import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  startPositionSource, sampleToLocationObject, type LocationSourceKind,
} from '@/features/tracking/utils/positionSource';
import {
  useTrackingStore,
  type MarkerType, type MarkerMaterial, type AngleKind, type TrackPointSample, type MarkerSample,
} from '@/features/tracking/store/trackingStore';
import {
  calculateDistance, calculateHeading, calculateAverageAccuracy, medianLatLng, type LatLng,
} from '@/features/tracking/utils/gpsFilter';
import { finishTrackRecording, saveTrackMarker } from '@/features/tracking/services/trackService';
import { supabase } from '@/lib/supabase';
import { createLocalTrainingSession, updateTrainingSyncStatus } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackPointsBatch, createLocalTrackMarker } from '@/features/tracking/repositories/localTrackRepository';
import { precisionLocationClient } from '@/features/tracking/native/precisionLocationClient';
import { setTrackFixHandler, startBackgroundUpdates, stopBackgroundUpdates } from '@/features/tracking/native/backgroundLocationTask';
import { startFaehrteActivity, updateFaehrteActivity, stopFaehrteActivity } from '@/features/tracking/native/faehrteLiveActivity';

// ──────────────────────────────────────────────────────────────────────────
// Robuste Live-Aufnahme der Fährte. Bewusst eigenständig und einfach gehalten,
// damit die Spur zuverlässig entsteht (statt „nur Striche"):
//   • EINE GPS-Quelle (expo-location, BestForNavigation) für Warmup UND Aufnahme.
//   • Track liegt in useRef → kein Stale-Closure mehr (der Fix-Handler sieht
//     immer den aktuellen Stand, nicht eine eingefrorene Kopie).
//   • Schlechte Fixes (keine/zu grobe Genauigkeit, unrealistische Sprünge) werden
//     verworfen.
//   • Distanz-Gate ≥ 2 m + EMA-Glättung → ruhige, echte Linie ohne Zacken.
//   • Eigener Sekunden-Timer (setInterval), unabhängig von GPS-Updates.
//   • Winkel-Erkennung über die Heading-Differenz zweier Schenkel (ein-/auslaufend)
//     mit Richtung (links/rechts) UND Schärfe (rechtwinklig vs. spitz).
// ──────────────────────────────────────────────────────────────────────────

// Filter-/Glättungs-Parameter.
const MAX_ACCURACY_M = 45;   // gröber → kein LINIEN-Punkt (Puck folgt trotzdem). Feld unter Bäumen ~30-45 m.
const MAX_SPEED_MPS  = 12;   // ~43 km/h: schnellerer Sprung = unrealistisch → verwerfen
const MIN_STEP_M     = 2.0;  // Distanz-Gate: erst ab 2 m neuen Linienpunkt setzen
const EMA_ALPHA      = 0.4;  // Glättung der aufgezeichneten LINIE (ruhig, träge)
const PUCK_ALPHA     = 0.6;  // Glättung des LIVE-Pucks separat → folgt flotter,
                             // ohne die aufgezeichnete Linie unruhiger zu machen

// Winkel-Erkennung (zwei Schenkel). Klassifikation über den INNENWINKEL des Wegs
// (Referenz winkel.png: „30° ≤ spitzer Winkel ≤ 60°"). Innenwinkel = 180 − |Richtungs-
// änderung am Scheitel|:
//   Innenwinkel 30–60°  → Spitzwinkel (links/rechts)   → Richtungsänderung ~120–150°
//   Innenwinkel 75–115° → rechtwinklig ~90°            → Richtungsänderung ~65–105°
//   Innenwinkel 60–75° oder ausserhalb → unklar → NICHT automatisch markieren
const LEG_MIN_M           = 4.0;  // moderate Schenkellänge (3–5 m) — bewusst kurze Winkel bleiben erfassbar
const ACUTE_ANGLE_MIN_DEG = 30;   // Innenwinkel: ab hier Spitzwinkel
const ACUTE_ANGLE_MAX_DEG = 60;   // Innenwinkel: bis hier Spitzwinkel
const ANGLE_90_MIN_DEG    = 75;   // Innenwinkel: ab hier rechtwinklig (~90°)
const ANGLE_90_MAX_DEG    = 115;  // Innenwinkel: bis hier rechtwinklig
const MAX_ANGLE_ACCURACY_M = 20;  // Winkel nur bestätigen, wenn der Scheitel-Fix genau genug ist
// KEIN pauschaler Mindestabstand (8–12 m). Nur EIN Schenkel als Abstand, damit der
// nächste Scheitel saubere Schenkel hat — bewusst nahe beieinander gelegte Winkel
// bleiben so erfassbar (echte kurze Winkel werden NICHT unterdrückt).
const CORNER_GAP_M        = LEG_MIN_M;
// Klassifikation über den Innenwinkel (winkel.png-konform). Falls sich im Feld
// zeigt, dass direkt die rohe Richtungsänderung gemeint ist → auf false setzen.
const ANGLE_USE_INTERIOR  = true;
// Links/Rechts leicht invertierbar, falls der Feldtest sie vertauscht zeigt.
const ANGLE_INVERT_SIDE   = false;

// Abriss-Erkennung über das Laufmuster: kurzer Halt am Abrissfeld, danach
// GERADEAUS weiter (kein Winkel). Der ~1-Schritt-Versatz selbst liegt unter dem
// GPS-Rauschen und wird NICHT gemessen — Auslöser ist allein das Halt-Muster.
const ABRISS_DWELL_MS       = 4000;  // Mindest-Standzeit, die als Halt zählt
const ABRISS_DWELL_RADIUS_M = 1.5;   // „steht", solange innerhalb dieses Radius
const ABRISS_RESUME_M       = 4.0;   // so weit nach dem Halt laufen, bevor Richtung bewertet wird
const ABRISS_MAX_TURN_DEG   = 25;    // mehr Richtungsänderung ⇒ Winkel, kein Abriss
const ABRISS_AFTER_OBJECT_MS = 8000; // kein Abriss kurz nach manuellem Gegenstand (Fehlauslöser)

// Start-Lock: Stabilisierungsphase direkt nach „Fährte legen". Verhindert, dass
// GPS-Warmup-/Startdrift (auf iPhone real ~8 m, obwohl man steht) als echte
// Trackstrecke gespeichert wird. Solange aktiv: KEINE Linie, KEINE Distanz,
// KEINE Winkel/Abriss — nur gute Fixes für den Startanker sammeln.
const START_LOCK_MIN_MS       = 5000;   // frühestens nach 5 s freigeben
const START_LOCK_MAX_MS       = 12000;  // spätestens nach 12 s (Nutzer läuft evtl. schon) — nie ewig blockieren
const START_ANCHOR_MIN_FIXES  = 4;      // so viele gute Fixes → Median-Anker
const START_ANCHOR_MAX_ACC_M  = 20;     // nur Fixes ≤ 20 m fliessen in den Anker
const START_MOVE_MIN_M        = 3.5;    // so weit vom Anker weg = echte Bewegung
const START_MOVE_MIN_SPEED    = 0.5;    // m/s: zusätzliche Bewegungsbestätigung
const START_MOVE_CONFIRM_HITS = 2;      // so viele aufeinanderfolgende Bewegungs-Fixes (kein Einzelsprung)

const WATCH_OPTS: Location.LocationOptions = {
  accuracy:         Location.Accuracy.BestForNavigation,
  timeInterval:     1000,
  distanceInterval: 0,        // zeitbasiert; Filterung/Gating macht dieser Hook
};

interface AcceptedPoint extends LatLng { t: number; accuracy: number | null; cumDist: number; }
type Raw = { lat: number; lng: number; accuracy: number | null; altitude: number | null; speed: number | null; t: number };

function normalizeDeg(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export interface TrackRecorderOptions {
  onAngle?: (kind: AngleKind) => void;   // UI: Haptik + Toast bei erkanntem Winkel
  autoDetect?: boolean;                  // Winkel/Spitzwinkel/Abriss automatisch erkennen (Default: true)
}

export function useTrackRecorder(opts?: TrackRecorderOptions) {
  const store = useTrackingStore;

  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const headRef  = useRef<Location.LocationSubscription | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startMs  = useRef<number>(0);
  const recordingRef = useRef(false);   // true ⇒ Fixes fliessen in die Linie
  const bgActiveRef  = useRef(false);   // true ⇒ Hintergrund-Updates (Foreground-Service) laufen

  // GPS-Quelle/Debug (zentrale positionSource: native bevorzugt, expo-Fallback).
  const rejectedRef = useRef(0);        // verworfene Fixes (Genauigkeit/Speed)
  const [gpsDebug, setGpsDebug] = useState<{
    source: LocationSourceKind | null; provider: string | null;
    isNativeAvailable: boolean; rawGnssSupported: boolean; rejectedCount: number;
    angleCount: number; acuteAngleCount: number;
    lastAngleType: AngleKind | null; lastAngleDeg: number | null;
    lastAngleDir: 'links' | 'rechts' | null; lastAngleReject: string | null;
  }>({ source: null, provider: null, isNativeAvailable: false, rawGnssSupported: false, rejectedCount: 0,
       angleCount: 0, acuteAngleCount: 0, lastAngleType: null, lastAngleDeg: null, lastAngleDir: null, lastAngleReject: null });

  // Track-Zustand in Refs → kein Stale-Closure im Fix-Handler.
  const pointsRef     = useRef<AcceptedPoint[]>([]);   // akzeptierte, geglättete Linie
  const emaRef        = useRef<LatLng | null>(null);   // geglättete Position für die LINIE
  const puckRef       = useRef<LatLng | null>(null);   // schneller geglättete Position für den LIVE-Puck
  const lastRawRef    = useRef<Raw | null>(null);      // letzter (akzeptierter) Rohfix
  const lastCornerAtRef = useRef<number>(-Infinity);   // cumDist des letzten Winkels
  // Abriss-Erkennung: Halt-Anker, vorgemerkter Abriss, letzter Abriss + Gegenstand.
  const lastAbrissAtRef  = useRef<number>(-Infinity);  // cumDist des letzten Abrisses
  const dwellRef         = useRef<{ pos: LatLng; since: number; headingIn: number | null; cumDist: number } | null>(null);
  const pendingAbrissRef = useRef<{ at: LatLng; headingIn: number; atCumDist: number } | null>(null);
  const lastObjectAtRef  = useRef<number>(-Infinity);  // Zeit (ms) des letzten Gegenstand-Markers
  // Start-Lock (Stabilisierungsphase): Anker + Bewegungserkennung + Drift-Zähler.
  const startLockRef      = useRef<boolean>(false);              // true ⇒ Startphase aktiv
  const startLockBeganRef = useRef<number>(0);                   // ms: Beginn der Startphase
  const startFixesRef     = useRef<{ lat: number; lng: number; accuracy: number; t: number }[]>([]);
  const startAnchorRef    = useRef<LatLng | null>(null);         // berechneter Startanker
  const startAnchorAccRef = useRef<number | null>(null);         // Ø-Genauigkeit des Ankers
  const startMoveHitsRef  = useRef<number>(0);                   // aufeinanderfolgende Bewegungs-Fixes
  const startDriftRejRef  = useRef<number>(0);                   // in der Startphase verworfene Drift-Fixes
  // Winkel-Debug (Teil E): Zähler + letzter Winkel + letzter Ablehnungsgrund.
  const angleDbgRef = useRef<{ count: number; acuteCount: number; lastType: AngleKind | null; lastDeg: number | null; lastDir: 'links' | 'rechts' | null; lastReject: string | null }>(
    { count: 0, acuteCount: 0, lastType: null, lastDeg: null, lastDir: null, lastReject: null });
  const onAngleRef    = useRef<TrackRecorderOptions['onAngle']>(opts?.onAngle);
  onAngleRef.current  = opts?.onAngle;
  // Auto-Erkennung (Winkel/Spitzwinkel/Abriss) ein/aus — live umschaltbar via Ref.
  const autoDetectRef = useRef<boolean>(opts?.autoDetect ?? true);
  autoDetectRef.current = opts?.autoDetect ?? true;
  // Stabile Brücke vom globalen Hintergrund-Task zum jeweils aktuellen onFix.
  const onFixRef      = useRef<(loc: Location.LocationObject) => void>(() => {});

  // Offline-First: lokale SQLite-Session + Punkt-Puffer.
  const localSessionId = useRef<string | null>(null);
  const ptBuffer = useRef<{ latitude: number; longitude: number; accuracy: number | null; altitude: number | null; speed: number | null; heading: number | null; timestamp: string }[]>([]);

  const flushPoints = useCallback(async () => {
    const sid = localSessionId.current;
    if (!sid || ptBuffer.current.length === 0) return;
    const batch = ptBuffer.current; ptBuffer.current = [];
    try { await createLocalTrackPointsBatch(sid, batch); }
    catch (e) { console.warn('[trackRecorder] flush', e); ptBuffer.current.unshift(...batch); }
  }, []);

  const stopAll = useCallback(() => {
    recordingRef.current = false;
    startLockRef.current = false;
    watchRef.current?.remove(); watchRef.current = null;
    headRef.current?.remove();  headRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (bgActiveRef.current) {
      bgActiveRef.current = false;
      setTrackFixHandler(null);
      void stopBackgroundUpdates();
    }
    const st = store.getState();
    if (st.startLockActive) st.setStartLockActive(false);
    stopFaehrteActivity({ elapsedS: st.durationSeconds, distanceM: st.distanceMeters });
  }, [store]);

  useEffect(() => () => stopAll(), [stopAll]);

  // Marker im Store + lokal (SQLite) + Supabase ablegen (best-effort).
  const commitMarker = useCallback(async (marker: MarkerSample) => {
    const s = store.getState();
    // Gegenstand-Halt merken → unterdrückt einen Abriss-Fehlauslöser direkt danach.
    if (marker.type === 'gegenstand') lastObjectAtRef.current = marker.t;
    s.addMarker(marker);
    if (localSessionId.current) {
      try { await createLocalTrackMarker(localSessionId.current, { marker_type: marker.type, material: marker.material, angle_kind: marker.angleKind, latitude: marker.lat, longitude: marker.lng, accuracy: marker.accuracy, distance_from_start: marker.distance_from_start, note: marker.note, audio_local_uri: null }); }
      catch (e) { console.warn('[trackRecorder] marker', e); }
    }
    if (s.currentSessionId) await saveTrackMarker(s.currentSessionId, marker);
  }, [store]);

  // Winkel über zwei Schenkel (Einlauf A→Scheitel, Scheitel→Auslauf). Statt stur
  // den Punkt „LEG_MIN_M zurück" als Scheitel zu nehmen (der oft NEBEN der Ecke
  // liegt → Marker passte nicht), wird unter allen möglichen Scheiteln im frischen
  // Fenster der mit der SCHÄRFSTEN Richtungsänderung gesucht = der echte
  // Winkelpunkt. So sitzt der Marker exakt auf der Ecke und ein sauberer 90°-Knick
  // wird als rechtwinklig (links/rechts) statt „verschmiert" erkannt.
  const detectCorner = useCallback(() => {
    const pts = pointsRef.current;
    const n = pts.length;
    if (n < 3) return;
    const C = pts[n - 1];

    // Bester Scheitel-Kandidat: braucht je einen vollen Schenkel (≥ LEG_MIN_M)
    // davor UND danach UND einen genauen Fix; unter diesen gewinnt die grösste
    // Richtungsänderung. KEIN pauschaler Mindestabstand → nahe Winkel bleiben möglich.
    const dbg = angleDbgRef.current;
    let best: { apex: AcceptedPoint; diff: number; mag: number } | null = null;
    let sawLegShort = false, sawPoorAcc = false;
    for (let k = n - 2; k > 0; k--) {
      const apex = pts[k];
      if (C.cumDist - apex.cumDist < LEG_MIN_M) { sawLegShort = true; continue; }      // Auslauf noch zu kurz
      if (apex.cumDist - lastCornerAtRef.current < CORNER_GAP_M) break;                 // nur NACH dem letzten Winkel
      if (apex.accuracy == null || apex.accuracy > MAX_ANGLE_ACCURACY_M) { sawPoorAcc = true; continue; }  // Fix zu ungenau

      // Anker A: LEG_MIN_M vor dem Scheitel; Auslauf-Endpunkt: LEG_MIN_M danach.
      let ai = k;
      while (ai > 0 && apex.cumDist - pts[ai].cumDist < LEG_MIN_M) ai--;
      if (apex.cumDist - pts[ai].cumDist < LEG_MIN_M) { sawLegShort = true; continue; }  // kein voller Einlauf-Schenkel
      let ci = k;
      while (ci < n - 1 && pts[ci].cumDist - apex.cumDist < LEG_MIN_M) ci++;

      const diff = normalizeDeg(calculateHeading(apex, pts[ci]) - calculateHeading(pts[ai], apex));
      const mag = Math.abs(diff);
      if (!best || mag > best.mag) best = { apex, diff, mag };
    }

    if (!best || best.mag < 15) {   // praktisch keine Richtungsänderung → kein Winkel
      dbg.lastReject = best ? 'no_turn' : (sawPoorAcc ? 'poor_accuracy' : sawLegShort ? 'leg_too_short' : 'no_turn');
      return;
    }

    const B = best.apex;
    // Richtung: best.diff ist die VORZEICHENBEHAFTETE Richtungsänderung am Scheitel.
    // Konvention: + = rechts (im Uhrzeigersinn), − = links. Über ANGLE_INVERT_SIDE
    // im Feld umkehrbar, falls links/rechts vertauscht wirken.
    let dir: 'links' | 'rechts' = best.diff > 0 ? 'rechts' : 'links';
    if (ANGLE_INVERT_SIDE) dir = dir === 'rechts' ? 'links' : 'rechts';

    // Klassifikation über den Innenwinkel des Wegs (= 180 − Richtungsänderung).
    const angleDeg = ANGLE_USE_INTERIOR ? 180 - best.mag : best.mag;
    let kind: AngleKind | null = null;
    if (angleDeg >= ANGLE_90_MIN_DEG && angleDeg <= ANGLE_90_MAX_DEG) {
      kind = dir;                                                        // ~90° links/rechts
    } else if (angleDeg >= ACUTE_ANGLE_MIN_DEG && angleDeg <= ACUTE_ANGLE_MAX_DEG) {
      kind = dir === 'rechts' ? 'spitz_rechts' : 'spitz_links';         // Spitzwinkel
    }
    if (!kind) { dbg.lastReject = 'angle_unclear'; return; }   // 60–75° oder ausserhalb → nicht markieren

    // erkannt → Debug aktualisieren (Spitzwinkel zählen gleich wie 90°-Winkel).
    dbg.count++;
    if (kind === 'spitz_rechts' || kind === 'spitz_links') dbg.acuteCount++;
    dbg.lastType = kind; dbg.lastDeg = Math.round(angleDeg); dbg.lastDir = dir; dbg.lastReject = null;
    if (__DEV__) console.log('[trackRecorder] Winkel', { kind, innenwinkel: Math.round(angleDeg), richtungsaenderung: Math.round(best.mag), richtung: dir });

    lastCornerAtRef.current = B.cumDist;
    pendingAbrissRef.current = null;   // echter Winkel hier ⇒ kein Abriss am selben Halt

    const now = Date.now();
    void commitMarker({
      id: `angle-${now}-${kind}`, type: 'winkel', material: null, angleKind: kind,   // stabile ID inkl. Typ
      lat: B.lat, lng: B.lng, accuracy: B.accuracy,
      distance_from_start: Math.round(B.cumDist * 10) / 10,
      note: null, audio_url: null, found: false, t: now,
    });
    onAngleRef.current?.(kind);
  }, [commitMarker]);

  // Abriss: ein zuvor erkannter Halt (pendingAbriss) wird zum Abriss, sobald nach
  // dem Stopp GERADEAUS (kein Winkel) weitergelaufen wurde. Der Marker sitzt am Halt.
  const detectAbriss = useCallback(() => {
    const pending = pendingAbrissRef.current;
    if (!pending) return;
    const pts = pointsRef.current;
    const C = pts[pts.length - 1];
    if (!C) return;
    if (C.cumDist - pending.atCumDist < ABRISS_RESUME_M) return;   // erst genug weiterlaufen

    pendingAbrissRef.current = null;                               // Halt ist ausgewertet
    const turn = Math.abs(normalizeDeg(calculateHeading(pending.at, C) - pending.headingIn));
    if (turn > ABRISS_MAX_TURN_DEG) return;                       // war ein Winkel, kein Abriss
    if (pending.atCumDist - lastAbrissAtRef.current < CORNER_GAP_M) return;

    lastAbrissAtRef.current = C.cumDist;
    const now = Date.now();
    void commitMarker({
      id: `abriss-${now}`, type: 'winkel', material: null, angleKind: 'abriss',
      lat: pending.at.lat, lng: pending.at.lng, accuracy: null,
      distance_from_start: Math.round(pending.atCumDist * 10) / 10,
      note: null, audio_url: null, found: false, t: now,
    });
    onAngleRef.current?.('abriss');
  }, [commitMarker]);

  // Start-Lock verarbeiten. Gibt true zurück, sobald in DIESEM Fix freigegeben
  // wurde (der Anker ist dann als erster Linienpunkt gesetzt → Fix läuft normal
  // weiter). Solange false: Stabilisieren, KEINE Linie/Distanz.
  const handleStartLock = useCallback((raw: Raw, ema: LatLng): boolean => {
    const s = store.getState();
    const now = raw.t;
    const elapsed = now - startLockBeganRef.current;

    // Gute Fixes für den Anker sammeln (nur akzeptable Genauigkeit).
    if (raw.accuracy != null && raw.accuracy <= START_ANCHOR_MAX_ACC_M) {
      startFixesRef.current.push({ lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy, t: now });
    }
    // Anker = Median der guten Fixes, sobald genug beisammen sind.
    if (!startAnchorRef.current && startFixesRef.current.length >= START_ANCHOR_MIN_FIXES) {
      const m = medianLatLng(startFixesRef.current);
      if (m) {
        startAnchorRef.current = m;
        startAnchorAccRef.current = calculateAverageAccuracy(startFixesRef.current.map(f => f.accuracy));
        s.setStartAnchor({ lat: m.lat, lng: m.lng, accuracy: startAnchorAccRef.current, t: now });
      }
    }

    // Echte Bewegung nur mit vorhandenem Anker prüfen.
    const anchor = startAnchorRef.current;
    let moved = false;
    if (anchor) {
      const dist = calculateDistance(anchor, ema);
      const okAcc = raw.accuracy == null || raw.accuracy <= MAX_ACCURACY_M;
      if (dist > START_MOVE_MIN_M && okAcc) {
        startMoveHitsRef.current++;
      } else {
        // Jitter im Anker-Radius: hätte sonst (> MIN_STEP_M) eine Linie erzeugt → als Drift zählen.
        if (dist > MIN_STEP_M) { startDriftRejRef.current++; s.setStartDriftRejectedCount(startDriftRejRef.current); }
        startMoveHitsRef.current = 0;
      }
      const speedMove = raw.speed != null && raw.speed > START_MOVE_MIN_SPEED && dist > START_MOVE_MIN_M;
      moved = elapsed >= START_LOCK_MIN_MS &&
        (startMoveHitsRef.current >= START_MOVE_CONFIRM_HITS || speedMove);
    }

    const timedOut = elapsed >= START_LOCK_MAX_MS;
    if (!moved && !timedOut) return false;   // noch am Stabilisieren

    // Freigeben: Anker sicherstellen (Timeout ohne genug gute Fixes → besten nehmen).
    let a = startAnchorRef.current;
    if (!a) {
      a = { lat: ema.lat, lng: ema.lng };
      startAnchorRef.current = a;
      startAnchorAccRef.current = calculateAverageAccuracy(startFixesRef.current.map(f => f.accuracy)) ?? raw.accuracy;
      s.setStartAnchor({ lat: a.lat, lng: a.lng, accuracy: startAnchorAccRef.current, t: now });
    }

    // Start-Lock beenden und den Anker als ERSTEN Linienpunkt setzen.
    startLockRef.current = false;
    s.setStartLockActive(false);
    const p0: AcceptedPoint = { lat: a.lat, lng: a.lng, t: now, accuracy: startAnchorAccRef.current, cumDist: 0 };
    pointsRef.current = [p0];
    lastRawRef.current = raw;
    s.addTrackPoint({ lat: p0.lat, lng: p0.lng, accuracy: p0.accuracy, altitude: null, speed: null, heading: null, t: now });
    ptBuffer.current.push({
      latitude: p0.lat, longitude: p0.lng, accuracy: p0.accuracy ?? null,
      altitude: null, speed: null, heading: null, timestamp: new Date(now).toISOString(),
    });
    return true;
  }, [store]);

  // EIN Fix-Handler für Warmup UND Aufnahme.
  const onFix = useCallback((loc: Location.LocationObject) => {
    const c = loc.coords;
    const s = store.getState();
    const raw: Raw = {
      lat: c.latitude, lng: c.longitude, accuracy: c.accuracy ?? null,
      altitude: c.altitude ?? null, speed: c.speed ?? null, t: loc.timestamp || Date.now(),
    };
    if (__DEV__) console.log('[trackRecorder] fix', { accuracy: raw.accuracy, recording: recordingRef.current });

    // EMA-Glättung der Position — IMMER (Warmup wie Aufnahme). So folgt der
    // Live-Puck stets der echten Position und friert NIE ein, auch bei mässigem
    // GPS. Der Genauigkeits-/Speed-Filter blockt nur das Setzen von LINIEN-Punkten.
    const prevEma = emaRef.current;
    const ema: LatLng = prevEma
      ? { lat: prevEma.lat + (raw.lat - prevEma.lat) * EMA_ALPHA, lng: prevEma.lng + (raw.lng - prevEma.lng) * EMA_ALPHA }
      : { lat: raw.lat, lng: raw.lng };
    emaRef.current = ema;

    // Live-Puck getrennt und LEICHTER glätten (PUCK_ALPHA > EMA_ALPHA): er folgt
    // der echten Position deutlich flotter (weniger „hinkt nach"), während die
    // aufgezeichnete Linie unten weiter mit dem trägen EMA ruhig bleibt.
    const prevPuck = puckRef.current;
    const puck: LatLng = prevPuck
      ? { lat: prevPuck.lat + (raw.lat - prevPuck.lat) * PUCK_ALPHA, lng: prevPuck.lng + (raw.lng - prevPuck.lng) * PUCK_ALPHA }
      : { lat: raw.lat, lng: raw.lng };
    puckRef.current = puck;
    s.setCurrentPosition(puck, raw.accuracy);

    // Ab hier nur die aufgezeichnete LINIE.
    if (!recordingRef.current || s.isPaused) return;

    // ── Start-Lock: bis echte Bewegung KEINE Linie/Distanz/Winkel. Verhindert,
    //    dass Warmup-/Startdrift (auf iPhone real ~8 m im Stand) als Strecke landet.
    //    Bei Freigabe ist der Anker als erster Linienpunkt gesetzt → Fix läuft weiter.
    if (startLockRef.current) {
      if (!handleStartLock(raw, ema)) { angleDbgRef.current.lastReject = 'start_lock_active'; return; }   // noch am Stabilisieren
    }

    // 1) Zu ungenauer / unrealistischer Fix → kein Linienpunkt (Puck steht schon).
    if (raw.accuracy == null || raw.accuracy > MAX_ACCURACY_M) { rejectedRef.current++; return; }
    const prevRaw = lastRawRef.current;
    if (prevRaw) {
      const d = calculateDistance(prevRaw, raw);
      const dt = (raw.t - prevRaw.t) / 1000;
      if (dt > 0 && d / dt > MAX_SPEED_MPS) { rejectedRef.current++; return; }   // unrealistischer Sprung
    }
    lastRawRef.current = raw;

    // 2b) Abriss-Halt verfolgen (läuft auch ohne neuen Linienpunkt, also im Stand):
    //     Bewegung > Radius ⇒ neuer Anker inkl. aktueller Laufrichtung. Sonst
    //     Standzeit zählen; lang genug (und nicht direkt nach Gegenstand) ⇒ vormerken.
    //     Nur bei aktiver Auto-Erkennung — manuell setzt der Nutzer alles selbst.
    if (autoDetectRef.current) {
      const dwell = dwellRef.current;
      if (!dwell || calculateDistance(dwell.pos, ema) > ABRISS_DWELL_RADIUS_M) {
        const lp = pointsRef.current;
        const hIn = lp.length >= 2 ? calculateHeading(lp[lp.length - 2], lp[lp.length - 1]) : null;
        dwellRef.current = { pos: { lat: ema.lat, lng: ema.lng }, since: raw.t, headingIn: hIn, cumDist: lp[lp.length - 1]?.cumDist ?? 0 };
      } else if (
        raw.t - dwell.since >= ABRISS_DWELL_MS && dwell.headingIn != null &&
        !pendingAbrissRef.current && raw.t - lastObjectAtRef.current > ABRISS_AFTER_OBJECT_MS
      ) {
        pendingAbrissRef.current = { at: dwell.pos, headingIn: dwell.headingIn, atCumDist: dwell.cumDist };
      }
    }

    // 3) Distanz-Gate: erst ab MIN_STEP_M einen neuen Linienpunkt setzen.
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    const step = last ? calculateDistance(last, ema) : 0;
    if (last && step < MIN_STEP_M) return;

    const accepted: AcceptedPoint = {
      lat: ema.lat, lng: ema.lng, t: raw.t, accuracy: raw.accuracy,
      cumDist: (last?.cumDist ?? 0) + step,
    };
    pts.push(accepted);

    const sample: TrackPointSample = {
      lat: accepted.lat, lng: accepted.lng, accuracy: accepted.accuracy,
      altitude: raw.altitude, speed: raw.speed, heading: null, t: accepted.t,
    };
    s.addTrackPoint(sample);   // Store rechnet Distanz fort + aktualisiert Qualität
    ptBuffer.current.push({
      latitude: sample.lat, longitude: sample.lng, accuracy: sample.accuracy ?? null,
      altitude: sample.altitude ?? null, speed: sample.speed ?? null, heading: null,
      timestamp: new Date(sample.t).toISOString(),
    });
    if (ptBuffer.current.length >= 25) void flushPoints();

    // 4) Winkel- und Abriss-Erkennung auf der frischen Linie (nur wenn aktiviert).
    if (autoDetectRef.current) {
      detectCorner();
      detectAbriss();
    }
  }, [store, flushPoints, detectCorner, detectAbriss, handleStartLock]);
  onFixRef.current = onFix;

  // Berechtigung + EINEN GPS-Stream öffnen (Warmup). Idempotent.
  const startWarmup = useCallback(async (): Promise<{ error: string | null }> => {
    if (watchRef.current) return { error: null };
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { error: 'Standortberechtigung fehlt. Bitte in den Einstellungen erlauben.' };
    // iOS: falls „Genauer Standort" reduziert ist, einmalig präzise Ortung
    // anfragen (nutzt NSLocationTemporaryUsageDescriptionDictionary). Best-effort;
    // no-op ohne natives Modul oder wenn bereits präzise.
    precisionLocationClient.requestTemporaryFullAccuracy('TrackingDogSportPrecision').catch(() => {});
    try {
      // Zentrale Positionsquelle: natives Precision-Modul bevorzugt, expo-Fallback.
      const handle = await startPositionSource((s) => {
        // Debug (source/provider) nur bei Änderung setzen — kein Re-Render-Sturm.
        setGpsDebug(d => (d.source === s.source && d.provider === s.provider) ? d : { ...d, source: s.source, provider: s.provider });
        onFix(sampleToLocationObject(s));
      }, WATCH_OPTS);
      watchRef.current = { remove: handle.stop };
      setGpsDebug(d => ({ ...d, isNativeAvailable: handle.info.isNativeAvailable, rawGnssSupported: handle.info.rawGnssSupported, source: d.source ?? handle.info.source }));
    } catch {
      return { error: 'GPS konnte nicht gestartet werden. Bitte kurz im Freien erneut versuchen.' };
    }
    // Sofort-Anzeige der letzten BEKANNTEN Position (gecacht). WICHTIG:
    // KEIN getCurrentPositionAsync hier — das teilt sich auf iOS den
    // CLLocationManager mit watchPositionAsync und stoppt beim Abschluss den
    // laufenden Stream (→ onFix feuerte nie wieder, Spur blieb leer).
    // getLastKnownPositionAsync startet KEINE neue Anfrage und stört den Watch nicht.
    Location.getLastKnownPositionAsync()
      .then(loc => { if (loc) onFix(loc); })
      .catch(() => { /* Stream liefert ohnehin laufend Fixes */ });
    return { error: null };
  }, [onFix]);

  // Aufnahme scharf schalten: Track-Refs zurücksetzen, Timer + lokale Session
  // starten und den bereits laufenden Warmup-Stream weiterlaufen lassen.
  const beginRecording = useCallback(async (sessionId: string | null): Promise<{ error: string | null }> => {
    if (!watchRef.current) {
      const w = await startWarmup();
      if (w.error) return w;
    }

    // ── SOFORT scharf schalten (synchron, VOR jedem await/Netz-Call) ──
    // So hängt die Aufnahme nie an Login/Supabase/Heading. Fixes fliessen ab
    // hier in die Linie, der Timer läuft sofort.
    pointsRef.current = [];
    emaRef.current = null;
    puckRef.current = null;
    lastRawRef.current = null;
    rejectedRef.current = 0;
    lastCornerAtRef.current = -Infinity;
    lastAbrissAtRef.current = -Infinity;
    angleDbgRef.current = { count: 0, acuteCount: 0, lastType: null, lastDeg: null, lastDir: null, lastReject: null };
    dwellRef.current = null;
    pendingAbrissRef.current = null;
    lastObjectAtRef.current = -Infinity;
    ptBuffer.current = [];
    localSessionId.current = null;
    // Start-Lock scharf: Stabilisierungsphase beginnt jetzt (kein Warmup-Drift als Strecke).
    startLockRef.current = true;
    startLockBeganRef.current = Date.now();
    startFixesRef.current = [];
    startAnchorRef.current = null;
    startAnchorAccRef.current = null;
    startMoveHitsRef.current = 0;
    startDriftRejRef.current = 0;

    store.getState().startRecording(sessionId);
    store.getState().setStartLockActive(true);   // NACH startRecording (das setzt den Store zurück)
    startMs.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startMs.current) / 1000);
      const st = store.getState();
      st.setDuration(sec);
      // Debug: verworfene Fixes gedrosselt (1 Hz) in den State spiegeln.
      const a = angleDbgRef.current;
      setGpsDebug(d => ({ ...d, rejectedCount: rejectedRef.current,
        angleCount: a.count, acuteAngleCount: a.acuteCount,
        lastAngleType: a.lastType, lastAngleDeg: a.lastDeg, lastAngleDir: a.lastDir, lastAngleReject: a.lastReject }));
      // Live Activity gedrosselt aktualisieren (alle 3 s, nicht im Sekundentakt).
      if (sec % 3 === 0) updateFaehrteActivity({ elapsedS: sec, distanceM: st.distanceMeters, paused: st.isPaused });
    }, 1000);
    recordingRef.current = true;   // ← ab jetzt akzeptiert onFix die Fixes
    startFaehrteActivity();        // iOS: Lockscreen / Dynamic Island (no-op sonst)
    if (__DEV__) console.log('[trackRecorder] recording started', { sessionId });

    // ── Hintergrund-Aufnahme: auf Foreground-Service-GPS umschalten, damit die
    // Spur auch bei Display-aus / App in der Tasche weiterläuft. Zeigt dabei die
    // kleine Status-Anzeige (Android-Notification / iOS blaue Pille). Best-effort:
    // ohne „Immer"-Berechtigung bleibt der Vordergrund-Watch als Fallback aktiv.
    try {
      // Play-Policy: Die prominente In-App-Offenlegung (Disclosure) wird ZWINGEND
      // VOR dem Aufnahmestart im UI gezeigt (BackgroundLocationDisclosure in
      // app/track/legen.tsx). beginRecording läuft erst nach „Weiter". Hier wird
      // die OS-Berechtigung nur noch angefragt, wenn bereits erteilt oder erneut
      // fragbar. Ohne „Immer"-Berechtigung bleibt der Vordergrund-Watch als Fallback.
      const bgCurrent = await Location.getBackgroundPermissionsAsync();
      const mayRequest = bgCurrent.status === 'granted' || bgCurrent.canAskAgain;
      if (mayRequest) {
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status === 'granted') {
          setTrackFixHandler(loc => onFixRef.current(loc));
          await startBackgroundUpdates({
            notificationTitle: '🐾 Fährte läuft',
            notificationBody:  'Aufnahme aktiv – tippen, um ANYVO zu öffnen',
            notificationColor: '#15E6C3',
          });
          watchRef.current?.remove(); watchRef.current = null;   // Warmup-Watch ablösen
          bgActiveRef.current = true;
        }
      }
    } catch (e) { console.warn('[trackRecorder] background', e); /* Fallback: Vordergrund-Watch bleibt */ }

    // ── ab hier nur best-effort, blockiert die Aufnahme nicht ──
    try {
      headRef.current = await Location.watchHeadingAsync(h => store.getState().setHeading(h.trueHeading ?? h.magHeading));
    } catch { /* Heading optional */ }

    // Lokale SQLite-Session (Offline-First) — best-effort.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const local = await createLocalTrainingSession({ user_id: user.id, type: 'track', status: 'active' });
        localSessionId.current = local.local_id;
      }
    } catch (e) { console.warn('[trackRecorder] start', e); }

    return { error: null };
  }, [startWarmup, store]);

  const pause  = useCallback(() => store.getState().pauseRecording(), [store]);
  const resume = useCallback(() => store.getState().resumeRecording(), [store]);

  const addMarker = useCallback(async (
    type: MarkerType,
    markerOpts?: { note?: string; audioUrl?: string; material?: MarkerMaterial; angleKind?: AngleKind },
  ) => {
    const s = store.getState();
    const now = Date.now();
    const pos = s.currentPosition;
    await commitMarker({
      id: `${type}-${now}`,
      type,
      material: markerOpts?.material ?? null,
      angleKind: markerOpts?.angleKind ?? null,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      accuracy: s.gpsAccuracy,
      distance_from_start: Math.round(s.distanceMeters * 10) / 10,
      note: markerOpts?.note ?? null,
      audio_url: markerOpts?.audioUrl ?? null,
      found: false,
      t: now,
    });
  }, [store, commitMarker]);

  // Aufnahme beenden + Lay-Punkte/Summary persistieren.
  // SOFORT stoppen (synchron) und die Liegezeit starten; das schwere Speichern
  // (SQLite-Flush + Supabase) läuft im HINTERGRUND und blockiert NICHT die
  // Navigation zur Liegezeit. saveState spiegelt den Fortschritt in die UI.
  const finish = useCallback((sessionId: string | null): void => {
    stopAll();
    const s = store.getState();
    s.stopRecording();
    s.setLayFinishedAt(Date.now());   // ← Liegezeit-Start, sofort verfügbar
    s.setSaveState('saving');

    void (async () => {
      try {
        await flushPoints();
        if (!sessionId) { store.getState().setSaveState('saved'); return; }   // offline → nur lokal
        const accAvg = calculateAverageAccuracy(s.trackPoints.map(p => p.accuracy));
        const res = await finishTrackRecording(sessionId, s.trackPoints, {
          layingDurationSeconds: s.durationSeconds,
          distanceMeters:        s.distanceMeters,
          gpsQualityAverage:     accAvg,
          articlesTotal:         s.markers.filter(m => m.type === 'gegenstand').length,
          cornersTotal:          s.markers.filter(m => m.type === 'winkel').length,
          distractionsTotal:     s.markers.filter(m => m.type === 'verleitung').length,
        });
        if (localSessionId.current) {
          try { await updateTrainingSyncStatus(localSessionId.current, res.error ? 'pending' : 'synced', res.error); } catch { /* best-effort */ }
        }
        store.getState().setSaveState(res.error ? 'error' : 'saved');
      } catch (e) {
        console.warn('[trackRecorder] finish save', e);
        store.getState().setSaveState('error');
      }
    })();
  }, [stopAll, store, flushPoints]);

  return { startWarmup, beginRecording, pause, resume, addMarker, finish, stopAll, gpsDebug };
}

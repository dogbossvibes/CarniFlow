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
  calculateDistance, calculateAverageAccuracy, medianLatLng, type LatLng,
} from '@/features/tracking/utils/gpsFilter';
import {
  detectAutoCorner, type AutoCorner,
} from '@/features/tracking/utils/autoCornerDetection';
import {
  feedCornerBuffer, createCornerConfirmer,
  type CornerConfirmer, type ConfirmQuality,
} from '@/features/tracking/utils/cornerConfirmation';
import {
  createGpsQualityTracker, type GpsQualityTracker, type GpsQualityState,
} from '@/features/tracking/utils/gpsQualityState';
import { logConfirmEvent, logImmediateCorner, logGpsQualityChange } from '@/features/tracking/utils/angleDiagnostics';
import { saveTrackMarker } from '@/features/tracking/services/trackService';
import { createLocalTrainingSession, finalizeLocalTrainingSession, type NewLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { syncNow } from '@/features/sync/services/syncEngine';
import { buildLocalTrackSessionInput, type LocalTrackSessionMeta } from '@/features/tracking/utils/localTrackSession';
import { nowIso } from '@/lib/localDb/ids';
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

// Auto-Winkel-Erkennung: die gesamte reine, testbare Logik lebt in
// features/tracking/utils/autoCornerDetection.ts (Single Source of Truth) —
// stabile Ein-/Auslaufschenkel (LEG_MIN_M=4 m, Heading-Abweichung ≤12°, ≥2 Segmente),
// konzentrierte Scheitel-Richtungsänderung, Innenwinkel-Klassen (75–105° normal,
// 30–60° spitz), Rechts/Links via Bearing, Corner-Gap + Accuracy-Gate.

// Start-Lock: Stabilisierungsphase direkt nach „Fährte legen". Verhindert, dass
// GPS-Warmup-/Startdrift (auf iPhone real ~8 m, obwohl man steht) als echte
// Trackstrecke gespeichert wird. Solange aktiv: KEINE Linie, KEINE Distanz,
// KEINE Winkel — nur gute Fixes für den Startanker sammeln.
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


export interface TrackRecorderOptions {
  onAngle?: (kind: AngleKind) => void;   // UI: Haptik + Toast bei erkanntem Winkel
  autoDetect?: boolean;                  // Winkel/Spitzwinkel automatisch erkennen (Default: true)
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
    gpsQualityScore: number | null; gpsQualityLevel: GpsQualityState['level'] | null;
    gpsQualityValid: boolean; gpsQualitySamples: number; gpsQualityReasons: string[];
  }>({ source: null, provider: null, isNativeAvailable: false, rawGnssSupported: false, rejectedCount: 0,
       angleCount: 0, acuteAngleCount: 0, lastAngleType: null, lastAngleDeg: null, lastAngleDir: null, lastAngleReject: null,
       gpsQualityScore: null, gpsQualityLevel: null, gpsQualityValid: false, gpsQualitySamples: 0, gpsQualityReasons: [] });

  // Track-Zustand in Refs → kein Stale-Closure im Fix-Handler.
  const pointsRef     = useRef<AcceptedPoint[]>([]);   // akzeptierte, geglättete Linie
  const emaRef        = useRef<LatLng | null>(null);   // geglättete Position für die LINIE
  const puckRef       = useRef<LatLng | null>(null);   // schneller geglättete Position für den LIVE-Puck
  const lastRawRef    = useRef<Raw | null>(null);      // letzter (akzeptierter) Rohfix
  const lastCornerAtRef = useRef<number>(-Infinity);   // cumDist des letzten Winkels
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
  // Phase 2: adaptive Confirmation-State-Machine (ein Kandidat zur Zeit). Persistiert
  // einen Winkel erst, wenn er final bestätigt ist (HIGH sofort, MEDIUM nach Beleg).
  const confirmerRef  = useRef<CornerConfirmer>(createCornerConfirmer());
  // Phase 3: laufende GPS-Qualitätsbewertung (Rolling Window) als Kontext für die
  // Confirmation-Anforderung. Beeinflusst NIE die Geometrie, verwirft nie allein.
  const gpsQualityRef      = useRef<GpsQualityTracker>(createGpsQualityTracker());
  const gpsQualityStateRef = useRef<GpsQualityState | null>(null);
  // Auto-Erkennung (Winkel/Spitzwinkel) ein/aus — live umschaltbar via Ref.
  const autoDetectRef = useRef<boolean>(opts?.autoDetect ?? true);
  autoDetectRef.current = opts?.autoDetect ?? true;
  // Stabile Brücke vom globalen Hintergrund-Task zum jeweils aktuellen onFix.
  const onFixRef      = useRef<(loc: Location.LocationObject) => void>(() => {});

  // Offline-First: lokale SQLite-Session + Punkt-Puffer.
  const localSessionId = useRef<string | null>(null);
  // Vollständiger lokaler Session-Datensatz (aus dem Start) — für idempotentes
  // ensure-create beim Finalisieren (falls der Start-Insert fehlschlug).
  const localSessionInputRef = useRef<NewLocalTrainingSession | null>(null);
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
    s.addMarker(marker);
    if (localSessionId.current) {
      try { await createLocalTrackMarker(localSessionId.current, { marker_type: marker.type, material: marker.material, angle_kind: marker.angleKind, latitude: marker.lat, longitude: marker.lng, accuracy: marker.accuracy, distance_from_start: marker.distance_from_start, note: marker.note, audio_local_uri: null }); }
      catch (e) { console.warn('[trackRecorder] marker', e); }
    }
    if (s.currentSessionId) await saveTrackMarker(s.currentSessionId, marker);
  }, [store]);

  // HOTFIX (Recall): ein geometrisch AKZEPTIERTER Winkel wird SOFORT persistiert
  // (Verhalten wie ≤65eceeb). Confidence/Level werden diagnostisch am Marker geführt,
  // aber blockieren NICHT mehr. Markerposition = erkannter ursprünglicher Scheitel.
  const persistAcceptedCorner = useCallback((corner: AutoCorner) => {
    const { apex, kind, angleDeg, confidence, level } = corner;
    const dbg = angleDbgRef.current;
    const dir: 'links' | 'rechts' = (kind === 'rechts' || kind === 'spitz_rechts') ? 'rechts' : 'links';
    dbg.count++;
    if (kind === 'spitz_rechts' || kind === 'spitz_links') dbg.acuteCount++;
    dbg.lastType = kind; dbg.lastDeg = Math.round(angleDeg); dbg.lastDir = dir; dbg.lastReject = null;

    lastCornerAtRef.current = apex.cumDist;   // Gap → nächster Winkel + verhindert Doppelmarker
    const qs = gpsQualityStateRef.current;
    if (__DEV__) logImmediateCorner({
      kind, angleDeg, confidence, level,
      quality: qs ? `${qs.level}(${qs.score.toFixed(2)})` : 'n/a',
      persistReason: 'geometric_accept',
    });
    const now = Date.now();
    void commitMarker({
      id: `angle-${now}-${kind}`, type: 'winkel', material: null, angleKind: kind,   // stabile ID inkl. Typ
      lat: apex.lat, lng: apex.lng, accuracy: apex.accuracy,
      distance_from_start: Math.round(apex.cumDist * 10) / 10,
      note: null, audio_url: null, found: false, t: now,
      confidence, confidenceLevel: level,   // nur zur Laufzeit; nicht in der DB (s. MarkerSample)
    });
    onAngleRef.current?.(kind);
  }, [commitMarker]);

  // Auto-Winkel: geometrische Erkennung entscheidet die Persistenz (Sofort-Persist).
  // Die Adaptive Confirmation läuft PARALLEL im SHADOW-MODE — nur Lifecycle-Diagnostik
  // (would_confirm/would_reject/…), sie persistiert NICHTS und kann keinen bereits
  // akzeptierten Winkel mehr verlieren. Die GPS-Quality bleibt reiner Kontext.
  const detectCorner = useCallback(() => {
    const points = pointsRef.current;
    const now = Date.now();
    const q = gpsQualityStateRef.current;
    const confirmQuality: ConfirmQuality | undefined = q && q.valid ? q.level : undefined;

    // SHADOW: Confirmation weiterlaufen lassen (kein Persist) — reale Kalibrierungsdaten.
    if (__DEV__) for (const ev of feedCornerBuffer(confirmerRef.current, points, lastCornerAtRef.current, now, confirmQuality)) {
      logConfirmEvent(ev);   // [cornerConfirm] = Shadow-Lifecycle, NICHT persistiert
    }

    // PRIMARY: nur bei bestehendem geometrischem state==='accept' → sofort persistieren.
    const corner = detectAutoCorner(points, lastCornerAtRef.current);
    if (!corner) { angleDbgRef.current.lastReject = 'no_corner'; return; }
    persistAcceptedCorner(corner);   // setzt lastCornerAtRef → genau 1 Marker je Winkel
  }, [persistAcceptedCorner]);

  // Start-Lock verarbeiten. Gibt true zurück, sobald in DIESEM Fix freigegeben
  // wurde (der Anker ist dann als erster Linienpunkt gesetzt → Fix läuft normal
  // weiter). Solange false: Stabilisieren, KEINE Linie/Distanz.
  const handleStartLock = useCallback((raw: Raw, livePos: LatLng): boolean => {
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
      const dist = calculateDistance(anchor, livePos);
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
      a = { lat: livePos.lat, lng: livePos.lng };
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

    // Live-Puck IMMER glätten (auch bei später verworfenen Fixes) — er zeigt nur die
    // aktuelle Standortanzeige und darf nie einfrieren. Die aufgezeichnete Track-EMA
    // (emaRef) wird dagegen ERST NACH den Accuracy-/Speed-Gates aktualisiert (s. u.),
    // damit verworfene Fixes die Linie/Distanz/Persistenz/Corner-Buffer nicht mehr
    // kontaminieren. Track-EMA und Puck-EMA bleiben getrennt.
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
      // StartLock nutzt die Live-Position (Puck) für die Bewegungserkennung — die
      // Track-EMA existiert vor dem ersten validierten Fix bewusst noch nicht.
      if (!handleStartLock(raw, puck)) { angleDbgRef.current.lastReject = 'start_lock_active'; return; }   // noch am Stabilisieren
    }

    // ── GPS Quality Engine: JEDEN Fix (accepted, distanz-gated oder rejected) in das
    //    Rolling Window geben. Reine Kontextbewertung — ändert Geometrie/Reject nicht.
    {
      const prevQ = lastRawRef.current;
      const qDist = prevQ ? calculateDistance(prevQ, raw) : null;
      const qDt = prevQ ? raw.t - prevQ.t : null;
      const accReject = raw.accuracy == null || raw.accuracy > MAX_ACCURACY_M;
      const jumpReject = !accReject && !!prevQ && qDt != null && qDt > 0 && (qDist as number) / (qDt / 1000) > MAX_SPEED_MPS;
      const qState = gpsQualityRef.current.observe({
        t: raw.t, accuracy: raw.accuracy, distFromPrevM: qDist, dtMs: qDt,
        rejected: accReject || jumpReject,
        rejectReason: accReject ? 'accuracy' : jumpReject ? 'jump' : null,
        speedMps: raw.speed,
      });
      if (__DEV__) logGpsQualityChange(gpsQualityStateRef.current, qState);
      gpsQualityStateRef.current = qState;
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

    // 2) Track-EMA NUR aus validierten Fixes (nach Accuracy-/Speed-Gate). So zieht
    //    kein verworfener Fix die aufgezeichnete Linie/Distanz/Persistenz/Corner-
    //    Buffer mit. (MIN_STEP-Verhalten unverändert: ein gültiger, aber sub-MIN_STEP-
    //    Fix aktualisiert die EMA weiterhin — s. Folgepunkt.)
    const prevEma = emaRef.current;
    const ema: LatLng = prevEma
      ? { lat: prevEma.lat + (raw.lat - prevEma.lat) * EMA_ALPHA, lng: prevEma.lng + (raw.lng - prevEma.lng) * EMA_ALPHA }
      : { lat: raw.lat, lng: raw.lng };
    emaRef.current = ema;

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

    // 4) Winkel-Erkennung auf der frischen Linie (nur wenn aktiviert).
    // Abriss wird bewusst nur manuell gesetzt, weil das Halt-Muster im Feld zu
    // fehleranfällig ist.
    if (autoDetectRef.current) {
      detectCorner();
    }
  }, [store, flushPoints, detectCorner, handleStartLock]);
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

  // Aufnahme scharf schalten (LOCAL-FIRST): führende clientUuid ist bereits erzeugt,
  // die lokale Session wird OHNE Netz/getUser angelegt (owner aus dem Session-Cache).
  // Punkte/Marker referenzieren ab sofort die stabile local_id — nie eine Remote-ID.
  const beginRecording = useCallback(async (input: {
    localId: string; ownerId: string | null | undefined; dogId?: string | null; meta?: LocalTrackSessionMeta;
  }): Promise<{ error: string | null }> => {
    if (!input.ownerId) return { error: 'Bitte zuerst anmelden.' };   // sauber abbrechen — keine halbe Session
    const dogId = input.dogId ?? null;
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
    confirmerRef.current.reset();   // laufende Confirmation-State-Machine leeren
    gpsQualityRef.current.reset();  // Rolling-GPS-Qualität leeren
    gpsQualityStateRef.current = null;
    angleDbgRef.current = { count: 0, acuteCount: 0, lastType: null, lastDeg: null, lastDir: null, lastReject: null };
    ptBuffer.current = [];
    // Führende lokale Session-ID SOFORT deterministisch setzen (kein Warten auf Remote/Netz).
    localSessionId.current = input.localId;
    localSessionInputRef.current = buildLocalTrackSessionInput({
      localId: input.localId, ownerId: input.ownerId, dogId, startedAt: nowIso(), meta: input.meta,
    });
    // Start-Lock scharf: Stabilisierungsphase beginnt jetzt (kein Warmup-Drift als Strecke).
    startLockRef.current = true;
    startLockBeganRef.current = Date.now();
    startFixesRef.current = [];
    startAnchorRef.current = null;
    startAnchorAccRef.current = null;
    startMoveHitsRef.current = 0;
    startDriftRejRef.current = 0;

    // currentSessionId bleibt null: Marker gehen lokal (SQLite); die Remote-ID reicht
    // der Screen erst nach erfolgreichem createTrackSession nach (setCurrentSession).
    store.getState().startRecording(null, dogId);   // dogId → hundebasierter Puffer-Slot
    store.getState().setStartLockActive(true);   // NACH startRecording (das setzt den Store zurück)
    startMs.current = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startMs.current) / 1000);
      const st = store.getState();
      st.setDuration(sec);
      // Debug: verworfene Fixes gedrosselt (1 Hz) in den State spiegeln.
      const a = angleDbgRef.current;
      const q = gpsQualityStateRef.current;
      setGpsDebug(d => ({ ...d, rejectedCount: rejectedRef.current,
        angleCount: a.count, acuteAngleCount: a.acuteCount,
        lastAngleType: a.lastType, lastAngleDeg: a.lastDeg, lastAngleDir: a.lastDir, lastAngleReject: a.lastReject,
        gpsQualityScore: q ? Math.round(q.score * 100) / 100 : null, gpsQualityLevel: q?.level ?? null,
        gpsQualityValid: q?.valid ?? false, gpsQualitySamples: q?.sampleCount ?? 0, gpsQualityReasons: q?.reasons ?? [] }));
      // Live Activity gedrosselt aktualisieren (alle 3 s, nicht im Sekundentakt).
      if (sec % 3 === 0) updateFaehrteActivity({ elapsedS: sec, distanceM: st.distanceMeters, paused: st.isPaused });
    }, 1000);
    recordingRef.current = true;   // ← ab jetzt akzeptiert onFix die Fixes
    startFaehrteActivity();        // iOS: Lockscreen / Dynamic Island (no-op sonst)
    if (__DEV__) console.log('[trackRecorder] recording started', { localId: input.localId });

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

    // Lokale SQLite-Session (Offline-First, KEIN Netz/getUser) — führende ID = input.localId.
    // Idempotent (insert or ignore) → Doppeltipp-sicher. Schlägt der Insert fehl, laufen die
    // Punkte weiter gegen dieselbe local_id (kein FK); der Finish-Pfad legt die Zeile per
    // ensure-create nach, damit nichts verloren geht.
    try {
      if (localSessionInputRef.current) await createLocalTrainingSession(localSessionInputRef.current);
    } catch (e) { console.warn('[trackRecorder] local session', e); }

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

  // Aufnahme beenden. SOFORT stoppen (synchron) und die Liegezeit starten; das
  // Speichern läuft im HINTERGRUND und blockiert NICHT die Navigation. LOCAL-FIRST:
  // Erfolg = lokale Finalisierung (durabel, unabhängig von Netz/Remote). Der Remote-
  // Transport läuft AUSSCHLIESSLICH über die persistente Sync-Queue (P-SAVE2) — kein
  // direkter finishTrackRecording-Pfad mehr (eine einzige Remote-Sync-Quelle).
  const finish = useCallback((): void => {
    // Winkel werden bereits bei geometrischem Accept sofort persistiert; die Shadow-
    // Confirmation wird hier nur noch abgeschlossen (Diagnostik), OHNE zu persistieren
    // — sonst entstünde ein später Doppelmarker.
    if (__DEV__) for (const ev of confirmerRef.current.flush(Date.now())) logConfirmEvent(ev);
    stopAll();
    const s = store.getState();
    s.stopRecording();
    s.setLayFinishedAt(Date.now());   // ← Liegezeit-Start, sofort verfügbar
    s.setSaveState('saving');

    // Summary synchron aus dem Vor-Stop-Snapshot festhalten.
    const summary = {
      endedAt:           new Date().toISOString(),
      durationSeconds:   s.durationSeconds,
      distanceMeters:    s.distanceMeters,
      gpsQualityAverage: calculateAverageAccuracy(s.trackPoints.map(p => p.accuracy)),
      articlesTotal:     s.markers.filter(m => m.type === 'gegenstand').length,
      cornersTotal:      s.markers.filter(m => m.type === 'winkel').length,
      segments:          s.segments,
    };

    void (async () => {
      // 1) LOKAL sichern = echter Erfolg. Punkte flushen, Session-Zeile sicherstellen
      //    (ensure-create, falls Start-Insert fehlschlug) und finalisieren.
      const lid = localSessionId.current;
      try {
        await flushPoints();
        if (localSessionInputRef.current) await createLocalTrainingSession(localSessionInputRef.current);   // idempotent
        if (lid) {
          await finalizeLocalTrainingSession(lid, {
            endedAt:           summary.endedAt,
            durationSeconds:   summary.durationSeconds,
            distanceMeters:    summary.distanceMeters,
            articlesTotal:     summary.articlesTotal,
            cornersTotal:      summary.cornersTotal,
            gpsQualityAverage: summary.gpsQualityAverage,
            segments:          summary.segments,
            status:            'completed',
          });
        }
        store.getState().setSaveState('saved');   // lokal durabel → Erfolg (auch offline)
      } catch (e) {
        console.warn('[trackRecorder] local finalize', e);
        store.getState().setSaveState('error');   // ehrlich: lokale Persistenz fehlgeschlagen
        return;
      }

      // 2) Remote-Transport in die persistente Sync-Queue geben (überlebt App-Kill).
      //    syncNow() ist best-effort und blockiert NICHTS — die Navigation ist längst
      //    erfolgt. Schlägt der Upload fehl, bleibt der Queue-Eintrag pending/failed
      //    für den späteren Retry (SyncProvider bei Start/Reconnect/Foreground).
      if (!lid) return;
      try {
        await enqueueSyncOperation({ entityType: 'training_session', entityLocalId: lid, operation: 'create', priority: 1 });
      } catch (e) { console.warn('[trackRecorder] enqueue', e); return; }
      void syncNow().catch(() => { /* Queue bleibt pending → Retry später */ });
    })();
  }, [stopAll, store, flushPoints]);

  return { startWarmup, beginRecording, pause, resume, addMarker, finish, stopAll, gpsDebug };
}

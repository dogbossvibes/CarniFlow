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
  createCornerConfirmer,
  type CornerConfirmer, type ConfirmedCorner,
} from '@/features/tracking/utils/cornerConfirmation';
import {
  createGpsQualityTracker, type GpsQualityTracker, type GpsQualityState,
} from '@/features/tracking/utils/gpsQualityState';
import { logConfirmEvent, logConfirmedCornerMetrics, logGpsQualityChange } from '@/features/tracking/utils/angleDiagnostics';
import { legacyDetectCorner, type LegacyAcceptedPoint } from '@/features/tracking/utils/legacyCornerDetection';
import {
  detectShortLegCorners, DETECTOR_INPUT, type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import { getTrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';
import { getLocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { hydrateQaModes } from '@/features/tracking/utils/qaModeBootstrap';
import { isQaDiagnosticsEnabled } from '@/features/tracking/utils/qaDiagnosticsMode';
import { markWarmupStarted, markReportedSource, markWarmupStopped, markMotionStarted, markMotionSample } from '@/features/tracking/utils/trackingWarmupState';
import { pushQaCandidateLine, clearQaCandidateLog } from '@/features/tracking/utils/qaCandidateLog';
import {
  saveQaSessionCapture, pathLength,
  type QaCapturePoint, type QaMarkerMeta, type QaAutoDiagnostic,
  type QaMarkerSource, type QaDistanceScale,
} from '@/features/tracking/utils/qaSessionCapture';
import { evaluateStopFlush } from '@/features/tracking/utils/stopFlushCorner';
import { motionClient } from '@/features/tracking/native/motionClient';
import { MotionEvidenceBuffer } from '@/features/tracking/utils/motionTurnEvidence';
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
  // ── Eigener, dichterer Punktstrom NUR für die Winkel-Erkennung ──
  // Die aufgezeichnete LINIE bleibt unverändert (EMA_ALPHA 0,4 / MIN_STEP_M 2 m).
  // Für kurze Schenkel (Feldschema: ~3,75 m) reicht dieser Strom nicht: er
  // liefert dort ~1 Punkt pro Schenkel, und die ruhige Glättung rundet die
  // Ecke über ~2 m ab. Der Detektor bekommt deshalb denselben Fix-Strom mit
  // leichterer Glättung und feinerem Distanz-Gate (siehe DETECTOR_INPUT).
  // Reine Erkennungs-Eingabe: weder Linie, Distanz, Persistenz noch Auswertung
  // sehen diese Punkte.
  const detectPointsRef = useRef<ShortLegPoint[]>([]);
  const detectEmaRef = useRef<LatLng | null>(null);
  // UNGEGLÄTTETE Fixe der letzten Meter — ausschliesslich für den
  // Stop-assisted Flush am Sessionende (die Glättung hat über einen sehr
  // kurzen Schlussnachlauf die neue Richtung noch nicht eingeholt, gemessen in
  // stopFlushCorner.test.ts). Kleiner Ringpuffer, nie persistiert.
  const rawTailRef = useRef<ShortLegPoint[]>([]);
  // Core-Motion-Mitschnitt beim Legen — NUR im QA-Diagnosemodus und NUR für
  // ENGINE=CURRENT. Rein beobachtend: erzeugt keinen Kandidaten, verwirft
  // keinen, verändert keine Confidence, keine Distanz, kein GPS.
  const motionBufRef = useRef<MotionEvidenceBuffer>(new MotionEvidenceBuffer(20));
  const motionSubRef = useRef<{ remove: () => void } | null>(null);
  const motionActiveRef = useRef(false);
  const qaRef = useRef(false);
  const qaLastRejectRef = useRef<string | null>(null);
  // ── QA-Mitschnitt (nur im Diagnosemodus befüllt) ──
  // Ursprung für die Anonymisierung: der erste eingegangene Rohfix.
  const qaOriginRef = useRef<{ lat: number; lng: number; t: number } | null>(null);
  const qaRawFixesRef = useRef<QaCapturePoint[]>([]);
  const qaRawCountRef = useRef(0);
  const qaAcceptedCountRef = useRef(0);
  const qaMarkerMetaRef = useRef<QaMarkerMeta[]>([]);
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

  // Relativkoordinaten für den QA-Mitschnitt. Der Ursprung ist der erste
  // Rohfix; er selbst wird NICHT mitgeschrieben, nur die Differenzen.
  const qaRel = useCallback((lat: number, lng: number, t: number, accuracy: number | null, cumDistM?: number): QaCapturePoint => {
    const o = qaOriginRef.current;
    const mPerLat = 111320;
    const mPerLng = 111320 * Math.cos(((o?.lat ?? lat) * Math.PI) / 180);
    return {
      x: Math.round(((lng - (o?.lng ?? lng)) * mPerLng) * 1000) / 1000,
      y: Math.round(((lat - (o?.lat ?? lat)) * mPerLat) * 1000) / 1000,
      accuracy,
      tMs: t - (o?.t ?? t),
      ...(cumDistM != null ? { cumDistM: Math.round(cumDistM * 100) / 100 } : {}),
    };
  }, []);

  /**
   * Marker-Herkunft für den QA-Export festhalten. Rein additiv.
   *
   * `markerId` MUSS die von `createLocalTrackMarker` vergebene `local_id`
   * (`mk_…`) sein — nur über die lässt sich der Export später wieder mit der
   * Herkunft zusammenführen. Die ID im Store (`angle-<ts>-<kind>`) ist eine
   * andere und taucht in der Datenbank nicht auf.
   */
  const qaNoteMarker = useCallback((markerId: string, source: QaMarkerSource, scale: QaDistanceScale, apexIndex: number | null) => {
    if (!qaRef.current) return;
    qaMarkerMetaRef.current.push({ markerId, source, scale, apexIndex });
  }, []);

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
    // QA-Motion-Mitschnitt beenden (falls er lief) und den sichtbaren
    // Aktiv-Zustand zurücksetzen.
    if (motionActiveRef.current) {
      motionActiveRef.current = false;
      motionSubRef.current?.remove(); motionSubRef.current = null;
      void motionClient.stop();
    }
    markWarmupStopped();
    const st = store.getState();
    if (st.startLockActive) st.setStartLockActive(false);
    stopFaehrteActivity({ elapsedS: st.durationSeconds, distanceM: st.distanceMeters });
  }, [store]);

  useEffect(() => () => stopAll(), [stopAll]);

  // Marker im Store + lokal (SQLite) + Supabase ablegen (best-effort).
  const commitMarker = useCallback(async (
    marker: MarkerSample,
    qa?: { source: QaMarkerSource; scale: QaDistanceScale; apexIndex: number | null },
  ) => {
    const s = store.getState();
    s.addMarker(marker);
    if (localSessionId.current) {
      try {
        const dbId = await createLocalTrackMarker(localSessionId.current, { marker_type: marker.type, material: marker.material, angle_kind: marker.angleKind, latitude: marker.lat, longitude: marker.lng, accuracy: marker.accuracy, distance_from_start: marker.distance_from_start, note: marker.note, audio_local_uri: null });
        if (qa) qaNoteMarker(dbId, qa.source, qa.scale, qa.apexIndex);
      }
      catch (e) { console.warn('[trackRecorder] marker', e); }
    }
    if (s.currentSessionId) await saveTrackMarker(s.currentSessionId, marker);
  }, [store, qaNoteMarker]);

  // Übergabe eines FINAL bestätigten Winkels an die bestehende Pipeline (Marker/
  // Voice/Logbuch/Persistenz) — genau EINMAL je Winkel. Geometrie/Confidence liegen
  // in autoCornerDetection; die Confirmation-Entscheidung in cornerConfirmation.
  const persistConfirmedCorner = useCallback((c: ConfirmedCorner) => {
    const dbg = angleDbgRef.current;
    const dir: 'links' | 'rechts' = (c.kind === 'rechts' || c.kind === 'spitz_rechts') ? 'rechts' : 'links';
    dbg.count++;
    if (c.kind === 'spitz_rechts' || c.kind === 'spitz_links') dbg.acuteCount++;
    dbg.lastType = c.kind; dbg.lastDeg = Math.round(c.angleDeg); dbg.lastDir = dir; dbg.lastReject = null;
    if (__DEV__) logConfirmedCornerMetrics(c);

    lastCornerAtRef.current = c.apexCumDist;   // Gap für den nächsten Winkel setzen
    const now = Date.now();
    void commitMarker({
      id: `angle-${now}-${c.kind}`, type: 'winkel', material: null, angleKind: c.kind,   // stabile ID inkl. Typ
      lat: c.apexLat, lng: c.apexLng, accuracy: c.accuracyM,
      distance_from_start: Math.round(c.apexCumDist * 10) / 10,
      note: null, audio_url: null, found: false, t: now,
      confidence: c.finalConfidence, confidenceLevel: c.finalLevel,   // nur zur Laufzeit; nicht in der DB (s. MarkerSample)
    });
    onAngleRef.current?.(c.kind);
  }, [commitMarker]);

  // ENGINE=BUILD40 (Golden-Reference-Audit, Punkt 3/4): identisch zum
  // historischen Einzelschuss-Verhalten aus Commit 82bd17c — genau EIN
  // Kandidat pro Aufruf, sofort committed, KEIN Bestätigungspuffer. Bewusst
  // eine separate Funktion statt eine Fallunterscheidung mitten in der neuen
  // Pipeline, damit BUILD40 nachvollziehbar exakt der alte Pfad bleibt.
  const persistLegacyCorner = useCallback((pts: readonly LegacyAcceptedPoint[]) => {
    const r = legacyDetectCorner(pts, lastCornerAtRef.current);
    const dbg = angleDbgRef.current;
    if (r.reject) { dbg.lastReject = r.reject; return; }
    dbg.count++;
    if (r.kind === 'spitz_rechts' || r.kind === 'spitz_links') dbg.acuteCount++;
    dbg.lastType = r.kind; dbg.lastDeg = r.angleDeg; dbg.lastDir = r.dir; dbg.lastReject = null;
    lastCornerAtRef.current = r.apex.cumDist;
    const now = Date.now();
    void commitMarker({
      id: `angle-${now}-${r.kind}`, type: 'winkel', material: null, angleKind: r.kind,
      lat: r.apex.lat, lng: r.apex.lng, accuracy: r.apex.accuracy,
      distance_from_start: Math.round(r.apex.cumDist * 10) / 10,
      note: null, audio_url: null, found: false, t: now,
    }, { source: 'build40', scale: 'line', apexIndex: null });
    onAngleRef.current?.(r.kind);
  }, [commitMarker]);

  // Auto-Winkel: pro akzeptiertem Linienpunkt EIN Confirmation-Schritt. Die gesamte
  // Erkennung (Scheitelwahl, stabile Schenkel, Klassen, Confidence) liegt in
  // autoCornerDetection; feedCornerBuffer() hält denselben Kandidaten stabil und
  // liefert nur relevante Lifecycle-Events zurück.
  // Adaptive Short-Leg-Erkennung (CURRENT): arbeitet auf dem dichteren
  // Detektor-Puffer und meldet nur NEUE, noch nicht persistierte Winkel.
  // Ersetzt für kurze Schenkel die bisherige, an LEG_MIN_M = 4 m gebundene
  // Kandidatenbewertung; die Marker-/Voice-/Persistenz-Pipeline dahinter
  // bleibt unverändert.
  const persistShortLegCorners = useCallback(() => {
    // Motion-Confidence-Kopplung (±0,12): der Detector bekommt eine reine
    // NACHSCHLAGEFUNKTION für die Turn-Evidenz zum Kandidaten-Zeitpunkt. Läuft
    // kein Motion-Mitschnitt (Normalfall: kein QA-Modus oder ENGINE=BUILD40),
    // wird nichts übergeben und die Confidence bleibt exakt wie bisher.
    const turnEvidenceAt = motionActiveRef.current
      ? (t: number | null) => (t == null ? null : motionBufRef.current.evidenceFor(t))
      : undefined;
    const { corners, diagnostics } = detectShortLegCorners(detectPointsRef.current, null, turnEvidenceAt);
    if (__DEV__ && diagnostics.length) {
      const last = diagnostics[diagnostics.length - 1];
      if (last.rejectReason) angleDbgRef.current.lastReject = last.rejectReason;
    }
    // ── QA-Diagnose (nur Diagnosemodus): eine Zeile je Kandidat, inklusive
    // Motion-Turn-Evidenz, falls Core Motion mitläuft. Rein beobachtend.
    if (qaRef.current && diagnostics.length) {
      const last = diagnostics[diagnostics.length - 1];
      const changed = last.rejectReason !== qaLastRejectRef.current;
      qaLastRejectRef.current = last.rejectReason;
      if (changed || last.classification) {
        const ev = motionActiveRef.current && last.t != null
          ? motionBufRef.current.evidenceFor(last.t)
          : null;
        // Confidence-Rechenweg sichtbar machen: vorher + Motion = nachher → Entscheidung.
        const before = last.confidenceBeforeMotion;
        const adj = last.motionAdjustment;
        const confTrail = before != null && adj != null
          ? `conf ${before.toFixed(2)} ${adj >= 0 ? '+' : '−'} motion ${Math.abs(adj).toFixed(2)} = ${last.confidence.toFixed(2)}`
          : `conf ${last.confidence.toFixed(2)}`;
        pushQaCandidateLine(
          `[gps] ${new Date(last.t ?? Date.now()).toISOString().slice(11, 19)} ` +
          `acc=${last.accuracyM?.toFixed(1) ?? '—'}m typ=${last.classification ?? '—'} ` +
          `innen=${last.interiorAngleDeg?.toFixed(1) ?? '—'}° ${confTrail} ` +
          `→ ${last.rejectReason ? `rejected (${last.rejectReason})` : 'accepted'}` +
          (ev ? ` | [motion] netYaw=${ev.netYawDeg.toFixed(1)}° gross=${ev.grossYawDeg.toFixed(1)}° ` +
            `mono=${ev.monotonicity.toFixed(2)} yawShare=${ev.yawShare.toFixed(2)} ` +
            `locomotion=${ev.locomotionSource} steps=${ev.steps} ` +
            `accelFraction=${ev.gaitAccelFraction.toFixed(2)} accelThr=${ev.gaitAccelThreshold.toFixed(2)}g ` +
            `cad=${ev.cadence?.toFixed(0) ?? '—'} state=${ev.movementState ?? '—'} ` +
            `turnEvidence=${ev.evidence?.toFixed(3) ?? '—'}` : ''),
        );
      }
    }
    for (const c of corners) {
      if (c.atM <= lastCornerAtRef.current) continue;   // schon gemeldet
      lastCornerAtRef.current = c.atM;
      // ── QA: JEDE automatisch akzeptierte Ecke bekommt genau EINE Zeile ──
      // Zuordnung über den stabilen `apexIndex` der Diagnose, nicht mehr über
      // `diagnostics[length-1]` — der gehörte praktisch nie zur bestätigten
      // Ecke, weshalb akzeptierte Winkel bisher gar nicht protokolliert wurden.
      if (qaRef.current) {
        const d = diagnostics.find(x => x.apexIndex === c.apexIndex) ?? null;
        const ev = motionActiveRef.current && d?.t != null ? motionBufRef.current.evidenceFor(d.t) : null;
        const before = d?.confidenceBeforeMotion ?? null;
        const adj = d?.motionAdjustment ?? null;
        const trail = before != null && adj != null
          ? `conf ${before.toFixed(2)} ${adj >= 0 ? '+' : '−'} motion ${Math.abs(adj).toFixed(2)} = ${(d?.confidence ?? 0).toFixed(2)}`
          : `conf ${(d?.confidence ?? 0).toFixed(2)}`;
        const dir = (c.kind === 'rechts' || c.kind === 'spitz_rechts') ? 'rechts' : 'links';
        pushQaCandidateLine(
          `AUTO ${new Date(d?.t ?? Date.now()).toISOString().slice(11, 19)} ` +
          `idx=${c.apexIndex} ${c.kind} (${dir}) innen=${d?.interiorAngleDeg?.toFixed(1) ?? '—'}° ` +
          `acc=${d?.accuracyM?.toFixed(1) ?? '—'}m ${trail} → accepted` +
          (ev ? ` | turnEvidence=${ev.evidence?.toFixed(3) ?? '—'} locomotion=${ev.locomotionSource} ` +
            `steps=${ev.steps} accelFraction=${ev.gaitAccelFraction.toFixed(2)} ` +
            `netYaw=${ev.netYawDeg.toFixed(1)}° mono=${ev.monotonicity.toFixed(2)} yawShare=${ev.yawShare.toFixed(2)}` : ''),
        );
      }
      const dbg = angleDbgRef.current;
      dbg.count++;
      if (c.kind === 'spitz_rechts' || c.kind === 'spitz_links') dbg.acuteCount++;
      dbg.lastType = c.kind;
      dbg.lastDir = (c.kind === 'rechts' || c.kind === 'spitz_rechts') ? 'rechts' : 'links';
      dbg.lastReject = null;
      const p = detectPointsRef.current[c.apexIndex];
      const now = Date.now();
      void commitMarker({
        id: `angle-${now}-${c.kind}`, type: 'winkel', material: null, angleKind: c.kind,
        lat: p.lat, lng: p.lng, accuracy: p.accuracy,
        distance_from_start: Math.round(c.atM * 10) / 10,
        note: null, audio_url: null, found: false, t: now,
      }, { source: 'auto', scale: 'detector', apexIndex: c.apexIndex });
      onAngleRef.current?.(c.kind);
    }
  }, [commitMarker]);

  const detectCorner = useCallback(() => {
    // BUILD40: unveränderte historische Einzelschuss-Erkennung.
    if (getTrackingEngineMode() === 'build40') { persistLegacyCorner(pointsRef.current); return; }
    // CURRENT: adaptive Short-Leg-Erkennung auf dem dichteren Detektor-Puffer.
    // Die frühere, an LEG_MIN_M = 4 m gebundene Confirmation-Kaskade
    // (feedCornerBuffer/classifyCornerCandidate) konnte Schenkel unter 4 m
    // strukturell nie bestätigen — nachgerechnet, siehe
    // shortLegCornerDetection.ts. autoCornerDetection/cornerConfirmation
    // bleiben als Module unverändert bestehen (weiterhin getestet), werden
    // hier aber nicht mehr aufgerufen.
    persistShortLegCorners();
  }, [persistLegacyCorner, persistShortLegCorners]);

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

    // ── QA-Mitschnitt: JEDER eingegangene Rohfix, vor allen Gates. Nur im
    // Diagnosemodus; ausserhalb passiert hier nichts. ──
    if (qaRef.current) {
      if (!qaOriginRef.current) qaOriginRef.current = { lat: raw.lat, lng: raw.lng, t: raw.t };
      qaRawCountRef.current++;
      qaRawFixesRef.current.push(qaRel(raw.lat, raw.lng, raw.t, raw.accuracy));
    }

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
    if (qaRef.current) qaAcceptedCountRef.current++;

    // ── Detektor-Puffer fortschreiben (nur Winkel-Erkennung, siehe oben) ──
    {
      const a = DETECTOR_INPUT.emaAlpha;
      const prevD = detectEmaRef.current;
      const dEma: LatLng = prevD
        ? { lat: prevD.lat + (raw.lat - prevD.lat) * a, lng: prevD.lng + (raw.lng - prevD.lng) * a }
        : { lat: raw.lat, lng: raw.lng };
      detectEmaRef.current = dEma;
      const dPts = detectPointsRef.current;
      const dLast = dPts[dPts.length - 1];
      const dStep = dLast ? calculateDistance(dLast, dEma) : 0;
      if (!dLast || dStep >= DETECTOR_INPUT.minStepM) {
        dPts.push({ lat: dEma.lat, lng: dEma.lng, cumDist: (dLast?.cumDist ?? 0) + dStep, accuracy: raw.accuracy, t: raw.t });
      }
      // Rohfix-Ring für den Stop-Flush (ungeglättet, kein Gate). Nur die
      // letzten Meter werden gebraucht — bewusst klein gehalten.
      const rt = rawTailRef.current;
      const rLast = rt[rt.length - 1];
      const rStep = rLast ? calculateDistance(rLast, { lat: raw.lat, lng: raw.lng }) : 0;
      rt.push({ lat: raw.lat, lng: raw.lng, cumDist: (rLast?.cumDist ?? 0) + rStep, accuracy: raw.accuracy, t: raw.t });
      if (rt.length > 60) rt.splice(0, rt.length - 60);
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

    // 4) Winkel-Erkennung auf der frischen Linie (nur wenn aktiviert).
    // Abriss wird bewusst nur manuell gesetzt, weil das Halt-Muster im Feld zu
    // fehleranfällig ist.
    if (autoDetectRef.current) {
      detectCorner();
    }
  }, [store, flushPoints, detectCorner, handleStartLock, qaRel]);
  onFixRef.current = onFix;

  // Berechtigung + EINEN GPS-Stream öffnen (Warmup). Idempotent.
  const startWarmup = useCallback(async (): Promise<{ error: string | null }> => {
    if (watchRef.current) return { error: null };
    // Persistierte QA-Einstellungen MÜSSEN geladen sein, bevor die
    // Positionsquelle ihren Modus liest — sonst startet ein Feldtest direkt
    // nach dem App-Start auf dem Default statt auf der gewählten Quelle.
    // Idempotent; nach dem ersten Aufruf praktisch kostenlos.
    await hydrateQaModes();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { error: 'Standortberechtigung fehlt. Bitte in den Einstellungen erlauben.' };
    // iOS: falls „Genauer Standort" reduziert ist, einmalig präzise Ortung
    // anfragen (nutzt NSLocationTemporaryUsageDescriptionDictionary). Best-effort;
    // no-op ohne natives Modul oder wenn bereits präzise.
    precisionLocationClient.requestTemporaryFullAccuracy('TrackingDogSportPrecision').catch(() => {});
    // Was JETZT tatsächlich gilt — nicht die Präferenz von später. Ab hier ist
    // die Quelle für diesen Stream festgeschrieben (startWarmup ist idempotent,
    // ein späteres Umschalten wechselt den laufenden Stream bewusst NICHT).
    const activeEngine = getTrackingEngineMode();
    const activeSource = getLocationSourceMode();
    qaRef.current = isQaDiagnosticsEnabled();
    try {
      // Zentrale Positionsquelle: natives Precision-Modul bevorzugt, expo-Fallback.
      const handle = await startPositionSource((s) => {
        // Debug (source/provider) nur bei Änderung setzen — kein Re-Render-Sturm.
        setGpsDebug(d => (d.source === s.source && d.provider === s.provider) ? d : { ...d, source: s.source, provider: s.provider });
        markReportedSource(s.source ?? null);
        onFix(sampleToLocationObject(s));
      }, WATCH_OPTS);
      watchRef.current = { remove: handle.stop };
      markWarmupStarted(activeEngine, activeSource);
      setGpsDebug(d => ({ ...d, isNativeAvailable: handle.info.isNativeAvailable, rawGnssSupported: handle.info.rawGnssSupported, source: d.source ?? handle.info.source }));
      // Core Motion NUR im QA-Diagnosemodus und NUR für ENGINE=CURRENT.
      // Ausschliesslich beobachtend (siehe motionTurnEvidence.ts): die Samples
      // landen in einem RAM-Ringpuffer und werden je Kandidat protokolliert.
      // Sie fliessen NICHT in Erkennung, Confidence, Distanz oder GPS ein.
      if (qaRef.current && activeEngine === 'current' && !motionActiveRef.current) {
        motionActiveRef.current = true;
        motionBufRef.current.clear();
        markMotionStarted();
        motionSubRef.current = motionClient.onSample((m) => {
          markMotionSample();
          motionBufRef.current.push({
            t: m.timestamp, headingDelta: m.headingDelta,
            rotationMagnitude: m.rotationMagnitude, accelerationMagnitude: m.accelerationMagnitude,
            stepDelta: m.stepDelta, cadence: m.cadence, movementState: m.movementState,
          });
        });
        void motionClient.start();
      }
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
    detectPointsRef.current = [];
    detectEmaRef.current = null;
    rawTailRef.current = [];
    // QA-Mitschrift gehört zu GENAU EINER Aufzeichnung.
    qaLastRejectRef.current = null;
    qaOriginRef.current = null;
    qaRawFixesRef.current = [];
    qaRawCountRef.current = 0;
    qaAcceptedCountRef.current = 0;
    qaMarkerMetaRef.current = [];
    if (qaRef.current) { clearQaCandidateLog(); motionBufRef.current.clear(); }
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
    // ── QA: manuell gesetzte Winkel bekommen eine EIGENE, klar abgegrenzte
    // Zeile. Automatisch und manuell dürfen im Log nie verwechselt werden.
    if (qaRef.current && type === 'winkel') {
      pushQaCandidateLine(
        `MANUAL ${new Date(now).toISOString().slice(11, 19)} ` +
        `${markerOpts?.angleKind ?? 'winkel'} ` +
        `acc=${s.gpsAccuracy?.toFixed(1) ?? '—'}m bei ${Math.round(s.distanceMeters * 10) / 10} m → manuell gesetzt`,
      );
    }
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
      // Manuelle Marker zählen auf `store.distanceMeters` — also auf der
      // aufgezeichneten Linie, nicht auf dem Detektor-Puffer.
    }, { source: 'manual', scale: 'line', apexIndex: null });
  }, [store, commitMarker]);

  // Aufnahme beenden. SOFORT stoppen (synchron) und die Liegezeit starten; das
  // Speichern läuft im HINTERGRUND und blockiert NICHT die Navigation. LOCAL-FIRST:
  // Erfolg = lokale Finalisierung (durabel, unabhängig von Netz/Remote). Der Remote-
  // Transport läuft AUSSCHLIESSLICH über die persistente Sync-Queue (P-SAVE2) — kein
  // direkter finishTrackRecording-Pfad mehr (eine einzige Remote-Sync-Quelle).
  const finish = useCallback((): void => {
    // Letzten noch offenen (bestätigungswürdigen) Winkel best-effort retten, BEVOR
    // gestoppt wird — sonst ginge ein Winkel am Track-Ende ohne Auslauf verloren.
    for (const ev of confirmerRef.current.flush(Date.now())) {
      if (__DEV__) logConfirmEvent(ev);
      if (ev.type === 'confirmed' && ev.corner) persistConfirmedCorner(ev.corner);
    }
    // ── Stop-assisted final corner flush (PROTOTYP, QA-Diagnosemodus + CURRENT) ──
    // Das ausdrückliche Ende ist eine Information, die während der Aufnahme
    // nicht zur Verfügung steht: der kurze Nachlauf ist nicht „noch nicht
    // fertig", sondern vollständig. Deshalb darf ein noch offener letzter
    // Kandidat genau EINMAL mit kürzerem Nachlauf, dafür strengeren
    // Kriterien bewertet werden (siehe stopFlushCorner.ts).
    // Bewusst noch nicht für alle Nutzer aktiv: die Wirkung wird in dieser
    // Runde im Feld beobachtet, nicht ausgerollt.
    if (qaRef.current && getTrackingEngineMode() === 'current' && autoDetectRef.current) {
      const flush = evaluateStopFlush(
        detectPointsRef.current, lastCornerAtRef.current, undefined, rawTailRef.current,
      );
      const d = flush.diagnostics;
      pushQaCandidateLine(
        `[stop-flush] ${flush.corner ? `WINKEL ${flush.corner.kind}` : 'kein Winkel'} ` +
        `grund=${d.rejectReason ?? '—'} nachlauf=${d.tailM ?? '—'}m/${d.tailSamples ?? '—'}P ` +
        `innen=${d.interiorAngleDeg ?? '—'}° conf=${d.confidence}`,
      );
      if (flush.corner) {
        const p = detectPointsRef.current[flush.corner.apexIndex];
        const now = Date.now();
        lastCornerAtRef.current = flush.corner.atM;
        angleDbgRef.current.count++;
        if (flush.corner.kind === 'spitz_rechts' || flush.corner.kind === 'spitz_links') angleDbgRef.current.acuteCount++;
        angleDbgRef.current.lastType = flush.corner.kind;
        angleDbgRef.current.lastReject = null;
        void commitMarker({
          id: `angle-${now}-${flush.corner.kind}`, type: 'winkel', material: null, angleKind: flush.corner.kind,
          lat: p.lat, lng: p.lng, accuracy: p.accuracy,
          distance_from_start: Math.round(flush.corner.atM * 10) / 10,
          note: null, audio_url: null, found: false, t: now,
        }, { source: 'stop_flush', scale: 'detector', apexIndex: flush.corner.apexIndex });
        onAngleRef.current?.(flush.corner.kind);
      }
    }
    // ── QA-Mitschnitt schreiben (nur Diagnosemodus) ──────────────────────
    // Muss VOR stopAll() laufen: danach sind Detektor-Puffer und Rohring leer.
    // Rein lesend gegenüber der Erkennung — die Winkel dieses Durchlaufs werden
    // verworfen, es werden nur die Diagnosen übernommen.
    if (qaRef.current && localSessionId.current) {
      try {
        const detectPts = detectPointsRef.current;
        const linePts = pointsRef.current;
        const sweep = detectShortLegCorners(detectPts);
        const acceptedIdx = new Set(sweep.corners.map(c => c.apexIndex));
        const autoDiagnostics: QaAutoDiagnostic[] = sweep.diagnostics.map(d => ({
          apexIndex: d.apexIndex,
          tMs: d.t == null ? null : d.t - (qaOriginRef.current?.t ?? d.t),
          bearingBefore: d.bearingBefore,
          bearingAfter: d.bearingAfter,
          headingDeltaDeg: d.headingDeltaDeg,
          interiorAngleDeg: d.interiorAngleDeg,
          classification: d.classification,
          confidenceBeforeMotion: d.confidenceBeforeMotion,
          motionAdjustment: d.motionAdjustment,
          confidence: d.confidence,
          rejectReason: d.rejectReason,
          accepted: acceptedIdx.has(d.apexIndex),
        }));
        const detectorPoints = detectPts.map(p => qaRel(p.lat, p.lng, p.t ?? 0, p.accuracy, p.cumDist));
        const linePoints = linePts.map(p => qaRel(p.lat, p.lng, p.t, p.accuracy, p.cumDist));
        const rawFixes = qaRawFixesRef.current;
        void saveQaSessionCapture({
          captureVersion: 1,
          sessionLocalId: localSessionId.current,
          durationMs: rawFixes.length ? rawFixes[rawFixes.length - 1].tMs : 0,
          counts: {
            rawFixes: qaRawCountRef.current,
            acceptedFixes: qaAcceptedCountRef.current,
            rejectedFixes: rejectedRef.current,
            detectorPoints: detectorPoints.length,
            linePoints: linePoints.length,
          },
          distances: {
            rawPathM: pathLength(rawFixes),
            detectorPathM: detectPts.length ? Math.round(detectPts[detectPts.length - 1].cumDist * 100) / 100 : 0,
            recordedLineM: linePts.length ? Math.round(linePts[linePts.length - 1].cumDist * 100) / 100 : 0,
            storeDistanceM: Math.round(store.getState().distanceMeters * 100) / 100,
          },
          rawFixes,
          detectorPoints,
          linePoints,
          markers: qaMarkerMetaRef.current.slice(),
          autoDiagnostics,
        });
      } catch (e) {
        console.warn('[trackRecorder] QA-Mitschnitt', e);
      }
    }

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
  }, [stopAll, store, flushPoints, persistConfirmedCorner, commitMarker, qaRel]);

  return { startWarmup, beginRecording, pause, resume, addMarker, finish, stopAll, gpsDebug };
}

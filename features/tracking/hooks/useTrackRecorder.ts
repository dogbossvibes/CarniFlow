import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
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
  DETECTOR_INPUT, CORNER_GAP_M, type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import { fuseTurns, associateLiveTurn, nearestCompatibleTurnEvidence, type FusedTurn } from '@/features/tracking/utils/turnFusion';
import { lineGateStepM, lineEmaAlpha, inTurnZone } from '@/features/tracking/utils/turnAwareLineGate';
import { createCanonicalDistance } from '@/features/tracking/utils/canonicalDistance';
import { getTrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';
import { getLocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { hydrateQaModes } from '@/features/tracking/utils/qaModeBootstrap';
import { isQaDiagnosticsEnabled } from '@/features/tracking/utils/qaDiagnosticsMode';
import { markWarmupStarted, markReportedSource, markWarmupStopped, markMotionStarted, markMotionSample } from '@/features/tracking/utils/trackingWarmupState';
import { pushQaCandidateLine, clearQaCandidateLog } from '@/features/tracking/utils/qaCandidateLog';
import {
  saveQaSessionCapture, pathLength, QA_MOTION_CONTEXT_MS, toQaTurnFusion, toQaImuOnlyEvent,
  type QaCapturePoint, type QaMarkerMeta, type QaAutoDiagnostic,
  type QaMarkerSource, type QaDistanceScale, type QaCandidateMotion, type QaSessionCapture,
} from '@/features/tracking/utils/qaSessionCapture';
import { evaluateStopFlush } from '@/features/tracking/utils/stopFlushCorner';
import { createMarkerWriteBarrier } from '@/features/tracking/utils/markerWriteBarrier';
import { motionClient } from '@/features/tracking/native/motionClient';
import { MotionEvidenceBuffer, TURN_EVIDENCE_DEFAULTS, motionTurnDirection, type TurnEvidence } from '@/features/tracking/utils/motionTurnEvidence';
import { saveTrackMarker } from '@/features/tracking/services/trackService';
import { createLocalTrainingSession, finalizeLocalTrainingSession, type NewLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { syncNow } from '@/features/sync/services/syncEngine';
import { buildLocalTrackSessionInput, type LocalTrackSessionMeta } from '@/features/tracking/utils/localTrackSession';
import { nowIso } from '@/lib/localDb/ids';
import { createLocalTrackPointsBatch, createLocalTrackMarker } from '@/features/tracking/repositories/localTrackRepository';
import { precisionLocationClient } from '@/features/tracking/native/precisionLocationClient';
import { TRACK_LOCATION_TASK, setTrackFixHandler, startBackgroundUpdates, stopBackgroundUpdates } from '@/features/tracking/native/backgroundLocationTask';
import { beginBackgroundLayDiagnostics, endBackgroundLayDiagnostics, recordBackgroundLayEvent } from '@/features/tracking/utils/backgroundLayDiagnostics';
import { startFaehrteActivity, updateFaehrteActivity, stopFaehrteActivity } from '@/features/tracking/native/faehrteLiveActivity';
import { classifyManualAngleGeometry } from '@/features/tracking/utils/manualAngleGeometry';
import { voiceDiagnostics } from '@/features/tracking/utils/voiceEvents';
import { isLaySessionWarmupReady, layStartBlockingReason } from '@/features/tracking/utils/layStartLock';
import { confirmLayMovement } from '@/features/tracking/utils/layMovementConfirmation';
import { boundedPush } from '@/features/tracking/utils/trackingUxDiagnostics';

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
const START_LOCK_MAX_MS       = 12000;  // nur mit gutem Anker: nach 12 s auch ohne Bewegungsbestätigung freigeben
const START_ANCHOR_MIN_FIXES  = 4;      // so viele gute Fixes → Median-Anker
const START_ANCHOR_MAX_ACC_M  = 20;     // nur Fixes ≤ 20 m fliessen in den Anker
const START_FIX_MAX_AGE_MS    = 5000;   // gecachte/stale Fixes bestätigen keine Bewegung

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
  const warmupAccuracyRef = useRef<number | null>(null);
  const localSessionCreationRef = useRef<Promise<void> | null>(null);
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
  const emaRef        = useRef<LatLng | null>(null);   // EMA 0,4 — bisherige Linien-Kette; speist Start-Lock + kanonische Distanz (unverändert)
  const lineEmaRef    = useRef<LatLng | null>(null);   // Linien-Geometrie: EMA 0,4, in Kurvenzonen 0,7 (turn-aware)
  const canonDistRef  = useRef(createCanonicalDistance());   // Distanz unabhängig von der Punktdichte
  const puckRef       = useRef<LatLng | null>(null);   // schneller geglättete Position für den LIVE-Puck
  const lastRawRef    = useRef<Raw | null>(null);      // letzter (akzeptierter) Rohfix
  const lastCornerAtRef = useRef<number>(-Infinity);   // cumDist des letzten Winkels
  const lineTurnZoneRef = useRef(false);               // Kurvenzone laut Detektor-Puffer (turn-aware Linien-Gate)
  const lastCornerRescuedRef = useRef(false);          // war der letzte Winkel eine Split-Apex-Paarung?
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
  const startupOriginRef = useRef<number | null>(null);
  const startupMovementRef = useRef<NonNullable<QaSessionCapture['startupMovementDiagnostics']>>({
    samples: [], confirmationTSec: null, confirmationSource: null,
    confirmationConfidence: null, fallbackUsed: false, truncated: false,
  });
  const startupRef = useRef<QaSessionCapture['startupDiagnostics']>({
    userTapStartTSec: null, permissionStartTSec: null, permissionEndTSec: null,
    warmupStartTSec: null, firstRawFixTSec: null, firstStableFixTSec: null,
    firstAcceptedFixTSec: null, motionReadyTSec: null, recorderArmedTSec: null,
    motionSubscriptionStartedTSec: null, pedometerSubscriptionStartedTSec: null,
    motionFirstCallbackTSec: null, pedometerFirstCallbackTSec: null, firstNonZeroStepTSec: null,
    actualRecordingStartTSec: null, startupDelayMs: null, blockingReason: null,
    accuracyAtStartM: null,
    recordingSessionStartedTSec: null, geometryStartedTSec: null,
    startupUiDelayMs: null, geometryLockDelayMs: null,
    movementConfirmedTSec: null, fallbackUsed: false,
    movementConfirmationSource: null, movementConfirmationConfidence: null,
    movementGpsDisplacementM: null, movementStepDelta: 0, movementMotionState: null,
  });
  const startupSec = () => startupOriginRef.current == null ? null : (Date.now() - startupOriginRef.current) / 1000;
  const noteUserTapStart = useCallback(() => { startupRef.current!.userTapStartTSec = startupSec(); }, []);
  // Ein unmittelbar vor Finish bestätigter Marker ist synchron im Store,
  // sein SQLite-Insert kann aber noch laufen. Finish wartet nur auf diese
  // lokalen Writes, bevor QA-Snapshot und Session-Finalisierung gespeichert werden.
  const markerWritesRef = useRef(createMarkerWriteBarrier());
  /** QA v2.1: Motion-Evidenz je bewertetem Kandidaten, LIVE mitgeschnitten. */
  const qaCandidateMotionRef = useRef<QaCandidateMotion[]>([]);
  const liveTurnsRef = useRef<Map<number, FusedTurn>>(new Map());
  // Keep evidence by apex timestamp beyond the bounded Motion sample ring.
  const turnEvidenceRef = useRef<Map<number, TurnEvidence>>(new Map());
  /** Verhindert Doppel-Einträge: je apexIndex genau ein Mitschnitt. */
  const qaMotionSeenRef = useRef<Set<number>>(new Set());
  // Start-Lock (Stabilisierungsphase): Anker + Bewegungserkennung + Drift-Zähler.
  const startLockRef      = useRef<boolean>(false);              // true ⇒ Startphase aktiv
  const startLockBeganRef = useRef<number>(0);                   // ms: Beginn der Startphase
  const startFixesRef     = useRef<{ lat: number; lng: number; accuracy: number; t: number }[]>([]);
  const startAnchorRef    = useRef<LatLng | null>(null);         // berechneter Startanker
  const startAnchorAccRef = useRef<number | null>(null);         // Ø-Genauigkeit des Ankers
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
  const diagnosticsReadyRef = useRef<Promise<void> | null>(null);
  const foregroundPermissionRef = useRef<string | null>(null);
  const lastAppStateRef = useRef(AppState.currentState);
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
    void recordBackgroundLayEvent(sid, 'flushAttempt').catch(() => {});
    void recordBackgroundLayEvent(sid, 'persistAttempt', batch.length).catch(() => {});
    try {
      await createLocalTrackPointsBatch(sid, batch);
      void recordBackgroundLayEvent(sid, 'flushSuccess').catch(() => {});
      void recordBackgroundLayEvent(sid, 'persistSuccess', batch.length).catch(() => {});
    } catch (e) {
      void recordBackgroundLayEvent(sid, 'flushFailure').catch(() => {});
      void recordBackgroundLayEvent(sid, 'persistFailure', batch.length).catch(() => {});
      console.warn('[trackRecorder] flush', e); ptBuffer.current.unshift(...batch);
    }
  }, []);

  const stopAll = useCallback(() => {
    recordingRef.current = false;
    startLockRef.current = false;
    watchRef.current?.remove(); watchRef.current = null;
    headRef.current?.remove();  headRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (bgActiveRef.current) {
      bgActiveRef.current = false;
      setTrackFixHandler(null, localSessionId.current);
      void stopBackgroundUpdates(localSessionId.current);
    } else if (localSessionId.current) {
      const sid = localSessionId.current;
      void (diagnosticsReadyRef.current ?? Promise.resolve())
        .then(() => endBackgroundLayDiagnostics(sid)).catch(() => {});
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

  // Observation only: AppState does not start, stop, or restore recording.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      const previous = lastAppStateRef.current;
      lastAppStateRef.current = next;
      const sid = localSessionId.current;
      if (!sid || !recordingRef.current) return;
      if (next === 'active') {
        void recordBackgroundLayEvent(sid, 'foreground').catch(() => {});
        if (previous !== 'active') void recordBackgroundLayEvent(sid, 'resume').catch(() => {});
        void Location.hasStartedLocationUpdatesAsync(TRACK_LOCATION_TASK)
          .then(value => recordBackgroundLayEvent(sid, 'taskRegistered', 1, String(value))).catch(() => {});
        void Location.getForegroundPermissionsAsync()
          .then(value => recordBackgroundLayEvent(sid, 'foregroundPermission', 1, value.status)).catch(() => {});
        void Location.getBackgroundPermissionsAsync()
          .then(value => recordBackgroundLayEvent(sid, 'backgroundPermission', 1, value.status)).catch(() => {});
      } else if (next === 'background' || next === 'inactive') {
        void recordBackgroundLayEvent(sid, next).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Marker im Store + lokal (SQLite) + Supabase ablegen (best-effort).
  const commitMarker = useCallback(async (
    marker: MarkerSample,
    qa?: { source: QaMarkerSource; scale: QaDistanceScale; apexIndex: number | null },
  ) => {
    const s = store.getState();
    s.addMarker(marker);
    const markerSessionId = localSessionId.current;
    if (markerSessionId) {
      const localWrite = (async () => {
        try {
          await localSessionCreationRef.current;
          const dbId = await createLocalTrackMarker(markerSessionId, { marker_type: marker.type, material: marker.material, angle_kind: marker.angleKind, latitude: marker.lat, longitude: marker.lng, accuracy: marker.accuracy, distance_from_start: marker.distance_from_start, note: marker.note, audio_local_uri: null });
          if (qa) qaNoteMarker(dbId, qa.source, qa.scale, qa.apexIndex);
          return true;
        } catch (e) { console.warn('[trackRecorder] marker', e); return false; }
      })();
      markerWritesRef.current.track(localWrite);
      await localWrite;
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
    // kein Motion-Mitschnitt (z. B. ENGINE=BUILD40 oder Modul nicht verfügbar),
    // wird nichts übergeben und die Confidence bleibt exakt wie bisher.
    const turnEvidenceAt = motionActiveRef.current
      ? (t: number | null) => {
        if (t == null) return null;
        const current = motionBufRef.current.evidenceForTrailing(t);
        const retained = turnEvidenceRef.current.get(t);
        if (current.available && (!retained || (current.evidence ?? 0) > (retained.evidence ?? 0)))
          turnEvidenceRef.current.set(t, current);
        return turnEvidenceRef.current.get(t) ?? current;
      }
      : undefined;
    const turnEvidenceForDirection = motionActiveRef.current
      ? (t: number | null, direction: 'links' | 'rechts') => t == null ? null : nearestCompatibleTurnEvidence(t, direction, queryT => {
        if (queryT == null) return null;
        return motionBufRef.current.evidenceFor(queryT);
      })
      : undefined;
    // Turn-Fusion (GPS ∪ IMU): Regelpfad des Detektors + Split-Apex-Paarung +
    // Schärfe-Auflösbarkeit. Ohne Motion rein GPS-basiert.
    let { corners, diagnostics, turns } = fuseTurns(detectPointsRef.current, { turnEvidenceAt, turnEvidenceForDirection });
    // Some candidates are inspected before the GPS corner is accepted. Save
    // their available evidence and re-evaluate the same GPS candidates once.
    let newlyAssociated = false;
    if (motionActiveRef.current) for (const d of diagnostics) {
      if (d.t == null || turnEvidenceRef.current.has(d.t)) continue;
      const ev = motionBufRef.current.evidenceForTrailing(d.t);
      if (ev.available) { turnEvidenceRef.current.set(d.t, ev); newlyAssociated = true; }
    }
    if (newlyAssociated) ({ corners, diagnostics, turns } = fuseTurns(detectPointsRef.current, { turnEvidenceAt, turnEvidenceForDirection }));

    // ── QA v2.1: Motion-Evidenz LIVE je Kandidat festhalten ────────────────
    // Rein beobachtend. Greift nur im QA-Diagnosemodus und nur, solange Core
    // Motion ohnehin läuft. Es wird NICHTS neu berechnet — die Aggregate
    // stammen aus derselben Auswertung, die der Detektor gerade benutzt hat,
    // und die Rohsamples kommen unverändert aus dem Ringpuffer.
    if (qaRef.current && motionActiveRef.current) {
      for (const d of diagnostics) {
        const tCand = d.t;
        if (tCand == null) continue;
        // Nur Kandidaten, bei denen Motion überhaupt eine Rolle spielen kann:
        // die Geometrie muss bis zur Richtungsmessung gekommen sein.
        if (d.headingDeltaDeg == null) continue;
        const ev = motionBufRef.current.evidenceForTrailing(tCand);
        const previousIndex = qaCandidateMotionRef.current.findIndex(c => c.apexIndex === d.apexIndex);
        if (previousIndex >= 0 && (qaCandidateMotionRef.current[previousIndex].turnEvidence ?? 0) >= (ev.evidence ?? 0)) continue;
        qaMotionSeenRef.current.add(d.apexIndex);
        const samples = motionBufRef.current.samplesIn(
          tCand - (TURN_EVIDENCE_DEFAULTS.halfWindowSec * 1000 + QA_MOTION_CONTEXT_MS),
          tCand + (TURN_EVIDENCE_DEFAULTS.halfWindowSec * 1000 + QA_MOTION_CONTEXT_MS),
        );
        const t0 = qaOriginRef.current?.t ?? tCand;
        const candidate: QaCandidateMotion = {
          apexIndex: d.apexIndex,
          evaluatedAtMs: Math.round(tCand - t0),
          windowStartMs: Math.round(ev.windowStartMs - tCand),
          windowEndMs: Math.round(ev.windowEndMs - tCand),
          sampleCount: ev.sampleCount,
          firstSampleAgeMs: samples.length ? Math.round(samples[0].t - tCand) : null,
          lastSampleAgeMs: samples.length ? Math.round(samples[samples.length - 1].t - tCand) : null,
          motionAvailable: ev.available,
          netYawDeg: Math.round(ev.netYawDeg * 100) / 100,
          signedNetYawDeg: Math.round(ev.signedNetYawDeg * 100) / 100,
          direction: motionTurnDirection(ev),
          grossYawDeg: Math.round(ev.grossYawDeg * 100) / 100,
          monotonicity: Math.round(ev.monotonicity * 1000) / 1000,
          yawShare: Math.round(ev.yawShare * 1000) / 1000,
          accelerationEvidence: Math.round(ev.gaitAccelFraction * 1000) / 1000,
          stepDelta: ev.steps,
          cadence: ev.cadence,
          movementState: ev.movementState,
          locomotionEvidence: ev.locomotionSource,
          turnEvidence: ev.evidence,
          adjustmentApplied: d.motionAdjustment ?? 0,
          samples: samples.map(x => ({
            dtMs: Math.round(x.t - tCand),
            headingDelta: Math.round(x.headingDelta * 100) / 100,
            rotationMagnitude: Math.round(x.rotationMagnitude * 1000) / 1000,
            accelerationMagnitude: Math.round(x.accelerationMagnitude * 1000) / 1000,
            stepDelta: x.stepDelta,
            cadence: x.cadence,
            movementState: x.movementState,
          })),
          source: 'live',
        };
        if (previousIndex >= 0) qaCandidateMotionRef.current[previousIndex] = candidate;
        else qaCandidateMotionRef.current.push(candidate);
      }
    }
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
          ? motionBufRef.current.evidenceForTrailing(last.t)
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
      const fused = turns.find(t => t.apexIndex === c.apexIndex) ?? null;
      // Eine gepaarte (Split-Apex-)Ecke wird früh gemeldet; entdeckt der Regelpfad
      // mit mehr Punkten einen Nachbarscheitel in derselben Ecke, darf daraus keine
      // zweite Markierung werden.
      if (lastCornerRescuedRef.current && c.atM - lastCornerAtRef.current < CORNER_GAP_M) continue;
      if (fused) liveTurnsRef.current.set(c.apexIndex, fused);
      lastCornerRescuedRef.current = fused?.source === 'gps_split_apex';
      lastCornerAtRef.current = c.atM;
      // ── QA: JEDE automatisch akzeptierte Ecke bekommt genau EINE Zeile ──
      // Zuordnung über den stabilen `apexIndex` der Diagnose, nicht mehr über
      // `diagnostics[length-1]` — der gehörte praktisch nie zur bestätigten
      // Ecke, weshalb akzeptierte Winkel bisher gar nicht protokolliert wurden.
      if (qaRef.current) {
        const d = diagnostics.find(x => x.apexIndex === c.apexIndex) ?? null;
        const ev = motionActiveRef.current && d?.t != null ? motionBufRef.current.evidenceForTrailing(d.t) : null;
        const before = d?.confidenceBeforeMotion ?? null;
        const adj = d?.motionAdjustment ?? null;
        const trail = before != null && adj != null
          ? `conf ${before.toFixed(2)} ${adj >= 0 ? '+' : '−'} motion ${Math.abs(adj).toFixed(2)} = ${(d?.confidence ?? 0).toFixed(2)}`
          : `conf ${(d?.confidence ?? 0).toFixed(2)}`;
        const dir = (c.kind === 'rechts' || c.kind === 'spitz_rechts') ? 'rechts' : 'links';
        pushQaCandidateLine(
          `AUTO ${new Date(d?.t ?? Date.now()).toISOString().slice(11, 19)} ` +
          `idx=${c.apexIndex} ${c.kind} (${dir}) src=${fused?.source ?? 'gps'} sharp=${fused?.sharpness ?? '—'} ` +
          `geo=${fused?.geometryQualityLevel ?? '—'}/${fused?.accuracyToLegRatio ?? '—'} ` +
          `innen=${d?.interiorAngleDeg?.toFixed(1) ?? '—'}° ` +
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
      }, { source: fused?.source === 'gps_split_apex' ? 'auto_split_apex' : 'auto', scale: 'detector', apexIndex: c.apexIndex });
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
  const handleStartLock = useCallback((raw: Raw): boolean => {
    const s = store.getState();
    const now = raw.t;
    const elapsed = now - startLockBeganRef.current;

    // Gute Fixes für den Anker sammeln (nur akzeptable Genauigkeit).
    const previousAccepted = startFixesRef.current[startFixesRef.current.length - 1];
    const distinct = !previousAccepted || raw.t > previousAccepted.t;
    const fresh = raw.t <= now && now - raw.t <= START_FIX_MAX_AGE_MS;
    const plausibleSpeed = !previousAccepted || (distinct
      && calculateDistance(previousAccepted, raw) / ((raw.t - previousAccepted.t) / 1000) <= MAX_SPEED_MPS);
    if (raw.accuracy != null && raw.accuracy <= START_ANCHOR_MAX_ACC_M && fresh && distinct && plausibleSpeed) {
      startFixesRef.current.push({ lat: raw.lat, lng: raw.lng, accuracy: raw.accuracy, t: raw.t });
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

    const anchor = startAnchorRef.current;
    const gaitSamples = motionBufRef.current.samplesIn(startLockBeganRef.current, now);
    const movement = confirmLayMovement({ anchor, anchorAccuracyM: startAnchorAccRef.current,
      acceptedFixes: startFixesRef.current,
      gaitSamples,
      sessionStartedMs: startLockBeganRef.current, nowMs: now, fallbackAfterMs: START_LOCK_MAX_MS });
    if (anchor && movement.displacementM != null && movement.displacementM > MIN_STEP_M && !movement.confirmed) {
      startDriftRejRef.current++; s.setStartDriftRejectedCount(startDriftRejRef.current);
    }
    const moved = movement.confirmed && movement.source !== 'fallback';
    if (moved) startupRef.current!.movementConfirmedTSec ??= startupSec();
    startupRef.current!.movementConfirmationSource = movement.source;
    startupRef.current!.movementConfirmationConfidence = movement.confidence;
    startupRef.current!.movementGpsDisplacementM = movement.displacementM;
    startupRef.current!.movementStepDelta = movement.stepDelta;
    startupRef.current!.movementMotionState = movement.motionState;

    const blocker = layStartBlockingReason({ anchorReady: !!anchor, movementConfirmed: moved,
      elapsedMs: elapsed, maximumMs: START_LOCK_MAX_MS });
    startupRef.current!.blockingReason = blocker;
    if (qaRef.current && startupRef.current!.recordingSessionStartedTSec != null) {
      const startupMovement = startupMovementRef.current;
      const walking = gaitSamples.filter(g => g.movementState === 'walking' || g.movementState === 'running');
      const accelEvidence = walking.length
        ? walking.filter(g => g.accelerationMagnitude >= 0.1).length / walking.length : 0;
      const tSec = Math.max(0, (now - startLockBeganRef.current) / 1000);
      const recorded = boundedPush(startupMovement.samples, {
        tSec, accuracyM: raw.accuracy ?? null,
        acceptedFix: !!(raw.accuracy != null && raw.accuracy <= START_ANCHOR_MAX_ACC_M && fresh && distinct && plausibleSpeed),
        displacementFromAnchorM: movement.displacementM,
        cumulativeStepDelta: movement.stepDelta, motionState: movement.motionState,
        locomotionEvidence: movement.stepDelta > 0 ? 'steps'
          : accelEvidence >= TURN_EVIDENCE_DEFAULTS.gaitAccelMinFraction ? 'gait_accel' : 'none',
        accelerationEvidence: Math.round(accelEvidence * 1000) / 1000,
        candidateSource: movement.source, confirmed: movement.confirmed,
        rejectionReason: blocker ?? (!anchor ? 'anchor_unavailable' : !movement.confirmed ? 'movement_unconfirmed' : null),
      }, 100);
      if (!recorded) startupMovement.truncated = true;
      if (movement.confirmed && startupMovement.confirmationTSec == null) {
        startupMovement.confirmationTSec = tSec;
        startupMovement.confirmationSource = movement.source;
        startupMovement.confirmationConfidence = movement.confidence;
        startupMovement.fallbackUsed = movement.source === 'fallback';
      }
    }
    if (blocker) return false;

    // Kein Fallback auf einen unbrauchbaren Fix: der Anker muss aus guten Fixes stammen.
    const a = startAnchorRef.current;
    if (!a) return false;

    // Start-Lock beenden und den Anker als ERSTEN Linienpunkt setzen.
    startLockRef.current = false;
    s.setStartLockActive(false);
    if (startupRef.current!.actualRecordingStartTSec == null) {
      startupRef.current!.actualRecordingStartTSec = startupSec();
      startupRef.current!.geometryStartedTSec = startupRef.current!.actualRecordingStartTSec;
      const sessionStart = startupRef.current!.recordingSessionStartedTSec;
      startupRef.current!.geometryLockDelayMs = sessionStart == null ? null
        : Math.max(0, Math.round((startupRef.current!.geometryStartedTSec! - sessionStart) * 1000));
      startupRef.current!.fallbackUsed = movement.source === 'fallback';
      startupRef.current!.accuracyAtStartM = startAnchorAccRef.current;
      const tap = startupRef.current!.userTapStartTSec;
      startupRef.current!.startupDelayMs = tap == null ? null : Math.max(0, Math.round((startupRef.current!.actualRecordingStartTSec! - tap) * 1000));
      startupRef.current!.blockingReason = null;
    }
    const p0: AcceptedPoint = { lat: a.lat, lng: a.lng, t: now, accuracy: startAnchorAccRef.current, cumDist: 0 };
    pointsRef.current = [p0];
    canonDistRef.current.start({ lat: p0.lat, lng: p0.lng });
    lastRawRef.current = raw;
    s.addTrackPoint({ lat: p0.lat, lng: p0.lng, accuracy: p0.accuracy, altitude: null, speed: null, heading: null, t: now });
    ptBuffer.current.push({
      latitude: p0.lat, longitude: p0.lng, accuracy: p0.accuracy ?? null,
      altitude: null, speed: null, heading: null, timestamp: new Date(now).toISOString(),
    });
    void recordBackgroundLayEvent(localSessionId.current, 'onFixAccepted').catch(() => {});
    return true;
  }, [store]);

  // EIN Fix-Handler für Warmup UND Aufnahme.
  const onFix = useCallback((loc: Location.LocationObject) => {
    warmupAccuracyRef.current = loc.coords.accuracy ?? null;
    startupRef.current!.firstRawFixTSec ??= startupSec();
    if (loc.coords.accuracy != null && loc.coords.accuracy <= START_ANCHOR_MAX_ACC_M)
      startupRef.current!.firstStableFixTSec ??= startupSec();
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
    // Turn-aware: in einer Kurvenzone (CURRENT) glättet die Linie leichter, damit
    // eine Ecke nicht über ~2 m abgerundet wird; sonst unverändert EMA_ALPHA.
    const lineAlpha = getTrackingEngineMode() === 'build40' ? EMA_ALPHA : lineEmaAlpha(lineTurnZoneRef.current);
    // Kanonische Kette (Start-Lock + Distanz): unverändert EMA_ALPHA.
    const prevEma = emaRef.current;
    const ema: LatLng = prevEma
      ? { lat: prevEma.lat + (raw.lat - prevEma.lat) * EMA_ALPHA, lng: prevEma.lng + (raw.lng - prevEma.lng) * EMA_ALPHA }
      : { lat: raw.lat, lng: raw.lng };
    emaRef.current = ema;
    // Geometrie-Kette der LINIE (turn-aware, s. o.).
    const prevLine = lineEmaRef.current;
    const lineEma: LatLng = prevLine
      ? { lat: prevLine.lat + (raw.lat - prevLine.lat) * lineAlpha, lng: prevLine.lng + (raw.lng - prevLine.lng) * lineAlpha }
      : { lat: raw.lat, lng: raw.lng };
    lineEmaRef.current = lineEma;

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
    void recordBackgroundLayEvent(localSessionId.current, 'onFixReceived').catch(() => {});

    // ── Start-Lock: bis echte Bewegung KEINE Linie/Distanz/Winkel. Verhindert,
    //    dass Warmup-/Startdrift (auf iPhone real ~8 m im Stand) als Strecke landet.
    //    Bei Freigabe ist der Anker als erster Linienpunkt gesetzt → Fix läuft weiter.
    if (startLockRef.current) {
      if (!handleStartLock(raw)) {
        void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'start_lock_active').catch(() => {});
        angleDbgRef.current.lastReject = 'start_lock_active'; return;
      }   // noch am Stabilisieren
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
    if (raw.accuracy == null || raw.accuracy > MAX_ACCURACY_M) {
      void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'accuracy').catch(() => {});
      rejectedRef.current++; return;
    }
    const prevRaw = lastRawRef.current;
    if (prevRaw) {
      const d = calculateDistance(prevRaw, raw);
      const dt = (raw.t - prevRaw.t) / 1000;
      if (dt > 0 && d / dt > MAX_SPEED_MPS) {
        void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'gps_outlier').catch(() => {});
        rejectedRef.current++; return;
      }   // unrealistischer Sprung
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
      // Kurvenzone für Linien-Gate (dieser Fix) und Linien-Glättung (nächster Fix).
      lineTurnZoneRef.current = inTurnZone(dPts, lastCornerAtRef.current);
    }

    // 3) Distanz-Gate: erst ab MIN_STEP_M einen neuen Linienpunkt setzen.
    // Kanonische Distanz: exakt die bisherige Semantik (EMA 0,4 / Gate 2,0 m),
    // unabhängig davon, wie dicht die Geometrie unten persistiert wird.
    {
      const before = canonDistRef.current.total;
      const total = canonDistRef.current.push(ema);
      if (total !== before) store.getState().setDistanceMeters(total);
    }
    const pts = pointsRef.current;
    const last = pts[pts.length - 1];
    const step = last ? calculateDistance(last, lineEma) : 0;
    // Turn-aware Gate (CURRENT): 2,0 m auf gerader Strecke wie bisher, in der
    // Kurvenzone dichter (turnAwareLineGate.ts). BUILD40 bleibt beim festen Gate.
    const gateM = getTrackingEngineMode() === 'build40' ? MIN_STEP_M : lineGateStepM(detectPointsRef.current, lastCornerAtRef.current);
    if (last && step < gateM) {
      void recordBackgroundLayEvent(localSessionId.current, 'onFixRejected', 1, 'distance_gate').catch(() => {});
      return;
    }

    const accepted: AcceptedPoint = {
      lat: lineEma.lat, lng: lineEma.lng, t: raw.t, accuracy: raw.accuracy,
      cumDist: (last?.cumDist ?? 0) + step,
    };
    pts.push(accepted);
    void recordBackgroundLayEvent(localSessionId.current, 'onFixAccepted').catch(() => {});
    startupRef.current!.firstAcceptedFixTSec ??= startupSec();

    const sample: TrackPointSample = {
      lat: accepted.lat, lng: accepted.lng, accuracy: accepted.accuracy,
      altitude: raw.altitude, speed: raw.speed, heading: null, t: accepted.t,
    };
    s.addTrackPoint(sample, { skipDistance: true });   // Distanz kommt aus canonDistRef (Punktdichte-unabhängig); Store aktualisiert Qualität
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
    warmupAccuracyRef.current = null;
    startupOriginRef.current ??= Date.now();
    startupRef.current!.warmupStartTSec ??= startupSec();
    // Persistierte QA-Einstellungen MÜSSEN geladen sein, bevor die
    // Positionsquelle ihren Modus liest — sonst startet ein Feldtest direkt
    // nach dem App-Start auf dem Default statt auf der gewählten Quelle.
    // Idempotent; nach dem ersten Aufruf praktisch kostenlos.
    await hydrateQaModes();
    startupRef.current!.permissionStartTSec ??= startupSec();
    const { status } = await Location.requestForegroundPermissionsAsync();
    foregroundPermissionRef.current = status;
    startupRef.current!.permissionEndTSec ??= startupSec();
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
      // Bestehende Motion-Bridge liefert Schritte/Gang für den Geometriestart
      // und Turn-Evidenz. Ohne Modul bleibt der GPS-/Fallback-Pfad verfügbar.
      if (activeEngine === 'current' && !motionActiveRef.current) {
        motionActiveRef.current = true;
        motionBufRef.current.clear();
        markMotionStarted();
        startupRef.current!.motionSubscriptionStartedTSec ??= startupSec();
        motionSubRef.current = motionClient.onSample((m) => {
          markMotionSample();
          const callbackTime = startupSec();
          startupRef.current!.motionFirstCallbackTSec ??= callbackTime;
          startupRef.current!.pedometerFirstCallbackTSec ??= callbackTime;
          if (m.stepDelta > 0) startupRef.current!.firstNonZeroStepTSec ??= callbackTime;
          motionBufRef.current.push({
            t: m.timestamp, headingDelta: m.headingDelta,
            rotationMagnitude: m.rotationMagnitude, accelerationMagnitude: m.accelerationMagnitude,
            stepDelta: m.stepDelta, cadence: m.cadence, movementState: m.movementState,
          });
        });
        startupRef.current!.pedometerSubscriptionStartedTSec ??= startupSec();
        void motionClient.start().then(() => { startupRef.current!.motionReadyTSec ??= startupSec(); })
          .catch(() => { /* Motion ist optional; GPS-Aufnahme läuft weiter. */ });
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
    onSessionStarted?: () => void;
  }): Promise<{ error: string | null }> => {
    if (!input.ownerId) return { error: 'Bitte zuerst anmelden.' };   // sauber abbrechen — keine halbe Session
    const dogId = input.dogId ?? null;
    if (!watchRef.current) {
      const w = await startWarmup();
      if (w.error) return w;
    }
    if (!isLaySessionWarmupReady(warmupAccuracyRef.current)) return { error: 'gps_not_ready' };

    // ── SOFORT scharf schalten (synchron, VOR jedem await/Netz-Call) ──
    // So hängt die Session nicht an Heading oder Hintergrundberechtigung. Der
    // Timer läuft sofort; Linienpunkte warten weiterhin auf den Startanker.
    pointsRef.current = [];
    emaRef.current = null;
    lineEmaRef.current = null;
    canonDistRef.current.reset();
    puckRef.current = null;
    lastRawRef.current = null;
    rejectedRef.current = 0;
    lastCornerAtRef.current = -Infinity;
    lastCornerRescuedRef.current = false;
    lineTurnZoneRef.current = false;
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
    markerWritesRef.current = createMarkerWriteBarrier();
    qaCandidateMotionRef.current = [];
    startupMovementRef.current = { samples: [], confirmationTSec: null, confirmationSource: null,
      confirmationConfidence: null, fallbackUsed: false, truncated: false };
    liveTurnsRef.current.clear();
    turnEvidenceRef.current.clear();
    qaMotionSeenRef.current.clear();
    motionBufRef.current.clear();
    if (qaRef.current) clearQaCandidateLog();
    confirmerRef.current.reset();   // laufende Confirmation-State-Machine leeren
    gpsQualityRef.current.reset();  // Rolling-GPS-Qualität leeren
    gpsQualityStateRef.current = null;
    angleDbgRef.current = { count: 0, acuteCount: 0, lastType: null, lastDeg: null, lastDir: null, lastReject: null };
    ptBuffer.current = [];
    // Führende lokale Session-ID SOFORT deterministisch setzen (kein Warten auf Remote/Netz).
    localSessionId.current = input.localId;
    const diagnosticsReady = beginBackgroundLayDiagnostics(input.localId).catch(() => {});
    diagnosticsReadyRef.current = diagnosticsReady;
    if (AppState.currentState === 'active') void recordBackgroundLayEvent(input.localId, 'foreground').catch(() => {});
    void recordBackgroundLayEvent(input.localId, 'foregroundPermission', 1, foregroundPermissionRef.current ?? 'unknown').catch(() => {});
    localSessionInputRef.current = buildLocalTrackSessionInput({
      localId: input.localId, ownerId: input.ownerId, dogId, startedAt: nowIso(), meta: input.meta,
    });
    // Start-Lock scharf: Stabilisierungsphase beginnt jetzt (kein Warmup-Drift als Strecke).
    startLockRef.current = true;
    startLockBeganRef.current = Date.now();
    startFixesRef.current = [];
    startAnchorRef.current = null;
    startAnchorAccRef.current = null;
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
    startupRef.current!.recorderArmedTSec = startupSec();
    startupRef.current!.recordingSessionStartedTSec = startupRef.current!.recorderArmedTSec;
    const tap = startupRef.current!.userTapStartTSec;
    startupRef.current!.startupUiDelayMs = tap == null ? null
      : Math.max(0, Math.round((startupRef.current!.recordingSessionStartedTSec! - tap) * 1000));
    startupRef.current!.blockingReason = startAnchorRef.current ? null : 'waiting_for_stable_anchor';
    startFaehrteActivity();        // iOS: Lockscreen / Dynamic Island (no-op sonst)
    if (__DEV__) console.log('[trackRecorder] recording started', { localId: input.localId });

    // Die sichtbare Session startet sofort. Marker-Writes und Finish warten
    // weiterhin auf die lokale Session, selbst wenn die UI bereits aktiv ist.
    localSessionCreationRef.current = localSessionInputRef.current
      ? createLocalTrainingSession(localSessionInputRef.current).then(() => {})
        .catch(e => { console.warn('[trackRecorder] local session', e); })
      : Promise.resolve();
    input.onSessionStarted?.();

    // ── Hintergrund-Aufnahme: auf Foreground-Service-GPS umschalten, damit die
    // Spur auch bei Display-aus / App in der Tasche weiterläuft. Zeigt dabei die
    // kleine Status-Anzeige (Android-Notification / iOS blaue Pille). Best-effort:
    // ohne „Immer"-Berechtigung bleibt der Vordergrund-Watch als Fallback aktiv.
    void (async () => { try {
      await diagnosticsReady;
      // Play-Policy: Die prominente In-App-Offenlegung (Disclosure) wird ZWINGEND
      // VOR dem Aufnahmestart im UI gezeigt (BackgroundLocationDisclosure in
      // app/track/legen.tsx). beginRecording läuft erst nach „Weiter". Hier wird
      // die OS-Berechtigung nur noch angefragt, wenn bereits erteilt oder erneut
      // fragbar. Ohne „Immer"-Berechtigung bleibt der Vordergrund-Watch als Fallback.
      const bgCurrent = await Location.getBackgroundPermissionsAsync();
      void recordBackgroundLayEvent(input.localId, 'backgroundPermission', 1, bgCurrent.status).catch(() => {});
      if (!recordingRef.current) return;
      const mayRequest = bgCurrent.status === 'granted' || bgCurrent.canAskAgain;
      if (mayRequest) {
        const bg = await Location.requestBackgroundPermissionsAsync();
        void recordBackgroundLayEvent(input.localId, 'backgroundPermission', 1, bg.status).catch(() => {});
        if (bg.status === 'granted' && recordingRef.current) {
          setTrackFixHandler(loc => onFixRef.current(loc), input.localId);
          await startBackgroundUpdates({
            notificationTitle: '🐾 Fährte läuft',
            notificationBody:  'Aufnahme aktiv – tippen, um ANYVO zu öffnen',
            notificationColor: '#15E6C3',
            diagnosticSessionId: input.localId,
          });
          if (!recordingRef.current) { setTrackFixHandler(null, input.localId); await stopBackgroundUpdates(input.localId); return; }
          watchRef.current?.remove(); watchRef.current = null;   // Warmup-Watch ablösen
          bgActiveRef.current = true;
        }
      }
    } catch (e) { console.warn('[trackRecorder] background', e); /* Fallback: Vordergrund-Watch bleibt */ } })();

    // ── ab hier nur best-effort, blockiert die Aufnahme nicht ──
    void Location.watchHeadingAsync(h => store.getState().setHeading(h.trueHeading ?? h.magHeading))
      .then(handle => { if (recordingRef.current) headRef.current = handle; else handle.remove(); })
      .catch(() => { /* Heading optional */ });

    // Lokale SQLite-Session (Offline-First, KEIN Netz/getUser) — führende ID = input.localId.
    // Idempotent (insert or ignore) → Doppeltipp-sicher. Schlägt der Insert fehl, laufen die
    // Punkte weiter gegen dieselbe local_id (kein FK); der Finish-Pfad legt die Zeile per
    // ensure-create nach, damit nichts verloren geht.
    await localSessionCreationRef.current;

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
        motionActiveRef.current ? (t: number | null) => (t == null ? null : motionBufRef.current.evidenceForTrailing(t)) : undefined,
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
    const pendingLocalMarkers = markerWritesRef.current.snapshot();
    // ── QA-Mitschnitt schreiben (nur Diagnosemodus) ──────────────────────
    // Muss VOR stopAll() laufen: danach sind Detektor-Puffer und Rohring leer.
    // Rein lesend gegenüber der Erkennung — die Winkel dieses Durchlaufs werden
    // verworfen, es werden nur die Diagnosen übernommen.
    if (qaRef.current && localSessionId.current) {
      try {
        const detectPts = detectPointsRef.current;
        const linePts = pointsRef.current;
        const originMs = qaOriginRef.current?.t ?? detectPts[0]?.t ?? 0;
        // Hinweis: der Motion-Ringpuffer hält nur die letzten ~20 s — IMU-only-Ereignisse
        // decken deshalb nur das Ende der Aufnahme ab.
        const sweep = fuseTurns(detectPts, {
          turnEvidenceAt: motionActiveRef.current
            ? (t: number | null) => (t == null ? null : turnEvidenceRef.current.get(t)
              ?? motionBufRef.current.evidenceForTrailing(t))
            : undefined,
          turnEvidenceForDirection: motionActiveRef.current
            ? (t: number | null, direction: 'links' | 'rechts') => t == null ? null : nearestCompatibleTurnEvidence(t, direction, queryT => {
              if (queryT == null) return null;
              return motionBufRef.current.evidenceFor(queryT);
            })
            : undefined,
          motionSamples: motionActiveRef.current ? motionBufRef.current.samplesIn(-Infinity, Infinity) : undefined,
        });
        const associatedTurns = sweep.turns.map(t => {
          const associated = associateLiveTurn(t, Array.from(liveTurnsRef.current.values()));
          return { ...associated, motionAssociationSource: associated.motionAssociationSource === 'nearest_episode' ? 'nearest_episode' as const
            : !associated.motion.available ? 'none' as const
            : !t.motion.available ? 'accepted_live_turn' as const
            : t.t != null && turnEvidenceRef.current.has(t.t) ? 'live_cached' as const : 'current_ring' as const };
        });
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
        const capture = {
          captureVersion: 2 as const,
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
          candidateMotionEvidence: qaCandidateMotionRef.current.slice(),
          turnFusion: associatedTurns.map(t => toQaTurnFusion(t, originMs)),
          imuOnlyEvents: sweep.imuOnly.map(e => toQaImuOnlyEvent(e, originMs)),
          startupDiagnostics: startupRef.current,
          startupMovementDiagnostics: startupMovementRef.current,
          voiceDiagnostics: voiceDiagnostics(),
          manualAngleGeometryDiagnostics: classifyManualAngleGeometry(store.getState().markers, detectPts, associatedTurns),
        };
        void pendingLocalMarkers.then(markersSaved => {
          if (markersSaved) void saveQaSessionCapture({ ...capture, markers: qaMarkerMetaRef.current.slice() });
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
      manualAngleGeometry: classifyManualAngleGeometry(
        s.markers, detectPointsRef.current,
        fuseTurns(detectPointsRef.current).turns,
      ).markers,
    };

    void (async () => {
      // 1) LOKAL sichern = echter Erfolg. Punkte flushen, Session-Zeile sicherstellen
      //    (ensure-create, falls Start-Insert fehlschlug) und finalisieren.
      const lid = localSessionId.current;
      try {
        if (!(await pendingLocalMarkers)) throw new Error('Lokale Marker konnten nicht vollständig gespeichert werden.');
        await localSessionCreationRef.current;
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
            manualAngleGeometry: summary.manualAngleGeometry,
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

  return { startWarmup, beginRecording, noteUserTapStart, pause, resume, addMarker, finish, stopAll, gpsDebug };
}

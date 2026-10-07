import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { AppState } from 'react-native';
import {
  startPositionSource, sampleToLocationObject, type LocationSourceKind,
} from '@/features/tracking/utils/positionSource';
import {
  useTrackingStore,
  type MarkerType, type MarkerMaterial, type AngleKind, type MarkerSample,
} from '@/features/tracking/store/trackingStore';
import { calculateAverageAccuracy } from '@/features/tracking/utils/gpsFilter';
import {
  createCornerConfirmer,
  type CornerConfirmer, type ConfirmedCorner,
} from '@/features/tracking/utils/cornerConfirmation';
import type { GpsQualityState } from '@/features/tracking/utils/gpsQualityState';
import { logConfirmEvent, logConfirmedCornerMetrics } from '@/features/tracking/utils/angleDiagnostics';
import { fuseTurns, associateLiveTurn, nearestCompatibleTurnEvidence } from '@/features/tracking/utils/turnFusion';
import { getTrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';
import { getLocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { hydrateQaModes } from '@/features/tracking/utils/qaModeBootstrap';
import { isQaDiagnosticsEnabled } from '@/features/tracking/utils/qaDiagnosticsMode';
import { markWarmupStarted, markReportedSource, markWarmupStopped, markMotionStarted, markMotionSample } from '@/features/tracking/utils/trackingWarmupState';
import { pushQaCandidateLine, clearQaCandidateLog } from '@/features/tracking/utils/qaCandidateLog';
import {
  saveQaSessionCapture, pathLength, toQaTurnFusion, toQaImuOnlyEvent,
  type QaMarkerMeta, type QaAutoDiagnostic,
  type QaMarkerSource, type QaDistanceScale, type QaSessionCapture,
} from '@/features/tracking/utils/qaSessionCapture';
import { evaluateStopFlush } from '@/features/tracking/utils/stopFlushCorner';
import { createMarkerWriteBarrier } from '@/features/tracking/utils/markerWriteBarrier';
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
import { TRACK_LOCATION_TASK, setTrackFixHandler, startBackgroundUpdates, stopBackgroundUpdates } from '@/features/tracking/native/backgroundLocationTask';
import { beginBackgroundLayDiagnostics, endBackgroundLayDiagnostics, recordBackgroundLayEvent } from '@/features/tracking/utils/backgroundLayDiagnostics';
import { startFaehrteActivity, updateFaehrteActivity, stopFaehrteActivity } from '@/features/tracking/native/faehrteLiveActivity';
import { classifyManualAngleGeometry } from '@/features/tracking/utils/manualAngleGeometry';
import { voiceDiagnostics } from '@/features/tracking/utils/voiceEvents';
import { isLaySessionWarmupReady } from '@/features/tracking/utils/layStartLock';
import {
  createLayProcessingState, createLayProcessor, type LayProcessingState,
} from '@/features/tracking/engine/layProcessingSession';
import {
  registerLaySession, getLaySessionStatus, deliverLayFix, stopLaySession, beginFinalizeLaySession,
  bindBackgroundLaySession, unbindBackgroundLaySession,
} from '@/features/tracking/engine/laySessionRuntime';

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

// Filter-/Glättungs-Parameter, Start-Lock-Konstanten und der synchrone Fix-Kern
// liegen in features/tracking/engine/layProcessingSession.ts (unverändert verschoben).

const WATCH_OPTS: Location.LocationOptions = {
  accuracy:         Location.Accuracy.BestForNavigation,
  timeInterval:     1000,
  distanceInterval: 0,        // zeitbasiert; Filterung/Gating macht dieser Hook
};



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

  // Fachlicher Lay-Zustand: EIN sessiongebundenes, React-unabhängiges Objekt
  // (createLayProcessingState). Die Box-Namen entsprechen den bisherigen Refs;
  // beginRecording setzt sie wie bisher für jede Aufnahme zurück.
  const laySessionRef = useRef<LayProcessingState | null>(null);
  if (!laySessionRef.current) laySessionRef.current = createLayProcessingState();
  const laySession = laySessionRef.current;
  const {
    pointsRef, emaRef, lineEmaRef, canonDistRef, puckRef, lastRawRef, lastCornerAtRef, lineTurnZoneRef,
    lastCornerRescuedRef, detectPointsRef, detectEmaRef, rawTailRef, rejectedRef,
    startLockRef, startLockBeganRef, startFixesRef, startAnchorRef, startAnchorAccRef, startDriftRejRef,
    gpsQualityRef, gpsQualityStateRef, angleDbgRef, liveTurnsRef, turnEvidenceRef, qaMotionSeenRef,
    qaCandidateMotionRef, qaLastRejectRef, qaOriginRef, qaRawFixesRef, qaRawCountRef, qaAcceptedCountRef,
  } = laySession;
  // ── Eigener, dichterer Punktstrom NUR für die Winkel-Erkennung ──
  // Die aufgezeichnete LINIE bleibt unverändert (EMA_ALPHA 0,4 / MIN_STEP_M 2 m).
  // Für kurze Schenkel (Feldschema: ~3,75 m) reicht dieser Strom nicht: er
  // liefert dort ~1 Punkt pro Schenkel, und die ruhige Glättung rundet die
  // Ecke über ~2 m ab. Der Detektor bekommt deshalb denselben Fix-Strom mit
  // leichterer Glättung und feinerem Distanz-Gate (siehe DETECTOR_INPUT).
  // Reine Erkennungs-Eingabe: weder Linie, Distanz, Persistenz noch Auswertung
  // sehen diese Punkte.
  // UNGEGLÄTTETE Fixe der letzten Meter — ausschliesslich für den
  // Stop-assisted Flush am Sessionende (die Glättung hat über einen sehr
  // kurzen Schlussnachlauf die neue Richtung noch nicht eingeholt, gemessen in
  // stopFlushCorner.test.ts). Kleiner Ringpuffer, nie persistiert.
  // Core-Motion-Mitschnitt beim Legen — NUR im QA-Diagnosemodus und NUR für
  // ENGINE=CURRENT. Rein beobachtend: erzeugt keinen Kandidaten, verwirft
  // keinen, verändert keine Confidence, keine Distanz, kein GPS.
  const motionBufRef = useRef<MotionEvidenceBuffer>(new MotionEvidenceBuffer(20));
  const motionSubRef = useRef<{ remove: () => void } | null>(null);
  const motionActiveRef = useRef(false);
  const qaRef = useRef(false);
  // ── QA-Mitschnitt (nur im Diagnosemodus befüllt) ──
  // Ursprung für die Anonymisierung: der erste eingegangene Rohfix.
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
  // Keep evidence by apex timestamp beyond the bounded Motion sample ring.
  /** Verhindert Doppel-Einträge: je apexIndex genau ein Mitschnitt. */
  // Start-Lock (Stabilisierungsphase): Anker + Bewegungserkennung + Drift-Zähler.
  // Winkel-Debug (Teil E): Zähler + letzter Winkel + letzter Ablehnungsgrund.
  const onAngleRef    = useRef<TrackRecorderOptions['onAngle']>(opts?.onAngle);
  onAngleRef.current  = opts?.onAngle;
  // Phase 2: adaptive Confirmation-State-Machine (ein Kandidat zur Zeit). Persistiert
  // einen Winkel erst, wenn er final bestätigt ist (HIGH sofort, MEDIUM nach Beleg).
  const confirmerRef  = useRef<CornerConfirmer>(createCornerConfirmer());
  // Phase 3: laufende GPS-Qualitätsbewertung (Rolling Window) als Kontext für die
  // Confirmation-Anforderung. Beeinflusst NIE die Geometrie, verwirft nie allein.
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

  // true = alles Gepufferte ist dauerhaft geschrieben (oder nichts offen); false = Write fehlgeschlagen
  // (Batch bleibt für den nächsten Versuch im Puffer). Die Hintergrund-Verarbeitung wartet darauf.
  const flushPoints = useCallback(async (): Promise<boolean> => {
    const sid = localSessionId.current;
    if (!sid || ptBuffer.current.length === 0) return true;
    const batch = ptBuffer.current; ptBuffer.current = [];
    void recordBackgroundLayEvent(sid, 'flushAttempt').catch(() => {});
    void recordBackgroundLayEvent(sid, 'persistAttempt', batch.length).catch(() => {});
    try {
      await createLocalTrackPointsBatch(sid, batch);
      void recordBackgroundLayEvent(sid, 'flushSuccess').catch(() => {});
      void recordBackgroundLayEvent(sid, 'persistSuccess', batch.length).catch(() => {});
      return true;
    } catch (e) {
      void recordBackgroundLayEvent(sid, 'flushFailure').catch(() => {});
      void recordBackgroundLayEvent(sid, 'persistFailure', batch.length).catch(() => {});
      console.warn('[trackRecorder] flush', e); ptBuffer.current.unshift(...batch);
      return false;
    }
  }, []);

  const stopAll = useCallback(() => {
    recordingRef.current = false;
    stopLaySession(localSessionId.current);   // Runtime: keine weiteren Fixes; Bindung des Hintergrund-Tasks lösen
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
  }, [store, startLockRef]);

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
  }, [commitMarker, angleDbgRef, lastCornerAtRef]);


  // Fachlicher Lay-Fix-Kern: sessiongebundener, React-unabhängiger Processor
  // (features/tracking/engine/layProcessingSession). Der Hook bleibt Owner:
  // er erzeugt die Session, reicht Fixes durch und hält UI, Persistenz,
  // Hintergrund-Task und Lifecycle.
  const processor = useMemo(() => createLayProcessor(laySession, {
    store, localSessionId, ptBuffer, flushPoints: async () => { await flushPoints(); }, commitMarker, onAngleRef, recordingRef, qaRef,
    motionActiveRef, motionBufRef, autoDetectRef, startupRef, startupMovementRef, startupSec,
  }), [laySession, store, flushPoints, commitMarker]);
  const qaRel = processor.qaRel;

  // EIN Fix-Handler für Warmup UND Aufnahme.
  const onFix = useCallback((loc: Location.LocationObject) => {
    warmupAccuracyRef.current = loc.coords.accuracy ?? null;
    // Aktive Aufnahme: über die Lay-Session-Runtime (kanalübergreifende Dedup,
    // Serialisierung mit Hintergrund-Fixes). Ohne laufende Arbeit synchron wie bisher.
    const sid = localSessionId.current;
    if (sid && getLaySessionStatus(sid) === 'active') { void deliverLayFix(sid, loc, 'foreground'); return; }
    processor.processFix(loc);   // Warmup / keine aktive Session: unverändert direkt
  }, [processor]);
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
    stopLaySession(localSessionId.current);   // eine evtl. vorherige Runtime-Session nimmt keine Fixes mehr an
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
    // Fachliche Ownership: dieselbe Session (Processor + State) für Vordergrund UND Hintergrund-Task.
    // persist schreibt nur in GENAU diese Session (fail closed, falls der Hook inzwischen eine andere führt).
    registerLaySession({
      sessionId: input.localId, dogId, startedAtMs: startLockBeganRef.current,
      processFix: processor.processFix,
      persist: async () => (localSessionId.current === input.localId ? flushPoints() : false),
    });
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
          // Hintergrund-Task an GENAU diese Session binden; die Verarbeitung macht die Session-Runtime.
          // Der Handler ist nur noch die optionale UI-Brücke (Live-Genauigkeit), kein Verarbeitungspfad.
          bindBackgroundLaySession(input.localId, dogId);
          setTrackFixHandler(loc => { warmupAccuracyRef.current = loc.coords.accuracy ?? null; }, input.localId);
          await startBackgroundUpdates({
            notificationTitle: '🐾 Fährte läuft',
            notificationBody:  'Aufnahme aktiv – tippen, um ANYVO zu öffnen',
            notificationColor: '#15E6C3',
            diagnosticSessionId: input.localId,
          });
          if (!recordingRef.current) { unbindBackgroundLaySession(input.localId); setTrackFixHandler(null, input.localId); await stopBackgroundUpdates(input.localId); return; }
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
  }, [startWarmup, store, flushPoints, processor, angleDbgRef, canonDistRef, detectEmaRef, detectPointsRef, emaRef, gpsQualityRef, gpsQualityStateRef, lastCornerAtRef, lastCornerRescuedRef, lastRawRef, lineEmaRef, lineTurnZoneRef, liveTurnsRef, pointsRef, puckRef, qaAcceptedCountRef, qaCandidateMotionRef, qaLastRejectRef, qaMotionSeenRef, qaOriginRef, qaRawCountRef, qaRawFixesRef, rawTailRef, rejectedRef, startAnchorAccRef, startAnchorRef, startDriftRejRef, startFixesRef, startLockBeganRef, startLockRef, turnEvidenceRef]);

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
    // Ab jetzt nimmt die Session keine Fixes mehr an; bereits laufende Verarbeitung
    // (inkl. awaited Persistenz) wird vor Flush/Finalize abgewartet.
    const processingDrained = beginFinalizeLaySession(localSessionId.current);
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
        await processingDrained;
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
  }, [stopAll, store, flushPoints, persistConfirmedCorner, commitMarker, qaRel, angleDbgRef, detectPointsRef, lastCornerAtRef, liveTurnsRef, pointsRef, qaAcceptedCountRef, qaCandidateMotionRef, qaOriginRef, qaRawCountRef, qaRawFixesRef, rawTailRef, rejectedRef, turnEvidenceRef]);

  return { startWarmup, beginRecording, noteUserTapStart, pause, resume, addMarker, finish, stopAll, gpsDebug };
}

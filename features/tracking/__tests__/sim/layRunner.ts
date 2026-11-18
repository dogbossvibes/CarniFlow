// Fährten-Simulator (T-192) — reiner Testcode.
// Speist simulierte GPS- und Bewegungsdaten in die ECHTE Lege-Verarbeitung der App
// (createLayProcessor) — unverändert, genau so wie useTrackRecorder sie treibt.
// Die aufrufende Testdatei muss trackingEngineMode, backgroundLayDiagnostics und
// AsyncStorage mocken (siehe layMatrix.test.ts).
import {
  createLayProcessingState, createLayProcessor,
  type LayFixResult, type LayPointRow, type LayProcessorDeps, type LayRejectReason, type LayStoreFacade,
} from '../../engine/layProcessingSession';
import { MotionEvidenceBuffer, type MotionWindowSample } from '../../utils/motionTurnEvidence';
import type { AngleKind, MarkerSample } from '../../store/trackingStore';
import type { FusedTurn } from '../../utils/turnFusion';
import type { SimFix } from './gpsModel';

export const LAT0 = 47.3, LNG0 = 8.5;
export const M_LAT = 111320, M_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
export const SIM_T0_MS = 1_800_000_000_000;

export const toLatLng = (x: number, y: number) => ({ latitude: LAT0 + y / M_LAT, longitude: LNG0 + x / M_LNG });
export const toLocal = (lat: number, lng: number) => ({ x: (lng - LNG0) * M_LNG, y: (lat - LAT0) * M_LAT });

export interface RecordedPoint { x: number; y: number; tMs: number; accuracy: number | null }
export interface RecordedCorner {
  kind: AngleKind; x: number; y: number; atM: number; committedAtMs: number;
  /** Fusions-Diagnose der Engine im Moment der Meldung (Quelle, Geometrie, Confidence) — nur für die Ursachenanalyse. */
  fused: FusedTurn | null;
}
/** Manuell gesetzter Gegenstand: Position = Live-Punkt der App im Moment des Antippens (wie addMarker). */
export interface RecordedObject { index: number; x: number; y: number; accuracy: number | null; atM: number; tMs: number }

export interface LayRunResult {
  line: RecordedPoint[];
  corners: RecordedCorner[];
  objects: RecordedObject[];
  distanceM: number;
  fixesTotal: number;
  rejects: Partial<Record<LayRejectReason, number>>;
  /** Startpunkt der aufgezeichneten Linie (Anker) und Zeitpunkt der Freigabe. */
  anchor: { x: number; y: number } | null;
  anchorReleasedAtMs: number | null;
  /** Rechenzeit der Engine je GPS-Messung auf diesem Rechner (ms) — wächst sie mit der Fährtenlänge? */
  fixComputeMaxMs: number;
  fixComputeTotalMs: number;
}

export interface LayRunInput {
  fixes: readonly SimFix[];
  motion: readonly MotionWindowSample[];
  /** false = Gerät ohne nutzbare Bewegungssensorik (nur GPS). */
  motionActive?: boolean;
  /** Zeitpunkte (ms), zu denen der Fährtenleger «Gegenstand» antippt. */
  objectTapsMs?: readonly number[];
  t0Ms?: number;
}

function startupDiagnostics(): NonNullable<LayProcessorDeps['startupRef']['current']> {
  return {
    userTapStartTSec: null, permissionStartTSec: null, permissionEndTSec: null, warmupStartTSec: null,
    firstRawFixTSec: null, firstStableFixTSec: null, firstAcceptedFixTSec: null, motionReadyTSec: null, recorderArmedTSec: null,
    motionSubscriptionStartedTSec: null, pedometerSubscriptionStartedTSec: null, motionFirstCallbackTSec: null,
    pedometerFirstCallbackTSec: null, firstNonZeroStepTSec: null, actualRecordingStartTSec: null, startupDelayMs: null,
    blockingReason: null, accuracyAtStartM: null, recordingSessionStartedTSec: 0, geometryStartedTSec: null,
    startupUiDelayMs: null, geometryLockDelayMs: null, movementConfirmedTSec: null, fallbackUsed: false,
    movementConfirmationSource: null, movementConfirmationConfidence: null, movementGpsDisplacementM: null,
    movementStepDelta: 0, movementMotionState: null,
  } as NonNullable<LayProcessorDeps['startupRef']['current']>;
}

/** Ein kompletter Lege-Durchlauf durch die echte Engine. */
export function runLay(input: LayRunInput): LayRunResult {
  const t0 = input.t0Ms ?? SIM_T0_MS;
  let clock = t0;
  const result: LayRunResult = { line: [], corners: [], objects: [], distanceM: 0, fixesTotal: 0, rejects: {}, anchor: null, anchorReleasedAtMs: null, fixComputeMaxMs: 0, fixComputeTotalMs: 0 };
  const markers: { marker: MarkerSample; at: number; fused: FusedTurn | null }[] = [];
  let puck: { x: number; y: number; accuracy: number | null } | null = null;
  const taps = [...(input.objectTapsMs ?? [])].sort((a, b) => a - b);
  const state: LayStoreFacade = {
    isPaused: false,
    setCurrentPosition: (p, accuracy) => { puck = { ...toLocal(p.lat, p.lng), accuracy }; }, setStartAnchor: () => {}, setStartDriftRejectedCount: () => {},
    setStartLockActive: () => {}, setDistanceMeters: () => {},
    // Die aufgezeichnete Linie, wie sie im Store landet — inklusive Startanker als erstem Punkt.
    addTrackPoint: p => { result.line.push({ ...toLocal(p.lat, p.lng), tMs: p.t, accuracy: p.accuracy ?? null }); },
  };
  const ptBuffer = { current: [] as LayPointRow[] };
  const motionBuf = new MotionEvidenceBuffer(20);
  const session = createLayProcessingState();
  const processor = createLayProcessor(session, {
    store: { getState: () => state },
    localSessionId: { current: 'sim' },
    ptBuffer,
    flushPoints: async () => { ptBuffer.current = []; },
    commitMarker: async (marker, qa) => { markers.push({ marker, at: clock, fused: qa?.apexIndex != null ? session.liveTurnsRef.current.get(qa.apexIndex) ?? null : null }); },
    // Nachträgliche Spitz-Hochstufung (T-211): wie im Store nur normal → spitz desselben Markers.
    upgradeAngleKind: (markerId, kind) => { const hit = markers.find(m => m.marker.id === markerId); if (hit) hit.marker = { ...hit.marker, angleKind: kind }; },
    onAngleRef: { current: undefined },
    recordingRef: { current: true },
    qaRef: { current: false },
    motionActiveRef: { current: input.motionActive ?? true },
    motionBufRef: { current: motionBuf },
    autoDetectRef: { current: true },
    startupRef: { current: startupDiagnostics() },
    startupMovementRef: { current: { samples: [], confirmationTSec: null, confirmationSource: null, confirmationConfidence: null, fallbackUsed: false, truncated: false } },
    startupSec: () => (clock - t0) / 1000,
  });
  // Wie beginRecording: Start-Lock scharf, Beginn = aktuelle Uhr.
  session.startLockRef.current = true;
  session.startLockBeganRef.current = clock;

  type Event = { at: number; order: number; fix?: SimFix; motion?: MotionWindowSample };
  const events: Event[] = [
    ...input.motion.map((motion): Event => ({ at: motion.t, order: 0, motion })),
    ...input.fixes.map((fix): Event => ({ at: fix.receivedMs, order: 1, fix })),
  ].sort((a, b) => a.at - b.at || a.order - b.order || (a.fix && b.fix ? a.fix.tMs - b.fix.tMs : 0));

  // Die Engine liest Date.now() und protokolliert im Dev-Modus jede Messung:
  // Uhr auf Simulationszeit stellen und Protokoll stumm schalten — nur für diesen Lauf.
  const realNow = Date.now, realLog = console.log;
  Date.now = () => clock;
  console.log = () => {};
  try {
    for (const ev of events) {
      while (taps.length && taps[0] <= ev.at) {
        const tMs = taps.shift()!;
        if (puck) result.objects.push({ index: result.objects.length, ...(puck as { x: number; y: number; accuracy: number | null }), atM: result.distanceM, tMs });
      }
      clock = ev.at;
      if (ev.motion) { motionBuf.push(ev.motion); continue; }
      const fix = ev.fix!;
      result.fixesTotal++;
      const started = performance.now();
      const r: LayFixResult = processor.processFix({
        coords: { ...toLatLng(fix.x, fix.y), accuracy: fix.accuracy, altitude: null, speed: fix.speedMps, heading: null, altitudeAccuracy: null },
        timestamp: fix.tMs,
      } as never, { receivedAtMs: fix.receivedMs, source: fix.background ? 'background' : 'foreground' });
      const took = performance.now() - started;
      result.fixComputeTotalMs += took;
      if (took > result.fixComputeMaxMs) result.fixComputeMaxMs = took;
      if (r.outcome === 'rejected' && r.rejectReason) result.rejects[r.rejectReason] = (result.rejects[r.rejectReason] ?? 0) + 1;
      if (r.anchorReleased && result.anchorReleasedAtMs == null) result.anchorReleasedAtMs = fix.tMs;
      result.distanceM = r.distanceM;
    }
  } finally {
    Date.now = realNow;
    console.log = realLog;
  }

  const anchor = session.startAnchorRef.current;
  result.anchor = anchor ? toLocal(anchor.lat, anchor.lng) : null;
  for (const { marker, at, fused } of markers) {
    if (marker.type !== 'winkel' || !marker.angleKind || marker.lat == null || marker.lng == null) continue;
    result.corners.push({ kind: marker.angleKind, ...toLocal(marker.lat, marker.lng), atM: marker.distance_from_start ?? 0, committedAtMs: at, fused });
  }
  return result;
}

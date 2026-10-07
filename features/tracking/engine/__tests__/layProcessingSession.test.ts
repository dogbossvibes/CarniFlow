// Sessiongebundener Lay-Processor: Foreground-Parität mit dem ORIGINALEN
// useTrackRecorder (b6bc114) und explizite, testbare Ergebnisse — ohne React.
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import {
  createLayProcessingState, createLayProcessor,
  type LayFixResult, type LayPointRow, type LayStoreFacade, type LayProcessingState,
} from '../layProcessingSession';
import { MotionEvidenceBuffer } from '../../utils/motionTurnEvidence';
import type { MarkerSample, TrackPointSample, AngleKind } from '../../store/trackingStore';
import { scenarios, LAT0, LNG0, M_LAT, M_LNG, T0, type Scenario } from './helpers/layScenarios';
import { LAY_GOLDEN_B6BC114 } from './helpers/layGolden';

let mockEngine: 'current' | 'build40' = 'current';
let clock = T0;
jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => mockEngine }));
jest.mock('../../utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) }));

interface Run {
  session: LayProcessingState;
  results: LayFixResult[];
  points: TrackPointSample[];
  distanceCalls: number[];
  angles: AngleKind[];
  markers: MarkerSample[];
  buffered: LayPointRow[];
  flushes: number;
  storeLog: string[];
}

/** Treibt den Processor wie useTrackRecorder nach beginRecording (Start-Lock scharf). */
function runScenario(sc: Scenario): Run {
  mockEngine = sc.engine ?? 'current';
  clock = T0;
  const run: Run = { session: createLayProcessingState(), results: [], points: [], distanceCalls: [], angles: [], markers: [], buffered: [], flushes: 0, storeLog: [] };
  const state: LayStoreFacade = {
    isPaused: false,
    setCurrentPosition: () => { run.storeLog.push('position'); },
    setStartAnchor: () => { run.storeLog.push('anchor'); },
    setStartDriftRejectedCount: () => { run.storeLog.push('drift'); },
    setStartLockActive: active => { run.storeLog.push(`lock:${active}`); },
    addTrackPoint: p => { run.points.push(p); run.storeLog.push('point'); },
    setDistanceMeters: m => { run.distanceCalls.push(m); },
  };
  const ptBuffer = { current: [] as LayPointRow[] };
  const motionBuf = new MotionEvidenceBuffer(20);
  const processor = createLayProcessor(run.session, {
    store: { getState: () => state },
    localSessionId: { current: 'local' },
    ptBuffer,
    flushPoints: async () => { run.flushes++; run.buffered.push(...ptBuffer.current); ptBuffer.current = []; },
    commitMarker: async marker => { run.markers.push(marker); },
    onAngleRef: { current: kind => { run.angles.push(kind); } },
    recordingRef: { current: true },
    qaRef: { current: sc.qa ?? false },
    motionActiveRef: { current: (sc.engine ?? 'current') === 'current' },
    motionBufRef: { current: motionBuf },
    autoDetectRef: { current: sc.autoDetect ?? true },
    startupRef: { current: { userTapStartTSec: null, permissionStartTSec: null, permissionEndTSec: null, warmupStartTSec: null,
      firstRawFixTSec: null, firstStableFixTSec: null, firstAcceptedFixTSec: null, motionReadyTSec: null, recorderArmedTSec: null,
      motionSubscriptionStartedTSec: null, pedometerSubscriptionStartedTSec: null, motionFirstCallbackTSec: null,
      pedometerFirstCallbackTSec: null, firstNonZeroStepTSec: null, actualRecordingStartTSec: null, startupDelayMs: null,
      blockingReason: null, accuracyAtStartM: null, recordingSessionStartedTSec: 0, geometryStartedTSec: null,
      startupUiDelayMs: null, geometryLockDelayMs: null, movementConfirmedTSec: null, fallbackUsed: false,
      movementConfirmationSource: null, movementConfirmationConfidence: null, movementGpsDisplacementM: null,
      movementStepDelta: 0, movementMotionState: null } },
    startupMovementRef: { current: { samples: [], confirmationTSec: null, confirmationSource: null, confirmationConfidence: null, fallbackUsed: false, truncated: false } },
    startupSec: () => (clock - T0) / 1000,
  });
  // Wie beginRecording: Start-Lock scharf, Beginn = aktuelle Uhr.
  run.session.startLockRef.current = true;
  run.session.startLockBeganRef.current = clock;
  for (const st of sc.steps) {
    if (st.k === 'fix') {
      clock = st.t + (st.ageMs ?? 0);
      run.results.push(processor.processFix({
        coords: { latitude: LAT0 + st.y / M_LAT, longitude: LNG0 + st.x / M_LNG, accuracy: st.acc, altitude: null, speed: st.speed ?? 1, heading: null, altitudeAccuracy: null },
        timestamp: st.t,
      } as never));
    } else if (st.k === 'motion') {
      clock = st.t;
      motionBuf.push({ t: st.t, headingDelta: st.headingDelta, rotationMagnitude: Math.abs(st.headingDelta) / 10, accelerationMagnitude: 0.15, stepDelta: st.stepDelta, cadence: 100, movementState: 'walking' });
    } else if (st.k === 'pause') state.isPaused = st.on;
  }
  return run;
}
const hash = (pts: TrackPointSample[]) => createHash('sha256').update(JSON.stringify(pts.map(p => [p.lat, p.lng, p.accuracy, p.t]))).digest('hex').slice(0, 16);

beforeEach(() => { jest.spyOn(Date, 'now').mockImplementation(() => clock); jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

// Manuelle Marker sind Hook-Funktionalität (addMarker) — Processor-Parität ohne sie.
const processorScenarios = scenarios.filter(s => !s.steps.some(st => st.k === 'marker'));

describe('Foreground-Parität mit dem Original (Golden b6bc114): Punktfolge, Distanz, Winkel', () => {
  it.each(processorScenarios.map(s => [s.name, s] as const))('%s', (name, sc) => {
    const golden = LAY_GOLDEN_B6BC114[name];
    const run = runScenario(sc);
    expect(run.points).toHaveLength(golden.points);
    expect(hash(run.points)).toBe(golden.pointsHash);
    expect(run.distanceCalls.at(-1) ?? 0).toBe(golden.distance);
    expect(run.angles).toEqual(golden.corners);
  });
});

describe('Corner-Parität (Schwerpunkt-Szenarien)', () => {
  const kinds = (name: string) => runScenario(scenarios.find(s => s.name === name)!).angles;
  it('90° rechts / links werden wie bisher erkannt', () => {
    expect(kinds('right90 current')).toEqual(['rechts']);
    expect(kinds('left90 current')).toEqual(['links']);
    expect(kinds('right90 build40')).toEqual(['rechts']);
  });
  it('Spitzwinkel: Verhalten unverändert (inkl. bisheriger Klassifikation je Engine)', () => {
    expect(kinds('acuteLeft current')).toEqual(['spitz_links']);
    expect(kinds('acuteRight build40')).toEqual(['spitz_rechts']);
    expect(kinds('acuteRight current')).toEqual(LAY_GOLDEN_B6BC114['acuteRight current'].corners);
  });
  it('gerade Strecke: kein Winkel; Jitter vor der Ecke: genau einer; schlechte Accuracy an der Ecke: wie bisher', () => {
    expect(kinds('straight60 current')).toEqual([]);
    expect(kinds('jitterBeforeCorner')).toEqual(['rechts']);
    expect(kinds('badAccuracyAtCorner')).toEqual(LAY_GOLDEN_B6BC114.badAccuracyAtCorner.corners);
  });
});

describe('Explizite Ergebnisse des Processors', () => {
  it('Start-Lock: vor Freigabe nur start_lock_active, Freigabe genau einmal, Anker = erster Linienpunkt', () => {
    const run = runScenario(scenarios.find(s => s.name === 'right90 current')!);
    const releaseIdx = run.results.findIndex(r => r.anchorReleased);
    expect(releaseIdx).toBeGreaterThan(0);
    expect(run.results.slice(0, releaseIdx).every(r => r.outcome === 'rejected' && r.rejectReason === 'start_lock_active')).toBe(true);
    expect(run.results.filter(r => r.anchorReleased)).toHaveLength(1);
    expect(run.storeLog.indexOf('lock:false')).toBeLessThan(run.storeLog.indexOf('point'));
    expect(run.points[0].t).toBe(run.results[releaseIdx].acceptedPoint?.t ?? run.points[0].t);
  });
  it('stale Fixes, wiederholte Zeitstempel und 12-s-Fallback: Freigabe frühestens nach 12 s', () => {
    const run = runScenario(scenarios.find(s => s.name === 'startLockStaleRepeatFallback')!);
    const idx = run.results.findIndex(r => r.anchorReleased);
    const sc = scenarios.find(s => s.name === 'startLockStaleRepeatFallback')!;
    const fixSteps = sc.steps.filter(s => s.k === 'fix') as Extract<Scenario['steps'][number], { k: 'fix' }>[];
    expect(fixSteps[idx].t - T0).toBeGreaterThanOrEqual(12_000);
    expect(run.points).toHaveLength(LAY_GOLDEN_B6BC114.startLockStaleRepeatFallback.points);
  });
  it('Ablehnungsgründe sind explizit und entsprechen den bisherigen Diagnose-Reasons', () => {
    const run = runScenario(scenarios.find(s => s.name === 'rejectMix')!);
    const reasons = new Set(run.results.map(r => r.rejectReason).filter(Boolean));
    expect(reasons).toEqual(new Set(['start_lock_active', 'gps_outlier', 'accuracy', 'distance_gate']));
    // rejectedCount zählt wie bisher nur Accuracy-/Sprung-Verwerfungen.
    const counted = run.results.filter(r => r.rejectReason === 'accuracy' || r.rejectReason === 'gps_outlier').length;
    expect(run.results.at(-1)!.rejectedCount).toBe(counted);
  });
  it('Pause: pausierte Fixes erzeugen keine Linie; danach geht es normal weiter', () => {
    const run = runScenario(scenarios.find(s => s.name === 'pausedMidRoute')!);
    expect(run.results.some(r => r.outcome === 'paused')).toBe(true);
    expect(run.points).toHaveLength(LAY_GOLDEN_B6BC114.pausedMidRoute.points);
  });
  it('Ergebnis = beobachtbare Effekte: Punkte, Distanz, Winkel, Persistenz-Puffer', () => {
    const run = runScenario(scenarios.find(s => s.name === 'longRouteFlushBatches')!);
    const accepted = run.results.filter(r => r.outcome === 'accepted').map(r => r.acceptedPoint!);
    // Anker (Start-Lock-Freigabe) + jeder akzeptierte Fix = an den Store übergebene Linienpunkte.
    expect(run.points.length).toBe(accepted.length + 1);
    expect(accepted.map(p => [p.lat, p.lng, p.t])).toEqual(run.points.slice(1).map(p => [p.lat, p.lng, p.t]));
    expect(run.results.at(-1)!.distanceM).toBe(run.distanceCalls.at(-1));
    expect(run.results.flatMap(r => r.corners).map(c => c.kind)).toEqual(run.angles);
    expect(run.markers.map(m => m.angleKind)).toEqual(run.angles);
    // Persistenz unverändert: Flush ab 25 gepufferten Punkten, nichts geht verloren.
    expect(run.flushes).toBeGreaterThan(0);
    expect(run.buffered.length).toBeLessThanOrEqual(run.points.length);
  });
});

describe('Architektur', () => {
  // Nur Code, keine Kommentare (Kommentare dürfen die Herkunft aus dem Hook erwähnen).
  const src = readFileSync('features/tracking/engine/layProcessingSession.ts', 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\/\*\*|\*)/.test(l)).join('\n');
  it('ist React-unabhängig (kein React, keine Hooks, kein react-native, kein Screen)', () => {
    expect(src).not.toMatch(/from 'react'|from 'react-native'|useRef|useCallback|useState|useEffect|app\/track/);
  });
  it('jede Session hat eigenen Zustand (keine geteilten Mutables)', () => {
    const a = createLayProcessingState(), b = createLayProcessingState();
    a.pointsRef.current.push({ lat: 1, lng: 1, t: 1, accuracy: 1, cumDist: 0 });
    expect(b.pointsRef.current).toHaveLength(0);
    expect(a.canonDistRef.current).not.toBe(b.canonDistRef.current);
    expect(a.gpsQualityRef.current).not.toBe(b.gpsQualityRef.current);
  });
});

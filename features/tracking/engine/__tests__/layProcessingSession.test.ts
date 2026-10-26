import * as turnFusion from '../../utils/turnFusion';
import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';
// Sessiongebundener Lay-Processor: Foreground-Parität mit dem ORIGINALEN
// useTrackRecorder (b6bc114) und explizite, testbare Ergebnisse — ohne React.
import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
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
  lineFixes: {
    raw: { lat: number; lng: number };
    before: { lat: number; lng: number } | null;
    after: { lat: number; lng: number } | null;
    wasTurn: boolean;
    isTurn: boolean;
    result: LayFixResult;
  }[];
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
function runScenario(sc: Scenario, startLocked = true): Run {
  mockEngine = sc.engine ?? 'current';
  clock = T0;
  const run: Run = { lineFixes: [], session: createLayProcessingState(), results: [], points: [], distanceCalls: [], angles: [], markers: [], buffered: [], flushes: 0, storeLog: [] };
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
  run.session.startLockRef.current = startLocked;
  run.session.startLockBeganRef.current = clock;
  for (const st of sc.steps) {
    if (st.k === 'fix') {
      clock = st.t + (st.ageMs ?? 0);
      if (sc.qa) resolveDiagnosticsAccess('qa', getDiagnosticsAccessSnapshot().generation, true);
      const before = run.session.lineEmaRef.current;
      const wasTurn = run.session.lineTurnZoneRef.current;
      run.results.push(processor.processFix({
        coords: { latitude: LAT0 + st.y / M_LAT, longitude: LNG0 + st.x / M_LNG, accuracy: st.acc, altitude: null, speed: st.speed ?? 1, heading: null, altitudeAccuracy: null },
        timestamp: st.t,
      } as never));
      run.lineFixes.push({
        raw: { lat: LAT0 + st.y / M_LAT, lng: LNG0 + st.x / M_LNG },
        before, after: run.session.lineEmaRef.current,
        wasTurn, isTurn: run.session.lineTurnZoneRef.current, result: run.results.at(-1)!,
      });
    } else if (st.k === 'motion') {
      clock = st.t;
      motionBuf.push({ t: st.t, headingDelta: st.headingDelta, rotationMagnitude: Math.abs(st.headingDelta) / 10, accelerationMagnitude: 0.15, stepDelta: st.stepDelta, cadence: 100, movementState: 'walking' });
    } else if (st.k === 'pause') { processor.interruptContinuity(); state.isPaused = st.on; }
  }
  return run;
}
const hash = (pts: TrackPointSample[]) => createHash('sha256').update(JSON.stringify(pts.map(p => [p.lat, p.lng, p.accuracy, p.t]))).digest('hex').slice(0, 16);

beforeEach(() => { clock = T0; jest.useFakeTimers(); jest.setSystemTime(T0); setDiagnosticsSession('qa'); resolveDiagnosticsAccess('qa', getDiagnosticsAccessSnapshot().generation, true); jest.spyOn(Date, 'now').mockImplementation(() => clock); jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { revokeDiagnosticsAccess(); setDiagnosticsSession(null); jest.restoreAllMocks(); jest.useRealTimers(); });

// Manuelle Marker sind Hook-Funktionalität (addMarker) — Processor-Parität ohne sie.
const processorScenarios = scenarios.filter(s => !s.steps.some(st => st.k === 'marker'));

describe('P1: line smoothing uses the current accepted detector fix', () => {
  it.each(['right90 current', 'left90 current'])('%s changes smoothing on entry and exit without a one-fix delay', name => {
    const run = runScenario(scenarios.find(s => s.name === name)!);
    const transitions = run.lineFixes.filter(f => f.wasTurn !== f.isTurn);
    expect(transitions.some(f => f.isTurn)).toBe(true);
    expect(transitions.some(f => !f.isTurn)).toBe(true);
    for (const f of transitions) {
      expect(f.before).not.toBeNull();
      const alpha = f.isTurn ? 0.7 : 0.4;
      expect(f.after?.lat).toBeCloseTo(f.before!.lat + (f.raw.lat - f.before!.lat) * alpha, 12);
      expect(f.after?.lng).toBeCloseTo(f.before!.lng + (f.raw.lng - f.before!.lng) * alpha, 12);
      if (f.result.acceptedPoint) {
        expect(f.result.acceptedPoint).toMatchObject(f.after!);
      }
    }
  });
  it('BUILD40 keeps fixed smoothing even when the current detector enters a turn', () => {
    const run = runScenario(scenarios.find(s => s.name === 'right90 build40')!);
    expect(run.lineFixes.some(f => !f.wasTurn && f.isTurn)).toBe(true);
    for (const f of run.lineFixes.filter(f => f.before)) {
      expect(f.after?.lat).toBeCloseTo(f.before!.lat + (f.raw.lat - f.before!.lat) * 0.4, 12);
      expect(f.after?.lng).toBeCloseTo(f.before!.lng + (f.raw.lng - f.before!.lng) * 0.4, 12);
    }
  });
  it('accuracy and jump rejections do not update the detector turn zone', () => {
    const sc = scenarios.find(s => s.name === 'right90 current')!;
    const turn = runScenario(sc).lineFixes.find(f => !f.wasTurn && f.isTurn)!;
    const steps = sc.steps.flatMap(st => st.k === 'fix' && st.t === turn.result.acceptedPoint?.t
      ? [st, { ...st, t: st.t + 100, x: st.x - 20, acc: 80 },
        { ...st, t: st.t + 200, x: st.x - 20, acc: 5 }]
      : [st]);
    const rejected = runScenario({ ...sc, steps }).lineFixes.filter(f =>
      f.result.rejectReason === 'accuracy' || f.result.rejectReason === 'gps_outlier');
    expect(rejected.map(f => f.result.rejectReason)).toEqual(['accuracy', 'gps_outlier']);
    for (const f of rejected) {
      expect(f.wasTurn).toBe(true);
      expect(f.isTurn).toBe(true);
      expect(f.result.acceptedPoint).toBeNull();
      expect(f.after).toEqual(f.before);
    }
  });
});

describe('P1: existing real raw fixes through the production processor', () => {
  const dir = join(__dirname, '../../utils/__tests__/fixtures/realFieldV21');
  // Observed by replaying the published 49a5784 processor in this same harness.
  // These are baseline classifications, not claims about physical ground truth.
  const baselineAngles: Record<string, AngleKind[]> = {
    'f1t-qa-1616e65f.json': ['rechts', 'links'],
    'ft2-qa-c2a47f13.json': ['rechts', 'links'],
    'lauf1-qa-a3055da3.json': ['rechts'],
    'lauf10-qa-5637ad58.json': [],
    'lauf2-qa-848ea966.json': ['links'],
    'lauf3-qa-1c341a07.json': [],
    'lauf7-qa-3e78df58.json': [],
    'lauf8-qa-ef808e24.json': [],
    'lauf9-qa-01e12e75.json': ['rechts'],
    'r1-qa-03d970ff.json': ['links'],
    'spitz-qa-0ec8c4ca.json': ['rechts', 'links', 'spitz_links', 'spitz_rechts'],
  };
  const fixtures = readdirSync(dir).filter(f => f.endsWith('.json') && !f.includes('search'))
    .map(f => ({ name: f, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
    .filter(f => f.data.rawFixes?.length);
  it('covers the eleven recorded lay streams', () => { expect(fixtures).toHaveLength(11); });
  it.each(fixtures)('$name preserves canonical distance and detector samples across line modes', ({ name, data }) => {
    // These stored coordinates are relative metres, not new field observations.
    const steps: Scenario['steps'] = data.rawFixes.map((f: { x: number; y: number; tMs: number; accuracy: number }) =>
      ({ k: 'fix', x: f.x, y: f.y, t: T0 + f.tMs, acc: f.accuracy }));
    const current = runScenario({ name, steps, engine: 'current' });
    const legacy = runScenario({ name, steps, engine: 'build40' });
    expect(current.points.length).toBeGreaterThan(0);
    expect(current.angles).toEqual(baselineAngles[name]);
    expect(current.results.map(r => r.distanceM)).toEqual(legacy.results.map(r => r.distanceM));
    expect(current.session.detectPointsRef.current).toEqual(legacy.session.detectPointsRef.current);
    expect(current.session.completedDetectorSectionsRef.current).toEqual(legacy.session.completedDetectorSectionsRef.current);
    expect(current.results.map(r => r.anchorReleased)).toEqual(legacy.results.map(r => r.anchorReleased));
    expect(current.results.map(r => r.rejectedCount)).toEqual(legacy.results.map(r => r.rejectedCount));
    const firstTurn = current.lineFixes.findIndex(f => f.isTurn);
    if (firstTurn >= 0) {
      expect(current.lineFixes.slice(0, firstTurn).map(f => f.after))
        .toEqual(legacy.lineFixes.slice(0, firstTurn).map(f => f.after));
    }
  });
});

describe('Original golden: unchanged distance, BUILD40 and straight geometry; CURRENT turn timing', () => {
  it.each(processorScenarios.filter(s => !['badAccuracyAtCorner', 'longGapAndDuplicateTime', 'pausedMidRoute', 'rejectMix'].includes(s.name)).map(s => [s.name, s] as const))('%s', (name, sc) => {
    const golden = LAY_GOLDEN_B6BC114[name];
    const run = runScenario(sc);
    // CURRENT turn geometry intentionally changes with P1. Keep the historical
    // goldens intact for BUILD40 and routes that never enter a turn zone.
    if (sc.engine === 'build40' || !run.lineFixes.some(f => f.isTurn)) {
      expect(run.points).toHaveLength(golden.points);
      expect(hash(run.points)).toBe(golden.pointsHash);
    }
    expect(run.distanceCalls.at(-1) ?? 0).toBe(golden.distance);
    expect(run.angles).toEqual(name.startsWith('acuteRight current') ? ['spitz_rechts'] : golden.corners);
  });
});

describe('Corner-Parität (Schwerpunkt-Szenarien)', () => {
  const kinds = (name: string) => runScenario(scenarios.find(s => s.name === name)!).angles;
  it('90° rechts / links werden wie bisher erkannt', () => {
    expect(kinds('right90 current')).toEqual(['rechts']);
    expect(kinds('left90 current')).toEqual(['links']);
    expect(kinds('right90 build40')).toEqual(['rechts']);
  });
  it('Spitzwinkel: CURRENT erkennt rechts nun spitz, BUILD40 bleibt unverändert', () => {
    expect(kinds('acuteLeft current')).toEqual(['spitz_links']);
    expect(kinds('acuteRight build40')).toEqual(['spitz_rechts']);
    expect(kinds('acuteRight current')).toEqual(['spitz_rechts']);
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


describe('Lay continuity: explicitly changed pause/gap semantics', () => {
  it.each(['badAccuracyAtCorner', 'longGapAndDuplicateTime', 'pausedMidRoute'])('%s stores a new section and no unknown distance', name => {
    const run = runScenario(scenarios.find(s => s.name === name)!);
    expect(run.points.filter(p => p.breakBefore)).toHaveLength(1);
    const index = run.results.findIndex(r => r.acceptedPoint?.breakBefore);
    expect(index).toBeGreaterThan(0);
    expect(run.results[index].distanceM).toBe(run.results[index - 1].distanceM);
    expect([...run.buffered].some(p => p.breakBefore) || run.points.some(p => p.breakBefore)).toBe(true);
    // The boundary cannot produce a new corner; subsequent observed turns still work.
    expect(run.results[index].corners).toEqual([]);
  });
});



describe('Personal QA observes without changing tracking outcomes', () => {
  it.each(['motionEvidence current+qa', 'straight60 current', 'jitterBeforeCorner', 'badAccuracyAtCorner', 'pausedMidRoute'])(
    '%s has identical product outputs with capture enabled or disabled', name => {
      const sc = scenarios.find(s => s.name === name)!;
      const off = runScenario({ ...sc, qa: false });
      const on = runScenario({ ...sc, qa: true });
      expect(on.results).toEqual(off.results);
      expect(on.points).toEqual(off.points);
      expect(on.angles).toEqual(off.angles);
      expect(on.markers).toEqual(off.markers);
      expect(on.distanceCalls).toEqual(off.distanceCalls);
      expect(off.session.qaMotionCaptureRef.current.snapshot()).toEqual({});
      const rows = on.session.qaMotionCaptureRef.current.snapshot().candidateMotionEvidence;
      expect(rows?.length).toBeGreaterThan(0);
      expect(rows?.some(r => r.geometryAtLastEvaluation?.rejectReason)).toBe(true);
    });
});


it('joins private QA indices to their actual detector section without joining product geometry', () => {
  const base = scenarios.find(s => s.name === 'motionEvidence current+qa')!;
  const steps = [...base.steps];
  steps.splice(Math.floor(steps.length * 0.4), 0, { k: 'pause', on: false });
  steps.splice(Math.floor(base.steps.length / 3), 0, { k: 'pause', on: true });
  const run = runScenario({ ...base, steps, qa: true });
  const offset = run.session.completedDetectorSectionsRef.current.reduce((sum, section) => sum + section.length, 0);
  expect(offset).toBeGreaterThan(0);
  const detector = [...run.session.completedDetectorSectionsRef.current.flat(), ...run.session.detectPointsRef.current];
  const rows = run.session.qaMotionCaptureRef.current.snapshot().candidateMotionEvidence!;
  expect(rows.some(row => row.apexIndex < offset)).toBe(true);
  expect(rows.some(row => row.apexIndex >= offset)).toBe(true);
  expect(new Set(rows.map(row => row.apexIndex)).size).toBe(rows.length);
  for (const row of rows) {
    expect(detector[row.apexIndex].t! - run.session.qaOriginRef.current!.t).toBe(row.evaluatedAtMs);
  }
});

// Candidate selection may move to a neighbouring apex as more evidence arrives.
// Reproduce across separate processor evaluations, not just one offline sweep.
it('commits a normal corner only once when a later evaluation moves its apex within the existing 2 m exclusion', () => {
  let calls = 0;
  const spy = jest.spyOn(turnFusion, 'fuseTurns').mockImplementation(() => {
    const atM = [10, 11.3, 14][Math.min(calls++, 2)];
    return { corners: [{ kind: 'rechts', atM, apexIndex: 0 }], diagnostics: [], turns: [] } as unknown as ReturnType<typeof turnFusion.fuseTurns>;
  });
  try {
    const run = runScenario(scenarios.find(s => s.name === 'right90 current')!);
    expect(calls).toBeGreaterThan(2);
    expect(run.markers.map(m => m.distance_from_start)).toEqual([10, 14]);
    expect(run.angles).toEqual(['rechts', 'rechts']);
  } finally { spy.mockRestore(); }
});


describe('Rejected lay fixes cannot contaminate the next admitted measurement', () => {
  it('keeps the rejected-mix legacy golden intact and matches the clean observed walk in CURRENT', () => {
    const sc = scenarios.find(s => s.name === 'rejectMix')!;
    const legacy = runScenario({ ...sc, engine: 'build40' });
    const golden = LAY_GOLDEN_B6BC114.rejectMix;
    expect(legacy.points).toHaveLength(golden.points);
    expect(hash(legacy.points)).toBe(golden.pointsHash);
    expect(legacy.distanceCalls.at(-1)).toBe(golden.distance);
    // Exactly the three known injected rejects; every regular observed fix
    // keeps its original timestamp (including distance-gated points).
    const cleanSteps = sc.steps.filter(st => st.k !== 'fix' || (st.t - T0) % 1000 === 0);
    expect(sc.steps.length - cleanSteps.length).toBe(3);
    const actual = runScenario(sc);
    const clean = runScenario({ ...sc, steps: cleanSteps });
    expect(actual.angles).toEqual(golden.corners);
    expect(actual.points).toEqual(clean.points);
    expect(actual.distanceCalls).toEqual(clean.distanceCalls);
    expect(actual.markers).toEqual(clean.markers);
  });

  it.each([
    ['missing accuracy', null], ['poor accuracy', 80], ['implausible jump', 5],
  ] as const)('%s leaves admitted line, distance and detector equal to the same walk without that fix', (_name, acc) => {
    const sc = scenarios.find(s => s.name === 'right90 current')!;
    const baseline = runScenario(sc);
    const insertion = sc.steps.findIndex(s => s.k === 'fix' && s.t >= T0 + 20_000);
    const anchor = sc.steps[insertion] as Extract<Scenario['steps'][number], { k: 'fix' }>;
    const bad = { ...anchor, t: anchor.t + 100, x: anchor.x + 100, y: anchor.y + 100, acc };
    const steps = [...sc.steps.slice(0, insertion + 1), bad, ...sc.steps.slice(insertion + 1)];
    const actual = runScenario({ ...sc, steps });
    expect(actual.results[insertion + 1].rejectReason).toBe(acc === 5 ? 'gps_outlier' : 'accuracy');
    expect(actual.points).toEqual(baseline.points);
    expect(actual.distanceCalls).toEqual(baseline.distanceCalls);
    expect(actual.session.detectPointsRef.current).toEqual(baseline.session.detectPointsRef.current);
    expect(actual.angles).toEqual(baseline.angles);
    expect(actual.markers).toEqual(baseline.markers);
    // The visible puck continues receiving raw positions independently.
    const before = runScenario({ ...sc, steps: sc.steps.slice(0, insertion + 1) });
    const rejected = runScenario({ ...sc, steps: steps.slice(0, insertion + 2) });
    expect(rejected.session.puckRef.current).not.toEqual(before.session.puckRef.current);
    expect(rejected.results.at(-1)!.distanceM).toBe(before.results.at(-1)!.distanceM);
  });
});


describe('local direction confirmation in live processor', () => {
  const q = JSON.parse(readFileSync('features/tracking/utils/__tests__/fixtures/field-20261026-build55-raw.json', 'utf8'));
  const steps: Scenario['steps'] = q.rawFixes.map((p: {x: number; y: number; tMs: number; accuracy: number}) => ({
    k: 'fix', x: p.x, y: p.y, t: T0 + p.tMs, acc: p.accuracy,
  }));
  it('persists the recovered SL once and retains ordinary corners', () => {
    const run = runScenario({ name: '55 raw after start lock', steps, qa: true }, false);
    expect(run.angles).toEqual(['links', 'rechts', 'spitz_links', 'spitz_rechts']);
    expect(run.markers.filter(m => m.angleKind === 'spitz_links')).toHaveLength(1);
    expect([...run.session.liveTurnsRef.current.values()].filter(t => t.flags.includes('local_direction_confirmed'))).toHaveLength(1);
    const confirmedAt = run.markers.find(m => m.angleKind === 'spitz_links')!.t;
    const stopped = runScenario({ name: 'stop immediately after SL', steps: steps.filter(s => s.k === 'fix' && s.t <= confirmedAt), qa: true }, false);
    expect(stopped.markers.filter(m => m.angleKind === 'spitz_links')).toHaveLength(1);

  });
  it('clears pending direction confirmation at a pause', () => {
    const prefix = steps.filter(s => s.k === 'fix' && s.t < T0 + 37000);
    const run = runScenario({ name: '55 pause', steps: [...prefix, { k: 'pause', on: true }], qa: true }, false);
    expect(run.session.localDirectionRef.current.pending.size).toBe(0);
    expect(run.session.localDirectionRef.current.confirmed.size).toBe(0);
    expect(run.markers.some(m => m.angleKind === 'spitz_links')).toBe(false);
  });
});

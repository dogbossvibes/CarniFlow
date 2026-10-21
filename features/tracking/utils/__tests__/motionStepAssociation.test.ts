import type { MotionSample } from '@/modules/anyvo-motion';
import physical from './fixtures/nativePedometerDelayedStationaryTurn.json';
import { nativeMotionWindowSample, nativeMotionFusionSample } from '../nativeMotionSampleAdapters';
import { motionForFix } from '../../engine/trackFusionEngine';
import { nativeStepInterval } from '../motionStepEvidence';
import { computeTurnEvidence, MotionEvidenceBuffer } from '../motionTurnEvidence';
import { confirmLayMovement } from '../layMovementConfirmation';
import { QaMotionCapture } from '../qaMotionCapture';
import { buildQaTrackExport, assertNoAbsoluteData } from '../qaTrackExport';
import type { QaSessionCapture } from '../qaSessionCapture';
import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess } from '@/lib/diagnosticsAccessState';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }));
const native = physical.samples as unknown as MotionSample[];
const samples = (qa = false) => native.map(s => nativeMotionWindowSample(s, qa));

it.each([false, true])('does not promote the independently replayed 20 Hz stationary turn to locomotion (QA %s)', qa => {
  const raw = samples(qa);
  expect(raw[0].stepDelta).toBe(2); // delivery/counting remains intact
  const ev = computeTurnEvidence(raw, physical.candidateTimeMs);
  expect(ev.netYawDeg).toBeGreaterThan(45);
  expect(ev.gaitAccelFraction).toBe(0);
  expect(ev.steps).toBe(0);
  expect(ev.evidence).toBe(0);
  expect(ev.locomotionSource).toBe('none');
});

it('does not use cumulative warm-up steps delivered after the recording started as new movement', () => {
  const anchor = { lat: 47, lng: 8 };
  expect(confirmLayMovement({ anchor, anchorAccuracyM: 5,
    acceptedFixes: [{ ...anchor, accuracy: 5, t: 12_000 }], gaitSamples: samples(),
    sessionStartedMs: 11_000, nowMs: 12_500, fallbackAfterMs: 12_000,
  })).toMatchObject({ confirmed: false, source: null, stepDelta: 0 });
});

it('supports a fully contained v3 source interval at inclusive turn and session boundaries', () => {
  const first = { ...native[0], pedometerStepWindowStartTimestamp: 11_250, pedometerStepWindowEndTimestamp: 12_000 };
  const raw = [first, ...native.slice(1)].map(s => nativeMotionWindowSample(s));
  expect(computeTurnEvidence(raw, physical.candidateTimeMs).steps).toBe(2);
  const anchor = { lat: 47, lng: 8 };
  expect(confirmLayMovement({ anchor, anchorAccuracyM: 5,
    acceptedFixes: [{ ...anchor, accuracy: 5, t: 12_000 }], gaitSamples: raw,
    sessionStartedMs: 11_250, nowMs: 12_500, fallbackAfterMs: 12_000,
  })).toMatchObject({ confirmed: true, source: 'pedometer', stepDelta: 2 });
});

it.each([
  [11_000, 11_900], // partial overlap: no fractional allocation
  [11_900, 12_600], // newer than the actual motion measurement
  [12_000, 11_900], [12_000, 12_000], // reversed / empty
  [null, null], [undefined, undefined], [NaN, 12_000], [11_250, Infinity],
])('treats partial or unknown v3 source coverage %s..%s as no step support', (start, end) => {
  const first = { ...native[0], pedometerStepWindowStartTimestamp: start, pedometerStepWindowEndTimestamp: end };
  const raw = [first, ...native.slice(1)].map(s => nativeMotionWindowSample(s));
  expect(raw[0].stepDelta).toBe(2);
  expect(computeTurnEvidence(raw, physical.candidateTimeMs).steps).toBe(0);
});

it.each([undefined, 2] as const)('preserves the existing legacy/v2 tuple and evidence (%s)', qualityVersion => {
  const old = native.map(s => ({ ...s, qualityVersion }));
  const raw = old.map(s => nativeMotionWindowSample(s));
  expect(raw[0].stepInterval).toBeUndefined();
  expect(raw[0].diagnostics).toBeUndefined();
  expect(computeTurnEvidence(raw, physical.candidateTimeMs)).toEqual(computeTurnEvidence(old.map(s => ({
    t: s.timestamp, headingDelta: s.headingDelta, rotationMagnitude: s.rotationMagnitude,
    accelerationMagnitude: s.accelerationMagnitude, stepDelta: s.stepDelta, cadence: s.cadence, movementState: s.movementState,
  })), physical.candidateTimeMs));
});

it('does not silently treat an unknown future quality contract as legacy', () => {
  expect(nativeStepInterval({ ...native[0], qualityVersion: 4 } as unknown as MotionSample)).toBeNull();
});

it.each([-1, 0.5, NaN, Infinity])('does not manufacture step support from invalid v3 counts %s', stepDelta => {
  const sample = { ...native[0], stepDelta, pedometerStepWindowStartTimestamp: 11_250,
    pedometerStepWindowEndTimestamp: 12_000 };
  expect(nativeStepInterval(sample)).toBeNull();
  expect(computeTurnEvidence([sample, ...native.slice(1)].map(s => nativeMotionWindowSample(s)), physical.candidateTimeMs).steps).toBe(0);
  expect(nativeMotionFusionSample(sample, 11_250).stepDelta).toBeNull();
});

it('expires v3 source steps against the GPS time/receipt window without changing the saved aggregate', () => {
  const aggregate = nativeMotionFusionSample(native[0], 8000);
  expect(aggregate.stepDelta).toBe(2);
  // The existing two-second boundary still accepts the full known interval.
  expect(motionForFix(aggregate, 10_000, 10_000)).toBeNull(); // motion itself is in the future
  expect(motionForFix(aggregate, 12_000, 12_000)?.stepDelta).toBeNull(); // interval began before 10_000
  const inWindow = { ...native[0], pedometerStepWindowStartTimestamp: 10_000 };
  const eligible = nativeMotionFusionSample(inWindow, 8000);
  expect(motionForFix(eligible, 12_000, 12_000)?.stepDelta).toBe(2);
  expect(motionForFix(eligible, 12_250, 12_250)?.stepDelta).toBeNull();
  expect(motionForFix(eligible, 10_050, 12_000)?.stepDelta).toBeNull(); // source end after this older GPS fix
  expect(eligible.stepDelta).toBe(2); // do not mutate retained source data
  expect(motionForFix(eligible, 14_001, 14_001)).toBeNull(); // existing motion freshness unchanged
});

it('keeps unknown steps distinct from a measured zero and isolates new/resumed searches', () => {
  const beforeBoundary = nativeMotionFusionSample(native[0], 11_000);
  expect(beforeBoundary.stepDelta).toBeNull();
  const inside = { ...native[0], timestamp: 12_000, pedometerStepWindowStartTimestamp: 11_000,
    pedometerStepWindowEndTimestamp: 11_900 };
  expect(nativeMotionFusionSample(inside, 11_000).stepDelta).toBe(2);
  expect(nativeMotionFusionSample(inside, 11_001).stepDelta).toBeNull();
  expect(nativeMotionFusionSample({ ...inside, stepDelta: 0 }, 11_000).stepDelta).toBe(0);
  expect(nativeMotionFusionSample({ ...inside, pedometerStepWindowStartTimestamp: undefined }, 11_000).stepDelta).toBeNull();
  expect(nativeMotionFusionSample({ ...inside, qualityVersion: 2 }, 11_001).stepDelta).toBe(2);
});

it('keeps absolute source coverage in isolated RAM copies and exports relative provenance only', () => {
  const T = 1_800_000_000_000;
  jest.useFakeTimers(); jest.setSystemTime(T);
  setDiagnosticsSession('private-test');
  resolveDiagnosticsAccess('private-test', getDiagnosticsAccessSnapshot().generation, true);
  try {
    const buffer = new MotionEvidenceBuffer();
    const sample = nativeMotionWindowSample({ ...native[0], timestamp: T + 3000,
      windowStartTimestamp: T + 2800, windowEndTimestamp: T + 3000, emittedAtTimestamp: T + 3050,
      pedometerStepWindowStartTimestamp: T + 2000, pedometerStepWindowEndTimestamp: T + 2900 }, true);
    buffer.push(sample); sample.stepInterval!.startMs = 0;
    const read = buffer.samplesIn(T, T + 6000);
    expect(read[0].stepInterval!.startMs).toBe(T + 2000);
    read[0].stepInterval!.startMs = 0;
    expect(buffer.samplesIn(T, T + 6000)[0].stepInterval!.startMs).toBe(T + 2000);
    const capture = new QaMotionCapture();
    capture.observe([{ apexIndex: 1, t: T + 3000, headingDeltaDeg: null, rejectReason: 'no_window_before', motionAdjustment: null }], buffer, T, new Set());
    const stored: QaSessionCapture = { captureVersion: 2, sessionLocalId: 'local', durationMs: 6000,
      counts: { rawFixes: 0, acceptedFixes: 0, rejectedFixes: 0, detectorPoints: 0, linePoints: 0 },
      distances: { rawPathM: 0, detectorPathM: 0, recordedLineM: 0, storeDistanceM: 0 },
      rawFixes: [], detectorPoints: [], linePoints: [], markers: [], autoDiagnostics: [], ...capture.snapshot() };
    const exported = buildQaTrackExport('local', [], [], stored);
    expect(exported.candidateMotionEvidence![0].samples[0].diagnostics!.pedometerStepWindowStartOffsetMs).toBe(-1000);
    expect(JSON.stringify(exported)).not.toMatch(/stepInterval|startMs|endMs|180000000|private-test|runId/);
    expect(() => assertNoAbsoluteData(exported)).not.toThrow();
    Object.assign(exported.candidateMotionEvidence![0].samples[0], { stepInterval: { startMs: T + 2000, endMs: T + 2900 } });
    expect(() => assertNoAbsoluteData(exported)).toThrow('Schritt-Quellintervalle');
  } finally { revokeDiagnosticsAccess(); setDiagnosticsSession(null); jest.useRealTimers(); }
});

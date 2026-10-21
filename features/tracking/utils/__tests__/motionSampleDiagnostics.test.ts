import type { MotionSample } from '@/modules/anyvo-motion';
import { motionSampleDiagnostics } from '../motionSampleDiagnostics';
import { computeTurnEvidence, MotionEvidenceBuffer, type MotionWindowSample } from '../motionTurnEvidence';

const T = 1_800_000_000_000;
const base: MotionSample = { timestamp: T, headingDelta: 20, stepDelta: 2,
  accelerationMagnitude: 0.15, rotationMagnitude: 0.4, cadence: 90,
  movementState: 'walking', motionConfidence: 0.8, activityConfidence: 'low' };

it('leaves legacy provenance unknown and preserves explicit unavailable sources', () => {
  expect(motionSampleDiagnostics(base)).toBeUndefined();
  const d = motionSampleDiagnostics({ ...base, qualityVersion: 2, pedometerAgeMs: null, pedometerIntervalMs: null });
  expect(d).toMatchObject({ qualityVersion: 2, pedometerAgeMs: null, pedometerIntervalMs: null });
  expect(d?.deviceMotionSampleCount).toBeUndefined();
  expect(d?.pedometerCumulativeSteps).toBeUndefined();
});

it('retains v3 delivery accounting and separate source coverage using relative times only', () => {
  const d = motionSampleDiagnostics({ ...base, qualityVersion: 3, runId: 'private-native-run',
    windowStartTimestamp: T - 200, windowEndTimestamp: T, emittedAtTimestamp: T + 50,
    deviceMotionSampleCount: 5, deviceMotionAgeMs: 50,
    pedometerAgeMs: 150, pedometerIntervalMs: 1000, discardedWindowCount: 2,
    pedometerCumulativeSteps: 7, pedometerPublishedStepCount: 4,
    pedometerPendingStepCount: 1, pedometerDiscardedStepCount: 2,
    pedometerStepWindowStartTimestamp: T - 1100, pedometerStepWindowEndTimestamp: T - 100,
  });
  expect(d).toEqual({ qualityVersion: 3, windowStartOffsetMs: -200, windowEndOffsetMs: 0, emittedAtOffsetMs: 50,
    deviceMotionSampleCount: 5, deviceMotionAgeMs: 50, pedometerAgeMs: 150, pedometerIntervalMs: 1000,
    discardedWindowCount: 2, pedometerCumulativeSteps: 7, pedometerPublishedStepCount: 4,
    pedometerPendingStepCount: 1, pedometerDiscardedStepCount: 2,
    pedometerStepWindowStartOffsetMs: -1100, pedometerStepWindowEndOffsetMs: -100,
  });
  expect(JSON.stringify(d)).not.toMatch(/private-native-run|1800000000000|Timestamp|runId/);
});

it('rejects malformed native values without changing the recording tuple', () => {
  const m = { ...base, qualityVersion: 3 as const, windowStartTimestamp: Infinity,
    emittedAtTimestamp: 0, deviceMotionSampleCount: NaN, deviceMotionAgeMs: -1,
    pedometerAgeMs: Infinity, pedometerStepWindowStartTimestamp: null };
  expect(motionSampleDiagnostics(m)).toMatchObject({ qualityVersion: 3, pedometerStepWindowStartOffsetMs: null });
  expect(motionSampleDiagnostics(m)?.windowStartOffsetMs).toBeUndefined();
  expect(motionSampleDiagnostics(m)?.emittedAtOffsetMs).toBeUndefined();
  expect(motionSampleDiagnostics(m)?.deviceMotionSampleCount).toBeUndefined();
  expect(motionSampleDiagnostics(m)?.deviceMotionAgeMs).toBeUndefined();
  expect(m.headingDelta).toBe(base.headingDelta); expect(m.stepDelta).toBe(base.stepDelta);
});

it('keeps diagnostic metadata isolated from callers, returned snapshots and turn evidence', () => {
  const sample: MotionWindowSample = { t: T, headingDelta: 20, stepDelta: 2,
    accelerationMagnitude: 0.15, rotationMagnitude: 0.4, cadence: 90, movementState: 'walking',
    diagnostics: motionSampleDiagnostics({ ...base, qualityVersion: 3, discardedWindowCount: 2 }) };
  const buffer = new MotionEvidenceBuffer(); buffer.push(sample);
  sample.diagnostics!.discardedWindowCount = 99;
  const read = buffer.samplesIn(T, T);
  expect(read[0].diagnostics!.discardedWindowCount).toBe(2);
  read[0].diagnostics!.discardedWindowCount = 88;
  expect(buffer.samplesIn(T, T)[0].diagnostics!.discardedWindowCount).toBe(2);
  const clean = { ...sample }; delete clean.diagnostics;
  expect(buffer.evidenceFor(T)).toEqual(computeTurnEvidence([clean], T));
});

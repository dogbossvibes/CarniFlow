import type { MotionSample } from '@/modules/anyvo-motion';
import type { MotionWindowSample } from './motionTurnEvidence';
import type { TimedMotionInput } from '../engine/trackFusionEngine';
import { motionSampleDiagnostics } from './motionSampleDiagnostics';
import { nativeStepInterval, stepIntervalWithin } from './motionStepEvidence';

/** Original sensor tuple plus v3 source coverage, independent of QA authority. */
export function nativeMotionWindowSample(sample: MotionSample, diagnostics = false): MotionWindowSample {
  const interval = nativeStepInterval(sample);
  return {
    t: sample.timestamp, headingDelta: sample.headingDelta,
    rotationMagnitude: sample.rotationMagnitude, accelerationMagnitude: sample.accelerationMagnitude,
    stepDelta: sample.stepDelta, cadence: sample.cadence, movementState: sample.movementState,
    ...(interval === undefined ? {} : { stepInterval: interval }),
    ...(diagnostics ? { diagnostics: motionSampleDiagnostics(sample) } : {}),
  };
}

/** Same v3 source coverage for Search, including its start/resume boundary. */
export function nativeMotionFusionSample(sample: MotionSample, notBeforeMs: number): TimedMotionInput {
  const interval = nativeStepInterval(sample);
  return {
    timestamp: sample.timestamp, movementState: sample.movementState,
    stepDelta: interval !== undefined && !stepIntervalWithin(interval, notBeforeMs, sample.timestamp, sample.timestamp)
      ? null : sample.stepDelta,
    accelerationMagnitude: sample.accelerationMagnitude, rotationMagnitude: sample.rotationMagnitude,
    headingDelta: sample.headingDelta, motionConfidence: sample.motionConfidence,
    ...(interval === undefined ? {} : { stepInterval: interval }),
  };
}

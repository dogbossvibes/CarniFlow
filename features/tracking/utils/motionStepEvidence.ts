import type { MotionSample } from '@/modules/anyvo-motion';

/** RAM only. Cumulative coverage; never per-step timestamps. */
export interface MotionStepInterval { startMs: number; endMs: number }
export interface TimedSteps {
  t: number;
  stepDelta: number;
  /** undefined = legacy contract; null = new contract with unknown coverage. */
  stepInterval?: MotionStepInterval | null;
}

export function nativeStepInterval(sample: MotionSample): MotionStepInterval | null | undefined {
  if (sample.qualityVersion == null || sample.qualityVersion === 2) return undefined;
  if (sample.qualityVersion !== 3) return null;
  const startMs = sample.pedometerStepWindowStartTimestamp;
  const endMs = sample.pedometerStepWindowEndTimestamp;
  if (typeof startMs !== 'number' || typeof endMs !== 'number'
    || !Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(sample.timestamp)
    || !Number.isInteger(sample.stepDelta) || sample.stepDelta < 0
    || startMs >= endMs || endMs > sample.timestamp) return null;
  return { startMs, endMs };
}

/** Partial overlap is unknown: never prorate cumulative counts into a window. */
export function stepIntervalWithin(
  interval: MotionStepInterval | null, fromMs: number, toMs: number, sampleTimeMs: number,
): boolean {
  return interval != null && [interval.startMs, interval.endMs, fromMs, toMs, sampleTimeMs].every(Number.isFinite)
    && fromMs <= toMs && interval.startMs < interval.endMs
    && interval.startMs >= fromMs && interval.endMs <= toMs && interval.endMs <= sampleTimeMs;
}

export function stepsForWindow(sample: TimedSteps, fromMs: number, toMs: number): number {
  // Keep legacy/v2 behavior; callers already select their sample time window.
  if (sample.stepInterval === undefined) return sample.stepDelta;
  if (!stepIntervalWithin(sample.stepInterval, fromMs, toMs, sample.t)
    || !Number.isInteger(sample.stepDelta) || sample.stepDelta < 0) return 0;
  return sample.stepDelta;
}

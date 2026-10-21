import type { MotionSample } from '@/modules/anyvo-motion';

/** Sensor provenance only. No absolute times, run/device IDs or fusion inputs. */
export interface MotionWindowDiagnostics {
  qualityVersion: 2 | 3;
  windowStartOffsetMs?: number;
  windowEndOffsetMs?: number;
  emittedAtOffsetMs?: number;
  deviceMotionSampleCount?: number;
  deviceMotionAgeMs?: number;
  pedometerAgeMs?: number | null;
  pedometerIntervalMs?: number | null;
  discardedWindowCount?: number;
  pedometerCumulativeSteps?: number;
  pedometerPublishedStepCount?: number;
  pedometerPendingStepCount?: number;
  pedometerDiscardedStepCount?: number;
  pedometerStepWindowStartOffsetMs?: number | null;
  pedometerStepWindowEndOffsetMs?: number | null;
}

/** Legacy binaries stay unknown; absent measurements are never filled with zero. */
export function motionSampleDiagnostics(m: MotionSample): MotionWindowDiagnostics | undefined {
  if ((m.qualityVersion !== 2 && m.qualityVersion !== 3) || !Number.isFinite(m.timestamp)) return undefined;
  const result: MotionWindowDiagnostics = { qualityVersion: m.qualityVersion };
  const offset = (value: number | null | undefined): number | null | undefined => {
    if (value === null) return null;
    const relative = typeof value === 'number' ? value - m.timestamp : NaN;
    return Number.isFinite(relative) && Math.abs(relative) < 1e8 ? Math.round(relative) : undefined;
  };
  const nonnegative = (value: number | null | undefined): number | null | undefined =>
    value === null ? null : typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1e8 ? Math.round(value) : undefined;
  result.windowStartOffsetMs = offset(m.windowStartTimestamp) ?? undefined;
  result.windowEndOffsetMs = offset(m.windowEndTimestamp) ?? undefined;
  result.emittedAtOffsetMs = offset(m.emittedAtTimestamp) ?? undefined;
  result.deviceMotionSampleCount = nonnegative(m.deviceMotionSampleCount) ?? undefined;
  result.deviceMotionAgeMs = nonnegative(m.deviceMotionAgeMs) ?? undefined;
  result.pedometerAgeMs = nonnegative(m.pedometerAgeMs);
  result.pedometerIntervalMs = nonnegative(m.pedometerIntervalMs);
  result.discardedWindowCount = nonnegative(m.discardedWindowCount) ?? undefined;
  result.pedometerCumulativeSteps = nonnegative(m.pedometerCumulativeSteps) ?? undefined;
  result.pedometerPublishedStepCount = nonnegative(m.pedometerPublishedStepCount) ?? undefined;
  result.pedometerPendingStepCount = nonnegative(m.pedometerPendingStepCount) ?? undefined;
  result.pedometerDiscardedStepCount = nonnegative(m.pedometerDiscardedStepCount) ?? undefined;
  result.pedometerStepWindowStartOffsetMs = offset(m.pedometerStepWindowStartTimestamp);
  result.pedometerStepWindowEndOffsetMs = offset(m.pedometerStepWindowEndTimestamp);
  return result;
}

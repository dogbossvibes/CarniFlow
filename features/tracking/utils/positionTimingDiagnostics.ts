/** Bounded, coordinate-free timing evidence; never a recording/filter gate. */
export interface PositionTiming {
  received: number; duplicates: number; outOfOrder: number;
  lastTimestamp: number | null; lastIntervalMs: number | null; largestGapMs: number;
}
export const emptyPositionTiming = (): PositionTiming => ({ received: 0, duplicates: 0, outOfOrder: 0, lastTimestamp: null, lastIntervalMs: null, largestGapMs: 0 });
export function observePositionTiming(previous: PositionTiming, timestamp: number | undefined): PositionTiming {
  const next = { ...previous, received: previous.received + 1 };
  if (timestamp == null || !Number.isFinite(timestamp)) return next;
  if (previous.lastTimestamp == null) return { ...next, lastTimestamp: timestamp };
  const interval = timestamp - previous.lastTimestamp;
  if (interval === 0) return { ...next, duplicates: next.duplicates + 1 };
  if (interval < 0) return { ...next, outOfOrder: next.outOfOrder + 1 };
  return { ...next, lastTimestamp: timestamp, lastIntervalMs: interval, largestGapMs: Math.max(previous.largestGapMs, interval) };
}

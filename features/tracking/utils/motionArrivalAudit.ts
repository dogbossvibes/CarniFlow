import { MotionEvidenceBuffer } from './motionTurnEvidence';
import type { QaMotionTimeline } from './qaSessionCapture';

/** Offline only. Uses the real ring's timestamp acceptance and retention rules.
 * This does NOT replay turn confidence: step-coverage and full GPS decision
 * chronology are not guaranteed by every export. No points or turns are added.
 */
export function auditMotionArrivals(timeline: QaMotionTimeline | undefined, observedMs: number) {
  const empty = { accepted: 0, rejectedNonIncreasing: 0, notYetReceived: 0, retained: 0, maxDelayMs: null as number | null };
  if (!timeline) return { ...empty, status: 'unavailable' as const };
  if (!Number.isFinite(observedMs) || timeline.omitted < 0
    || timeline.observed !== timeline.samples.length + timeline.omitted
    || timeline.samples.some((s, i, all) => !Number.isFinite(s.tMs) || !Number.isFinite(s.receivedMs)
      || (i > 0 && s.receivedMs < all[i - 1].receivedMs))) {
    return { ...empty, status: 'invalid_time_basis' as const };
  }
  const ring = new MotionEvidenceBuffer();
  let accepted = 0, rejectedNonIncreasing = 0, notYetReceived = 0;
  let maxDelayMs: number | null = null;
  for (const sample of timeline.samples) {
    if (sample.receivedMs > observedMs) { notYetReceived++; continue; }
    const previous = ring.span?.lastMs;
    ring.push({ t: sample.tMs, headingDelta: sample.headingDelta,
      rotationMagnitude: sample.rotationMagnitude, accelerationMagnitude: sample.accelerationMagnitude,
      stepDelta: sample.stepDelta, cadence: sample.cadence, movementState: sample.movementState });
    if (previous != null && sample.tMs <= previous) rejectedNonIncreasing++;
    else accepted++;
    const delay = sample.receivedMs - sample.tMs;
    maxDelayMs = maxDelayMs == null ? delay : Math.max(maxDelayMs, delay);
  }
  return { status: timeline.omitted ? 'partial_capture' as const : 'captured_arrivals_only' as const,
    accepted, rejectedNonIncreasing, notYetReceived, retained: ring.size, maxDelayMs };
}

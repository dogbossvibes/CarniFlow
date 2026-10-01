import { calculateDistance, type LatLng } from './gpsFilter';

export interface LayMovementFix extends LatLng { accuracy: number; t: number }
export interface LayGaitSample {
  t: number;
  stepDelta: number;
  movementState: string | null;
  accelerationMagnitude: number;
}
export type LayMovementSource = 'pedometer' | 'gps_displacement' | 'motion_gps' | 'fallback' | null;
export interface LayMovementResult {
  confirmed: boolean;
  source: LayMovementSource;
  confidence: number;
  displacementM: number | null;
  stepDelta: number;
  motionState: string | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Only accepted fixes and samples recorded after the session started may confirm movement. */
export function confirmLayMovement(input: {
  anchor: LatLng | null;
  anchorAccuracyM: number | null;
  acceptedFixes: readonly LayMovementFix[];
  gaitSamples: readonly LayGaitSample[];
  sessionStartedMs: number;
  nowMs: number;
  fallbackAfterMs: number;
}): LayMovementResult {
  const fixes = input.acceptedFixes.filter(f => f.t >= input.sessionStartedMs && f.t <= input.nowMs);
  const gait = input.gaitSamples.filter(s => s.t >= input.sessionStartedMs && s.t <= input.nowMs);
  const stepDelta = gait.reduce((n, s) => n + Math.max(0, s.stepDelta), 0);
  const last = fixes[fixes.length - 1];
  const displacementM = input.anchor && last ? calculateDistance(input.anchor, last) : null;
  const motionState = gait[gait.length - 1]?.movementState ?? null;
  const result = (source: LayMovementSource, confidence: number): LayMovementResult => ({
    confirmed: source != null, source, confidence, displacementM, stepDelta, motionState,
  });
  if (!input.anchor) return result(null, 0);
  if (stepDelta >= 2) return result('pedometer', 0.95);

  const threshold = clamp(0.5 * (input.anchorAccuracyM ?? 6), 1.8, 3.0);
  const two = fixes.slice(-2);
  if (two.length === 2 && two.every(f => calculateDistance(input.anchor!, f) >= threshold)
    && calculateDistance(two[0], two[1]) <= 5) return result('gps_displacement', 0.8);

  const walking = gait.filter(s => s.movementState === 'walking' || s.movementState === 'running');
  const gaitDuration = walking.length >= 2 ? walking[walking.length - 1].t - walking[0].t : 0;
  const accelerationShare = walking.length
    ? walking.filter(s => s.accelerationMagnitude >= 0.1).length / walking.length : 0;
  const stableSmallDisplacement = two.length === 2 && input.anchor
    && two.every(f => calculateDistance(input.anchor!, f) >= 1.0)
    && calculateDistance(two[0], two[1]) <= 3;
  if (gaitDuration >= 1000 && accelerationShare >= 0.6 && stableSmallDisplacement)
    return result('motion_gps', 0.7);

  if (input.nowMs - input.sessionStartedMs >= input.fallbackAfterMs) return result('fallback', 0.35);
  return result(null, 0);
}

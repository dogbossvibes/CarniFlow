/** Stabilization is evidence-based: no minimum timer, no bad-fix fallback. */
export const LAY_SESSION_START_MAX_ACCURACY_M = 15;

export function isLaySessionWarmupReady(accuracyM: number | null): boolean {
  return accuracyM != null && accuracyM <= LAY_SESSION_START_MAX_ACCURACY_M;
}

export function releaseLayStartLock(input: {
  anchorReady: boolean; movementConfirmed: boolean; elapsedMs: number; maximumMs: number;
}): boolean {
  return input.anchorReady && (input.movementConfirmed || input.elapsedMs >= input.maximumMs);
}

export function layStartBlockingReason(input: Parameters<typeof releaseLayStartLock>[0]):
  'waiting_for_stable_anchor' | 'waiting_for_movement_confirmation' | null {
  if (releaseLayStartLock(input)) return null;
  return input.anchorReady ? 'waiting_for_movement_confirmation' : 'waiting_for_stable_anchor';
}

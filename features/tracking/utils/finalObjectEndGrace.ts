export const FINAL_OBJECT_END_GRACE_MS = 1_200;

export interface FinalObjectEndGraceState {
  startedAtMs: number | null;
  endedAtMs: number | null;
  reason: 'waiting_for_final_object' | 'active_dwell' | 'grace_elapsed' | 'not_applicable' | null;
}

export const INITIAL_FINAL_OBJECT_END_GRACE: FinalObjectEndGraceState = {
  startedAtMs: null, endedAtMs: null, reason: null,
};

export function advanceFinalObjectEndGrace(
  previous: FinalObjectEndGraceState,
  input: { nowMs: number; eligible: boolean; pendingFinalObjectNearEnd: boolean; activeObjectWait: boolean },
): FinalObjectEndGraceState {
  if (previous.startedAtMs == null) {
    if (!input.eligible || !input.pendingFinalObjectNearEnd) return previous;
    return { startedAtMs: input.nowMs, endedAtMs: null, reason: 'waiting_for_final_object' };
  }
  if (!input.pendingFinalObjectNearEnd) return { ...previous, endedAtMs: input.nowMs, reason: 'not_applicable' };
  if (input.activeObjectWait) return { ...previous, reason: 'active_dwell' };
  if (previous.endedAtMs != null) return previous;
  if (input.nowMs - previous.startedAtMs >= FINAL_OBJECT_END_GRACE_MS)
    return { ...previous, endedAtMs: input.nowMs, reason: 'grace_elapsed' };
  return { ...previous, reason: 'waiting_for_final_object' };
}

export function finalObjectEndGraceActive(state: FinalObjectEndGraceState): boolean {
  return state.startedAtMs != null && state.endedAtMs == null && state.reason !== 'active_dwell';
}

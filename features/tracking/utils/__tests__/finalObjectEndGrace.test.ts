import {
  advanceFinalObjectEndGrace, finalObjectEndGraceActive, FINAL_OBJECT_END_GRACE_MS,
  INITIAL_FINAL_OBJECT_END_GRACE,
} from '../finalObjectEndGrace';

const start = (pendingFinalObjectNearEnd = true) => advanceFinalObjectEndGrace(INITIAL_FINAL_OBJECT_END_GRACE,
  { nowMs: 10_000, eligible: true, pendingFinalObjectNearEnd, activeObjectWait: false });

it('does not delay when there is no pending final object or end is not otherwise eligible', () => {
  expect(start(false)).toEqual(INITIAL_FINAL_OBJECT_END_GRACE);
  expect(advanceFinalObjectEndGrace(INITIAL_FINAL_OBJECT_END_GRACE,
    { nowMs: 10_000, eligible: false, pendingFinalObjectNearEnd: true, activeObjectWait: false }))
    .toEqual(INITIAL_FINAL_OBJECT_END_GRACE);
});

it('starts a bounded grace only for an eligible pending final object near the end', () => {
  const state = start();
  expect(state).toMatchObject({ startedAtMs: 10_000, endedAtMs: null, reason: 'waiting_for_final_object' });
  expect(finalObjectEndGraceActive(state)).toBe(true);
});

it('hands control to active dwell and resolves after found or user removed', () => {
  const state = start();
  const dwell = advanceFinalObjectEndGrace(state,
    { nowMs: 10_300, eligible: true, pendingFinalObjectNearEnd: true, activeObjectWait: true });
  expect(dwell.reason).toBe('active_dwell');
  expect(finalObjectEndGraceActive(dwell)).toBe(false);
  const found = advanceFinalObjectEndGrace(dwell,
    { nowMs: 16_300, eligible: true, pendingFinalObjectNearEnd: false, activeObjectWait: false });
  expect(found.reason).toBe('not_applicable');
  expect(finalObjectEndGraceActive(found)).toBe(false);
});

it('expires after only a small bounded window when no dwell starts', () => {
  const state = start();
  const waiting = advanceFinalObjectEndGrace(state,
    { nowMs: 10_500, eligible: true, pendingFinalObjectNearEnd: true, activeObjectWait: false });
  expect(finalObjectEndGraceActive(waiting)).toBe(true);
  const ended = advanceFinalObjectEndGrace(waiting,
    { nowMs: 10_000 + FINAL_OBJECT_END_GRACE_MS, eligible: true, pendingFinalObjectNearEnd: true, activeObjectWait: false });
  expect(ended).toMatchObject({ endedAtMs: 11_200, reason: 'grace_elapsed' });
  expect(finalObjectEndGraceActive(ended)).toBe(false);
});

it('does not restart an expired grace or apply it to an earlier pending object', () => {
  const expired = advanceFinalObjectEndGrace(start(),
    { nowMs: 11_200, eligible: true, pendingFinalObjectNearEnd: true, activeObjectWait: false });
  expect(advanceFinalObjectEndGrace(expired,
    { nowMs: 12_000, eligible: true, pendingFinalObjectNearEnd: true, activeObjectWait: false })).toEqual(expired);
  expect(start(false).startedAtMs).toBeNull();
});

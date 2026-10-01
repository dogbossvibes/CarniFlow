import { advanceEndFixHistory, INITIAL_END_FIX_HISTORY } from '../endFixConfirmation';

const fix = (tMs: number, distanceToEndM: number) => ({ tMs, distanceToEndM,
  accuracyM: 4, lastSegmentReached: true, handlerProgressRatio: 0.92 });

it('requires a real prior approach and two distinct accepted fixes over 0.8 seconds', () => {
  const approach = advanceEndFixHistory(INITIAL_END_FIX_HISTORY, fix(1000, 5));
  expect(approach).toMatchObject({ approachSeen: true, insideCount: 0 });
  const first = advanceEndFixHistory(approach, fix(2000, 0.6));
  expect(first).toMatchObject({ insideCount: 1, firstInsideMs: 2000 });
  expect(advanceEndFixHistory(first, fix(2000, 0.6))).toEqual(first);
  const second = advanceEndFixHistory(first, fix(2900, 0.5));
  expect(second.insideCount).toBe(2);
  expect(second.lastFixMs! - second.firstInsideMs!).toBe(900);
});

it('ignores a single GPS jump into the end and resets consecutive fixes on exit', () => {
  const jumped = advanceEndFixHistory(INITIAL_END_FIX_HISTORY, fix(1000, 0.5));
  expect(jumped.approachSeen).toBe(false);
  const outside = advanceEndFixHistory(jumped, fix(2000, 6));
  expect(outside).toMatchObject({ approachSeen: true, insideCount: 0, firstInsideMs: null });
});

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

it('retains a real accepted approach when progress crosses the last-section gate after passing 4–5 m', () => {
  let history = INITIAL_END_FIX_HISTORY;
  for (const [tMs, distanceToEndM, handlerProgressRatio] of [
    [1000, 4.6, 0.76], [2000, 3.61, 0.79], [3000, 2.69, 0.87], [4000, 2, 0.87],
  ]) history = advanceEndFixHistory(history, { tMs, distanceToEndM, accuracyM: 4,
    lastSegmentReached: distanceToEndM <= 5 && handlerProgressRatio >= 0.75, handlerProgressRatio });
  expect(history).toMatchObject({ approachSeen: true, insideCount: 1,
    approachStartDistanceM: 4.6, approachSampleCount: 2 });
});

it('does not turn a single inside jump into an approach history', () => {
  const first = advanceEndFixHistory(INITIAL_END_FIX_HISTORY, fix(1000, 0.6));
  const second = advanceEndFixHistory(first, fix(2000, 0.5));
  expect(second.approachSeen).toBe(false);
});

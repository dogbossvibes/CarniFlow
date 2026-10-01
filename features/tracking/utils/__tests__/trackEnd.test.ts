import { stepTrackEnd, trackEndBlocker, endRadiusM, type TrackEndInput } from '../guidanceEngine';
import { advanceEndFixHistory, INITIAL_END_FIX_HISTORY } from '../endFixConfirmation';

const ready = (patch: Partial<TrackEndInput> = {}): TrackEndInput => ({
  dogProgressM: 100, handlerProgressM: 96, trackLengthM: 100,
  geomDistanceM: 0, handlerDistanceToEndM: 0.6, accuracyM: 4,
  lastSegmentReached: true, approachSeen: true,
  stableEndFixCount: 2, stableEndFixSpanMs: 1000,
  activeObjectWait: false, searchActive: true, openMandatoryObjects: 0,
  ...patch,
});

it('uses an accuracy-aware handler radius', () => {
  expect(endRadiusM(1)).toBe(1.5);
  expect(endRadiusM(4)).toBe(2);
  expect(endRadiusM(20)).toBe(3);
});

it('DogLead at the end cannot fire while the handler is five metres away', () => {
  const input = ready({ handlerProgressM: 95, handlerDistanceToEndM: 5 });
  expect(trackEndBlocker(input)).toBe('handler_distance');
  expect(stepTrackEnd(input).justReached).toBe(false);
  expect(trackEndBlocker(ready({ handlerDistanceToEndM: undefined, geomDistanceM: 0 }))).toBe('handler_distance');
});

it('active object dwell blocks the event', () => {
  expect(trackEndBlocker(ready({ activeObjectWait: true }))).toBe('object_wait');
});

it('one endpoint jump is not enough; two accepted fixes over 800 ms fire once', () => {
  let h = advanceEndFixHistory(INITIAL_END_FIX_HISTORY, {
    tMs: 1000, distanceToEndM: 5, accuracyM: 4, lastSegmentReached: true, handlerProgressRatio: 0.9,
  });
  h = advanceEndFixHistory(h, { tMs: 2000, distanceToEndM: 0.6, accuracyM: 4,
    lastSegmentReached: true, handlerProgressRatio: 0.95 });
  expect(trackEndBlocker(ready({ stableEndFixCount: h.insideCount, stableEndFixSpanMs: 0 }))).toBe('end_hysteresis');
  h = advanceEndFixHistory(h, { tMs: 3000, distanceToEndM: 0.6, accuracyM: 4,
    lastSegmentReached: true, handlerProgressRatio: 0.95 });
  const first = stepTrackEnd(ready({ stableEndFixCount: h.insideCount,
    stableEndFixSpanMs: 3000 - h.firstInsideMs! }));
  expect(first).toEqual({ state: 'reached', justReached: true });
  expect(stepTrackEnd(ready(), first.state)).toEqual({ state: 'completed', justReached: false });
});

it('requires last section or 90% handler progress, plus approach history', () => {
  expect(trackEndBlocker(ready({ handlerProgressM: 80, lastSegmentReached: false }))).toBe('handler_progress');
  expect(trackEndBlocker(ready({ approachSeen: false }))).toBe('approach_history');
});

it('missed earlier objects do not block a confirmed F2-like endpoint', () => {
  expect(trackEndBlocker(ready({ openMandatoryObjects: 3, handlerDistanceToEndM: 0.6 }))).toBeNull();
  expect(stepTrackEnd(ready({ openMandatoryObjects: 3 })).justReached).toBe(true);
});

it('nothing fires without active search or a reference track', () => {
  expect(stepTrackEnd(ready({ searchActive: false })).justReached).toBe(false);
  expect(stepTrackEnd(ready({ trackLengthM: 0 })).justReached).toBe(false);
});

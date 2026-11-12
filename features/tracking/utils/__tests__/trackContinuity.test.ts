import { isRecordingGap, splitContinuousPoints, restoreLayContinuity } from '../trackContinuity';
import { pathDistanceM } from '../../store/searchRecovery';
import { buildArc, projectForward } from '../searchGeometry';
import { replayPositionAt, replayTraveledPoints } from '../../engine/trackReplay';
import { buildRunResultPayload } from '../localTrackRun';
import { buildTrackDetailMap } from '../trackDetailMap';
import { replayGeometryArrays } from '../searchReplayGeometry';
import { createCanonicalDistance } from '../canonicalDistance';

const p = (m: number, breakBefore = false) => ({ latitude: m / 111320, longitude: 0, ...(breakBefore ? { breakBefore: true } : {}) });
const points = [p(0), p(10), p(100, true), p(110)];
const times = [0, 2, 20, 22];

it('excludes unknown distance and projection, and never interpolates the replay gap', () => {
  const arc = buildArc(points);
  expect(arc.total).toBeCloseTo(19.98, 1);
  expect(projectForward(p(55), points, arc.cum, 0, 200, 0).devM).toBeGreaterThan(40);
  expect(pathDistanceM(points.map(v => ({ lat: v.latitude, lng: v.longitude, breakBefore: v.breakBefore })))).toBeCloseTo(arc.total, 5);
  const geometry = { points, pointsTimeSec: times };
  expect(replayPositionAt(geometry, 10)).toBeNull();
  expect(replayTraveledPoints(geometry, 10)).toEqual(points.slice(0, 2));
  expect(replayTraveledPoints(geometry, 20)).toEqual(points.slice(0, 3));
  expect(splitContinuousPoints(replayTraveledPoints(geometry, 21))).toHaveLength(2);
});

it('preserves actual boundaries through result, detail and display simplification', () => {
  const run = buildRunResultPayload({ runId: 'run', sessionId: 'session', startedAtMs: 0, endedAtMs: 22_000,
    result: { durationS: 22, score: 0, deviationAvgM: 0, foundObjects: 0, totalObjects: 0, distanceM: 20, breaks: [], points }, pointsTimeSec: times });
  expect(run.score).toBeNull(); // incomplete observations are excluded from overall training score averages
  const detail = buildTrackDetailMap({ runs: [run] });
  expect(splitContinuousPoints(detail.run).map(section => section.length)).toEqual([2, 2]);
  const replay = replayGeometryArrays(points.map((v, i) => ({ lat: v.latitude, lng: v.longitude, breakBefore: v.breakBefore, t: times[i] })))!;
  expect(splitContinuousPoints(replay.points)).toHaveLength(2);
  // Diagnostic gaps inside observed sections must not disappear when another section exists.
  expect(replay.unfillableGaps).toHaveLength(2);
});

it('restores local and remote metadata without inventing gaps for legacy points', () => {
  const rows = [{ timestamp: 'a' }, { timestamp: 'b' }, { timestamp: 'c', payload_json: '{"breakBefore":true}' }];
  expect(restoreLayContinuity(rows, { version: 1, breakBeforeTimestamps: ['b'] }).map(v => !!v.breakBefore)).toEqual([false, true, true]);
  expect(restoreLayContinuity([{ timestamp: 'a' }, { timestamp: 'b' }], null)).toEqual([{ timestamp: 'a' }, { timestamp: 'b' }]);
  expect(isRecordingGap(1000, 6000)).toBe(false);
  expect(isRecordingGap(1000, 6001)).toBe(true);
});

it('canonical distance retains its total but seeds a new anchor after interruption', () => {
  const acc = createCanonicalDistance();
  acc.start({ lat: 0, lng: 0 }); acc.push({ lat: 10 / 111320, lng: 0 });
  const before = acc.total;
  acc.interrupt();
  expect(acc.push({ lat: 100 / 111320, lng: 0 })).toBe(before);
  expect(acc.push({ lat: 110 / 111320, lng: 0 })).toBeCloseTo(before * 2, 5);
});

it('restores remote boundaries after PostgreSQL timestamp normalization', () => {
  const points = [{ timestamp: '2026-10-08T12:00:00+00:00' }, { timestamp: '2026-10-08T12:00:10.000+00:00' }];
  expect(restoreLayContinuity(points, { version: 1, breakBeforeTimestamps: ['2026-10-08T12:00:10.000Z'] })[1].breakBefore).toBe(true);
});

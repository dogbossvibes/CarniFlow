import fixture from './fixtures/backend-cloud-v1.json';
import { parseTransferReceipt } from '../importPlan';
import { parseOwnCopy, parseOwnRun } from '../ownCopy';
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
const receipt = parseTransferReceipt(fixture.accept.receipt);
it('preserves supported Android recorder payload and replay times without changing its ordinary score', () => {
  const points = [{ latitude: 47, longitude: 8 }, { latitude: 47.001, longitude: 8.001 }];
  const payload = buildRunResultPayload({ runId: receipt.ownRunId, sessionId: receipt.ownSessionId, startedAtMs: 1000, endedAtMs: 11000,
    result: { durationS: 10, score: 80, deviationAvgM: 2, foundObjects: 1, totalObjects: 2, distanceM: 20, breaks: [], points },
    pointsTimeSec: [0, 10], replayPoints: points, replayPointsTimeSec: [0, 10], autoDwellObjectIds: ['actual-object'],
    analytics: { analyticsVersion: 1, trackScore: 80 } as never });
  expect(parseOwnRun(payload, receipt)).toEqual(payload); expect(payload.score).toBe(80);
});
it.each([undefined, null, {}, { ...fixture.accept.ownCopy, pointIds: [] }, { ...fixture.accept.ownCopy, metadata: { notes: 'incomplete' } },
  { ...fixture.accept.ownCopy, revision: 1.5 }, { ...fixture.restore.ownCopy, run: { ...fixture.restore.ownCopy.run, run_id: receipt.ownSessionId } }])('rejects malformed/current-copy response before hydration: %s', value => {
  expect(() => parseOwnCopy(value, receipt)).toThrow('INVALID_RESPONSE');
});

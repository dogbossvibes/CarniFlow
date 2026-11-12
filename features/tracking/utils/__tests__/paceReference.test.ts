import { currentPaceReference, dogPaceReference, relativePaceBand } from '../paceReference';
import type { AnalyticsSegment } from '../../engine/trackSegmentAnalysis';
import { buildHeatmapParts, paceBand } from '../../engine/trackHeatmap';
const seg = (speed: number, confidence = .9) => ({ type: 'straight', averageSpeedMps: speed, analysisConfidence: confidence, startTimeSec: 0, endTimeSec: 2 }) as AnalyticsSegment;
const current = { id: 'now', dog_id: 'dog', track_data: { run: { started_at: '2026-10-08T12:00:00Z', search_handler_distance_m: 5 } } };
function history(id: string, speed = 1) { return { id, dog_id: 'dog', session_date: '2026-10-01', track_data: { run: { started_at: '2026-10-01T12:00:00Z', ended_at: '2026-10-01T12:15:00Z', search_handler_distance_m: 5, analytics: { analysisConfidence: .9, segments: [seg(speed), seg(speed), seg(speed)] } } } }; }
it('requires three reliable straight sections and excludes stationary/invalid/low confidence data', () => {
  expect(currentPaceReference([seg(1), seg(2)])).toBeNull();
  expect(currentPaceReference([seg(1), seg(2), seg(3), seg(100,.2), seg(NaN), seg(0), seg(9,NaN)])?.medianMps).toBe(2);
});
it('uses a session-balanced median from at least three distinct previous runs of this dog', () => {
  expect(dogPaceReference(current, [history('a'), history('b'), history('b')])).toBeNull();
  expect(dogPaceReference(current, [history('a',1), history('b',2), history('c',9)])).toEqual({ source: 'dog_history', sessionCount: 3, medianMps: 2 });
});
it.each(['dog', 'future', 'distance', 'unfinished', 'confidence', 'segments'])('rejects incomparable %s history', reason => {
  const row = history('c');
  if (reason === 'dog') row.dog_id = 'another';
  if (reason === 'future') row.track_data.run.started_at = '2027-01-01T00:00:00Z';
  if (reason === 'distance') row.track_data.run.search_handler_distance_m = 10;
  if (reason === 'unfinished') row.track_data.run.ended_at = '';
  if (reason === 'confidence') row.track_data.run.analytics.analysisConfidence = NaN;
  if (reason === 'segments') row.track_data.run.analytics.segments = [seg(1)];
  expect(dogPaceReference(current, [history('a'), history('b'), row])).toBeNull();
});
it('unknown handler distance is not treated as a comparable setting', () => {
  expect(dogPaceReference({ ...current, track_data: { run: { started_at: '2026-10-08T12:00:00Z' } } }, [history('a'), history('b'), history('c')])).toBeNull();
});
it('caps the historical reference and excludes current run', () => {
  expect(dogPaceReference(current, [history('now'), ...Array.from({ length: 25 }, (_,i) => history(String(i)))])?.sessionCount).toBe(20);
});
it('uses descriptive relative bands and leaves constant pace neutral', () => {
  const ref = { source: 'dog_history' as const, sessionCount: 3, medianMps: 2 };
  expect([1,2,3].map(s => relativePaceBand(s,ref))).toEqual(['slow','normal','fast']);
  expect(paceBand(1,{p33:1,p66:1})).toBe('normal');
});
it('missing baseline/poor GPS suppresses tempo coloring without changing geometry or scores', () => {
  const geometry = { points: [{ latitude:47,longitude:8 }, { latitude:47.1,longitude:8 }], pointsTimeSec:[0,2] };
  const segments = [seg(1,.2)]; const before = JSON.stringify({geometry,segments});
  expect(buildHeatmapParts(geometry,[seg(1)],'pace',null)).toEqual([]);
  expect(buildHeatmapParts(geometry,segments,'pace',{source:'dog_history',sessionCount:3,medianMps:1})).toEqual([]);
  expect(JSON.stringify({geometry,segments})).toBe(before);
});

import { scoredObjectSummary } from '../scoredObjectProjection';
import { trackAnalysisAvailability } from '../trackAnalysisState';

const markers = ['duebel', 'holz', 'ball', 'gummi'].map((material, i) => ({ id: String(i), marker_type: 'gegenstand', material }));
it('never guesses how many of the old aggregate findings were jokers', () => {
 const data = { markers, articles_total: 4, articles_found: 3 };
 expect(scoredObjectSummary(data)).toEqual({ total: 2, found: null, hasJokers: true });
 expect(data.articles_found).toBe(3);
});
it('derives regular findings only from the complete known snapshot', () => {
 const objects = markers.map((m, i) => ({ id: m.id, material: m.material, index: i, recordedStatus: i === 3 ? 'missed' : 'auto_dwell_found' }));
 const data = { markers, track_data: { run: { object_snapshot: { version: 1, objects } } } };
 expect(scoredObjectSummary(data)).toEqual({ total: 2, found: 1, hasJokers: true });
 objects[3].recordedStatus = 'unknown';
 expect(scoredObjectSummary(data).found).toBeNull();
});
it('keeps ordinary aggregates and does not silently reweight a historical joker score', () => {
 expect(scoredObjectSummary({ articles_total: 3, articles_found: 2 })).toEqual({ total: 3, found: 2, hasJokers: false });
 const analytics = { trackScore: 81, analysisConfidenceBand: 'high', deviation: { meanM: 1 }, pace: { avgMps: 1 }, reacquisition: { count: 0 }, corners: [], objects: markers };
 const before = JSON.stringify(analytics);
 const projected = trackAnalysisAvailability({ track_data: { run: { analytics } } });
 expect(projected.analytics?.trackScore).toBeNull();
 expect(projected.analytics?.objects.map(m => m.material)).toEqual(['holz', 'gummi']);
 expect(JSON.stringify(analytics)).toBe(before);
});
it('never borrows a newer run snapshot for an older displayed search',()=>{
 const data={markers,runs:[{id:'older'}],track_data:{run:{run_id:'newer',object_snapshot:{version:1,objects:[{material:'holz',recordedStatus:'manual_found'},{material:'gummi',recordedStatus:'manual_found'}]}}}};
 expect(scoredObjectSummary(data).found).toBeNull();
});

const regularSnapshot = () => [
  { id: 'wood', index: 0, material: 'holz', recordedStatus: 'manual_found' },
  { id: 'rubber', index: 1, material: 'gummi', recordedStatus: 'auto_dwell_found' },
];
const boundRecording = (objects: unknown[], runId: unknown = 'displayed') => ({
  markers,
  runs: [{ id: 'displayed' }],
  track_data: { run: { run_id: runId, object_snapshot: { version: 1, objects } } },
});

it.each([undefined, null, '', ' ', 'another-run'])('rejects missing or mismatched run binding %p', runId => {
  const data = boundRecording(regularSnapshot());
  data.track_data.run.run_id = runId;
  expect(scoredObjectSummary(data).found).toBeNull();
});
it.each([{}, { id: '' }, { id: ' ' }, { id: null }])('rejects malformed displayed run %p', row => {
  const data = { ...boundRecording(regularSnapshot()), runs: [row] };
  expect(scoredObjectSummary(data).found).toBeNull();
});
it.each([
  ['duplicate ID', { id: 'wood' }],
  ['empty ID', { id: '' }],
  ['blank ID', { id: ' ' }],
  ['missing ID', { id: undefined }],
  ['duplicate index', { index: 0 }],
  ['gap in indices', { index: 2 }],
  ['missing index', { index: undefined }],
  ['fractional index', { index: 1.5 }],
])('rejects invalid snapshot identity or sequence: %s', (_label, change) => {
  const objects = regularSnapshot();
  const data = boundRecording([objects[0], { ...objects[1], ...change }]);
  const before = JSON.stringify(data);
  expect(scoredObjectSummary(data).found).toBeNull();
  expect(JSON.stringify(data)).toBe(before);
});
it('accepts a bound complete compact snapshot without rewriting the input', () => {
  const data = boundRecording(regularSnapshot());
  const before = JSON.stringify(data);
  expect(scoredObjectSummary(data)).toEqual({ total: 2, found: 2, hasJokers: true });
  expect(JSON.stringify(data)).toBe(before);
});
it('checks identities of legacy joker entries before filtering them out', () => {
  const objects = markers.map((m, index) => ({ ...m, index, recordedStatus: 'manual_found' }));
  expect(scoredObjectSummary(boundRecording(objects)).found).toBe(2);
  objects[0].id = objects[1].id;
  expect(scoredObjectSummary(boundRecording(objects)).found).toBeNull();
});
it('keeps pending regular findings unknown even with valid identity and run binding', () => {
  const objects = regularSnapshot();
  objects[1].recordedStatus = 'pending';
  expect(scoredObjectSummary(boundRecording(objects)).found).toBeNull();
});

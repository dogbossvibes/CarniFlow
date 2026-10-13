import { localAutoObjectsFromRun, validateIntent } from '../localIntent';
import { key } from './fixtures';
import { localRun, coldIntent } from './intentFixtures';
it('retains exact local detection IDs, including legacy runs without a snapshot; does not infer remote markers', () => {
  expect(localAutoObjectsFromRun(localRun(), key)).toEqual([
    { objectId: 'local-auto-a', index: 0, material: 'duebel' }, { objectId: 'local-auto-b', index: 1, material: null }]);
  expect(localAutoObjectsFromRun({ ...localRun(), object_snapshot: undefined }, key)[0].material).toBeNull();
});
it.each(['run_id', 'session_id', 'ended_at'])('rejects wrong or incomplete run binding %s', field => {
  expect(localAutoObjectsFromRun({ ...localRun(), [field]: 'wrong' }, key)).toEqual([]);
});
it('does not manufacture identifiers or include already overridden detections', () => {
  expect(localAutoObjectsFromRun({ ...localRun(), object_detections: [{ source: 'auto_dwell' }] }, key)).toEqual([]);
  expect(localAutoObjectsFromRun({ ...localRun(), object_detections: [{ id: 'x', source: 'auto_dwell', user_override: true }] }, key)).toEqual([]);
  expect(localAutoObjectsFromRun({ ...localRun(), object_detections: [{ id: 'x', source: 'auto_dwell' }, { id: 'x', source: 'auto_dwell' }] }, key)).toEqual([]);
});
it('allows only an explicit dismissal of an existing local automatic detection', () => {
  expect(() => validateIntent(coldIntent())).not.toThrow();
  expect(() => validateIntent({ ...coldIntent(), changes: [{ objectId: 'remote-guess', status: 'not_found' }] })).toThrow('REVIEW_INVALID_INTENT');
  expect(() => validateIntent({ ...coldIntent(), changes: [{ objectId: 'local-auto-a', status: 'found' }] })).toThrow('REVIEW_INVALID_INTENT');
});

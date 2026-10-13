import { localAutoObjectsFromRun, type ReviewIntent } from '../localIntent';
import { key } from './fixtures';
export const localRun = () => ({ run_id: key.runId, session_id: key.sessionId, ended_at: '2026-10-09T08:00:00Z',
  object_detections: [{ id: 'local-auto-a', source: 'auto_dwell' }, { id: 'local-auto-b', source: 'auto_dwell' }],
  object_snapshot: { version: 1, objects: [{ id: 'local-auto-a', material: 'duebel' }] } });
export const coldIntent = (): ReviewIntent => ({ ...key, operationId: 'intent-a', expectedRevision: null,
  localAutoObjects: localAutoObjectsFromRun(localRun(), key), changes: [{ objectId: 'local-auto-a', status: 'not_found' }] });

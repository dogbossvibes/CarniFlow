import fixture from './fixtures/backend-v1.json';
import { createTrackTransferImportPlan } from '../importPlan';
import type { LocalTrainingSession } from '@/features/sync/types/sync';
import { createRemoteTrainingSession } from '@/features/sync/services/remoteTrainingSyncService';
const mockCloud = { notes: 'Own edited notes', track_data: { run: { run_id: fixture.accept.receipt.ownRunId, score: 86 } } };
const mockUpsert = jest.fn((row: object) => {
  Object.assign(mockCloud, row);
  return { select: () => ({ single: async () => ({ data: { id: fixture.accept.receipt.ownSessionId }, error: null }) }) };
});
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ upsert: mockUpsert }) } }));
jest.mock('@/services/mediaService', () => ({ uploadImage: jest.fn(), uploadVideo: jest.fn(), uploadAudio: jest.fn() }));
function imported() {
  const parent = createTrackTransferImportPlan(fixture.accept.receipt, fixture.accept.reference).statements[0];
  const columns = parent.sql.slice(parent.sql.indexOf('(') + 1, parent.sql.indexOf(')')).split(',');
  return Object.fromEntries(columns.map((column, i) => [column, parent.params[i]])) as unknown as LocalTrainingSession;
}
it.each([null, fixture.accept.receipt.ownSessionId])('never sends an imported reference through ordinary overwrite sync (remote id %s)', async remoteId => {
  const before = JSON.stringify(mockCloud), row = { ...imported(), remote_id: remoteId };
  const result = await createRemoteTrainingSession(row);
  expect(result.error).toBe('TRANSFER_SYNC_REQUIRES_ATOMIC_API');
  expect(mockUpsert).not.toHaveBeenCalled();
  expect(JSON.stringify(mockCloud)).toBe(before);
});

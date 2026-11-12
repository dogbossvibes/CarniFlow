import fixture from './fixtures/backend-cloud-v1.json';
import { getLocalTrackDetail, getLocalRunSupplement } from '@/features/tracking/services/trackHistoryService';
const mockLocal = jest.fn();
jest.mock('@/features/tracking/services/trackService', () => ({}));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessionById: () => mockLocal() }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({ getTrackPointsBySession: async () => [], getTrackMarkersBySession: async () => [] }));
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({}));
const receipt = fixture.restore.receipt;
beforeEach(() => mockLocal.mockResolvedValue({ local_id: receipt.ownSessionId, user_id: receipt.recipientUserId, dog_id: receipt.recipientDogId,
  notes: 'private', payload_json: JSON.stringify({ trackTransferReceipt: receipt, run: fixture.restore.ownCopy.run }) }));
it.each([undefined, null, 'another-account'])('does not reveal a local transfer or run for identity %s', async user => {
  expect(await getLocalTrackDetail(receipt.ownSessionId, user)).toBeNull(); expect(await getLocalRunSupplement(receipt.ownSessionId, user)).toBeNull();
});
it('returns its own private record and bound receipt', async () => {
  expect(await getLocalTrackDetail(receipt.ownSessionId, receipt.recipientUserId)).toMatchObject({ notes: 'private', track_data: { trackTransferReceipt: receipt } });
});
it('does not weaken ordinary local-only history fallback', async () => {
  mockLocal.mockResolvedValue({ local_id: 'legacy', payload_json: '{}', notes: 'offline ordinary' });
  expect(await getLocalTrackDetail('legacy')).toMatchObject({ notes: 'offline ordinary' });
});

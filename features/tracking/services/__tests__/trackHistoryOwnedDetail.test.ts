import { getLocalTrackDetail } from '../trackHistoryService';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { getTrackPointsBySession, getTrackMarkersBySession } from '@/features/tracking/repositories/localTrackRepository';

jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessionById: jest.fn() }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({ getTrackPointsBySession: jest.fn(), getTrackMarkersBySession: jest.fn() }));
jest.mock('@/features/tracking/services/trackService', () => ({}));
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({}));
jest.mock('@/features/tracking-transfer/syncGuard', () => ({ isTransferTrainingSession: () => false }));

const local = { local_id: 'session', user_id: 'owner', dog_id: 'dog', type: 'track', deleted_at: null, payload_json: '{}' };
beforeEach(() => {
  jest.clearAllMocks();
  (getLocalTrainingSessionById as jest.Mock).mockResolvedValue(local);
  (getTrackPointsBySession as jest.Mock).mockResolvedValue([]);
  (getTrackMarkersBySession as jest.Mock).mockResolvedValue([]);
});
it('reads an owned non-deleted session through the real service', async () => {
  expect(await getLocalTrackDetail('session', 'owner', { ownedOnly: true })).not.toBeNull();
  expect(getTrackPointsBySession).toHaveBeenCalledWith('session');
  expect(getTrackMarkersBySession).toHaveBeenCalledWith('session');
});
it.each([
  ['different owner', 'other', local],
  ['missing user', undefined, local],
  ['deleted session', 'owner', { ...local, deleted_at: '2026-01-01' }],
] as const)('rejects %s before reading points or markers', async (_, user, record) => {
  (getLocalTrainingSessionById as jest.Mock).mockResolvedValue(record);
  expect(await getLocalTrackDetail('session', user, { ownedOnly: true })).toBeNull();
  expect(getTrackPointsBySession).not.toHaveBeenCalled();
  expect(getTrackMarkersBySession).not.toHaveBeenCalled();
});
it('preserves the existing non-transfer legacy call without ownedOnly', async () => {
  expect(await getLocalTrackDetail('session')).not.toBeNull();
  expect(getTrackPointsBySession).toHaveBeenCalledWith('session');
  expect(getTrackMarkersBySession).toHaveBeenCalledWith('session');
});

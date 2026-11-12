import { syncNow } from '@/features/sync/services/syncEngine';
const mockRemote = { create: jest.fn(), update: jest.fn(), delete: jest.fn(), deletePoints: jest.fn(), deleteMarkers: jest.fn(), run: jest.fn() };
const mockGetLocal = jest.fn(), mockPending = jest.fn(), mockCompleted = jest.fn(), mockFailed = jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessionById: () => mockGetLocal(), setTrainingRemoteId: jest.fn(), updateTrainingSyncStatus: jest.fn() }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({ getTrackPointsBySession: async () => [], getTrackMarkersBySession: async () => [], updateTrackPointSyncStatus: jest.fn() }));
jest.mock('@/features/sync/services/remoteTrainingSyncService', () => ({
  createRemoteTrainingSession: (...a: unknown[]) => mockRemote.create(...a), updateRemoteTrainingSession: (...a: unknown[]) => mockRemote.update(...a),
  deleteRemoteTrainingSession: (...a: unknown[]) => mockRemote.delete(...a), deleteRemoteLayTrackPoints: (...a: unknown[]) => mockRemote.deletePoints(...a),
  deleteRemoteTrackMarkers: (...a: unknown[]) => mockRemote.deleteMarkers(...a), upsertRemoteTrackRun: (...a: unknown[]) => mockRemote.run(...a),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) } } }));
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: async () => true }));
jest.mock('@/features/sync/store/syncStore', () => ({ useSyncStore: { getState: () => new Proxy({}, { get: () => jest.fn() }) } }));
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({
  getPendingSyncOperations: () => mockPending(), markSyncProcessing: jest.fn(), markSyncCompleted: (...a: unknown[]) => mockCompleted(...a),
  markSyncFailed: (...a: unknown[]) => mockFailed(...a), markSyncConflict: jest.fn(), clearCompleted: jest.fn(),
  syncQueueCounts: async () => ({ pending: 0, failed: 0, conflict: 0 }),
}));
jest.mock('@/features/media/repositories/localMediaRepository', () => ({}));
const mockOwnSync = jest.fn();
jest.mock('../runtime', () => ({ syncOwnTransfer: (...a: unknown[]) => mockOwnSync(...a) }));
const row = { local_id: 'own-session', remote_id: 'own-session', user_id: 'owner', notes: 'Keep my notes', payload_json: '{}' };
beforeEach(() => {
  jest.clearAllMocks();
  mockOwnSync.mockImplementation(async row => JSON.parse(row.payload_json).trackTransferReceipt !== undefined ? { ok: false, error: 'INVALID_RESPONSE' } : null);
  Object.values(mockRemote).forEach(fn => fn.mockResolvedValue({ data: { id: row.local_id }, error: null }));
});
it.each(['create', 'update', 'delete'])('keeps transfer %s queued and untouched instead of calling ordinary cloud writes', async operation => {
  const local = { ...row, payload_json: JSON.stringify({ trackTransferReceipt: { version: 1 }, run: { score: 84 } }) };
  mockGetLocal.mockResolvedValue(local); mockPending.mockResolvedValue([{ id: 'queue', entity_type: 'training_session', entity_local_id: row.local_id, operation }]);
  await syncNow();
  Object.values(mockRemote).forEach(fn => expect(fn).not.toHaveBeenCalled());
  expect(mockCompleted).not.toHaveBeenCalled();
  expect(mockFailed).toHaveBeenCalledWith('queue', 'INVALID_RESPONSE');
  expect(local.notes).toBe('Keep my notes'); expect(JSON.parse(local.payload_json).run.score).toBe(84);
});
it.each(['create', 'update', 'delete'])('retains the existing ordinary %s path for non-transfer training', async operation => {
  mockGetLocal.mockResolvedValue(row); mockPending.mockResolvedValue([{ id: 'queue', entity_type: 'training_session', entity_local_id: row.local_id, operation }]);
  await syncNow();
  expect(mockRemote[operation as keyof typeof mockRemote]).toHaveBeenCalledTimes(1);
  expect(mockCompleted).toHaveBeenCalledWith('queue'); expect(mockFailed).not.toHaveBeenCalled();
});
it('does not let a damaged null receipt fall back to an ordinary update', async () => {
  mockGetLocal.mockResolvedValue({ ...row, payload_json: '{"trackTransferReceipt":null}' });
  mockPending.mockResolvedValue([{ id: 'queue', entity_type: 'training_session', entity_local_id: row.local_id, operation: 'update' }]);
  await syncNow(); expect(mockRemote.update).not.toHaveBeenCalled();
  expect(mockFailed).toHaveBeenCalledWith('queue', 'INVALID_RESPONSE');
});

it.each(['create', 'update', 'delete'])('completes transfer %s only through the dedicated revisioned API', async operation => {
  mockOwnSync.mockResolvedValue({ ok: true }); mockGetLocal.mockResolvedValue({ ...row, payload_json: '{"trackTransferReceipt":{}}' });
  mockPending.mockResolvedValue([{ id: 'queue', entity_type: 'training_session', entity_local_id: row.local_id, operation }]);
  await syncNow(); expect(mockCompleted).toHaveBeenCalledWith('queue');
  Object.values(mockRemote).forEach(fn => expect(fn).not.toHaveBeenCalled());
  expect(mockOwnSync).toHaveBeenCalledWith(expect.objectContaining({ local_id: row.local_id }), ...(operation === 'create' ? [] : [operation === 'delete']));
});

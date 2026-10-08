// Isolated sync admission regression probe; all storage and network calls are mocked.

const mockGetLocal = jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (id: string) => mockGetLocal(id),
  setTrainingRemoteId: jest.fn(async () => {}),
  updateTrainingSyncStatus: jest.fn(async () => {}),
}));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getTrackPointsBySession: async () => [], getTrackMarkersBySession: async () => [], updateTrackPointSyncStatus: async () => {},
}));
const mockCreateRemote = jest.fn(async (..._a: any[]): Promise<any> => ({ data: { id: 'local-ok' }, error: null }));
jest.mock('@/features/sync/services/remoteTrainingSyncService', () => ({
  createRemoteTrainingSession: (...a: any[]) => mockCreateRemote(...a),
  updateRemoteTrainingSession: jest.fn(), deleteRemoteTrainingSession: jest.fn(),
  createRemoteTrackPointsBatch: async () => ({ data: null, error: null }),
  createRemoteTrackMarkersBatch: async () => ({ data: null, error: null }),
  createRemoteTrackMarkersIndividually: async () => ({ inserted: 0, failed: [] }),
  uploadRemoteMediaFile: jest.fn(),
  deleteRemoteLayTrackPoints: async () => ({ data: null, error: null }),
  deleteRemoteTrackMarkers: async () => ({ data: null, error: null }),
  upsertRemoteTrackRun: async () => ({ data: null, error: null }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) }, from: () => ({}) } }));
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: async () => true }));
const mockStore = { isOnline: true, setOnlineStatus: jest.fn(), setSyncing: jest.fn(), setLastError: jest.fn(), setSyncProgress: jest.fn(), setLastSyncAt: jest.fn(), setCurrentSyncItem: jest.fn(), setPendingCount: jest.fn(), setFailedCount: jest.fn(), setConflictCount: jest.fn() };
jest.mock('@/features/sync/store/syncStore', () => ({ useSyncStore: { getState: () => mockStore } }));

const mockGetPending = jest.fn(async (): Promise<any[]> => []);
const mockMarkCompleted = jest.fn(async (..._a: any[]) => {});
const mockMarkFailed = jest.fn(async (..._a: any[]) => {});
const mockMarkConflict = jest.fn(async (..._a: any[]) => {});
const mockRetryFailedOps = jest.fn(async () => {});
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({
  getPendingSyncOperations: () => mockGetPending(),
  markSyncProcessing: async () => {},
  markSyncCompleted: (...a: any[]) => mockMarkCompleted(...a),
  markSyncFailed: (...a: any[]) => mockMarkFailed(...a),
  markSyncConflict: (...a: any[]) => mockMarkConflict(...a),
  retryFailedOperations: () => mockRetryFailedOps(),
  syncQueueCounts: async () => ({ pending: 0, failed: 0, conflict: 0 }), clearCompleted: async () => {},
}));
jest.mock('@/features/media/repositories/localMediaRepository', () => ({
  getPendingMediaFiles: async () => [], markMediaUploaded: async () => {}, markMediaUploadFailed: async () => {},
}));

// eslint-disable-next-line import/first
import { syncNow } from '@/features/sync/services/syncEngine';

beforeEach(() => { jest.clearAllMocks(); mockGetLocal.mockReset(); mockGetPending.mockReset(); mockGetPending.mockResolvedValue([]); });


it('admits only one sync worker when two callers arrive before network/auth awaits settle', async () => {
  await Promise.all([syncNow(), syncNow()]);
  expect(mockGetPending).toHaveBeenCalledTimes(1);
});

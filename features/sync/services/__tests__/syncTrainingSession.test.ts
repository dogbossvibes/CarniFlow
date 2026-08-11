// Alle Nachbarn von syncEngine mocken → nur die Orchestrierung von
// syncTrainingSession prüfen (Idempotenz, Replace-Reihenfolge, Retry, Fehlerpfad).
const mockGetLocal = jest.fn();
const mockSetRemoteId = jest.fn(async (..._a: any[]) => {});
const mockUpdateSyncStatus = jest.fn(async (..._a: any[]) => {});
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  getLocalTrainingSessionById: (id: string) => mockGetLocal(id),
  setTrainingRemoteId: (...a: any[]) => mockSetRemoteId(...a),
  updateTrainingSyncStatus: (...a: any[]) => mockUpdateSyncStatus(...a),
}));

const mockGetPoints = jest.fn();
const mockGetMarkers = jest.fn();
const mockUpdatePointStatus = jest.fn(async (..._a: any[]) => {});
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  getTrackPointsBySession: (id: string) => mockGetPoints(id),
  getTrackMarkersBySession: (id: string) => mockGetMarkers(id),
  updateTrackPointSyncStatus: (...a: any[]) => mockUpdatePointStatus(...a),
}));

const mockCreateRemote = jest.fn(async (..._a: any[]): Promise<any> => ({ data: { id: 'local-1' }, error: null }));
const mockDelPoints = jest.fn(async (..._a: any[]): Promise<any> => ({ data: null, error: null }));
const mockDelMarkers = jest.fn(async (..._a: any[]): Promise<any> => ({ data: null, error: null }));
const mockInsPoints = jest.fn(async (..._a: any[]): Promise<any> => ({ data: null, error: null }));
const mockInsMarkers = jest.fn(async (..._a: any[]): Promise<any> => ({ data: null, error: null }));
jest.mock('@/features/sync/services/remoteTrainingSyncService', () => ({
  createRemoteTrainingSession: (...a: any[]) => mockCreateRemote(...a),
  updateRemoteTrainingSession: jest.fn(), deleteRemoteTrainingSession: jest.fn(),
  createRemoteTrackPointsBatch: (...a: any[]) => mockInsPoints(...a),
  createRemoteTrackMarkersBatch: (...a: any[]) => mockInsMarkers(...a),
  uploadRemoteMediaFile: jest.fn(),
  deleteRemoteLayTrackPoints: (...a: any[]) => mockDelPoints(...a),
  deleteRemoteTrackMarkers: (...a: any[]) => mockDelMarkers(...a),
}));

// Neutralisieren (nicht genutzt in syncTrainingSession) — nur damit der Import lädt.
jest.mock('@/lib/supabase', () => ({ supabase: { auth: {}, from: () => ({}) } }));
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: async () => true }));
jest.mock('@/features/sync/store/syncStore', () => ({ useSyncStore: { getState: () => ({}) } }));
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({
  getPendingSyncOperations: async () => [], markSyncProcessing: async () => {}, markSyncCompleted: async () => {},
  markSyncFailed: async () => {}, retryFailedOperations: async () => {},
  syncQueueCounts: async () => ({ pending: 0, failed: 0, conflict: 0 }), clearCompleted: async () => {},
}));
jest.mock('@/features/media/repositories/localMediaRepository', () => ({
  getPendingMediaFiles: async () => [], markMediaUploaded: async () => {}, markMediaUploadFailed: async () => {},
}));

import { syncTrainingSession } from '@/features/sync/services/syncEngine';

const localRow = { local_id: 'local-1', remote_id: null, user_id: 'owner-1', dog_id: 'dog-1' };
const layPoint = { local_id: 'p1', point_type: 'lay' };
const searchPoint = { local_id: 'p2', point_type: 'search' };

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLocal.mockResolvedValue(localRow);
  mockGetPoints.mockResolvedValue([layPoint, searchPoint]);
  mockGetMarkers.mockResolvedValue([{ local_id: 'm1' }]);
  mockCreateRemote.mockResolvedValue({ data: { id: 'local-1' }, error: null });
  mockDelPoints.mockResolvedValue({ data: null, error: null });
  mockDelMarkers.mockResolvedValue({ data: null, error: null });
  mockInsPoints.mockResolvedValue({ data: null, error: null });
  mockInsMarkers.mockResolvedValue({ data: null, error: null });
});

describe('syncTrainingSession — idempotenter Single-Source-Sync', () => {
  it('Online: Session-Upsert + verknüpft Remote-ID (= local_id) + markiert synced', async () => {
    const res = await syncTrainingSession('local-1');
    expect(res.ok).toBe(true);
    expect(mockCreateRemote).toHaveBeenCalledWith(localRow);
    expect(mockSetRemoteId).toHaveBeenCalledWith('local-1', 'local-1');   // remote_id == clientUuid
    expect(mockUpdateSyncStatus).toHaveBeenCalledWith('local-1', 'synced');
  });

  it('Punkte: Replace-by-session (delete VOR insert) und nur lay-Punkte', async () => {
    await syncTrainingSession('local-1');
    expect(mockDelPoints).toHaveBeenCalledWith('local-1');
    expect(mockInsPoints).toHaveBeenCalledWith('local-1', [layPoint]);   // search gefiltert
    expect(mockUpdatePointStatus).toHaveBeenCalledWith(['p1'], 'synced');
    // Reihenfolge: erst löschen, dann einfügen (idempotent).
    expect(mockDelPoints.mock.invocationCallOrder[0]).toBeLessThan(mockInsPoints.mock.invocationCallOrder[0]);
  });

  it('Marker: Replace-by-session (delete VOR insert)', async () => {
    await syncTrainingSession('local-1');
    expect(mockDelMarkers).toHaveBeenCalledWith('local-1');
    expect(mockInsMarkers).toHaveBeenCalledWith('local-1', [{ local_id: 'm1' }]);
    expect(mockDelMarkers.mock.invocationCallOrder[0]).toBeLessThan(mockInsMarkers.mock.invocationCallOrder[0]);
  });

  it('Doppelter Sync (Retry): Upsert + Replace jedes Mal → keine Insert-ohne-Delete-Duplikate', async () => {
    await syncTrainingSession('local-1');
    await syncTrainingSession('local-1');
    expect(mockCreateRemote).toHaveBeenCalledTimes(2);   // Upsert idempotent (keine 2. Zeile)
    expect(mockDelPoints).toHaveBeenCalledTimes(2);
    expect(mockInsPoints).toHaveBeenCalledTimes(2);
  });

  it('Session-Upload-Fehler: ok=false, NICHT als synced markiert (lokal bleibt erhalten)', async () => {
    mockCreateRemote.mockResolvedValueOnce({ data: null, error: 'HTTP 500' });
    const res = await syncTrainingSession('local-1');
    expect(res.ok).toBe(false);
    expect(mockDelPoints).not.toHaveBeenCalled();
    expect(mockUpdateSyncStatus).not.toHaveBeenCalledWith('local-1', 'synced');
  });

  it('Punkte-Fehler: ok=false, Session bleibt pending (kein synced)', async () => {
    mockDelPoints.mockResolvedValueOnce({ data: null, error: 'net' });
    const res = await syncTrainingSession('local-1');
    expect(res.ok).toBe(false);
    expect(mockUpdateSyncStatus).not.toHaveBeenCalledWith('local-1', 'synced');
  });
});

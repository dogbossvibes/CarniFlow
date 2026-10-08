/**
 * Retry fehlgeschlagener Sync-Items + Verhalten bei fehlender lokaler Session.
 *
 * Production-Befund (84b3c0ea, d80620ad): 'failed' Queue-Items wurden nur über
 * Sync-Screen/Startliste reaktiviert; fehlte die lokale Session, galt der Sync
 * still als erledigt. Hier: (1) Track-Open → Retry, wenn lokal nicht 'synced';
 * (2) lokale Session fehlt → terminal 'conflict' mit Grund, kein 'completed',
 * kein 'failed'-Endlos-Retry; (3) bestehende Retry-Semantik unverändert.
 */
import { readFileSync } from 'fs';

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
const mockGetSession = jest.fn();
const mockIsOnline = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: () => mockGetSession() }, from: () => ({}) } }));
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: () => mockIsOnline() }));
const mockStore = { isOnline: true, setOnlineStatus: jest.fn(), setSyncing: jest.fn(), setLastError: jest.fn(), setSyncProgress: jest.fn(), setLastSyncAt: jest.fn(), setCurrentSyncItem: jest.fn(), setPendingCount: jest.fn(), setFailedCount: jest.fn(), setConflictCount: jest.fn() };
jest.mock('@/features/sync/store/syncStore', () => ({ useSyncStore: { getState: () => mockStore } }));

const mockGetPending = jest.fn(async (): Promise<any[]> => []);
const mockMarkCompleted = jest.fn(async (..._a: any[]) => {});
const mockMarkFailed = jest.fn(async (..._a: any[]) => {});
const mockMarkConflict = jest.fn(async (..._a: any[]) => {});
const mockRetryFailedOps = jest.fn(async () => {});
const mockCounts = jest.fn();
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({
  getPendingSyncOperations: () => mockGetPending(),
  markSyncProcessing: async () => {},
  markSyncCompleted: (...a: any[]) => mockMarkCompleted(...a),
  markSyncFailed: (...a: any[]) => mockMarkFailed(...a),
  markSyncConflict: (...a: any[]) => mockMarkConflict(...a),
  retryFailedOperations: () => mockRetryFailedOps(),
  syncQueueCounts: () => mockCounts(), clearCompleted: async () => {},
}));
jest.mock('@/features/media/repositories/localMediaRepository', () => ({
  getPendingMediaFiles: async () => [], markMediaUploaded: async () => {}, markMediaUploadFailed: async () => {},
}));

// eslint-disable-next-line import/first
import { syncTrainingSession, syncNow, retryFailedSync, retryFailedSyncForSession, LOCAL_SESSION_MISSING } from '@/features/sync/services/syncEngine';

const item = (over: Record<string, unknown> = {}) => ({ id: 'sq-1', entity_type: 'training_session', entity_local_id: 'gone-1', operation: 'create', ...over });

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLocal.mockReset();
  mockStore.setSyncing.mockReset();
  mockCounts.mockReset().mockResolvedValue({ pending: 0, failed: 0, conflict: 0 });
  mockGetPending.mockReset().mockResolvedValue([]);
  mockIsOnline.mockReset().mockResolvedValue(true);
  mockGetSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
});

describe('lokale Session fehlt → explizit nicht rekonstruierbar', () => {
  it('syncTrainingSession meldet ok:false mit reason local_missing (nicht mehr still ok:true)', async () => {
    mockGetLocal.mockResolvedValue(null);
    const res = await syncTrainingSession('gone-1');
    expect(res).toEqual({ ok: false, error: LOCAL_SESSION_MISSING, reason: 'local_missing' });
    expect(mockCreateRemote).not.toHaveBeenCalled();
  });
  it('Queue-Item (create) → terminal conflict mit Grund; weder completed noch failed', async () => {
    mockGetLocal.mockResolvedValue(null);
    mockGetPending.mockResolvedValue([item()]);
    await syncNow();
    expect(mockMarkConflict).toHaveBeenCalledWith('sq-1', LOCAL_SESSION_MISSING);
    expect(mockMarkCompleted).not.toHaveBeenCalled();
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });
  it('Queue-Item (update ohne remote_id) → ebenfalls conflict', async () => {
    mockGetLocal.mockResolvedValue(null);
    mockGetPending.mockResolvedValue([item({ id: 'sq-2', operation: 'update' })]);
    await syncNow();
    expect(mockMarkConflict).toHaveBeenCalledWith('sq-2', LOCAL_SESSION_MISSING);
    expect(mockMarkCompleted).not.toHaveBeenCalled();
  });
  it('conflict wird von retryFailedOperations nicht angefasst (nur status=failed) — Repository-Vertrag', () => {
    const src = readFileSync('features/sync/repositories/syncQueueRepository.ts', 'utf8');
    expect(src).toContain(`update sync_queue set status='pending', updated_at=? where status='failed'`);
    expect(src).toContain(`set status='conflict', last_error=?`);
  });
});

describe('bestehende Retry-Semantik bleibt', () => {
  it('lokale Session vorhanden → normaler Sync-Pfad, completed', async () => {
    mockGetLocal.mockResolvedValue({ local_id: 'ok-1', remote_id: null, payload_json: null, sync_status: 'failed' });
    mockGetPending.mockResolvedValue([item({ entity_local_id: 'ok-1' })]);
    await syncNow();
    expect(mockMarkCompleted).toHaveBeenCalledWith('sq-1');
    expect(mockMarkConflict).not.toHaveBeenCalled();
  });
  it('echter Remote-Fehler → weiterhin failed (retry-fähig, attempts zählen im Repository)', async () => {
    mockGetLocal.mockResolvedValue({ local_id: 'ok-1', remote_id: null, payload_json: null, sync_status: 'failed' });
    mockCreateRemote.mockResolvedValueOnce({ data: null, error: 'boom' });
    mockGetPending.mockResolvedValue([item({ entity_local_id: 'ok-1' })]);
    await syncNow();
    expect(mockMarkFailed).toHaveBeenCalledWith('sq-1', 'boom');
    expect(mockMarkConflict).not.toHaveBeenCalled();
  });
});

describe('retryFailedSyncForSession (Track-Open)', () => {
  it('lokal failed → failed→pending + syncNow', async () => {
    mockGetLocal.mockResolvedValue({ local_id: 'f-1', sync_status: 'failed' });
    expect(await retryFailedSyncForSession('f-1')).toBe(true);
    expect(mockRetryFailedOps).toHaveBeenCalledTimes(1);
    expect(mockGetPending).toHaveBeenCalled();   // syncNow lief
  });
  it('lokal pending → ebenfalls Retry-Pfad', async () => {
    mockGetLocal.mockResolvedValue({ local_id: 'p-1', sync_status: 'pending' });
    expect(await retryFailedSyncForSession('p-1')).toBe(true);
    expect(mockRetryFailedOps).toHaveBeenCalledTimes(1);
  });
  it('lokal synced → kein Retry', async () => {
    mockGetLocal.mockResolvedValue({ local_id: 's-1', sync_status: 'synced' });
    expect(await retryFailedSyncForSession('s-1')).toBe(false);
    expect(mockRetryFailedOps).not.toHaveBeenCalled();
  });
  it('keine lokale Session → kein Retry, kein Fehler', async () => {
    mockGetLocal.mockResolvedValue(null);
    expect(await retryFailedSyncForSession('gone')).toBe(false);
    expect(mockRetryFailedOps).not.toHaveBeenCalled();
  });
});


describe('one sync worker across network and auth awaits', () => {
  it('admits one worker when callers arrive before the network check completes', async () => {
    let resolveOnline!: (online: boolean) => void;
    mockIsOnline.mockImplementationOnce(() => new Promise<boolean>(resolve => { resolveOnline = resolve; }));
    const first = syncNow();
    const second = syncNow();
    resolveOnline(true);
    await Promise.all([first, second]);
    expect(mockIsOnline).toHaveBeenCalledTimes(1);
    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });

  it('also excludes a second worker while authentication is pending', async () => {
    let resolveSession!: (session: unknown) => void;
    let authStarted!: () => void;
    const enteredAuth = new Promise<void>(resolve => { authStarted = resolve; });
    mockGetSession.mockImplementationOnce(() => new Promise(resolve => {
      resolveSession = resolve;
      authStarted();
    }));
    const first = syncNow();
    await enteredAuth;
    const second = syncNow();
    resolveSession({ data: { session: { user: { id: 'u1' } } } });
    await Promise.all([first, second]);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });

  it.each(['offline', 'logged-out', 'network-error', 'auth-error'])(
    'releases the worker after %s so a later sync can run', async (failure) => {
      if (failure === 'offline') mockIsOnline.mockResolvedValueOnce(false);
      if (failure === 'logged-out') mockGetSession.mockResolvedValueOnce({ data: { session: null } });
      if (failure === 'network-error') mockIsOnline.mockRejectedValueOnce(new Error('network unavailable'));
      if (failure === 'auth-error') mockGetSession.mockRejectedValueOnce(new Error('auth unavailable'));
      await syncNow();
      expect(mockGetPending).not.toHaveBeenCalled();
      expect(mockStore.setSyncing).not.toHaveBeenCalled();
      await syncNow();
      expect(mockGetPending).toHaveBeenCalledTimes(1);
      expect(mockStore.setSyncing).toHaveBeenLastCalledWith(false);
    },
  );
});


describe('reservation lifetime and recovery', () => {
  it('rejects an auth error even when the response still carries a session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: { user: { id: 'u1' } } }, error: { message: 'revoked' } });
    await syncNow();
    expect(mockGetPending).not.toHaveBeenCalled();
    expect(mockStore.setLastError).toHaveBeenCalledWith('revoked');
    await syncNow();
    expect(mockGetPending).toHaveBeenCalledTimes(1);
  });

  it('releases after a queue read failure and preserves a later retry', async () => {
    mockGetPending.mockRejectedValueOnce(new Error('queue read failed'));
    await syncNow();
    expect(mockStore.setLastError).toHaveBeenCalledWith('queue read failed');
    expect(mockStore.setLastSyncAt).not.toHaveBeenCalled();
    await retryFailedSync();
    expect(mockRetryFailedOps).toHaveBeenCalledTimes(1);
    expect(mockGetPending).toHaveBeenCalledTimes(2);
  });

  it('retains the reservation through asynchronous cleanup and concurrent retry', async () => {
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    mockCounts.mockImplementationOnce(() => new Promise(resolve => {
      finish = () => resolve({ pending: 0, failed: 0, conflict: 0 }); entered();
    }));
    const first = syncNow();
    await started;
    await Promise.all([syncNow(), retryFailedSync()]);
    expect(mockGetPending).toHaveBeenCalledTimes(1);
    finish(); await first;
    await syncNow();
    expect(mockGetPending).toHaveBeenCalledTimes(2);
  });

  it('releases even when cleanup counters or the store reset fail', async () => {
    mockCounts.mockRejectedValueOnce(new Error('counts unavailable'));
    mockStore.setSyncing.mockImplementation((value: boolean) => { if (!value) throw new Error('store observer failed'); });
    await expect(syncNow()).rejects.toThrow('store observer failed');
    mockStore.setSyncing.mockReset();
    await syncNow();
    expect(mockGetPending).toHaveBeenCalledTimes(2);
    expect(mockStore.setSyncing).toHaveBeenLastCalledWith(false);
  });

  it.each(['logout', 'account-switch'])(
    '%s cannot admit another worker while the current queue read is pending', async mode => {
      let finish!: (items: any[]) => void;
      let entered!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      mockGetPending.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; entered(); }));
      const first = syncNow(); await started;
      mockGetSession.mockResolvedValue({ data: { session: mode === 'logout' ? null : { user: { id: 'u2' } } } });
      await syncNow();
      expect(mockGetPending).toHaveBeenCalledTimes(1);
      finish([]); await first;
      await syncNow();
      expect(mockGetPending).toHaveBeenCalledTimes(mode === 'logout' ? 1 : 2);
      mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u2' } } } });
      await syncNow();
      expect(mockStore.setSyncing).toHaveBeenLastCalledWith(false);
    },
  );

  it('server denial retains the failed item and leaves the reservation reusable', async () => {
    mockGetLocal.mockResolvedValue({ local_id: 'denied', remote_id: null, payload_json: null, sync_status: 'pending' });
    mockGetPending.mockResolvedValueOnce([item({ entity_local_id: 'denied' })]);
    mockCreateRemote.mockResolvedValueOnce({ data: null, error: 'permission denied' });
    await Promise.all([syncNow(), syncNow()]);
    expect(mockGetPending).toHaveBeenCalledTimes(1);
    expect(mockMarkFailed).toHaveBeenCalledWith('sq-1', 'permission denied');
    expect(mockMarkCompleted).not.toHaveBeenCalled();
    await syncNow();
    expect(mockGetPending).toHaveBeenCalledTimes(2);
  });
});

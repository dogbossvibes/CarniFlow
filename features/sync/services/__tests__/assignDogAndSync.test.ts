/**
 * Upload nach dem Zuordnen (Ende-zu-Ende über den echten Sync-Engine-Pfad, echte
 * SQLite mit App-Migrationen, nur der Server ist simuliert):
 *  - vorher: Server lehnt die fremde dog_id mit 23503 ab → Eintrag bleibt failed, nichts verloren
 *  - Zuordnen → Upsert mit neuer dog_id, Punkte/Marker/Run hochgeladen, Queue erledigt
 *  - offline: Zuordnung wird lokal gespeichert, kein Upload-Versuch, Eintrag bleibt ausstehend
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';

let mockDb: DatabaseSync;
const adapter = () => ({
  runAsync: async (sql: string, ...params: unknown[]) => mockDb.prepare(sql).run(...(params as never[])),
  getFirstAsync: async (sql: string, ...params: unknown[]) => mockDb.prepare(sql).get(...(params as never[])) ?? null,
  getAllAsync: async (sql: string, ...params: unknown[]) => mockDb.prepare(sql).all(...(params as never[])),
  withExclusiveTransactionAsync: async (fn: (tx: unknown) => Promise<void>) => {
    mockDb.exec('begin');
    try { await fn(adapter()); mockDb.exec('commit'); } catch (e) { mockDb.exec('rollback'); throw e; }
  },
});
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => adapter() }));

const mockServerDogs = new Set(['dog-oha', 'dog-malu', 'dog-yam']);
const mockFK = 'insert or update on table "training_sessions" violates foreign key constraint "training_sessions_dog_id_fkey"';
const mockUpserts: any[] = [];
const mockPoints: any[] = [];
const mockMarkers: any[] = [];
const mockRuns: any[] = [];
jest.mock('@/features/sync/services/remoteTrainingSyncService', () => ({
  createRemoteTrainingSession: async (local: any) => {
    mockUpserts.push({ id: local.local_id, dog_id: local.dog_id, payload_json: local.payload_json });
    return mockServerDogs.has(local.dog_id) ? { data: { id: local.local_id }, error: null } : { data: null, error: mockFK };
  },
  updateRemoteTrainingSession: jest.fn(), deleteRemoteTrainingSession: jest.fn(),
  createRemoteTrackPointsBatch: async (_id: string, pts: any[]) => { mockPoints.push(...pts); return { data: null, error: null }; },
  createRemoteTrackMarkersBatch: async (_id: string, ms: any[]) => { mockMarkers.push(...ms); return { data: null, error: null }; },
  createRemoteTrackMarkersIndividually: async () => ({ inserted: 0, failed: [] }),
  uploadRemoteMediaFile: jest.fn(),
  deleteRemoteLayTrackPoints: async () => ({ data: null, error: null }),
  deleteRemoteTrackMarkers: async () => ({ data: null, error: null }),
  upsertRemoteTrackRun: async (_id: string, run: any) => { mockRuns.push(run); return { data: null, error: null }; },
}));
jest.mock('@/features/tracking-transfer/runtime', () => ({ syncOwnTransfer: async () => null }));
jest.mock('@/features/tracking/services/objectReview/service', () => ({ syncObjectReviews: async () => {}, objectReviewQueueCounts: async () => ({ pending: 0, failed: 0, conflict: 0 }) }));
jest.mock('@/features/training/trackLinks/sync', () => ({ syncTrackLinks: async () => {} }));
jest.mock('@/features/exam-book/sync', () => ({ syncExamBook: async () => {} }));
const mockIsOnline = jest.fn(async () => true);
jest.mock('@/features/sync/services/netinfo', () => ({ fetchIsOnline: () => mockIsOnline() }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } }, error: null }) }, from: () => ({}) } }));
const mockStore = { isOnline: true, setOnlineStatus: jest.fn(), setSyncing: jest.fn(), setLastError: jest.fn(), setSyncProgress: jest.fn(), setLastSyncAt: jest.fn(), setCurrentSyncItem: jest.fn(), setPendingCount: jest.fn(), setFailedCount: jest.fn(), setConflictCount: jest.fn() };
jest.mock('@/features/sync/store/syncStore', () => ({ useSyncStore: { getState: () => mockStore } }));

// eslint-disable-next-line import/first
import { assignDogAndSync, syncNow } from '@/features/sync/services/syncEngine';

const PAYLOAD = JSON.stringify({ distanceMeters: 412, articlesTotal: 1, run: { run_id: 'run-1', articles_found: 1, run_points: [] } });
function seed(id: string) {
  mockDb.prepare(`insert into local_training_sessions (local_id, user_id, dog_id, category, type, status, title, started_at, created_at, updated_at, sync_status, payload_json)
    values (?, 'owner-1', 'ghost-dog', 'IGP', 'track', 'completed', 'Fährte', '2026-11-28T09:00:00.000Z', '2026-11-28T09:00:00.000Z', '2026-11-28T10:00:00.000Z', 'pending', ?)`).run(id, PAYLOAD);
  for (let i = 0; i < 3; i++) {
    mockDb.prepare(`insert into local_track_points (local_id, session_local_id, latitude, longitude, timestamp, point_type, created_at, sync_status)
      values (?, ?, 47, 8, ?, 'lay', 'x', 'pending')`).run(`${id}-p${i}`, id, `2026-11-28T09:0${i}:00.000Z`);
  }
  mockDb.prepare(`insert into local_track_markers (local_id, session_local_id, marker_type, created_at, sync_status) values (?, ?, 'article', 'x', 'pending')`).run(`${id}-m`, id);
  mockDb.prepare(`insert into sync_queue (id, entity_type, entity_local_id, operation, priority, created_at, updated_at, attempts, status)
    values (?, 'training_session', ?, 'create', 1, ?, 'x', 0, 'pending')`).run(`sq-${id}`, id, `2026-11-28T09:00:0${id.slice(-1)}.000Z`);
}
const q = (id: string) => mockDb.prepare('select status, last_error from sync_queue where entity_local_id=?').get(id) as { status: string; last_error: string | null } | undefined;
const s = (id: string) => mockDb.prepare('select dog_id, sync_status, payload_json from local_training_sessions where local_id=?').get(id) as Record<string, unknown>;

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) mockDb.exec(m.sql);
  mockUpserts.length = 0; mockPoints.length = 0; mockMarkers.length = 0; mockRuns.length = 0;
  mockIsOnline.mockResolvedValue(true);
});
afterEach(() => mockDb.close());

it('vorher: fremde dog_id → Server lehnt ab (23503), Eintrag bleibt failed mit Grund, lokale Daten bleiben', async () => {
  seed('t1');
  await syncNow();
  expect(q('t1')).toMatchObject({ status: 'failed', last_error: mockFK });
  expect(s('t1')).toMatchObject({ dog_id: 'ghost-dog', payload_json: PAYLOAD });
});

it('Upload nach dem Zuordnen: neue dog_id hochgeladen, Punkte/Marker/Run vollständig, Queue erledigt', async () => {
  seed('t1');
  await syncNow();
  expect(q('t1')?.status).toBe('failed');
  mockUpserts.length = 0;

  const res = await assignDogAndSync(['t1'], 'dog-oha', 'owner-1');

  expect(res.reassigned).toEqual(['t1']);
  expect(mockUpserts).toEqual([{ id: 't1', dog_id: 'dog-oha', payload_json: PAYLOAD }]);
  expect(mockPoints).toHaveLength(3);
  expect(mockMarkers).toHaveLength(1);
  expect(mockRuns.map(r => r.run_id)).toEqual(['run-1']);
  expect(q('t1')).toBeUndefined();   // completed → aufgeräumt (wie bisher)
  expect(s('t1')).toMatchObject({ dog_id: 'dog-oha', sync_status: 'synced', payload_json: PAYLOAD });
});

it('mehrere Fährten auf einmal werden zugeordnet und hochgeladen', async () => {
  seed('t1'); seed('t2'); seed('t3');
  await syncNow();
  mockUpserts.length = 0;
  await assignDogAndSync(['t1', 't2', 't3'], 'dog-yam', 'owner-1');
  expect(mockUpserts.map(u => u.dog_id)).toEqual(['dog-yam', 'dog-yam', 'dog-yam']);
  for (const id of ['t1', 't2', 't3']) expect(q(id)).toBeUndefined();
});

it('offline: Zuordnung lokal gespeichert, kein Upload-Versuch, Eintrag bleibt ausstehend', async () => {
  seed('t1');
  await syncNow();
  mockUpserts.length = 0;
  mockIsOnline.mockResolvedValue(false);
  await assignDogAndSync(['t1'], 'dog-malu', 'owner-1');
  expect(mockUpserts).toEqual([]);
  expect(q('t1')?.status).toBe('pending');
  expect(s('t1')).toMatchObject({ dog_id: 'dog-malu', sync_status: 'pending', payload_json: PAYLOAD });
  // Wieder online → normaler Sync lädt hoch.
  mockIsOnline.mockResolvedValue(true);
  await syncNow();
  expect(mockUpserts.map(u => u.dog_id)).toEqual(['dog-malu']);
});

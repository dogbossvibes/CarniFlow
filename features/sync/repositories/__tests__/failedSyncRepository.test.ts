/**
 * Fährten mit fehlendem Hund zuordnen (Sync-Center, Befund 28.11.2026: Upload scheitert
 * dauerhaft an training_sessions_dog_id_fkey / 23503). Gegen eine ECHTE SQLite
 * (node:sqlite, In-Memory) mit den App-Migrationen. Belegt: nur dog_id ändert sich,
 * Punkte/Marker/payload_json/Daten bleiben, Queue failed → pending, mehrere auf einmal,
 * Altformat, fremdes Konto/geänderte Zeile bleibt unberührt, nichts wird gelöscht.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { listFailedSyncItems, reassignDogForSessions, retryFailedQueueItem } from '@/features/sync/repositories/failedSyncRepository';

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
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => 'gen-id', nowIso: () => '2026-11-28T18:00:00.000Z' }));

const OWNER = 'owner-1';
const RUN_PAYLOAD = JSON.stringify({ distanceMeters: 412.5, articlesTotal: 3, segments: [{ id: 's1' }], run: { run_id: 'run-1', articles_found: 2, run_points: [{ lat: 1, lng: 2 }] } });

function seedSession(id: string, opts: { dog?: string | null; owner?: string; payload?: string | null; queue?: 'failed' | 'pending' | 'completed'; error?: string } = {}) {
  mockDb.prepare(`insert into local_training_sessions (local_id, user_id, dog_id, type, status, title, notes, started_at, created_at, updated_at, sync_status, payload_json, last_sync_error)
    values (?, ?, ?, 'track', 'completed', 'Fährte', 'Notiz', '2026-11-28T09:00:00.000Z', '2026-11-28T08:59:00.000Z', '2026-11-28T10:00:00.000Z', 'failed', ?, ?)`)
    .run(id, opts.owner ?? OWNER, opts.dog === undefined ? 'ghost-dog' : opts.dog, opts.payload === undefined ? RUN_PAYLOAD : opts.payload, opts.error ?? null);
  for (let i = 0; i < 5; i++) {
    mockDb.prepare(`insert into local_track_points (local_id, session_local_id, latitude, longitude, timestamp, point_type, created_at, sync_status)
      values (?, ?, ?, ?, ?, 'lay', ?, 'pending')`).run(`${id}-p${i}`, id, 47 + i / 1000, 8, `2026-11-28T09:0${i}:00.000Z`, '2026-11-28T09:00:00.000Z');
  }
  mockDb.prepare(`insert into local_track_markers (local_id, session_local_id, marker_type, material, latitude, longitude, created_at, sync_status)
    values (?, ?, 'article', 'Holz', 47, 8, '2026-11-28T09:02:00.000Z', 'pending')`).run(`${id}-m1`, id);
  mockDb.prepare(`insert into sync_queue (id, entity_type, entity_local_id, operation, priority, created_at, updated_at, attempts, status, last_error)
    values (?, 'training_session', ?, 'create', 1, ?, ?, 7, ?, ?)`)
    .run(`sq-${id}`, id, `2026-11-28T09:00:0${id.length % 10}.000Z`, '2026-11-28T11:00:00.000Z', opts.queue ?? 'failed',
      opts.error ?? 'insert or update on table "training_sessions" violates foreign key constraint "training_sessions_dog_id_fkey"');
}

const session = (id: string) => mockDb.prepare('select * from local_training_sessions where local_id=?').get(id) as Record<string, unknown>;
const queue = (id: string) => mockDb.prepare('select status, attempts, last_error from sync_queue where entity_local_id=?').get(id) as Record<string, unknown>;
const childCounts = (id: string) => ({
  points: (mockDb.prepare('select count(*) as c from local_track_points where session_local_id=?').get(id) as { c: number }).c,
  markers: (mockDb.prepare('select count(*) as c from local_track_markers where session_local_id=?').get(id) as { c: number }).c,
});
const snapshotChildren = (id: string) => ({
  points: mockDb.prepare('select * from local_track_points where session_local_id=? order by local_id').all(id),
  markers: mockDb.prepare('select * from local_track_markers where session_local_id=? order by local_id').all(id),
});

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) mockDb.exec(m.sql);
});
afterEach(() => mockDb.close());

describe('reassignDogForSessions', () => {
  it('Zuordnen: nur dog_id ändert sich; Punkte, Marker, payload_json (inkl. run), Daten und Notiz bleiben; Queue failed → pending', async () => {
    seedSession('t1');
    const before = session('t1');
    const children = snapshotChildren('t1');

    const res = await reassignDogForSessions(['t1'], 'dog-oha', OWNER);

    expect(res).toEqual({ reassigned: ['t1'], skipped: [] });
    const after = session('t1');
    expect(after.dog_id).toBe('dog-oha');
    expect(after.sync_status).toBe('pending');
    expect(after.last_sync_error).toBeNull();
    for (const k of Object.keys(before)) {
      if (['dog_id', 'sync_status', 'last_sync_error'].includes(k)) continue;
      expect([k, after[k]]).toEqual([k, before[k]]);
    }
    expect(after.payload_json).toBe(RUN_PAYLOAD);
    expect(snapshotChildren('t1')).toEqual(children);
    expect(queue('t1')).toMatchObject({ status: 'pending', attempts: 7 });
  });

  it('mehrere Fährten auf einmal (Häkchen „auch für die anderen"): alle zugeordnet, alle wieder ausstehend', async () => {
    seedSession('t1'); seedSession('t2', { payload: JSON.stringify({ distanceMeters: 200 }) }); seedSession('t3');
    const res = await reassignDogForSessions(['t1', 't2', 't3', 't2'], 'dog-malu', OWNER);
    expect(res.reassigned.sort()).toEqual(['t1', 't2', 't3']);
    for (const id of ['t1', 't2', 't3']) {
      expect(session(id).dog_id).toBe('dog-malu');
      expect(queue(id).status).toBe('pending');
      expect(childCounts(id)).toEqual({ points: 5, markers: 1 });
    }
  });

  it('nur die gewählte Fährte: andere fehlgeschlagene bleiben unverändert', async () => {
    seedSession('t1'); seedSession('t2');
    await reassignDogForSessions(['t1'], 'dog-oha', OWNER);
    expect(session('t2').dog_id).toBe('ghost-dog');
    expect(queue('t2').status).toBe('failed');
  });

  it('Altformat: payload_json leer/ungültig und dog_id leer → Zuordnung klappt, payload bleibt byte-gleich', async () => {
    seedSession('old1', { dog: null, payload: null, error: 'null value in column "dog_id" of relation "training_sessions" violates not-null constraint' });
    seedSession('old2', { payload: '{kaputt' });
    const res = await reassignDogForSessions(['old1', 'old2'], 'dog-yam', OWNER);
    expect(res.reassigned.sort()).toEqual(['old1', 'old2']);
    expect(session('old1')).toMatchObject({ dog_id: 'dog-yam', payload_json: null });
    expect(session('old2')).toMatchObject({ dog_id: 'dog-yam', payload_json: '{kaputt' });
  });

  it('fremdes Konto, unbekannte Session oder leere Eingaben: nichts wird geändert', async () => {
    seedSession('foreign', { owner: 'other-owner' });
    expect(await reassignDogForSessions(['foreign', 'nope'], 'dog-oha', OWNER)).toEqual({ reassigned: [], skipped: ['foreign', 'nope'] });
    expect(session('foreign').dog_id).toBe('ghost-dog');
    expect(queue('foreign').status).toBe('failed');
    expect(await reassignDogForSessions(['foreign'], '', OWNER)).toEqual({ reassigned: [], skipped: ['foreign'] });
    expect(await reassignDogForSessions([], 'dog-oha', OWNER)).toEqual({ reassigned: [], skipped: [] });
  });

  it('abhängige lokale Bewertungs-Verweise derselben Session ziehen mit (Spalte + JSON), andere bleiben', async () => {
    seedSession('t1'); seedSession('t2');
    const req = (sid: string) => JSON.stringify({ operationId: `op-${sid}`, ownerId: OWNER, runId: 'run-1', sessionId: sid, dogId: 'ghost-dog', changes: [] });
    mockDb.prepare(`insert into track_object_review_outbox (operation_id, owner_id, run_id, session_id, dog_id, request_json, state, created_at)
      values ('op-t1', ?, 'run-1', 't1', 'ghost-dog', ?, 'pending', 'x'), ('op-t2', ?, 'run-2', 't2', 'ghost-dog', ?, 'pending', 'x')`)
      .run(OWNER, req('t1'), OWNER, req('t2'));
    await reassignDogForSessions(['t1'], 'dog-oha', OWNER);
    const rows = mockDb.prepare('select operation_id, dog_id, request_json from track_object_review_outbox order by operation_id').all() as { operation_id: string; dog_id: string; request_json: string }[];
    expect(rows[0].dog_id).toBe('dog-oha');
    expect(JSON.parse(rows[0].request_json)).toEqual({ ...JSON.parse(req('t1')), dogId: 'dog-oha' });
    expect(rows[1]).toMatchObject({ dog_id: 'ghost-dog', request_json: req('t2') });
  });

  it('nichts wird gelöscht: Anzahl aller lokalen Zeilen bleibt gleich', async () => {
    seedSession('t1'); seedSession('t2');
    const count = (t: string) => (mockDb.prepare(`select count(*) as c from ${t}`).get() as { c: number }).c;
    const before = ['local_training_sessions', 'local_track_points', 'local_track_markers', 'sync_queue'].map(count);
    await reassignDogForSessions(['t1', 't2'], 'dog-oha', OWNER);
    expect(['local_training_sessions', 'local_track_points', 'local_track_markers', 'sync_queue'].map(count)).toEqual(before);
  });
});

describe('listFailedSyncItems / retryFailedQueueItem', () => {
  it('liefert nur fehlgeschlagene Einträge mit Session-Angaben und Grund', async () => {
    seedSession('t1'); seedSession('t2', { queue: 'pending' });
    const items = await listFailedSyncItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ entityLocalId: 't1', entityType: 'training_session', session: { userId: OWNER, dogId: 'ghost-dog', payloadJson: RUN_PAYLOAD } });
    expect(items[0].lastError).toContain('training_sessions_dog_id_fkey');
  });

  it('erneut versuchen setzt genau einen Eintrag failed → pending, ändert keine Session', async () => {
    seedSession('t1'); seedSession('t2');
    const before = session('t1');
    expect(await retryFailedQueueItem('sq-t1')).toBe(true);
    expect(queue('t1').status).toBe('pending');
    expect(queue('t2').status).toBe('failed');
    expect(session('t1')).toEqual(before);
    expect(await retryFailedQueueItem('sq-t1')).toBe(false);   // nicht mehr failed → no-op
  });
});

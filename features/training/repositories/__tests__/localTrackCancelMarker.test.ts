// Dauerhafte lokale Lifecycle-Marker (Abbruch / „Ohne App abgeschlossen") gegen eine ECHTE
// SQLite (node:sqlite, In-Memory) — die exakten Repository-Statements inkl. json_set /
// json_valid laufen unverändert. Belegt Merge, Idempotenz, Hund-Bindung und die Races
// mit der asynchronen Lay-Finalisierung (finish()).
import { DatabaseSync } from 'node:sqlite';
import {
  finalizeLocalTrainingSession, markLocalTrackCancelled, setLocalTrackLifecycle,
} from '@/features/training/repositories/localTrainingRepository';
import { TRACK_LIFECYCLE_KEY } from '@/features/tracking/store/trackRecovery';

let mockDb: DatabaseSync;
jest.mock('@/lib/localDb/client', () => ({
  getLocalDb: async () => ({
    runAsync: async (sql: string, ...params: unknown[]) => mockDb.prepare(sql).run(...(params as never[])),
    getFirstAsync: async (sql: string, ...params: unknown[]) => mockDb.prepare(sql).get(...(params as never[])) ?? null,
  }),
}));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => 'gen-id', nowIso: () => '2026-10-04T09:00:00.000Z' }));

const LAY = { endedAt: '2026-10-04T08:30:00.000Z', durationSeconds: 300, distanceMeters: 123, articlesTotal: 1, cornersTotal: 2, gpsQualityAverage: 4, segments: [{ id: 's1' }] };
const row = () => mockDb.prepare('select status, sync_status, payload_json from local_training_sessions where local_id=?').get('sess-A') as
  { status: string; sync_status: string; payload_json: string | null };
const payload = () => JSON.parse(row().payload_json ?? 'null');

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec(`create table local_training_sessions (local_id text primary key, dog_id text, status text, ended_at text,
    duration_seconds integer, payload_json text, updated_at text, sync_status text)`);
  mockDb.prepare(`insert into local_training_sessions values ('sess-A', 'dog-A', 'active', null, null, null, null, 'pending')`).run();
});
afterEach(() => mockDb.close());

describe('setLocalTrackLifecycle / markLocalTrackCancelled', () => {
  it('Abbruch-Marker wird gemerged: Lay-Summary, Segmente, Status und sync_status bleiben', async () => {
    await finalizeLocalTrainingSession('sess-A', LAY);
    expect(await markLocalTrackCancelled('sess-A', 'dog-A')).toBe(true);
    expect(payload()).toEqual({
      distanceMeters: 123, articlesTotal: 1, cornersTotal: 2, gpsQualityAverage: 4, segments: [{ id: 's1' }],
      [TRACK_LIFECYCLE_KEY]: 'cancelled', trackLifecycleUpdatedAt: '2026-10-04T09:00:00.000Z',
    });
    expect(row().status).toBe('completed');
    expect(row().sync_status).toBe('pending');
  });

  it('„Ohne App abgeschlossen": Run/Bewertung bleiben, kein Suchlauf wird erzeugt', async () => {
    mockDb.prepare('update local_training_sessions set payload_json=? where local_id=?')
      .run(JSON.stringify({ distanceMeters: 5, score: 80, legs: [{ name: 'a' }] }), 'sess-A');
    expect(await setLocalTrackLifecycle('sess-A', 'dog-A', 'completed_without_app')).toBe(true);
    const p = payload();
    expect(p).toMatchObject({ distanceMeters: 5, score: 80, legs: [{ name: 'a' }], [TRACK_LIFECYCLE_KEY]: 'completed_without_app' });
    expect(p.run).toBeUndefined();
  });

  it('J: zweimal ausgeführt → idempotent, keine Duplikate, kein Datenverlust', async () => {
    await finalizeLocalTrainingSession('sess-A', LAY);
    await setLocalTrackLifecycle('sess-A', 'dog-A', 'completed_without_app');
    const once = row().payload_json;
    expect(await setLocalTrackLifecycle('sess-A', 'dog-A', 'completed_without_app')).toBe(true);
    expect(row().payload_json).toBe(once);
  });

  it('nur für genau diese Session UND diesen Hund — sonst false und keine Änderung', async () => {
    expect(await markLocalTrackCancelled('sess-A', 'dog-B')).toBe(false);
    expect(await markLocalTrackCancelled('sess-X', 'dog-A')).toBe(false);
    expect(row().payload_json).toBeNull();
  });

  it('korruptes payload_json → Marker trotzdem gesetzt, kein Fehler', async () => {
    mockDb.prepare('update local_training_sessions set payload_json=? where local_id=?').run('{kaputt', 'sess-A');
    expect(await markLocalTrackCancelled('sess-A', 'dog-A')).toBe(true);
    expect(payload()[TRACK_LIFECYCLE_KEY]).toBe('cancelled');
  });
});

describe('Race mit der asynchronen Lay-Finalisierung (finish())', () => {
  it('T: Abbruch vor dem Finalize-Write → cancelled bleibt cancelled', async () => {
    await markLocalTrackCancelled('sess-A', 'dog-A');   // Nutzer bricht ab, bevor finish() lokal schreibt
    await finalizeLocalTrainingSession('sess-A', LAY);  // finish() schreibt danach
    expect(payload()).toMatchObject({ distanceMeters: 123, segments: [{ id: 's1' }], [TRACK_LIFECYCLE_KEY]: 'cancelled' });
  });

  it('U: „Ohne App abgeschlossen" überlebt einen späteren lokalen Lay-Save', async () => {
    await finalizeLocalTrainingSession('sess-A', LAY);
    await setLocalTrackLifecycle('sess-A', 'dog-A', 'completed_without_app');
    await finalizeLocalTrainingSession('sess-A', { ...LAY, distanceMeters: 130 });
    expect(payload()).toMatchObject({ distanceMeters: 130, [TRACK_LIFECYCLE_KEY]: 'completed_without_app', trackLifecycleUpdatedAt: '2026-10-04T09:00:00.000Z' });
  });

  it('gleichzeitig gestartet → beide Reihenfolgen enden mit Marker (atomare Statements)', async () => {
    await Promise.all([finalizeLocalTrainingSession('sess-A', LAY), markLocalTrackCancelled('sess-A', 'dog-A')]);
    expect(payload()[TRACK_LIFECYCLE_KEY]).toBe('cancelled');
    expect(payload().distanceMeters).toBe(123);
  });

  it('Finalize ohne Marker bleibt unverändert; korruptes altes JSON wirft nicht', async () => {
    mockDb.prepare('update local_training_sessions set payload_json=? where local_id=?').run('{kaputt', 'sess-A');
    await expect(finalizeLocalTrainingSession('sess-A', LAY)).resolves.toBeUndefined();
    expect(payload()).toEqual({ distanceMeters: 123, articlesTotal: 1, cornersTotal: 2, gpsQualityAverage: 4, segments: [{ id: 's1' }] });
  });
});

describe('Abbruch-Quelle (nur Diagnose)', () => {
  it('Quelle wird mit dem Marker gespeichert und übersteht eine spätere Lay-Finalisierung', async () => {
    expect(await markLocalTrackCancelled('sess-A', 'dog-A', 'resting_abort')).toBe(true);
    expect(payload()).toMatchObject({ trackLifecycleStatus: 'cancelled', trackLifecycleSource: 'resting_abort' });
    await finalizeLocalTrainingSession('sess-A', LAY);   // finish() schreibt danach asynchron
    expect(payload()).toMatchObject({ trackLifecycleStatus: 'cancelled', trackLifecycleSource: 'resting_abort', distanceMeters: 123 });
  });
  it('ohne Quelle bleibt das Payload exakt wie bisher (kein zusätzlicher Key)', async () => {
    await markLocalTrackCancelled('sess-A', 'dog-A');
    expect(Object.keys(payload()).sort()).toEqual(['trackLifecycleStatus', 'trackLifecycleUpdatedAt']);
  });
});

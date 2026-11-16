import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';

// Echte Migrationen in In-Memory-SQLite; Supabase ist ein kleiner Fake mit
// denselben Antworten, die PostgREST für die Migration aus #114 liefert.
let mockDb: DatabaseSync;
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));
jest.mock('@/features/tracking/storage/gpsCaptureScope', () => ({ invalidateGpsCaptures: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => mockDb.exec(sql),
  getAllAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).get(...args),
  runAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).run(...args),
  withTransactionAsync: async (action: () => Promise<void>) => {
    mockDb.exec('SAVEPOINT t');
    try { await action(); mockDb.exec('RELEASE t'); } catch (error) { mockDb.exec('ROLLBACK TO t'); mockDb.exec('RELEASE t'); throw error; }
  },
}) }));

type Row = { id: string; owner_id: string; training_unit_id: string; training_session_id: string; track_run_id: string | null };
const mockServer = {
  user: 'owner' as string | null,
  table: true,                       // false = Migration noch nicht ausgeführt
  offline: false,
  units: new Set<string>(), sessions: new Set<string>(),
  links: [] as Row[],
  writes: [] as string[],            // jede schreibende Anfrage, zum Nachweis «nur Verknüpfung»
};
const mockMissing = { code: 'PGRST205', message: "Could not find the table 'public.training_unit_tracks' in the schema cache" };
function mockQuery(table: string) {
  const filters: [string, unknown][] = [];
  let action: 'select' | 'delete' = 'select';
  const result = async () => {
    if (mockServer.offline) throw new TypeError('Network request failed');
    if (table !== 'training_unit_tracks') {
      const set = table === 'training_units' ? mockServer.units : mockServer.sessions;
      return { data: set.has(String(filters[0][1])) ? { id: filters[0][1] } : null, error: null };
    }
    if (!mockServer.table) return { data: null, error: mockMissing };
    const match = (row: Row) => filters.every(([k, v]) => (row as Record<string, unknown>)[k] === v);
    if (action === 'delete') { mockServer.links = mockServer.links.filter(row => !match(row)); return { data: null, error: null }; }
    return { data: mockServer.links.filter(match), error: null };
  };
  const api: any = {
    select: () => api,
    delete: () => { action = 'delete'; mockServer.writes.push(`delete:${table}`); return api; },
    eq: (k: string, v: unknown) => { filters.push([k, v]); return api; },
    is: (k: string, v: unknown) => { filters.push([k, v]); return api; },
    maybeSingle: () => result(),
    then: (ok: any, fail: any) => result().then(ok, fail),
    upsert: async (row: Row) => {
      mockServer.writes.push(`upsert:${table}`);
      if (mockServer.offline) throw new TypeError('Network request failed');
      if (!mockServer.table) return { error: mockMissing };
      if (row.owner_id !== mockServer.user || !mockServer.units.has(row.training_unit_id) || !mockServer.sessions.has(row.training_session_id)) {
        return { error: { code: '42501', message: 'new row violates row-level security policy' } };
      }
      if (mockServer.links.some(l => l.id === row.id)) return { error: null };
      if (mockServer.links.some(l => l.training_unit_id === row.training_unit_id && l.training_session_id === row.training_session_id && l.track_run_id === row.track_run_id)) {
        return { error: { code: '23505', message: 'duplicate key value' } };
      }
      mockServer.links.push({ ...row }); return { error: null };
    },
  };
  return api;
}
jest.mock('@/lib/supabase', () => ({ supabase: {
  auth: { getSession: async () => ({ data: { session: mockServer.user ? { user: { id: mockServer.user } } : null }, error: null }) },
  from: (table: string) => mockQuery(table),
} }));

import {
  countOpenLinkOperations, forgetUnitLinks, listLinksForSession, listLinksForUnit, mergeRemoteLinks, setUnitLinks,
} from '../store';
import { refreshSessionLinks, refreshUnitLinks, SERVER_NOT_READY, syncTrackLinks, WAITING_FOR_SERVER } from '../sync';

const all = () => mockDb.prepare('select * from local_training_unit_tracks order by created_at, id').all() as any[];
const targets = async (unit: string) => (await listLinksForUnit('owner', unit)).map(l => `${l.training_session_id}|${l.track_run_id ?? ''}`).sort();

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('create table local_schema_migrations(version integer primary key, applied_at text)');
  for (const m of MIGRATIONS) { mockDb.exec(m.sql); mockDb.prepare('insert into local_schema_migrations(version) values (?)').run(m.version); }
  mockDb.exec(`insert into local_training_sessions(local_id,user_id,payload_json) values ('track-a','owner','{"keep":true}'), ('track-b','owner','{"keep":true}');`);
  Object.assign(mockServer, { user: 'owner', table: true, offline: false, units: new Set(['unit-1', 'unit-2']), sessions: new Set(['track-a', 'track-b']), links: [], writes: [] });
});
afterEach(() => mockDb.close());

describe('lokaler Speicher', () => {
  it('verknüpft mehrere Fährten pro Training und mehrere Trainings pro Fährte', async () => {
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }, { sessionId: 'track-b', runId: 'run-b1' }]);
    await setUnitLinks('owner', 'unit-2', [{ sessionId: 'track-a' }]);
    expect(await targets('unit-1')).toEqual(['track-a|', 'track-b|run-b1']);
    expect((await listLinksForSession('owner', 'track-a')).map(l => l.training_unit_id).sort()).toEqual(['unit-1', 'unit-2']);
    expect(await countOpenLinkOperations('owner')).toBe(3);
  });

  it('ändert die Zuordnung nachträglich und ist bei gleicher Auswahl ohne Wirkung', async () => {
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    expect(await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }])).toEqual({ added: 0, removed: 0 });
    expect(await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-b' }])).toEqual({ added: 1, removed: 1 });
    expect(await targets('unit-1')).toEqual(['track-b|']);
    // Die gelöste Zeile bleibt bis zum Abgleich vorgemerkt.
    expect(all().map(r => r.state).sort()).toEqual(['delete_pending', 'pending']);
  });

  it('trennt Konten und behält dieselbe Zeile beim erneuten Verknüpfen', async () => {
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    const id = all()[0].id;
    await setUnitLinks('owner', 'unit-1', []);
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    expect(all()).toHaveLength(1);
    expect(all()[0]).toMatchObject({ id, state: 'pending' });
    expect(await listLinksForUnit('someone-else', 'unit-1')).toEqual([]);
  });

  it('verändert beim Verknüpfen, Lösen und Vergessen keine Fährte', async () => {
    const before = mockDb.prepare('select * from local_training_sessions order by local_id').all();
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }, { sessionId: 'track-b' }]);
    await setUnitLinks('owner', 'unit-1', []);
    await forgetUnitLinks('owner', 'unit-1');
    expect(all()).toEqual([]);
    expect(mockDb.prepare('select * from local_training_sessions order by local_id').all()).toEqual(before);
  });
});

describe('Abgleich mit dem Server', () => {
  it('offline verknüpft, später synchronisiert', async () => {
    mockServer.offline = true;
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 0 });
    expect(await targets('unit-1')).toEqual(['track-a|']);
    mockServer.offline = false;
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 1, failed: 0 });
    expect(mockServer.links).toHaveLength(1);
    expect(all()[0]).toMatchObject({ state: 'synced', last_error: null });
    // Wiederholung ohne Wirkung.
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 0, removed: 0, waiting: 0, failed: 0 });
    expect(mockServer.links).toHaveLength(1);
  });

  it('wartet, solange Training oder Fährte noch nicht auf dem Server liegen', async () => {
    mockServer.units.delete('unit-1');
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 0, waiting: 1, failed: 0 });
    expect(all()[0]).toMatchObject({ state: 'pending', last_error: WAITING_FOR_SERVER });
    mockServer.units.add('unit-1'); mockServer.sessions.delete('track-a');   // Fährte noch nur lokal
    expect(await syncTrackLinks('owner')).toMatchObject({ waiting: 1 });
    expect(all()).toHaveLength(1);
    mockServer.sessions.add('track-a');
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 1 });
  });

  it('wartet ohne Verlust, wenn die Tabelle auf dem Server noch fehlt', async () => {
    mockServer.table = false;
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 0, waiting: 1, serverReady: false });
    expect(all()[0]).toMatchObject({ state: 'pending', last_error: SERVER_NOT_READY });
    expect(await refreshUnitLinks('owner', 'unit-1')).toBe(false);
    expect(await targets('unit-1')).toEqual(['track-a|']);
    mockServer.table = true;
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 1, serverReady: true });
  });

  it('löst serverseitig nur die Verknüpfung, auch wenn sie von einem anderen Gerät stammt', async () => {
    mockServer.links.push({ id: 'server-id', owner_id: 'owner', training_unit_id: 'unit-1', training_session_id: 'track-a', track_run_id: null },
      { id: 'other', owner_id: 'owner', training_unit_id: 'unit-2', training_session_id: 'track-a', track_run_id: null });
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    expect(await syncTrackLinks('owner')).toMatchObject({ synced: 1 });   // 23505 gilt als erreicht
    await setUnitLinks('owner', 'unit-1', []);
    expect(await syncTrackLinks('owner')).toMatchObject({ removed: 1 });
    expect(mockServer.links.map(l => l.id)).toEqual(['other']);
    expect(all()).toEqual([]);
    expect(new Set(mockServer.writes)).toEqual(new Set(['upsert:training_unit_tracks', 'delete:training_unit_tracks']));
  });

  it('entfernt eine wartende Verknüpfung erst, wenn die Fährte lokal und auf dem Server fehlt', async () => {
    mockServer.sessions.delete('track-a');
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    expect(await syncTrackLinks('owner')).toMatchObject({ waiting: 1, removed: 0 });
    mockDb.exec(`delete from local_training_sessions where local_id='track-a'`);
    expect(await syncTrackLinks('owner')).toMatchObject({ removed: 1 });
    expect(all()).toEqual([]);
  });

  it('synchronisiert nicht für ein anderes angemeldetes Konto', async () => {
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-a' }]);
    mockServer.user = 'someone-else';
    expect(await syncTrackLinks('owner')).toEqual({ synced: 0, removed: 0, waiting: 0, failed: 0, serverReady: true });
    expect(mockServer.writes).toEqual([]);
  });

  it('übernimmt den Serverstand, ohne wartende lokale Änderungen zu überschreiben', async () => {
    await mergeRemoteLinks('owner', { unitId: 'unit-1' }, [
      { id: 'r1', training_unit_id: 'unit-1', training_session_id: 'track-a', track_run_id: null },
      { id: 'r2', training_unit_id: 'unit-1', training_session_id: 'track-b', track_run_id: null }]);
    expect(await targets('unit-1')).toEqual(['track-a|', 'track-b|']);
    await setUnitLinks('owner', 'unit-1', [{ sessionId: 'track-b' }, { sessionId: 'track-c' }]);   // löst a, verknüpft c
    // Server: a noch da, b auf anderem Gerät gelöst.
    mockServer.links = [{ id: 'r1', owner_id: 'owner', training_unit_id: 'unit-1', training_session_id: 'track-a', track_run_id: null }];
    expect(await refreshUnitLinks('owner', 'unit-1')).toBe(true);
    expect(await targets('unit-1')).toEqual(['track-c|']);
    expect(all().map(r => `${r.training_session_id}:${r.state}`).sort()).toEqual(['track-a:delete_pending', 'track-c:pending']);
  });

  it('lädt die Trainings einer Fährte nach', async () => {
    mockServer.links = [{ id: 'r1', owner_id: 'owner', training_unit_id: 'unit-2', training_session_id: 'track-a', track_run_id: 'run-1' }];
    expect(await refreshSessionLinks('owner', 'track-a')).toBe(true);
    expect((await listLinksForSession('owner', 'track-a')).map(l => [l.training_unit_id, l.track_run_id, l.state])).toEqual([['unit-2', 'run-1', 'synced']]);
    mockServer.offline = true;
    expect(await refreshSessionLinks('owner', 'track-a')).toBe(false);
    expect(await listLinksForSession('owner', 'track-a')).toHaveLength(1);
  });
});

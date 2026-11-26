import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';

// Verlauf und Auswertung (Spec 02, PR C): lokale Trails aus echter In-Memory-SQLite,
// Server als kleiner Fake. IGP-Fährten erscheinen nie.
let mockDb: DatabaseSync;
jest.mock('@/features/tracking/storage/gpsCaptureScope', () => ({ invalidateGpsCaptures: jest.fn() }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => mockDb.exec(sql),
  getAllAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).get(...args),
  runAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).run(...args),
}) }));
const mockRemote: { sessions: any[]; lay: any[]; runs: any[]; offline: boolean } = { sessions: [], lay: [], runs: [], offline: false };
jest.mock('@/lib/supabase', () => ({ supabase: { from: (table: string) => {
  const filters: [string, unknown][] = [];
  const rows = () => {
    if (mockRemote.offline) throw new TypeError('Network request failed');
    const src = table === 'training_sessions' ? mockRemote.sessions : table === 'track_points' ? mockRemote.lay : mockRemote.runs;
    return src.filter(r => filters.every(([k, v]) => r[k] === v));
  };
  const api: any = {
    select: () => api, order: () => api, limit: () => api,
    eq: (k: string, v: unknown) => { filters.push([k, v]); return api; },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (ok: any, fail: any) => Promise.resolve().then(() => ({ data: rows(), error: null })).then(ok, fail),
  };
  return api;
} } }));

import { listMantrails, loadMantrailDetail, mergeMantrails, parseRunPoints, summarizeLocal, summarizeRemote } from '../history';
import { formatDuration, formatPercent, formatTrailAge } from '../format';
import { emptyMantrailData } from '../model';

const mantrail = (over = {}) => ({ ...emptyMantrailData(), result: 'found', environment: 'forest', trailAgeMinutes: 130, ...over });
function insertSession(id: string, type: string, payload: unknown, startedAt = '2026-11-20T10:00:00.000Z', user = 'u1') {
  mockDb.prepare(`insert into local_training_sessions(local_id,user_id,dog_id,type,category,title,status,started_at,payload_json,sync_status,created_at,updated_at)
    values (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, user, 'dog-1', type, type === 'mantrail' ? 'Mantrailing' : 'IGP', 'x', 'completed', startedAt, JSON.stringify(payload), 'pending', startedAt, startedAt);
}
function insertPoint(session: string, type: 'lay' | 'search', i: number, lat: number, lng: number) {
  mockDb.prepare(`insert into local_track_points(local_id,session_local_id,latitude,longitude,timestamp,point_type,created_at,sync_status)
    values (?,?,?,?,?,?,?,?)`).run(`${session}-${type}-${i}`, session, lat, lng, new Date(Date.UTC(2026, 10, 20, 10, 0, i)).toISOString(), type, 't', 'pending');
}

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('create table local_schema_migrations(version integer primary key, applied_at text)');
  for (const m of MIGRATIONS) { mockDb.exec(m.sql); mockDb.prepare('insert into local_schema_migrations(version) values (?)').run(m.version); }
  Object.assign(mockRemote, { sessions: [], lay: [], runs: [], offline: false });
});
afterEach(() => mockDb.close());

describe('Zusammenfassung', () => {
  it('nur Mantrails, Strecke und Dauer aus dem Ergebnis', () => {
    expect(summarizeLocal({ local_id: 'a', dog_id: 'd', started_at: 's', created_at: 'c', type: 'track', payload_json: '{}' })).toBeNull();
    expect(summarizeLocal({ local_id: 'a', dog_id: 'd', started_at: 's', created_at: 'c', type: 'mantrail',
      payload_json: JSON.stringify({ mantrail: mantrail(), run: { distance_meters: 812, duration_seconds: 600 } }) }))
      .toMatchObject({ id: 'a', dogDistanceM: 812, durationS: 600, hasRun: true, source: 'local', data: { result: 'found' } });
    expect(summarizeRemote({ id: 'r', type: 'track' })).toBeNull();
    expect(summarizeRemote({ id: 'r', type: 'mantrail', dog_id: 'd', started_at: 's', track_data: { mantrail: mantrail(), run: { distance_meters: 5 } } }))
      .toMatchObject({ id: 'r', dogDistanceM: 5, hasRun: true, source: 'remote' });
  });
  it('lokal gewinnt bei gleicher ID, neueste zuerst', () => {
    const l = { id: 'x', startedAt: '2026-11-02', source: 'local' } as never;
    const r = [{ id: 'x', startedAt: '2026-11-02', source: 'remote' }, { id: 'y', startedAt: '2026-11-05', source: 'remote' }] as never[];
    expect(mergeMantrails([l], r).map((m: any) => `${m.id}:${m.source}`)).toEqual(['y:remote', 'x:local']);
  });
  it('run_points robust lesen', () => {
    expect(parseRunPoints([{ lat: 47, lng: 8 }, { lat: 'x' }, null, { lat: 47.1, lng: 8.1, t: 3 }])).toEqual([{ lat: 47, lng: 8 }, { lat: 47.1, lng: 8.1 }]);
    expect(parseRunPoints(undefined)).toEqual([]);
  });
  it('Anzeige', () => {
    const t = (k: string, p?: Record<string, unknown>) => `${k}:${JSON.stringify(p)}`;
    expect(formatPercent(0.857)).toBe('86 %');
    expect(formatPercent(null)).toBe('–');
    expect(formatTrailAge(45, t as never)).toBe('mantrail.minutes:{"n":45}');
    expect(formatTrailAge(130, t as never)).toBe('mantrail.hoursMinutes:{"h":2,"m":"10"}');
    expect(formatDuration(605)).toBe('10:05');
  });
});

describe('Verlauf', () => {
  it('lokale und Server-Trails zusammen, ohne IGP-Fährten und ohne fremde', async () => {
    insertSession('m-local', 'mantrail', { mantrail: mantrail(), run: { distance_meters: 900 } }, '2026-11-21T10:00:00.000Z');
    insertSession('igp-1', 'track', { distanceMeters: 300 });
    insertSession('m-other-user', 'mantrail', { mantrail: mantrail() }, '2026-11-22T10:00:00.000Z', 'u2');
    mockRemote.sessions = [
      { id: 'm-local', owner_id: 'u1', type: 'mantrail', started_at: '2026-11-21T10:00:00Z', track_data: { mantrail: mantrail({ result: 'not_found' }) } },
      { id: 'm-tablet', owner_id: 'u1', type: 'mantrail', dog_id: 'dog-1', started_at: '2026-11-23T10:00:00Z', track_data: { mantrail: mantrail(), run: { distance_meters: 400 } } },
    ];
    const list = await listMantrails('u1');
    expect(list.map(x => `${x.id}:${x.source}`)).toEqual(['m-tablet:remote', 'm-local:local']);
    expect(list[1].data?.result).toBe('found');   // lokaler Stand gewinnt
  });
  it('offline: nur lokale Trails, kein Fehler', async () => {
    insertSession('m-local', 'mantrail', { mantrail: mantrail() });
    mockRemote.offline = true;
    expect((await listMantrails('u1')).map(x => x.id)).toEqual(['m-local']);
  });
});

describe('Auswertung eines Trails', () => {
  it('lokal: Trailer-Spur und Hundespur aus dem Ergebnis', async () => {
    insertSession('m1', 'mantrail', { mantrail: mantrail(), run: { distance_meters: 120, duration_seconds: 90, run_points: [{ lat: 47, lng: 8 }, { lat: 47.0005, lng: 8 }] } });
    insertPoint('m1', 'lay', 0, 47, 8); insertPoint('m1', 'lay', 1, 47.001, 8);
    const d = await loadMantrailDetail('u1', 'm1');
    expect(d).toMatchObject({ id: 'm1', durationS: 90, source: 'local' });
    expect(d!.trailer).toHaveLength(2);
    expect(d!.dog).toEqual([{ lat: 47, lng: 8 }, { lat: 47.0005, lng: 8 }]);
  });
  it('lokal ohne gespeicherte run_points: Hundespur aus den Suchpunkten', async () => {
    insertSession('m2', 'mantrail', { mantrail: mantrail(), run: { distance_meters: 10 } });
    insertPoint('m2', 'search', 0, 47, 8); insertPoint('m2', 'search', 1, 47.0001, 8);
    expect((await loadMantrailDetail('u1', 'm2'))!.dog).toHaveLength(2);
  });
  it('IGP-Fährte oder fremder Trail → nichts', async () => {
    insertSession('igp', 'track', {});
    insertSession('foreign', 'mantrail', {}, undefined, 'u2');
    expect(await loadMantrailDetail('u1', 'igp')).toBeNull();
    mockRemote.sessions = [{ id: 'foreign', owner_id: 'u2', type: 'mantrail', track_data: {} }];
    expect(await loadMantrailDetail('u1', 'foreign')).toBeNull();
  });
  it('vom Server (anderes Gerät): Spuren aus track_points und track_runs', async () => {
    mockRemote.sessions = [{ id: 'm-r', owner_id: 'u1', type: 'mantrail', dog_id: 'dog-1', started_at: 's', track_data: { mantrail: mantrail(), run: { duration_seconds: 30 } } }];
    mockRemote.lay = [{ session_id: 'm-r', point_type: 'lay', latitude: 47, longitude: 8 }, { session_id: 'm-r', point_type: 'lay', latitude: 47.001, longitude: 8 }];
    mockRemote.runs = [{ session_id: 'm-r', run_points: [{ lat: 47, lng: 8 }], ended_at: 'e' }];
    const d = await loadMantrailDetail('u1', 'm-r');
    expect(d).toMatchObject({ source: 'remote', durationS: 30, trailer: [{ lat: 47, lng: 8 }, { lat: 47.001, lng: 8 }], dog: [{ lat: 47, lng: 8 }] });
  });
});

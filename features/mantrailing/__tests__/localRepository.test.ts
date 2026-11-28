import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';

// Echte lokale Migrationen in In-Memory-SQLite (wie trackLinks-Tests).
let mockDb: DatabaseSync;
let mockUuid = 0;
const mockEnqueue = jest.fn(async (_op?: unknown) => undefined);
jest.mock('expo-crypto', () => ({ randomUUID: () => `00000000-0000-4000-8000-${String(++mockUuid).padStart(12, '0')}` }));
jest.mock('@/features/tracking/storage/gpsCaptureScope', () => ({ invalidateGpsCaptures: jest.fn() }));
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({ enqueueSyncOperation: (op: unknown) => mockEnqueue(op) }));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => mockDb.exec(sql),
  getAllAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).get(...args),
  runAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).run(...args),
}) }));

import { createLocalMantrailSession, getLocalMantrailDetails, setLocalMantrailDetails } from '../localRepository';
import { emptyMantrailData } from '../model';
import { finalizeLocalTrackRun, finalizeLocalTrainingSession, getLocalTrainingSessions } from '@/features/training/repositories/localTrainingRepository';

const row = (id: string) => mockDb.prepare('select * from local_training_sessions where local_id=?').get(id) as any;

beforeEach(() => {
  mockDb = new DatabaseSync(':memory:');
  mockDb.exec('create table local_schema_migrations(version integer primary key, applied_at text)');
  for (const m of MIGRATIONS) { mockDb.exec(m.sql); mockDb.prepare('insert into local_schema_migrations(version) values (?)').run(m.version); }
  // Eine bestehende IGP-Fährte mit Lay-Summary, die nie verändert werden darf.
  mockDb.exec(`insert into local_training_sessions(local_id,user_id,dog_id,type,category,title,payload_json,sync_status,created_at,updated_at)
    values ('igp-1','owner','dog-1','track','IGP','Fährte','{"distanceMeters":300,"segments":[]}','synced','t','t');`);
  mockEnqueue.mockClear();
});
afterEach(() => mockDb.close());

describe('Mantrailing lokal', () => {
  it('legt eine eigene Sitzung type=mantrail an und merkt sie zum Upload vor', async () => {
    const id = await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1' },
      { ...emptyMantrailData(), scentArticle: 'sock', doubleBlind: true });
    expect(id).toBe('m-1');
    expect(row('m-1')).toMatchObject({ type: 'mantrail', category: 'Mantrailing', title: 'Mantrailing', sync_status: 'pending' });
    expect(JSON.parse(row('m-1').payload_json).mantrail).toMatchObject({ version: 1, scentArticle: 'sock', doubleBlind: true });
    expect(mockEnqueue).toHaveBeenCalledWith({ entityType: 'training_session', entityLocalId: 'm-1', operation: 'create', priority: 1 });
  });

  it('IGP-Listen sehen Mantrailing nicht (Typ-Trennung)', async () => {
    await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1' });
    const igp = await getLocalTrainingSessions('owner', { type: 'track' });
    expect(igp.map(s => s.local_id)).toEqual(['igp-1']);
  });

  it('Angaben ändern behält andere payload-Schlüssel und setzt synced → pending', async () => {
    await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1' });
    mockDb.exec(`update local_training_sessions set sync_status='synced', payload_json=json_set(coalesce(payload_json,'{}'),'$.distanceMeters',1200) where local_id='m-1'`);
    expect(await setLocalMantrailDetails('m-1', { ...emptyMantrailData(), result: 'found' })).toBe(true);
    const payload = JSON.parse(row('m-1').payload_json);
    expect(payload.distanceMeters).toBe(1200);
    expect(payload.mantrail.result).toBe('found');
    expect(row('m-1').sync_status).toBe('pending');
    expect((await getLocalMantrailDetails('m-1'))!.result).toBe('found');
  });

  it('verändert nie eine IGP-Fährte', async () => {
    const before = row('igp-1');
    expect(await setLocalMantrailDetails('igp-1', { ...emptyMantrailData(), result: 'found' })).toBe(false);
    expect(row('igp-1')).toEqual(before);
    expect(await getLocalMantrailDetails('igp-1')).toBeNull();
  });

  it('gelöschte Sitzung wird nicht mehr beschrieben', async () => {
    await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1' });
    mockDb.exec(`update local_training_sessions set deleted_at='x' where local_id='m-1'`);
    expect(await setLocalMantrailDetails('m-1', emptyMantrailData())).toBe(false);
  });

  it('ungültige Angaben werden nicht geschrieben', async () => {
    await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1' });
    expect(await setLocalMantrailDetails('m-1', { version: 2 } as never)).toBe(false);
  });
});

describe('Mantrailing: Angaben überstehen Lege-Ende und Ergebnis (PR B1)', () => {
  const layEnd = { endedAt: '2026-11-25T10:20:00.000Z', durationSeconds: 600, distanceMeters: 850, segments: [] as unknown[], status: 'completed' };

  it('Lege-Ende ersetzt die Lay-Summary, behält aber payload_json.mantrail', async () => {
    await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1', status: 'active' },
      { ...emptyMantrailData(), scentArticle: 'sock', doubleBlind: true });
    await finalizeLocalTrainingSession('m-1', layEnd);
    const payload = JSON.parse(row('m-1').payload_json);
    expect(payload.distanceMeters).toBe(850);
    expect(payload.mantrail).toMatchObject({ scentArticle: 'sock', doubleBlind: true });
    expect(row('m-1')).toMatchObject({ status: 'completed', ended_at: layEnd.endedAt });
  });

  it('IGP-Fährte: Lege-Ende schreibt exakt dieselbe Summary wie vorher (kein mantrail-Schlüssel)', async () => {
    await finalizeLocalTrainingSession('igp-1', layEnd);
    expect(row('igp-1').payload_json).toBe(JSON.stringify({
      distanceMeters: 850, articlesTotal: null, cornersTotal: null, gpsQualityAverage: null, segments: [],
    }));
  });

  it('Abbruch-Marker und Mantrail-Angaben bleiben beide erhalten', async () => {
    await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1', status: 'active' }, emptyMantrailData());
    mockDb.exec(`update local_training_sessions set payload_json=json_set(payload_json,'$.trackLifecycleStatus','cancelled','$.trackLifecycleUpdatedAt','t') where local_id='m-1'`);
    await finalizeLocalTrainingSession('m-1', layEnd);
    const payload = JSON.parse(row('m-1').payload_json);
    expect(payload.trackLifecycleStatus).toBe('cancelled');
    expect(payload.mantrail.version).toBe(1);
    expect(payload.distanceMeters).toBe(850);
  });

  it('Ergebnis der Hundearbeit (run) ergänzt nur, Angaben bleiben', async () => {
    await createLocalMantrailSession({ local_id: 'm-1', user_id: 'owner', dog_id: 'dog-1', status: 'active' }, emptyMantrailData());
    await finalizeLocalTrainingSession('m-1', layEnd);
    await finalizeLocalTrackRun('m-1', { run_id: 'r-1', duration_s: 300 });
    expect(await setLocalMantrailDetails('m-1', { ...emptyMantrailData(), result: 'found' })).toBe(true);
    const payload = JSON.parse(row('m-1').payload_json);
    expect(payload.run).toMatchObject({ run_id: 'r-1' });
    expect(payload.distanceMeters).toBe(850);
    expect(payload.mantrail.result).toBe('found');
  });
});

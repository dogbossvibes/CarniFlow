import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '../migrations';

let mockDb: DatabaseSync;
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => ({
  execAsync: async (sql: string) => mockDb.exec(sql),
  getAllAsync: async (sql: string) => mockDb.prepare(sql).all(),
  runAsync: async (sql: string, ...args: any[]) => mockDb.prepare(sql).run(...args),
  withTransactionAsync: async (action: () => Promise<void>) => {
    mockDb.exec('BEGIN');
    try { await action(); mockDb.exec('COMMIT'); } catch (error) { mockDb.exec('ROLLBACK'); throw error; }
  },
}) }));

beforeEach(() => { jest.resetModules(); mockDb = new DatabaseSync(':memory:'); });
afterEach(() => mockDb.close());

function installed(version: number) {
  mockDb.exec('PRAGMA foreign_keys=ON; create table local_schema_migrations(version integer primary key, applied_at text)');
  for (const migration of MIGRATIONS.filter(m => m.version <= version)) {
    mockDb.exec(migration.sql);
    mockDb.prepare('insert into local_schema_migrations(version) values (?)').run(migration.version);
  }
  if (version < 1) return;
  mockDb.exec(`insert into local_training_sessions(local_id,payload_json) values ('parent','{"original":true}');
    insert into sync_queue(id,entity_type,entity_local_id,operation,status) values ('pending','training_session','parent','update','pending');`);
  if (version >= 7) mockDb.exec(`insert into local_track_transfer_sync
    (session_id,receipt_id,user_id,receipt_json,revision,base_patch_json,pending_json)
    values ('parent','receipt','owner','{"receipt":true}',3,'{}','{"notes":"offline"}');`);
  if (version >= 9) mockDb.exec(`insert into track_object_review_cache values ('owner','run','parent','dog',0,'{}','now');
    insert into track_object_review_outbox(operation_id,owner_id,run_id,session_id,dog_id,request_json,state,created_at)
    values ('operation','owner','run','parent','dog','{}','pending','now');`);
  if (version >= 10) mockDb.exec(`insert into local_track_plans values ('owner','plan-existing',1,1,'{"original":true}');`);
  if (version >= 11) mockDb.exec(`insert into local_distraction_parents values ('owner','parent','{"original":true}');`);
  if (version >= 12) mockDb.exec(`
    insert into local_track_exchange values ('owner','task-existing','outgoing','parent','{"offer":true}',123);
    insert into local_track_exchange_receipts values ('owner','task-existing','contribution','{"receipt":true}','child',123);
    insert into local_track_group_tasks values ('owner','server-task','task-existing','original-digest');
  `);
  if (version >= 8) mockDb.exec(`insert into local_track_distractions
    (id,owner_id,parent_session_id,revision,updated_at,payload_json)
    values ('child','owner','parent',2,123,'{"draft":true}');`);
}

it.each([0, 6, 7, 8, 9, 10, 11, 12])('upgrades schema %s without losing pending transfers, drafts or original data', async version => {
  installed(version);
  const before = mockDb.prepare("select name from sqlite_master where type='table' and name!='local_schema_migrations'").all()
    .map(row => String(row.name));
  const snapshots = new Map(before.map(table => [table, mockDb.prepare(`select * from ${table}`).all()]));
  const { getLocalDb } = jest.requireActual<typeof import('../client')>('../client');
  await getLocalDb();
  expect(mockDb.prepare('select version from local_schema_migrations order by version').all().map(row => row.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  for (const [table, rows] of snapshots) expect(mockDb.prepare(`select * from ${table}`).all()).toEqual(rows);
  expect(mockDb.prepare('select count(*) as n from track_object_review_cache').get()?.n).toBe(version >= 9 ? 1 : 0);
  expect(mockDb.prepare('select count(*) as n from track_object_review_outbox').get()?.n).toBe(version >= 9 ? 1 : 0);
  await getLocalDb();
  expect(mockDb.prepare('select count(*) as n from local_schema_migrations').get()?.n).toBe(12);
});

it('includes correction cache and pending edits when explicitly clearing the local database', async () => {
  installed(8);
  mockDb.exec(MIGRATIONS.find(m=>m.version===9)!.sql);
  mockDb.prepare('insert into local_schema_migrations(version) values (?)').run(9);
  mockDb.exec(`insert into track_object_review_cache values ('owner','run','parent','dog',0,'{}','now');
    insert into track_object_review_outbox(operation_id,owner_id,run_id,session_id,dog_id,request_json,state,created_at)
    values ('operation','owner','run','parent','dog','{}','pending','now');`);
  const { wipeLocalData } = jest.requireActual<typeof import('../client')>('../client');
  const { getLocalDb } = jest.requireActual<typeof import('../client')>('../client');
  await getLocalDb();
  mockDb.exec(`insert into local_track_plans values ('owner','plan',1,1,'{}');`);
  mockDb.exec(`insert into local_distraction_parents values ('owner','parent','{}');`);
  mockDb.exec(`
    insert into local_track_exchange values ('owner','task','incoming','parent','{"offer":true}',123);
    insert into local_track_exchange_receipts values ('owner','task','contribution','{"receipt":true}','child',123);
    insert into local_track_group_tasks values ('owner','server-task','task','original-digest');
  `);
  await wipeLocalData();
  for (const table of ['local_track_group_tasks', 'local_track_exchange_receipts', 'local_track_exchange', 'local_distraction_parents', 'local_track_plans', 'track_object_review_cache', 'track_object_review_outbox', 'local_track_transfer_sync', 'local_track_distractions', 'local_training_sessions', 'sync_queue']) {
    expect(mockDb.prepare(`select count(*) as n from ${table}`).get()?.n).toBe(0);
  }
  expect(mockDb.prepare('select count(*) as n from local_schema_migrations').get()?.n).toBe(12);
});

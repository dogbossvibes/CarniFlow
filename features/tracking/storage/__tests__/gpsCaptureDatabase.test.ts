import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let mockFolder: string;
let mockConnections: DatabaseSync[];
let mockFailSchema = false;
const mockOpenedNames: string[] = [];
type Adapter = {
  execAsync(sql: string): Promise<void>;
  getFirstAsync(sql: string, ...args: (string | number)[]): Promise<unknown>;
  getAllAsync(sql: string): Promise<unknown[]>;
  runAsync(sql: string, ...args: (string | number)[]): Promise<unknown>;
  closeAsync(): Promise<void>;
  withExclusiveTransactionAsync(work: (tx: Adapter) => Promise<void>): Promise<void>;
};
function mockAdapter(db: DatabaseSync): Adapter {
  return {
    execAsync: async (sql: string) => {
      db.exec(sql);
      if (mockFailSchema && sql.includes('create table if not exists raw_capture_measurements')) throw new Error('interrupted DDL');
    },
    getFirstAsync: async (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args),
    getAllAsync: async (sql: string) => db.prepare(sql).all(),
    runAsync: async (sql: string, ...args: (string | number)[]) => db.prepare(sql).run(...args),
    closeAsync: async () => { db.close(); mockConnections = mockConnections.filter(c => c !== db); },
    withExclusiveTransactionAsync: async (work: (tx: ReturnType<typeof mockAdapter>) => Promise<void>) => {
      db.exec('BEGIN IMMEDIATE');
      try { await work(mockAdapter(db)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
async function mockOpen(name: string) {
  mockOpenedNames.push(name);
  const db = new DatabaseSync(join(mockFolder, name)); mockConnections.push(db);
  return mockAdapter(db);
}
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: mockOpen }));
beforeEach(() => {
  jest.resetModules(); mockFailSchema = false; mockConnections = []; mockOpenedNames.length = 0;
  mockFolder = mkdtempSync(join(tmpdir(), 'anyvo-archive-isolation-'));
});
afterEach(() => { for (const db of mockConnections) db.close(); rmSync(mockFolder, { recursive: true, force: true }); });
function open(name: string) { const db = new DatabaseSync(join(mockFolder, name)); mockConnections.push(db); return db; }

it('proves same-file write contention and independent raw-file writes with real SQLite connections', async () => {
  const primary = open('anyvo_local.db'), primary2 = open('anyvo_local.db');
  primary.exec('PRAGMA journal_mode=WAL; CREATE TABLE points(t); INSERT INTO points VALUES(1); BEGIN IMMEDIATE; INSERT INTO points VALUES(2)');
  primary2.exec('PRAGMA busy_timeout=0');
  expect(() => primary2.exec('INSERT INTO points VALUES(99)')).toThrow(/locked/);
  const { getGpsCaptureDb } = jest.requireActual<typeof import('../gpsCaptureDb')>('../gpsCaptureDb');
  const raw = await getGpsCaptureDb();
  expect(mockOpenedNames).toEqual(['anyvo_gps_arrivals_v1.db']);
  await raw.execAsync('BEGIN IMMEDIATE');
  // An archival writer remains open, but the primary recorder can commit.
  primary.exec('INSERT INTO points VALUES(3); COMMIT');
  primary2.exec('INSERT INTO points VALUES(4)');
  expect(primary.prepare('SELECT t FROM points').all().map(r => r.t)).toEqual([1, 2, 3, 4]);
  await raw.execAsync('ROLLBACK');
  expect(primary.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'raw_capture_%'").all()).toEqual([]);
});

it('rolls back an interrupted archival schema and retries while the original database remains untouched', async () => {
  const primary = open('anyvo_local.db'); primary.exec('CREATE TABLE tracks(payload); INSERT INTO tracks VALUES(\'original\')');
  const { getGpsCaptureDb } = jest.requireActual<typeof import('../gpsCaptureDb')>('../gpsCaptureDb');
  mockFailSchema = true;
  await expect(getGpsCaptureDb()).rejects.toThrow('interrupted DDL');
  const inspect = open('anyvo_gps_arrivals_v1.db');
  expect(inspect.prepare('PRAGMA user_version').get()?.user_version).toBe(0);
  expect(inspect.prepare("SELECT name FROM sqlite_master WHERE name='raw_capture_measurements'").get()).toBeUndefined();
  mockFailSchema = false;
  const raw = await getGpsCaptureDb();
  expect((await raw.getFirstAsync<{user_version:number}>('PRAGMA user_version'))?.user_version).toBe(1);
  expect(primary.prepare('SELECT payload FROM tracks').get()?.payload).toBe('original');
});

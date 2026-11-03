import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as mockJoin } from 'node:path';
import type { GpsCaptureRecord } from '../gpsCapture';

type Param = string | number | null;
type Adapter = {
  execAsync(sql: string): Promise<void>;
  getFirstAsync(sql: string, ...args: Param[]): Promise<unknown>;
  getAllAsync(sql: string, ...args: Param[]): Promise<unknown[]>;
  runAsync(sql: string, ...args: Param[]): Promise<unknown>;
  closeAsync(): Promise<void>;
  withTransactionAsync(work: () => Promise<void>): Promise<void>;
  withExclusiveTransactionAsync(work: (tx: Adapter) => Promise<void>): Promise<void>;
};
let mockFolder: string;
let mockConnections: Set<DatabaseSync>;
let mockExclusiveConnections: number;
let mockFreshConnectionForeignKeys = false;
let mockForeignKeysOnTransaction: number[];
function mockOpenFile(path: string) {
  const db = new DatabaseSync(path); db.exec(`PRAGMA foreign_keys=${mockFreshConnectionForeignKeys ? 'ON' : 'OFF'}`); mockConnections.add(db); return db;
}
function mockClose(db: DatabaseSync) { if (mockConnections.delete(db)) db.close(); }
function mockAdapter(db: DatabaseSync, path: string): Adapter {
  return {
    execAsync: async sql => { db.exec(sql); },
    getFirstAsync: async (sql, ...args) => db.prepare(sql).get(...args) ?? null,
    getAllAsync: async (sql, ...args) => db.prepare(sql).all(...args),
    runAsync: async (sql, ...args) => db.prepare(sql).run(...args),
    closeAsync: async () => { mockClose(db); },
    withTransactionAsync: async work => {
      db.exec('BEGIN');
      try { await work(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    withExclusiveTransactionAsync: async work => {
      // expo-sqlite 16.0.10 creates a NEW connection and executes BEGIN.
      // Connection-local PRAGMAs from the original handle are not inherited.
      const tx = mockOpenFile(path); mockExclusiveConnections++;
      mockForeignKeysOnTransaction.push(Number(tx.prepare('PRAGMA foreign_keys').get()?.foreign_keys));
      tx.exec('BEGIN');
      try { await work(mockAdapter(tx, path)); tx.exec('COMMIT'); }
      catch (error) { tx.exec('ROLLBACK'); throw error; }
      finally { mockClose(tx); }
    },
  };
}
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: async (name: string) => {
  const path = mockJoin(mockFolder, name); return mockAdapter(mockOpenFile(path), path);
} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixture-id' }));
const point: GpsCaptureRecord = { measuredAtMs: 1000, receivedAtMs: 1100, latitude: 47, longitude: 8,
  accuracy: 3, altitude: null, speed: 1, heading: null, source: 'expo', delivery: 'background', timing: 'live' };

beforeEach(() => {
  jest.resetModules(); mockFreshConnectionForeignKeys = false; mockConnections = new Set(); mockExclusiveConnections = 0; mockForeignKeysOnTransaction = [];
  mockFolder = mkdtempSync(mockJoin(tmpdir(), 'anyvo-archive-downgrade-'));
});
afterEach(() => { for (const db of mockConnections) db.close(); rmSync(mockFolder, { recursive: true, force: true }); });
async function setup() {
  const primary = jest.requireActual<typeof import('@/lib/localDb/client')>('@/lib/localDb/client');
  const scope = jest.requireActual<typeof import('../gpsCaptureScope')>('../gpsCaptureScope');
  const capture = jest.requireActual<typeof import('../gpsCapture')>('../gpsCapture');
  scope.setGpsCaptureAccount('owner', true);
  const db = await primary.getLocalDb();
  await db.runAsync("insert into local_training_sessions(local_id,user_id,payload_json) values('s','owner','{\"original\":true}')");
  await db.runAsync("insert into local_track_points(local_id,session_local_id,point_type,latitude,longitude) values('lay','s','lay',47,8),('search','s','search',47,8)");
  await db.runAsync("insert into local_track_markers(local_id,session_local_id,marker_type,latitude,longitude) values('object','s','object',47,8)");
  return { primary, db, scope, capture };
}
function inspectRaw() { return mockOpenFile(mockJoin(mockFolder, 'anyvo_gps_arrivals_v1.db')); }

it.each([false, true])('round-trips raw arrivals with fresh transaction connections (foreign keys=%s), without changing original tables', async enabled => {
  mockFreshConnectionForeignKeys = enabled;
  const { db, capture } = await setup();
  const before = await db.getAllAsync('select * from local_track_points order by local_id');
  const h = capture.beginGpsCapture('s', 'lay');
  expect(await h.capture(point)).toBe(true);
  expect(await h.capture({ ...point, measuredAtMs: 500, receivedAtMs: 1200, timing: 'late' })).toBe(true);
  expect(await h.close(true)).toBe(true);
  expect(mockExclusiveConnections).toBeGreaterThan(5);
  // Node SQLite defaults may differ by runtime. The API always uses independent handles.
  expect(mockForeignKeysOnTransaction).toEqual(Array(mockExclusiveConnections).fill(Number(enabled)));
  expect((await capture.readGpsCapture('s', 'lay')).map(p => p.measuredAtMs)).toEqual([1000, 500]);
  expect(await db.getAllAsync('select * from local_track_points order by local_id')).toEqual(before);
  expect(await db.getAllAsync("select name from sqlite_master where name like 'raw_capture_%'")).toEqual([]);
});

it('documents the actual legacy-wipe limit and verifies the cleanup-aware wipe removes both files contents', async () => {
  const { db, capture, primary } = await setup();
  const h = capture.beginGpsCapture('s', 'lay'); await h.capture(point); await h.close(true);
  // Identical in native build 17443616… and live OTA 4a139455…; no invented legacy behavior.
  const legacySql = readFileSync(mockJoin(__dirname, 'fixtures/build57-legacy-wipe.sql'), 'utf8');
  expect(createHash('sha256').update(legacySql).digest('hex')).toBe('9d42a7400ae61e24b5702b847eef284547a1a4edc9ad9fed71e92f6d31be6065');
  await db.execAsync(legacySql);
  expect(await db.getAllAsync('select * from local_training_sessions')).toEqual([]);
  const raw = inspectRaw();
  expect(raw.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(1);
  await expect(capture.readGpsCapture('s', 'lay')).rejects.toThrow('RAW_PARENT_DELETED');
  // A supported rollback must carry this cleanup-aware path; old immutable bundles cannot do it.
  await primary.wipeLocalData();
  expect(raw.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(0);
  expect(raw.prepare('select count(*) n from raw_capture_links').get()?.n).toBe(0);
});

it('cleanup-aware discard removes only the specified raw search attempt and retains lay/object originals', async () => {
  const { db, capture } = await setup();
  for (const [phase, attempt] of [['lay', 's'], ['search', 'previous'], ['search', 'current']] as const) {
    const h = capture.beginGpsCapture('s', phase, attempt); await h.capture(point); await h.close(true);
  }
  const { deleteSearchPointsBySession } = jest.requireActual<typeof import('@/features/tracking/repositories/localTrackRepository')>('@/features/tracking/repositories/localTrackRepository');
  await deleteSearchPointsBySession('s', undefined, 'current');
  expect(await capture.readGpsCapture('s', 'search', 'current')).toEqual([]);
  expect(await capture.readGpsCapture('s', 'search', 'previous')).toHaveLength(1);
  expect(await capture.readGpsCapture('s', 'lay')).toHaveLength(1);
  expect(await db.getAllAsync('select local_id from local_track_points')).toEqual([{local_id: 'lay'}]);
  expect(await db.getAllAsync('select local_id from local_track_markers')).toEqual([{local_id: 'object'}]);
});

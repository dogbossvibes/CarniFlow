import { openSqliteRawRecording } from '../sqliteRawRecording';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RAW_CAPTURE_SCHEMA, RAW_CAPTURE_REVOKE } from '../rawCaptureSchema';
import { activateRawCapture, type RawCaptureDeps, type RawCaptureTx } from '../rawCaptureRepository';
import type { RawMeasurement } from '../rawMeasurementJournal';
let a: DatabaseSync, b: DatabaseSync, folder: string;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'anyvo-raw-test-'));
  a = new DatabaseSync(join(folder, 'test.db')); a.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  a.exec(RAW_CAPTURE_SCHEMA); b = new DatabaseSync(join(folder, 'test.db')); b.exec('PRAGMA foreign_keys=ON;');
});
afterEach(() => { a.close(); b.close(); rmSync(folder, { recursive: true, force: true }); });
const point: RawMeasurement = { measuredAtMs: 2, receivedAtMs: 3, latitude: 47, longitude: 8,
  accuracy: 3, altitude: null, speed: null, heading: null, source: 'expo', delivery: 'background' };
function deps(db: DatabaseSync, owner = 'a', maxRecordsPerOwner = 1000) {
  let epoch = 0;
  const tx = {
    getFirstAsync: async (sql: string, ...p: (string | number)[]) => db.prepare(sql).get(...p) ?? null,
    getAllAsync: async (sql: string, ...p: (string | number)[]) => db.prepare(sql).all(...p),
    runAsync: async (sql: string, ...p: (string | number)[]) => db.prepare(sql).run(...p),
  } as RawCaptureTx;
  const config: RawCaptureDeps = { scope: () => ({ userId: owner, epoch }), maxRecordsPerOwner,
    transaction: async fn => { db.exec('BEGIN IMMEDIATE'); try {
      const result = await fn(tx); db.exec('COMMIT'); return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; } },
  };
  return { config, tx, invalidate: () => { epoch++; } };
}
it('migration is additive and repeatable', () => {
  a.exec('create table existing_track(id text); insert into existing_track values(\'keep\');');
  a.exec(RAW_CAPTURE_SCHEMA); expect(a.prepare('select id from existing_track').get()?.id).toBe('keep');
});
it('preserves duplicate and reversed measurements across reopen and fences old process', async () => {
  const one = await activateRawCapture('a', deps(a).config); const first = await one.open('s');
  await one.append(first, [point, point, { ...point, measuredAtMs: 1 }]);
  const two = await activateRawCapture('a', deps(b).config); const resumed = await two.open('s');
  await expect(one.append(first, [point])).rejects.toThrow('REVOKED');
  const rows = await two.read('s'); expect(rows.map(r => JSON.parse(r.payload_json).measuredAtMs)).toEqual([2, 2, 1]);
  await two.append(resumed, [point]); await expect(two.close(resumed, true)).rejects.toThrow('RAW_CAPTURE_INCOMPLETE'); await two.close(resumed, false);
  await expect(two.append(resumed, [point])).rejects.toThrow('CLOSED');
});
it('durable tombstone prevents reopen or late writes even after new account activation', async () => {
  const one = await activateRawCapture('a', deps(a).config); const lease = await one.open('s');
  await one.append(lease, [point]); await one.remove('s');
  await expect(one.append(lease, [point])).rejects.toThrow('CLOSED');
  const two = await activateRawCapture('a', deps(b).config);
  await expect(two.open('s')).rejects.toThrow('CLOSED'); expect(await two.read('s')).toEqual([]);
});
it('isolates owners and does not let old logout revoke new login', async () => {
  const old = await activateRawCapture('a', deps(a).config); const current = await activateRawCapture('a', deps(b).config);
  await old.revoke(); const lease = await current.open('s'); await current.append(lease, [point]);
  const other = await activateRawCapture('b', deps(a, 'b').config); await other.remove('s');
  expect(await other.read('s')).toEqual([]); expect(await current.read('s')).toHaveLength(1);
});
it('rolls back complete batch when account changes during write', async () => {
  const d = deps(a); const repo = await activateRawCapture('a', d.config); const lease = await repo.open('s');
  const run = d.tx.runAsync; d.tx.runAsync = async (...args) => { const result = await run(...args); d.invalidate(); return result; };
  await expect(repo.append(lease, [point])).rejects.toThrow('ACCOUNT_CHANGED');
  expect(a.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(0);
});
it('rejects excess capacity without evicting old observations', async () => {
  const repo = await activateRawCapture('a', deps(a, 'a', 1).config); const lease = await repo.open('s');
  await repo.append(lease, [point]); await expect(repo.append(lease, [point])).rejects.toThrow('LIMIT');
  expect(await repo.read('s')).toHaveLength(1);
});
it('rolls back a batch on simulated disk failure', async () => {
  const d = deps(a); const repo = await activateRawCapture('a', d.config); const lease = await repo.open('s');
  const run = d.tx.runAsync; let calls = 0;
  d.tx.runAsync = async (...args) => { if (++calls === 2) throw new Error('disk full'); return run(...args); };
  await expect(repo.append(lease, [point, point])).rejects.toThrow('disk full');
  expect(await repo.read('s')).toHaveLength(0);
});
it('pages measurements by arrival rather than measurement timestamp', async () => {
  const repo = await activateRawCapture('a', deps(a).config); const lease = await repo.open('s');
  await repo.append(lease, Array.from({ length: 256 }, () => point)); await repo.append(lease, [point]);
  const page = await repo.read('s'); expect(page).toHaveLength(256);
  expect(await repo.read('s', page[255].arrival_id)).toHaveLength(1);
});
it('a second connection cannot write through an unfinished exclusive transaction', async () => {
  const repo = await activateRawCapture('a', deps(b).config); const lease = await repo.open('s');
  a.exec('BEGIN IMMEDIATE');
  await expect(repo.append(lease, [point])).rejects.toThrow(/locked/);
  a.exec('ROLLBACK'); await repo.append(lease, [point]); expect(await repo.read('s')).toHaveLength(1);
});

it('local revoke preserves coordinates and durably fences old callbacks', async () => {
  const repo = await activateRawCapture('a', deps(a).config); const lease = await repo.open('s');
  await repo.append(lease, [point]); a.exec(RAW_CAPTURE_REVOKE);
  await expect(repo.append(lease, [point])).rejects.toThrow('REVOKED');
  expect(a.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(1);
  const next = await activateRawCapture('a', deps(b).config);
  expect(await next.read('s')).toHaveLength(1);
  const resumed = await next.open('s');
  await expect(next.close(resumed, true)).rejects.toThrow('RAW_CAPTURE_INCOMPLETE');
});

it('discards activation result when account changes during native commit', async () => {
  const d = deps(a); const transaction = d.config.transaction;
  d.config.transaction = async fn => { const result = await transaction(fn); d.invalidate(); return result; };
  await expect(activateRawCapture('a', d.config)).rejects.toThrow('ACCOUNT_CHANGED');
});
it('discards read results when account changes after callback but before commit resolves', async () => {
  const d = deps(a); const repo = await activateRawCapture('a', d.config); const lease = await repo.open('s');
  await repo.append(lease, [point]);
  const transaction = d.config.transaction;
  d.config.transaction = async fn => { const result = await transaction(fn); d.invalidate(); return result; };
  await expect(repo.read('s')).rejects.toThrow('ACCOUNT_CHANGED');
});

it('never declares a capture complete after a rejected storage append', async () => {
  const repo = await activateRawCapture('a', deps(a, 'a', 1).config);
  const lease = await repo.open('failed');
  await repo.append(lease, [point]);
  await expect(repo.append(lease, [point])).rejects.toThrow('LIMIT');
  await expect(repo.close(lease, true)).rejects.toThrow('RAW_CAPTURE_INCOMPLETE');
  expect(await repo.read('failed')).toHaveLength(1);
  await repo.close(lease, false);
});

it('does not claim continuity after reopening an unfinished capture', async () => {
  const one = await activateRawCapture('a', deps(a).config);
  const lease = await one.open('recovered'); await one.append(lease, [point]);
  const two = await activateRawCapture('a', deps(b).config);
  const resumed = await two.open('recovered'); await two.append(resumed, [point]);
  await expect(two.close(resumed, true)).rejects.toThrow('RAW_CAPTURE_INCOMPLETE');
  expect(await two.read('recovered')).toHaveLength(2);
  await two.close(resumed, false);
});

it('refuses completion until an accepted append acknowledges its commit', async () => {
  const d = deps(a); const repo = await activateRawCapture('a', d.config);
  const lease = await repo.open('pending');
  const original = d.config.transaction;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let committed!: () => void; const ready = new Promise<void>(resolve => { committed = resolve; });
  let first = true;
  d.config.transaction = async fn => {
    const hold = first; first = false;
    const result = await original(fn);
    if (hold) { committed(); await gate; }
    return result;
  };
  const append = repo.append(lease, [point]); await ready;
  await expect(repo.close(lease, true)).rejects.toThrow('RAW_CAPTURE_WRITES_PENDING');
  release(); await append; await repo.close(lease, true);
  expect(await repo.read('pending')).toHaveLength(1);
});

it('serializes immutable recorder inputs and drains before finalizing', async () => {
  const repo = await activateRawCapture('a', deps(a).config);
  const recorder = await openSqliteRawRecording(repo, 'adapter');
  const input = { ...point }; const first = recorder.capture(input); input.latitude = 0;
  const second = recorder.capture({ ...point, measuredAtMs: 1 });
  const finish = recorder.finish();
  expect(await recorder.capture(point)).toBe(false);
  expect(await first).toBe(true); expect(await second).toBe(true); expect(await finish).toBe(true);
  expect((await repo.read('adapter')).map(r => JSON.parse(r.payload_json).latitude)).toEqual([47, 47]);
  expect(recorder.snapshot()).toEqual({ state: 'complete', observed: 2, stored: 2, rejected: 0, pending: 0 });
});

it('keeps accepted observations on queue exhaustion without claiming complete', async () => {
  const repo = await activateRawCapture('a', deps(a).config);
  const recorder = await openSqliteRawRecording(repo, 'bounded', 1);
  const accepted = recorder.capture(point);
  expect(await recorder.capture(point)).toBe(false);
  expect(await accepted).toBe(true); expect(await recorder.finish()).toBe(false);
  expect(await repo.read('bounded')).toHaveLength(1);
  expect(recorder.snapshot()).toEqual({ state: 'interrupted', observed: 2, stored: 1, rejected: 1, pending: 0 });
});

it('contains account revocation errors without deleting committed records', async () => {
  const repo = await activateRawCapture('a', deps(a).config);
  const recorder = await openSqliteRawRecording(repo, 'revoked');
  expect(await recorder.capture(point)).toBe(true); await repo.revoke();
  expect(await recorder.capture(point)).toBe(false); expect(await recorder.finish()).toBe(false);
  expect(recorder.snapshot().state).toBe('failed');
  const next = await activateRawCapture('a', deps(b).config);
  expect(await next.read('revoked')).toHaveLength(1);
});

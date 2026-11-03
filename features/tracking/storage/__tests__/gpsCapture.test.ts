import { DatabaseSync } from 'node:sqlite';
import { RAW_CAPTURE_DB_SCHEMA } from '../gpsCaptureDb';
import { markTrainingAsDeleted, getLocalTrainingSessions } from '@/features/training/repositories/localTrainingRepository';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { beginGpsCapture, readGpsCapture, deleteGpsCaptures, type GpsCaptureRecord } from '../gpsCapture';
import { gpsCaptureScope, setGpsCaptureAccount } from '../gpsCaptureScope';
let mockDb: DatabaseSync;
let mockMainDb: DatabaseSync;
let mockFailWrites = false;
let mockFailDeletes = false;
let mockFailMainWrite = false;
let mockBeforeMainRead: (() => void) | null = null;
let mockAfterPage: (() => void) | null = null;
let mockTransactionGate: Promise<void> | null = null;
let mockAfterParentLookup: (() => Promise<void>) | null = null;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  runAsync: async (sql: string, ...args: (string | number)[]) => {
    if (mockFailMainWrite) throw new Error('main database busy');
    return mockMainDb.prepare(sql).run(...args);
  },
  getAllAsync: async (sql: string, ...args: (string | number)[]) => mockMainDb.prepare(sql).all(...args),
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => {
    mockBeforeMainRead?.();
    const row = mockMainDb.prepare(sql).get(...args) ?? null;
    if (sql.includes('deleted_at')) await mockAfterParentLookup?.();
    return row;
  },
}) }));
jest.mock('../gpsCaptureDb', () => ({
  ...jest.requireActual('../gpsCaptureDb'), getGpsCaptureDb: async () => ({
  withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => {
    if (mockTransactionGate) await mockTransactionGate;
    const tx = {
      getFirstAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).get(...args) ?? null,
      getAllAsync: async (sql: string, ...args: (string | number)[]) => {
        const rows = mockDb.prepare(sql).all(...args);
        if (sql.includes('arrival_id>?')) { const callback = mockAfterPage; mockAfterPage = null; callback?.(); }
        return rows;
      },
      runAsync: async (sql: string, ...args: (string | number)[]) => {
        if (mockFailDeletes && sql.startsWith('delete from raw_capture_measurements')) throw new Error('archive busy');
        if (mockFailWrites && sql.startsWith('insert into raw_capture_measurements')) throw new Error('disk full');
        return mockDb.prepare(sql).run(...args);
      },
    };
    mockDb.exec('BEGIN IMMEDIATE');
    try { await work(tx); mockDb.exec('COMMIT'); } catch (error) { mockDb.exec('ROLLBACK'); throw error; }
  },
}) }));
const point: GpsCaptureRecord = { measuredAtMs: 1000, receivedAtMs: 1000, latitude: 47, longitude: 8,
  accuracy: 4, altitude: null, speed: 1, heading: 20, source: 'native', delivery: 'foreground', timing: 'live' };
beforeEach(() => {
  mockDb = new DatabaseSync(':memory:'); mockDb.exec('PRAGMA foreign_keys=ON');
  mockDb.exec(RAW_CAPTURE_DB_SCHEMA);
  mockMainDb = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) mockMainDb.exec(m.sql);
  mockAfterParentLookup = null; mockFailWrites = false; mockFailDeletes = false; mockFailMainWrite = false; mockBeforeMainRead = null; mockAfterPage = null; mockTransactionGate = null; setGpsCaptureAccount('a', true);
  mockMainDb.prepare("insert into local_training_sessions(local_id,user_id) values('s','a')").run();
});
afterEach(() => { setGpsCaptureAccount(null); mockDb.close(); mockMainDb.close(); });

it('queues arrivals during initialization and preserves measured/reception time and arrival order', async () => {
  const handle = beginGpsCapture('s', 'lay');
  const records = [{ ...point }, { ...point, measuredAtMs: 800, receivedAtMs: 1100, timing: 'late' as const },
    { ...point, receivedAtMs: 1200, timing: 'duplicate' as const },
    { ...point, measuredAtMs: 9999999999, receivedAtMs: 1300, timing: 'future' as const },
    { ...point, measuredAtMs: 1400, receivedAtMs: 1400 }];
  const writes = records.map(p => handle.capture(p));
  records[0].latitude = 99; // capture copied synchronously
  expect(await Promise.all(writes)).toEqual([true, true, true, true, true]);
  expect(await handle.flush()).toBe(true); expect(await handle.close()).toBe(true);
  const restored = await readGpsCapture('s', 'lay');
  expect(restored.map(p => p.measuredAtMs)).toEqual([1000, 800, 1000, 9999999999, 1400]);
  expect(restored[0].latitude).toBe(47); expect(restored[0].source).toBe('precision');
  const resumed = beginGpsCapture('s', 'lay');
  expect(await resumed.ready()).toEqual({ lastLiveMeasurementMs: 1400 });
  expect(await resumed.close()).toBe(true);
});
it('keeps lay, search and distinct search attempts separate', async () => {
  const lay = beginGpsCapture('s', 'lay'), search = beginGpsCapture('s', 'search', 'attempt1');
  expect(await lay.capture({ ...point, latitude: 46 })).toBe(true);
  expect(await search.capture({ ...point, latitude: 48 })).toBe(true);
  await lay.close(); await search.close();
  await deleteGpsCaptures('s', 'search', 'attempt1');
  expect(await readGpsCapture('s', 'search', 'attempt1')).toEqual([]);
  expect(await readGpsCapture('s', 'lay')).toHaveLength(1);
  const next = beginGpsCapture('s', 'search', 'attempt2');
  expect(await next.capture(point)).toBe(true); await next.close();
  expect(await readGpsCapture('s', 'search', 'attempt2')).toHaveLength(1);
});
it('fences an account switch and returning to the same owner without erasing old coordinates', async () => {
  const h = beginGpsCapture('s', 'lay'); expect(await h.capture(point)).toBe(true);
  setGpsCaptureAccount('b'); expect(await h.capture(point)).toBe(false);
  expect(await readGpsCapture('s', 'lay')).toEqual([]);
  setGpsCaptureAccount('a'); expect(await h.capture(point)).toBe(false);
  expect(await readGpsCapture('s', 'lay')).toHaveLength(1);
  await h.close();
});
it('does not revoke the account scope for a same-user token refresh', () => {
  const before = gpsCaptureScope(); setGpsCaptureAccount('a'); expect(gpsCaptureScope()).toEqual(before);
});
it('reports storage failures without deleting earlier rows or claiming completeness', async () => {
  const h = beginGpsCapture('s', 'lay'); expect(await h.capture(point)).toBe(true);
  mockFailWrites = true; expect(await h.capture(point)).toBe(false);
  expect(await h.flush()).toBe(false); expect(h.snapshot().failed).toBe(1);
  expect(await h.close(true)).toBe(false);
  expect(await readGpsCapture('s', 'lay')).toHaveLength(1);
});
it.each(['soft', 'hard'])('parent %s delete removes archived coordinates and fences pending callbacks', async mode => {
  const h = beginGpsCapture('s', 'lay'); expect(await h.capture(point)).toBe(true);
  if (mode === 'soft') mockMainDb.exec("update local_training_sessions set deleted_at='now' where local_id='s'");
  else mockMainDb.exec("delete from local_training_sessions where local_id='s'");
  expect(await h.capture(point)).toBe(false);
  await expect(readGpsCapture('s', 'lay')).rejects.toThrow('RAW_PARENT_DELETED');
  await deleteGpsCaptures('s');
  expect(await readGpsCapture('s', 'lay')).toEqual([]);
  const stale = beginGpsCapture('s', 'lay'); expect(await stale.capture(point)).toBe(false);
  await stale.close(); await h.close();
});
it('delete while open is queued cannot resurrect the archive', async () => {
  const h = beginGpsCapture('s', 'search', 'race');
  const write = h.capture(point); await deleteGpsCaptures('s', 'search', 'race');
  expect(await write).toBe(false); expect(await h.flush()).toBe(false); await h.close();
  expect(await readGpsCapture('s', 'search', 'race')).toEqual([]);
  const stale = beginGpsCapture('s', 'search', 'race');
  expect(await stale.capture(point)).toBe(false); await stale.close();
});

it('preserves an external provider as external and maintains O(1) quota counters across deletion', async () => {
  const lay = beginGpsCapture('s', 'lay');
  expect(await lay.capture({ ...point, source: 'external' })).toBe(true);
  expect(await lay.capture({ ...point, source: 'unknown' })).toBe(true);
  expect(await readGpsCapture('s', 'lay')).toEqual(expect.arrayContaining([expect.objectContaining({source:'external'}), expect.objectContaining({source:'unknown'})]));
  expect(mockDb.prepare('select record_count from raw_capture_counts where owner_id=?').get('a')?.record_count).toBe(2);
  await lay.close(); await deleteGpsCaptures('s');
  expect(mockDb.prepare('select record_count from raw_capture_counts where owner_id=?').get('a')?.record_count).toBe(0);
  const newAttempt = beginGpsCapture('s', 'search', 'another'); expect(await newAttempt.capture(point)).toBe(false); await newAttempt.close();
});

it.each([false, true])('close reports closing until the queued native write finishes; disk failure=%s', async diskFailure => {
  const h = beginGpsCapture('s', 'lay'); await h.ready();
  let release!: () => void;
  mockTransactionGate = new Promise<void>(resolve => { release = resolve; });
  mockFailWrites = diskFailure;
  const write = h.capture(point), completion = h.close(true);
  expect(h.snapshot()).toMatchObject({state: 'closing', pending:1, closed:true, stored:0});
  release();
  expect(await h.flush()).toBe(!diskFailure);
  expect(await write).toBe(!diskFailure); expect(await completion).toBe(!diskFailure);
  expect(h.snapshot().state).toBe(diskFailure ? 'failed' : 'complete');
  expect(h.snapshot().pending).toBe(0);
});

it.each([false, true])('drains every old arrival before reopening the same archive; caller already closed=%s', async alreadyClosed => {
  const old = beginGpsCapture('s', 'lay'); await old.ready();
  const queued = Array.from({ length: 20 }, (_, i) => old.capture({ ...point, measuredAtMs: 1000 + i }));
  const closing = alreadyClosed ? old.close(false) : null;
  const resumed = beginGpsCapture('s', 'lay');
  const next = resumed.capture({ ...point, measuredAtMs: 2000 });
  expect(await Promise.all(queued)).toEqual(Array(20).fill(true));
  if (closing) expect(await closing).toBe(true);
  expect(await old.flush()).toBe(true); expect(await next).toBe(true);
  expect(await resumed.ready()).toEqual({ lastLiveMeasurementMs: 1019 });
  expect(await resumed.close(false)).toBe(true);
  expect((await readGpsCapture('s', 'lay')).map(p => p.measuredAtMs)).toEqual([
    ...Array.from({ length: 20 }, (_, i) => 1000 + i), 2000,
  ]);
});

it('does not wait for another track handle to drain before opening an independent archive', async () => {
  const first = beginGpsCapture('s', 'lay'); await first.ready();
  const queued = Array.from({ length: 40 }, (_, i) => first.capture({ ...point, measuredAtMs: 1000 + i }));
  const closing = first.close(false);
  const separate = beginGpsCapture('other', 'lay');
  await separate.ready();
  expect(first.snapshot().pending).toBeGreaterThan(0);
  expect(await separate.capture(point)).toBe(true);
  expect(await Promise.all(queued)).toEqual(Array(40).fill(true));
  expect(await closing).toBe(true); expect(await separate.close(false)).toBe(true);
});


it('a recovered archive seals durably as interrupted instead of remaining open or claiming completeness', async () => {
  const first = beginGpsCapture('s', 'lay'); await first.capture(point); await first.close(false);
  const resumed = beginGpsCapture('s', 'lay'); await resumed.capture({ ...point, measuredAtMs: 2000 });
  expect(await resumed.close(true)).toBe(false);
  expect(resumed.snapshot()).toMatchObject({ state: 'interrupted', error: 'RAW_CAPTURE_INCOMPLETE' });
  expect(mockDb.prepare('select state from raw_capture_sessions').get()?.state).toBe('interrupted');
  expect(await readGpsCapture('s', 'lay')).toHaveLength(2);
});

it('discard deletes only the named search attempt, retaining earlier complete and interrupted attempts', async () => {
  for (const [attempt, complete] of [['old', true], ['interrupted', false], ['current', false]] as const) {
    const h = beginGpsCapture('s', 'search', attempt); await h.capture(point); await h.close(complete);
  }
  await deleteGpsCaptures('s', 'search'); // unknown legacy attempt must not guess
  expect(await readGpsCapture('s', 'search', 'current')).toHaveLength(1);
  await deleteGpsCaptures('s', 'search', 'current');
  expect(await readGpsCapture('s', 'search', 'current')).toEqual([]);
  expect(await readGpsCapture('s', 'search', 'old')).toHaveLength(1);
  expect(await readGpsCapture('s', 'search', 'interrupted')).toHaveLength(1);
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('preserves invalid measurement timestamp %s explicitly without fabricating a time', async measuredAtMs => {
  const h = beginGpsCapture('s', 'lay');
  expect(await h.capture({ ...point, measuredAtMs, timing: 'invalid' })).toBe(true);
  expect(await h.close(true)).toBe(true);
  const records = await readGpsCapture('s', 'lay');
  expect(Object.is(records[0].measuredAtMs, measuredAtMs)).toBe(true);
  expect(records[0].timing).toBe('invalid');
  expect(mockDb.prepare('select payload_json from raw_capture_measurements').get()?.payload_json).toContain('$nonFinite');
});

it('does not return an already-read page after deletion starts between pages', async () => {
  const h = beginGpsCapture('s', 'lay');
  for (let i = 0; i < 260; i++) expect(await h.capture({ ...point, measuredAtMs: 1000 + i })).toBe(true);
  await h.close(true);
  let deletion!: Promise<void>;
  mockAfterPage = () => { deletion = deleteGpsCaptures('s'); };
  await expect(readGpsCapture('s', 'lay')).rejects.toThrow('RAW_SESSION_CHANGED');
  await deletion;
  expect(await readGpsCapture('s', 'lay')).toEqual([]);
});

it('remembers a local parent created after archival opening, so later hard deletion remains visible after reopen', async () => {
  const h = beginGpsCapture('late-parent', 'lay');
  expect(await h.capture(point)).toBe(true);
  mockMainDb.exec("insert into local_training_sessions(local_id,user_id) values('late-parent','a')");
  expect(await h.capture({ ...point, measuredAtMs: 2000 })).toBe(true);
  await h.close(true);
  expect(mockDb.prepare('select parent_local_id from raw_capture_links').get()?.parent_local_id).toBe('late-parent');
  mockMainDb.exec("delete from local_training_sessions where local_id='late-parent'");
  await expect(readGpsCapture('late-parent', 'lay')).rejects.toThrow('RAW_PARENT_DELETED');
});


it('deletes a remote-linked archive by its remembered local parent after the legacy parent row has gone', async () => {
  mockMainDb.exec("update local_training_sessions set remote_id='remote-s' where local_id='s'");
  const h = beginGpsCapture('remote-s', 'search', 'alias-attempt');
  expect(await h.capture(point)).toBe(true); await h.close(true);
  expect(mockDb.prepare('select parent_local_id from raw_capture_links').get()?.parent_local_id).toBe('s');
  mockMainDb.exec("delete from local_training_sessions where local_id='s'");
  await deleteGpsCaptures('s');
  expect(mockDb.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(0);
  expect(await readGpsCapture('remote-s', 'search', 'alias-attempt')).toEqual([]);
  const stale = beginGpsCapture('remote-s', 'search', 'other-attempt');
  expect(await stale.capture(point)).toBe(false); await stale.close();
});


it('retains unresolved originals without exposing them until the real parent is recovered', async () => {
  const h = beginGpsCapture('recover-parent', 'lay');
  expect(await h.capture(point)).toBe(true); await h.close(true);
  await expect(readGpsCapture('recover-parent', 'lay')).rejects.toThrow('RAW_PARENT_UNRESOLVED');
  expect(mockDb.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(1);
  mockMainDb.exec("insert into local_training_sessions(local_id,remote_id,user_id) values('recovered-local','recover-parent','a')");
  expect(await readGpsCapture('recover-parent', 'lay')).toHaveLength(1);
  expect(mockDb.prepare('select parent_local_id from raw_capture_links').get()?.parent_local_id).toBe('recovered-local');
  mockMainDb.exec("delete from local_training_sessions where local_id='recovered-local'");
  await expect(readGpsCapture('recover-parent', 'lay')).rejects.toThrow('RAW_PARENT_DELETED');
});


it('does not silently rebind a remembered parent when a remote alias is reused by a different local row', async () => {
  mockMainDb.exec("update local_training_sessions set remote_id='reused-remote' where local_id='s'");
  const h = beginGpsCapture('reused-remote', 'lay');
  expect(await h.capture(point)).toBe(true); await h.close(false);
  mockMainDb.exec("delete from local_training_sessions where local_id='s'; insert into local_training_sessions(local_id,remote_id,user_id) values('different-local','reused-remote','a')");
  await expect(readGpsCapture('reused-remote', 'lay')).rejects.toThrow('RAW_PARENT_DELETED');
  const resumed = beginGpsCapture('reused-remote', 'lay');
  expect(await resumed.capture(point)).toBe(false); await resumed.close();
  expect(mockDb.prepare('select parent_local_id from raw_capture_links').get()?.parent_local_id).toBe('s');
});

it('a writer with an old unknown-parent cache cannot overwrite a binding established by a reader', async () => {
  const h = beginGpsCapture('shared-alias', 'lay');
  expect(await h.capture(point)).toBe(true);
  mockMainDb.exec("insert into local_training_sessions(local_id,remote_id,user_id) values('parent-a','shared-alias','a')");
  expect(await readGpsCapture('shared-alias', 'lay')).toHaveLength(1);
  mockMainDb.exec("delete from local_training_sessions where local_id='parent-a'; insert into local_training_sessions(local_id,remote_id,user_id) values('parent-b','shared-alias','a')");
  expect(await h.capture({ ...point, measuredAtMs: 2000 })).toBe(false);
  expect(mockDb.prepare('select parent_local_id from raw_capture_links').get()?.parent_local_id).toBe('parent-a');
  expect(mockDb.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(1);
  await h.close();
});


it('does not return a page deleted through a local alias during the final awaited parent lookup', async () => {
  mockMainDb.exec("update local_training_sessions set remote_id='remote-s' where local_id='s'");
  const h = beginGpsCapture('remote-s', 'search', 'attempt');
  await h.capture(point); await h.close(true);
  let lookups = 0;
  mockAfterParentLookup = async () => {
    if (++lookups === 2) await deleteGpsCaptures('s', 'search', 'attempt');
  };
  await expect(readGpsCapture('remote-s', 'search', 'attempt')).rejects.toThrow('RAW_SESSION_CHANGED');
  expect(mockDb.prepare('select count(*) n from raw_capture_measurements').get()?.n).toBe(0);
});

// A failed archive cleanup must leave the user's local delete action retryable.
it('failed local deletion retains original visible parent and raw data until a successful retry', async () => {
  const h = beginGpsCapture('s', 'lay'); await h.capture(point); await h.close(true);
  const before = mockMainDb.prepare("select * from local_training_sessions where local_id='s'").get();
  mockFailDeletes = true;
  await expect(markTrainingAsDeleted('s')).rejects.toThrow('archive busy');
  expect(mockMainDb.prepare("select * from local_training_sessions where local_id='s'").get()).toEqual(before);
  expect((await getLocalTrainingSessions('a')).map(r => r.local_id)).toEqual(['s']);
  expect(await readGpsCapture('s', 'lay')).toHaveLength(1);
  mockFailDeletes = false;
  await markTrainingAsDeleted('s');
  expect(await getLocalTrainingSessions('a')).toEqual([]);
  expect(await readGpsCapture('s', 'lay')).toEqual([]);
});
it('foreign-account deletion never hides the original parent or erases its archive', async () => {
  const h = beginGpsCapture('s', 'lay'); await h.capture(point); await h.close(true);
  setGpsCaptureAccount('b');
  await expect(markTrainingAsDeleted('s')).rejects.toThrow('RAW_ACCOUNT_CHANGED');
  expect((await getLocalTrainingSessions('a')).map(r => r.local_id)).toEqual(['s']);
  setGpsCaptureAccount('a'); expect(await readGpsCapture('s', 'lay')).toHaveLength(1);
});
it('logout and return to the same account during parent lookup invalidates the pending delete', async () => {
  mockBeforeMainRead = () => { mockBeforeMainRead = null; setGpsCaptureAccount(null); setGpsCaptureAccount('a'); };
  await expect(markTrainingAsDeleted('s')).rejects.toThrow('RAW_ACCOUNT_CHANGED');
  expect((await getLocalTrainingSessions('a')).map(r => r.local_id)).toEqual(['s']);
});
it('can retry a primary database failure after successful archive cleanup', async () => {
  const h = beginGpsCapture('s', 'lay'); await h.capture(point); await h.close(true);
  mockFailMainWrite = true;
  await expect(markTrainingAsDeleted('s')).rejects.toThrow('main database busy');
  expect((await getLocalTrainingSessions('a')).map(r => r.local_id)).toEqual(['s']);
  expect(await readGpsCapture('s', 'lay')).toEqual([]);
  mockFailMainWrite = false;
  await markTrainingAsDeleted('s');
  expect(await getLocalTrainingSessions('a')).toEqual([]);
});

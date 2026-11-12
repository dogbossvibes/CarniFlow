import { decodeRawMeasurement } from './rawCaptureCodec';
import { getLocalDb } from '@/lib/localDb/client';
import { getGpsCaptureDb } from './gpsCaptureDb';
import { activateRawCapture, type RawCaptureTx } from './rawCaptureRepository';
import { gpsCaptureScope } from './gpsCaptureScope';
import type { RawMeasurement } from './rawMeasurementJournal';

export type GpsCapturePhase = 'lay' | 'search';
export type GpsCaptureRecord = Omit<RawMeasurement, 'source'> & { source: RawMeasurement['source'] | 'native' };
type Repository = Awaited<ReturnType<typeof activateRawCapture>>;
const MAX_PENDING = 256;
const MAX_RECORDS_PER_OWNER = 1_000_000; // Explicit failure, never eviction of old tracks.
let transactions: Promise<unknown> = Promise.resolve();
let account: { userId: string; epoch: number; repository: Promise<Repository> } | undefined;
const parentEpochs = new Map<string, number>();
const openHandles = new Map<string, { close(complete?: boolean): Promise<boolean> }>();

function transaction<T>(work: (tx: RawCaptureTx) => Promise<T>): Promise<T> {
  const run = transactions.then(async () => {
    const db = await getGpsCaptureDb();
    let result!: T;
    await db.withExclusiveTransactionAsync(async tx => { result = await work(tx as RawCaptureTx); });
    return result;
  });
  transactions = run.catch(() => {});
  return run;
}
function accountRepository(): Promise<Repository> {
  const scope = gpsCaptureScope();
  if (!scope.userId) return Promise.reject(new Error('RAW_ACCOUNT_UNAVAILABLE'));
  if (!account || account.userId !== scope.userId || account.epoch !== scope.epoch) {
    account = { userId: scope.userId, epoch: scope.epoch,
      repository: activateRawCapture(scope.userId, { scope: gpsCaptureScope, transaction, maxRecordsPerOwner: MAX_RECORDS_PER_OWNER }) };
    const opening = account;
    void opening.repository.catch(() => { if (account === opening) account = undefined; });
  }
  return account.repository;
}
function archiveId(sessionId: string, phase: GpsCapturePhase, attemptId: string) {
  if (!sessionId || !attemptId || !['lay', 'search'].includes(phase)) throw new Error('RAW_INVALID_ID');
  const id = JSON.stringify([sessionId, phase, attemptId]);
  if (id.length > 128) throw new Error('RAW_INVALID_ID');
  return id;
}
const parentKey = (owner: string | null, session: string, phase: GpsCapturePhase) => JSON.stringify([owner, session, phase]);

/** A reader may resolve the parent while an older writer still caches null.
 * Bind once in the same transaction; never overwrite another resolved identity.
 * During initial opening the link can be absent and is checked again on insert.
 */
async function bindParent(tx: RawCaptureTx, owner: string, id: string, parentId: string) {
  await tx.runAsync('update raw_capture_links set parent_local_id=? where owner_id=? and archive_id=? and parent_local_id is null', parentId, owner, id);
  const bound = await tx.getFirstAsync<{ parent_local_id: string | null }>(
    'select parent_local_id from raw_capture_links where owner_id=? and archive_id=?', owner, id);
  if (bound && bound.parent_local_id !== parentId) throw new Error('RAW_PARENT_DELETED');
}

/** Synchronous handle: accepted arrivals queue immediately, including during SQLite open.
 * No GPS, geometry, network or public Live-Share side effects. Call flush at lifecycle
 * boundaries. A failed append is observable and never reported as a complete archive.
 */
export function beginGpsCapture(sessionId: string, phase: GpsCapturePhase, attemptId = sessionId) {
  const initial = gpsCaptureScope();
  const key = parentKey(initial.userId, sessionId, phase);
  const revision = parentEpochs.get(key) ?? 0;
  const valid = () => {
    const now = gpsCaptureScope();
    if (!initial.userId || now.userId !== initial.userId || now.epoch !== initial.epoch
      || revision !== (parentEpochs.get(key) ?? 0)) throw new Error('RAW_ACCOUNT_OR_SESSION_CHANGED');
  };
  let id: string;
  try { id = archiveId(sessionId, phase, attemptId); } catch { id = ''; }
  const handleKey = JSON.stringify([initial.userId, initial.epoch, id]);
  // Reopening must not revoke a lease while its previously accepted arrivals
  // are still queued. Only the same account/archive waits for this drain.
  const predecessor = openHandles.get(handleKey)?.close(false);
  let parentLocalId: string | null = null;
  const parentAvailable = async () => {
    valid(); const db = await getLocalDb();
    const row = await db.getFirstAsync<{ local_id: string; deleted_at: string | null }>(
      'select local_id,deleted_at from local_training_sessions where user_id=? and (local_id=? or remote_id=?)', initial.userId!, parentLocalId ?? sessionId, sessionId);
    valid(); if (row?.deleted_at || (parentLocalId && row?.local_id !== parentLocalId)) throw new Error('RAW_PARENT_DELETED');
    if (row && parentLocalId !== row.local_id) {
      await transaction(async tx => { valid(); await bindParent(tx, initial.userId!, id, row.local_id); valid(); });
      parentLocalId = row.local_id;
      valid();
    }
  };
  let observed = 0, stored = 0, failed = 0, pending = 0, closed = false;
  let error: string | null = null;
  let state: 'opening' | 'recording' | 'closing' | 'complete' | 'interrupted' | 'failed' = 'opening';
  let tail: Promise<unknown> = Promise.resolve();
  let closing: Promise<boolean> | undefined;
  const fail = (e: unknown) => { failed++; state = 'failed'; error = e instanceof Error ? e.message : 'RAW_WRITE_FAILED'; return false; };
  const ready = (async () => {
    if (predecessor) await predecessor;
    valid(); if (!id) throw new Error('RAW_INVALID_ID');
    const repo = await accountRepository(); valid();
    const link = await transaction(tx => tx.getFirstAsync<{ parent_local_id: string | null }>(
      'select parent_local_id from raw_capture_links where owner_id=? and archive_id=?', initial.userId!, id));
    parentLocalId = link?.parent_local_id ?? null;
    await parentAvailable();
    // Cross-database operations are deliberately not presented as atomic.
    // Known local parents are checked before and after native archival writes.
    await transaction(async tx => {
      valid();
      const tombstone = await tx.getFirstAsync<{ parent_session_id: string }>(
        'select parent_session_id from raw_capture_deleted_parents where owner_id=? and parent_session_id=?', initial.userId!, sessionId);
      if (tombstone) throw new Error('RAW_PARENT_DELETED');
      await tx.runAsync(
        'insert or ignore into raw_capture_links(owner_id,archive_id,parent_session_id,phase,attempt_id,parent_local_id) values(?,?,?,?,?,?)',
        initial.userId!, id, sessionId, phase, attemptId, parentLocalId); valid();
      if (parentLocalId) await bindParent(tx, initial.userId!, id, parentLocalId);
      valid();
    });
    valid(); const lease = await repo.open(id); valid();
    const latest = await transaction(tx => tx.getFirstAsync<{ measured_at: number }>(
      "select measured_at from raw_capture_measurements where owner_id=? and session_id=? and json_extract(payload_json,'$.timing')='live' order by arrival_id desc limit 1", initial.userId!, id));
    valid(); if (!closed && failed === 0) state = 'recording';
    return { repo, lease, lastLiveMeasurementMs: latest?.measured_at ?? null };
  })();
  // Prevent unhandled initialization rejection if no GPS callback ever arrives.
  void ready.catch(e => { state = 'failed'; error = e instanceof Error ? e.message : 'RAW_OPEN_FAILED'; });
  const handle = {
    ready: async () => { const result = await ready; valid(); return { lastLiveMeasurementMs: result.lastLiveMeasurementMs }; },
    capture(record: GpsCaptureRecord): Promise<boolean> {
      if (closed) return Promise.resolve(false);
      observed++;
      try { valid(); } catch (e) { return Promise.resolve(fail(e)); }
      if (pending >= MAX_PENDING) return Promise.resolve(fail(new Error('RAW_QUEUE_LIMIT')));
      const copy: RawMeasurement = { ...record, source: record.source === 'native' ? 'precision' : record.source };
      pending++;
      const write = tail.then(async () => {
        try { const { repo, lease } = await ready; await parentAvailable(); await repo.append(lease, [copy]); await parentAvailable(); stored++; return true; }
        catch (e) { return fail(e); }
        finally { pending--; }
      });
      tail = write; return write;
    },
    async flush(): Promise<boolean> {
      try { await ready; await tail; if (closing) await closing; valid(); return failed === 0 && pending === 0; }
      catch (e) { state = 'failed'; error = e instanceof Error ? e.message : 'RAW_FLUSH_FAILED'; return false; }
    },
    close(complete = false): Promise<boolean> {
      if (closing) return closing;
      closed = true; state = 'closing';
      closing = (async () => {
        try { await tail; const { repo, lease } = await ready; valid(); await repo.close(lease, complete && failed === 0);
          state = failed > 0 ? 'failed' : complete ? 'complete' : 'interrupted'; return failed === 0; }
        catch (e) {
          if (e instanceof Error && e.message === 'RAW_CAPTURE_INCOMPLETE') {
            try {
              const { repo, lease } = await ready; valid(); await repo.close(lease, false);
              error = e.message; state = 'interrupted'; return false;
            } catch (sealError) { return fail(sealError); }
          }
          return fail(e);
        }
      })();
      void closing.finally(() => { if (openHandles.get(handleKey) === handle) openHandles.delete(handleKey); });
      return closing;
    },
    snapshot: () => ({ state, observed, stored, failed, pending, closed, error }),
  };
  openHandles.set(handleKey, handle);
  return handle;
}

export async function readGpsCapture(sessionId: string, phase: GpsCapturePhase, attemptId = sessionId): Promise<RawMeasurement[]> {
  const initial = gpsCaptureScope(), repo = await accountRepository();
  const id = archiveId(sessionId, phase, attemptId), records: RawMeasurement[] = [];
  const key = parentKey(initial.userId, sessionId, phase), revision = parentEpochs.get(key) ?? 0;
  const valid = () => {
    if (gpsCaptureScope().epoch !== initial.epoch || gpsCaptureScope().userId !== initial.userId) throw new Error('RAW_ACCOUNT_CHANGED');
    if ((parentEpochs.get(key) ?? 0) !== revision) throw new Error('RAW_SESSION_CHANGED');
  };
  const getSession = () => transaction(tx => tx.getFirstAsync<{ generation: number; state: string }>(
    'select generation,state from raw_capture_sessions where owner_id=? and session_id=?', initial.userId!, id));
  const link = await transaction(tx => tx.getFirstAsync<{ parent_local_id: string | null }>(
    'select parent_local_id from raw_capture_links where owner_id=? and archive_id=?', initial.userId!, id));
  let parentLocalId = link?.parent_local_id ?? null;
  const parentAvailable = async () => {
    valid(); const db = await getLocalDb();
    const parent = await db.getFirstAsync<{ local_id: string; deleted_at: string | null }>(
      'select local_id,deleted_at from local_training_sessions where user_id=? and (local_id=? or remote_id=?)', initial.userId!, parentLocalId ?? sessionId, sessionId);
    valid(); if (parent?.deleted_at || (parentLocalId && parent?.local_id !== parentLocalId)) throw new Error('RAW_PARENT_DELETED');
    // A missing unknown parent can be an interrupted first save or a legacy
    // deletion. Preserve originals, but do not expose or guess their association.
    if (!parent) throw new Error('RAW_PARENT_UNRESOLVED');
    if (!parentLocalId) {
      await transaction(async tx => {
        valid();
        await bindParent(tx, initial.userId!, id, parent.local_id);
        valid();
      });
      parentLocalId = parent.local_id;
    }
  };
  const session = await getSession(); valid();
  if (!session || session.state === 'deleted') return [];
  await parentAvailable();
  let after = 0;
  while (true) {
    valid(); const rows = await repo.read(id, after); valid();
    // Never return already-read coordinates after deletion/reopen between pages.
    await parentAvailable();
    const current = await getSession(); valid();
    if (!current || current.state === 'deleted' || current.generation !== session.generation) throw new Error('RAW_SESSION_CHANGED');
    records.push(...rows.map(row => decodeRawMeasurement(row.payload_json)));
    if (rows.length < 256) return records;
    after = rows[rows.length - 1].arrival_id;
  }
}

/** Explicit deletion fences queued callbacks synchronously before awaiting SQLite. */
export async function deleteGpsCaptures(sessionId: string, phase?: GpsCapturePhase, attemptId?: string): Promise<void> {
  const initial = gpsCaptureScope();
  if (!initial.userId) throw new Error('RAW_ACCOUNT_UNAVAILABLE');
  // A legacy discard without a known attempt must not erase previous attempts.
  if (phase && !attemptId) return;
  for (const p of phase ? [phase] : ['lay', 'search'] as const) {
    const key = parentKey(initial.userId, sessionId, p); parentEpochs.set(key, (parentEpochs.get(key) ?? 0) + 1);
  }
  const main = await getLocalDb();
  const parent = await main.getFirstAsync<{ local_id: string; remote_id: string | null }>(
    'select local_id,remote_id from local_training_sessions where user_id=? and (local_id=? or remote_id=?)', initial.userId, sessionId, sessionId);
  const parentIds = Array.from(new Set([sessionId, parent?.local_id, parent?.remote_id].filter((v): v is string => !!v)));
  await transaction(async tx => {
    if (gpsCaptureScope().epoch !== initial.epoch) throw new Error('RAW_ACCOUNT_CHANGED');
    if (phase && attemptId) {
      // Fence even an attempt whose asynchronous link/open has not run yet.
      const id = archiveId(sessionId, phase, attemptId);
      await tx.runAsync("insert into raw_capture_sessions(owner_id,session_id,generation,state) values(?,?,1,'deleted') on conflict(owner_id,session_id) do update set generation=generation+1,state='deleted'", initial.userId!, id);
    }
    for (const parentId of parentIds) if (!phase) await tx.runAsync('insert or ignore into raw_capture_deleted_parents(owner_id,parent_session_id) values(?,?)', initial.userId!, parentId);
    const placeholders = parentIds.map(() => '?').join(',');
    const links = await tx.getAllAsync<{ archive_id: string; parent_session_id: string; parent_local_id: string | null }>(
      `select archive_id,parent_session_id,parent_local_id from raw_capture_links where owner_id=? and (parent_session_id in (${placeholders}) or parent_local_id in (${placeholders}))${phase ? ' and phase=? and attempt_id=?' : ''}`,
      initial.userId!, ...parentIds, ...parentIds, ...(phase ? [phase, attemptId!] : []));
    for (const link of links) {
      // Reads and writers can use either local or remote identity. Invalidate
      // every discovered alias before the first awaited deletion statement.
      for (const alias of [link.parent_session_id, link.parent_local_id]) if (alias) {
        for (const p of phase ? [phase] : ['lay', 'search'] as const) {
          const key = parentKey(initial.userId, alias, p);
          parentEpochs.set(key, (parentEpochs.get(key) ?? 0) + 1);
        }
      }
      if (!phase) {
        for (const alias of [link.parent_session_id, link.parent_local_id]) if (alias) {
          await tx.runAsync('insert or ignore into raw_capture_deleted_parents(owner_id,parent_session_id) values(?,?)', initial.userId!, alias);
        }
      }
      await tx.runAsync("insert into raw_capture_sessions(owner_id,session_id,generation,state) values(?,?,1,'deleted') on conflict(owner_id,session_id) do update set generation=generation+1,state='deleted'", initial.userId!, link.archive_id);
      await tx.runAsync('delete from raw_capture_measurements where owner_id=? and session_id=?', initial.userId!, link.archive_id);
    }
    if (gpsCaptureScope().epoch !== initial.epoch) throw new Error('RAW_ACCOUNT_CHANGED');
  });
}

export type GpsCaptureSnapshot = ReturnType<ReturnType<typeof beginGpsCapture>['snapshot']>;

/** Main DB wipe is independent; failures are returned to the caller for retry. */
export async function wipeGpsCaptures(): Promise<void> {
  for (const key of parentEpochs.keys()) parentEpochs.set(key, (parentEpochs.get(key) ?? 0) + 1);
  await transaction(async tx => {
    await tx.runAsync('delete from raw_capture_measurements');
    await tx.runAsync('delete from raw_capture_sessions');
    await tx.runAsync('delete from raw_capture_links');
    await tx.runAsync('delete from raw_capture_accounts');
    await tx.runAsync('delete from raw_capture_deleted_parents');
    await tx.runAsync('delete from raw_capture_counts');
  });
}

import type { LocalTrainingSession } from '@/features/sync/types/sync';
import { parseTransferReceipt, transferReceiptMatches, type ImportDependencies, type ImportTransaction, type TrackTransferReceipt } from './importPlan';
import { canonicalJson, parseOwnPatch, record, TransferCopyError } from './ownCopy';
import type { OwnPatch, SaveRequest, DeleteRequest } from './cloudContract';
interface State { session_id: string; receipt_id: string; user_id: string; receipt_json: string; revision: number; base_patch_json: string; pending_json: string | null; deleted: number }
interface Pending { action: 'save_own' | 'delete_own'; body: SaveRequest | DeleteRequest }
export interface OwnSyncDependencies extends ImportDependencies {
  call(userId: string, action: string, request: Record<string, unknown>): Promise<Record<string, unknown>>;
  uuid(): string;
}
const locks = new Map<string, Promise<unknown>>();
function fail(code: string): never { throw new TransferCopyError(code); }
function patchFromLocal(local: LocalTrainingSession, base: OwnPatch, receipt: TrackTransferReceipt): OwnPatch {
  const p = record(JSON.parse(local.payload_json ?? '{}'));
  const desired = { ...base, title: local.title, notes: local.notes };
  if (Object.hasOwn(p, 'trackTransferLyingTimeMinutes')) desired.lyingTimeMinutes = p.trackTransferLyingTimeMinutes as number | null;
  if (Object.hasOwn(p, 'trackTransferRating')) desired.rating = p.trackTransferRating as number | null;
  if (p.evaluated_at) { desired.evaluation = { score: p.score as number, legs: (p.legs ?? []) as never, evaluatedAt: p.evaluated_at as string }; }
  if (p.run) desired.run = p.run as never;
  return parseOwnPatch(desired, receipt);
}
function difference(desired: OwnPatch, base: OwnPatch): OwnPatch {
  return Object.fromEntries(Object.entries(desired).filter(([key, value]) => !Object.hasOwn(base, key)
    || canonicalJson(value) !== canonicalJson(base[key as keyof OwnPatch]))) as OwnPatch;
}
/** IDs/revision and pending request live separately from recorder payload_json.
 * A concurrent recorder finalize must not erase an operation awaiting its ACK.
 */
export function createOwnSync(deps: OwnSyncDependencies, userId: string) {
  const initial = deps.currentScope();
  const check = () => { const current = deps.currentScope(); if (!userId || initial.userId !== userId || current.userId !== userId || current.epoch !== initial.epoch) fail('ACCOUNT_CHANGED'); };
  const tx = async <T,>(fn: (db: ImportTransaction) => Promise<T>): Promise<T> => { check(); const r = await deps.exclusive(async db => { check(); const v = await fn(db); check(); return v; }); check(); return r; };
  async function read(db: ImportTransaction, sessionId: string) {
    const local = await db.getFirstAsync<LocalTrainingSession>('select * from local_training_sessions where local_id=?', sessionId); check();
    const state = await db.getFirstAsync<State>('select * from local_track_transfer_sync where session_id=?', sessionId); check();
    if (!local || !state || local.user_id !== userId || state.user_id !== userId) fail('TRANSFER_UNAVAILABLE');
    const receipt = parseTransferReceipt(JSON.parse(state.receipt_json));
    if (receipt.ownSessionId !== sessionId || receipt.receiptId !== state.receipt_id || receipt.recipientUserId !== userId || receipt.recipientDogId !== local.dog_id
      || !transferReceiptMatches(record(JSON.parse(local.payload_json ?? '{}')).trackTransferReceipt, receipt)) fail('TRANSFER_CONFLICT');
    if (!Number.isSafeInteger(state.revision) || state.revision < 1 || state.revision > 10001) fail('STORAGE');
    return { local, state, receipt, base: parseOwnPatch(JSON.parse(state.base_patch_json), receipt) };
  }
  async function locked<T>(sessionId: string, fn: () => Promise<T>) {
    const key = `${userId}:${sessionId}`, previous = locks.get(key) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(() => { check(); return fn(); }); locks.set(key, operation);
    try { return await operation; } finally { if (locks.get(key) === operation) locks.delete(key); }
  }
  async function send(sessionId: string, deleting: boolean) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const pending = await tx(async db => {
        const { local, state, receipt, base } = await read(db, sessionId);
        if (state.deleted) { if (deleting) return null; fail('TRANSFER_COPY_GONE'); }
        if (state.pending_json) {
          const saved = JSON.parse(state.pending_json) as Pending;
          if (!['save_own','delete_own'].includes(saved.action) || saved.body.receiptId !== receipt.receiptId
            || !/^[0-9a-f-]{36}$/i.test(saved.body.operationId) || saved.body.expectedRevision !== state.revision) fail('STORAGE');
          if (saved.action === 'save_own') parseOwnPatch((saved.body as SaveRequest).patch, receipt);
          return saved;
        }
        if (local.deleted_at && !deleting) fail('TRANSFER_COPY_GONE');
        const patch = deleting ? {} : difference(patchFromLocal(local, base, receipt), base);
        if (!deleting && !Object.keys(patch).length) {
          await db.runAsync("update local_training_sessions set sync_status='synced',last_sync_error=null where local_id=?", sessionId); return null;
        }
        const operationId = deps.uuid();
        const next: Pending = deleting ? { action: 'delete_own', body: { receiptId: receipt.receiptId, operationId, expectedRevision: state.revision } }
          : { action: 'save_own', body: { receiptId: receipt.receiptId, operationId, expectedRevision: state.revision, patch } };
        await db.runAsync('update local_track_transfer_sync set pending_json=? where session_id=?', JSON.stringify(next), sessionId);
        if (deleting) {
          const now = new Date().toISOString();
          await db.runAsync("update local_training_sessions set deleted_at=?,sync_status='deleted_pending',updated_at=? where local_id=?", now, now, sessionId);
          await db.runAsync("insert into sync_queue(id,entity_type,entity_local_id,operation,priority,created_at,updated_at,attempts,status) values(?,'training_session',?,'delete',1,?,?,0,'pending')", deps.uuid(), sessionId, now, now);
        }
        return next;
      });
      if (!pending) return;
      check(); let ack: Record<string, unknown>;
      try { ack = await deps.call(userId, pending.action, pending.body as unknown as Record<string, unknown>); }
      catch (error) {
        check(); const reason = (error as { code?: string; message?: string }).code ?? (error as Error).message;
        if (reason === 'TRANSFER_REVISION_CONFLICT' || reason === 'TRANSFER_COPY_GONE') await tx(async db => {
          await db.runAsync("update local_training_sessions set sync_status='conflict',last_sync_error=? where local_id=?", reason, sessionId);
        });
        throw error;
      }
      check();
      const applied = ack.appliedRevision, current = ack.currentRevision;
      if (ack.receiptId !== pending.body.receiptId || ack.operationId !== pending.body.operationId || applied !== pending.body.expectedRevision + 1
        || typeof current !== 'number' || !Number.isSafeInteger(current) || current < (applied as number) || current > 10001 || typeof ack.deleted !== 'boolean'
        || (pending.action === 'delete_own' && !ack.deleted)) fail('INVALID_RESPONSE');
      const advancedElsewhere = current !== applied || (ack.deleted && pending.action !== 'delete_own');
      await tx(async db => {
        const { state, base } = await read(db, sessionId);
        if (canonicalJson(JSON.parse(state.pending_json ?? 'null')) !== canonicalJson(pending)) fail('TRANSFER_CONFLICT');
        const nextBase = pending.action === 'save_own' ? { ...base, ...(pending.body as SaveRequest).patch } : base;
        await db.runAsync('update local_track_transfer_sync set revision=?,base_patch_json=?,pending_json=null,deleted=? where session_id=?', applied as number, JSON.stringify(nextBase), ack.deleted ? 1 : 0, sessionId);
        if (ack.deleted) await db.runAsync("update local_training_sessions set deleted_at=?,sync_status='synced' where local_id=?", new Date().toISOString(), sessionId);
        else if (advancedElsewhere) await db.runAsync("update local_training_sessions set sync_status='conflict',last_sync_error='TRANSFER_REVISION_CONFLICT' where local_id=?", sessionId);
      });
      if (advancedElsewhere) fail('TRANSFER_REVISION_CONFLICT');
      if (pending.action === 'delete_own') return;
      // If local work changed while the ACK was pending, reserve a NEW operation
      // against the newly confirmed revision. Never mutate the old request body.
    }
    fail('BUSY');
  }
  return {
    sync: (sessionId: string, deleting = false) => locked(sessionId, () => send(sessionId, deleting)),
    edit: (sessionId: string, input: unknown) => locked(sessionId, async () => {
      await tx(async db => {
        const { local, state, receipt } = await read(db, sessionId); if (state.deleted || local.deleted_at) fail('TRANSFER_COPY_GONE');
        if (state.pending_json && JSON.parse(state.pending_json).action === 'delete_own') fail('TRANSFER_CONFLICT');
        const patch = parseOwnPatch(input, receipt);
        // json_set merges into the latest recorder payload inside this exclusive transaction.
        const p = record(JSON.parse(local.payload_json ?? '{}'));
        if (patch.evaluation) Object.assign(p, { legs: patch.evaluation.legs, score: patch.evaluation.score, evaluated_at: patch.evaluation.evaluatedAt });
        if (patch.run) p.run = patch.run;
        if (Object.hasOwn(patch, 'lyingTimeMinutes')) p.trackTransferLyingTimeMinutes = patch.lyingTimeMinutes;
        if (Object.hasOwn(patch, 'rating')) p.trackTransferRating = patch.rating;
        await db.runAsync("update local_training_sessions set title=?,notes=?,score=?,payload_json=?,sync_status='pending',updated_at=? where local_id=?",
          Object.hasOwn(patch, 'title') ? patch.title! : local.title, Object.hasOwn(patch, 'notes') ? patch.notes! : local.notes,
          patch.evaluation?.score ?? local.score, JSON.stringify(p), new Date().toISOString(), sessionId);
        const now = new Date().toISOString();
        await db.runAsync("insert into sync_queue(id,entity_type,entity_local_id,operation,priority,created_at,updated_at,attempts,status) values(?,'training_session',?,'create',1,?,?,0,'pending')", deps.uuid(), sessionId, now, now);
      });
      await send(sessionId, false);
    }),
  };
}

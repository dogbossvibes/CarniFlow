import { createTrackTransferImportPlan, parseTransferReceipt, transferReceiptMatches, TransferImportError, type ImportDependencies, type ImportStatement } from './importPlan';
import { canonicalJson, parseOwnCopy } from './ownCopy';
import type { OwnCopy, OwnPatch } from './cloudContract';
import type { TrackTransferReference } from './reference';
export function copyPatch(copy: OwnCopy<TrackTransferReference>): OwnPatch {
  return { ...copy.metadata, ...(copy.evaluation ? { evaluation: copy.evaluation } : {}), ...(copy.run ? { run: copy.run } : {}) };
}
function rewrite(statement: ImportStatement, changes: Record<string, string | number | null>): ImportStatement {
  const names = statement.sql.slice(statement.sql.indexOf('(') + 1, statement.sql.indexOf(')')).split(',');
  return { sql: statement.sql, params: statement.params.map((v, i) => Object.hasOwn(changes, names[i]) ? changes[names[i]] : v) };
}
export function createOwnCopyImportPlan(receiptValue: unknown, copyValue: unknown) {
  const receipt = parseTransferReceipt(receiptValue), copy = parseOwnCopy(copyValue, receipt);
  const plan = createTrackTransferImportPlan(receipt, copy.reference), now = new Date(copy.createdAtMs).toISOString();
  const parent = plan.statements[0], names = parent.sql.slice(parent.sql.indexOf('(') + 1, parent.sql.indexOf(')')).split(',');
  const payload = JSON.parse(parent.params[names.indexOf('payload_json')] as string);
  Object.assign(payload, { trackTransferCloudRevision: copy.revision,
    trackTransferLyingTimeMinutes: copy.metadata.lyingTimeMinutes, trackTransferRating: copy.metadata.rating,
    ...(copy.run ? { run: copy.run } : {}), ...(copy.evaluation ? { legs: copy.evaluation.legs, score: copy.evaluation.score, evaluated_at: copy.evaluation.evaluatedAt } : {}) });
  const statements = [rewrite(parent, { remote_id: receipt.ownSessionId, title: copy.metadata.title, notes: copy.metadata.notes,
    score: copy.evaluation?.score ?? copy.metadata.rating, sync_status: 'synced', last_synced_at: now, created_at: now, updated_at: now,
    payload_json: JSON.stringify(payload) }),
  ...plan.statements.slice(1, 1 + copy.reference.points.length).map((s, i) => rewrite(s, { remote_id: copy.pointIds[i], session_remote_id: receipt.ownSessionId, sync_status: 'synced' })),
  ...plan.statements.slice(1 + copy.reference.points.length, -1).map((s, i) => rewrite(s, { remote_id: copy.markerIds[i], session_remote_id: receipt.ownSessionId, sync_status: 'synced' }))];
  statements.push({ sql: 'insert into local_track_transfer_sync(session_id,receipt_id,user_id,receipt_json,revision,base_patch_json,pending_json,deleted) values(?,?,?,?,?,?,null,0)',
    params: [receipt.ownSessionId, receipt.receiptId, receipt.recipientUserId, JSON.stringify(receipt), copy.revision, JSON.stringify(copyPatch(copy))] });
  // Server already committed parent, lay and markers atomically. NEVER enqueue ordinary create.
  return { receipt, copy, statements };
}
/** Hydrates only an absent local copy. Existing dirty/current copies always remain intact. */
export async function importOwnCopy(deps: ImportDependencies, userId: string, receiptValue: unknown, copyValue: unknown) {
  const plan = createOwnCopyImportPlan(receiptValue, copyValue), initial = deps.currentScope();
  const check = () => { const current = deps.currentScope();
    if (initial.userId !== userId || current.userId !== userId || current.epoch !== initial.epoch || plan.receipt.recipientUserId !== userId) throw new TransferImportError('ACCOUNT_CHANGED');
  };
  check(); const result = await deps.exclusive(async db => {
    check(); const stored = await db.getFirstAsync<{ user_id: string; dog_id: string; deleted_at: string | null; payload_json: string | null; sync_status: string }>(
      'select user_id,dog_id,deleted_at,payload_json,sync_status from local_training_sessions where local_id=?', plan.receipt.ownSessionId); check();
    if (stored) {
      let payload: Record<string, any>; try { payload = JSON.parse(stored.payload_json ?? '{}'); } catch { throw new TransferImportError('IMPORT_CONFLICT'); }
      if (stored.user_id !== userId || stored.dog_id !== plan.receipt.recipientDogId || stored.deleted_at || !transferReceiptMatches(payload?.trackTransferReceipt, plan.receipt)) throw new TransferImportError('IMPORT_CONFLICT');
      // No cloud snapshot, even a newer one, may silently overwrite local work or pending RPC state.
      const state = await db.getFirstAsync<{ user_id: string; receipt_json: string; revision: number; base_patch_json: string; pending_json: string | null; deleted: number }>(
        'select * from local_track_transfer_sync where session_id=?', plan.receipt.ownSessionId); check();
      if (!state || state.user_id !== userId || !transferReceiptMatches(JSON.parse(state.receipt_json), plan.receipt)
        || stored.sync_status !== 'synced' || state.pending_json || state.deleted || state.revision !== plan.copy.revision
        || canonicalJson(JSON.parse(state.base_patch_json)) !== canonicalJson(copyPatch(plan.copy))) throw new TransferImportError('IMPORT_CONFLICT');
      return { sessionId: plan.receipt.ownSessionId, runId: plan.receipt.ownRunId, dogId: plan.receipt.recipientDogId, created: false };
    }
    for (const s of plan.statements) { check(); await db.runAsync(s.sql, ...s.params); }
    check(); return { sessionId: plan.receipt.ownSessionId, runId: plan.receipt.ownRunId, dogId: plan.receipt.recipientDogId, created: true };
  }); check(); return result;
}

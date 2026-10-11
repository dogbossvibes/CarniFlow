import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { getLocalDb } from '@/lib/localDb/client';
import type { LocalTrainingSession } from '@/features/sync/types/sync';
import { createSupabaseTransferClient } from './rpc';
import { createTransferLocalStore } from './localStore';
import { createOwnSync } from './ownSync';
import { importOwnCopy } from './ownImport';
import { parseTransferReceipt, transferReceiptMatches } from './importPlan';
import { TransferCopyError, record } from './ownCopy';
import { isTransferTrainingSession } from './syncGuard';
import type { OwnPatch } from './cloudContract';
function code(error: unknown) { const e = error as { code?: string; message?: string }; const c = e?.code ?? e?.message;
  return c && /^(TRANSFER_[A-Z_]+|ACCOUNT_CHANGED|STORAGE|INVALID_RESPONSE|IMPORT_CONFLICT|BUSY)$/.test(c) ? c : 'CONNECTION'; }
async function context<T>(action: (scope: { userId: string; client: ReturnType<typeof createSupabaseTransferClient>; local: ReturnType<typeof createTransferLocalStore>; sync: ReturnType<typeof createOwnSync> }) => Promise<T>): Promise<T> {
  const client = createSupabaseTransferClient(), epoch = client.epoch();
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session || client.epoch() !== epoch) throw new TransferCopyError('ACCOUNT_CHANGED');
    const userId = data.session.user.id, local = createTransferLocalStore(() => ({ userId, epoch: client.epoch() }), () => false);
    const sync = createOwnSync({ ...local, call: client.call, uuid: () => Crypto.randomUUID() }, userId);
    return await action({ userId, client, local, sync });
  } finally { client.dispose(); }
}
export async function syncOwnTransfer(localRow: LocalTrainingSession, deleting = false): Promise<{ ok: boolean; error?: string; reason?: 'transfer_conflict' } | null> {
  if (!isTransferTrainingSession(localRow)) return null;
  try { await context(async ({ userId, sync }) => {
    if (localRow.user_id !== userId) throw new TransferCopyError('ACCOUNT_CHANGED');
    await sync.sync(localRow.local_id, deleting);
  }); return { ok: true }; }
  catch (e) { const error = code(e); return { ok: false, error, ...(['TRANSFER_REVISION_CONFLICT','TRANSFER_COPY_GONE'].includes(error) ? { reason: 'transfer_conflict' as const } : {}) }; }
}
/** Read path on a new device: same current-copy restoration as mutations, without edits. */
export async function ensureOwnTransferLocal(sessionId: string): Promise<{ handled: boolean; error: string | null }> {
  return mutateOwnTransfer(sessionId, 'restore');
}
/** Used by existing direct detail/lying/delete actions. No ordinary write fallback
 * after finding a transfer binding or after a failed transfer mutation.
 */
export async function mutateOwnTransfer(sessionId: string, patch: OwnPatch | 'delete' | 'restore'): Promise<{ handled: boolean; error: string | null }> {
  try { return await context(async ({ userId, client, local, sync }) => {
    const db = await getLocalDb().catch(() => null);
    const row = db ? await db.getFirstAsync<LocalTrainingSession>('select * from local_training_sessions where local_id=?', sessionId) : null;
    let receiptValue: unknown = row && isTransferTrainingSession(row) ? record(JSON.parse(row.payload_json ?? '{}')).trackTransferReceipt : null;
    if (receiptValue === null) {
      const result = await supabase.from('training_sessions').select('owner_id,dog_id,track_data').eq('id', sessionId).maybeSingle();
      if (result.error) throw new TransferCopyError('CONNECTION');
      const data = result.data as { owner_id?: string; dog_id?: string; track_data?: Record<string, unknown> } | null;
      if (!data?.track_data || !Object.hasOwn(data.track_data, 'trackTransferReceipt')) return { handled: false, error: null };
      if (data.owner_id !== userId) throw new TransferCopyError('ACCOUNT_CHANGED');
      receiptValue = data.track_data.trackTransferReceipt;
    }
    const receipt = parseTransferReceipt(receiptValue);
    if (receipt.recipientUserId !== userId || receipt.ownSessionId !== sessionId || (row && (row.dog_id !== receipt.recipientDogId || row.user_id !== userId))) throw new TransferCopyError('ACCOUNT_CHANGED');
    if (!row) {
      const response = await client.call(userId, 'restore', { receiptId: receipt.receiptId });
      const actual = parseTransferReceipt(response.receipt);
      if (!transferReceiptMatches(actual, receipt)) throw new TransferCopyError('INVALID_RESPONSE');
      await importOwnCopy(local, userId, actual, response.ownCopy);
    }
    if (patch === 'delete') await sync.sync(sessionId, true); else if (patch !== 'restore') await sync.edit(sessionId, patch);
    return { handled: true, error: null };
  }); } catch (e) { return { handled: true, error: code(e) }; }
}

/** Transfer copies must use the revision-checked transfer API for all writes.
 * Ordinary recordings keep the existing sync path. Treat malformed receipts as
 * transfer-bound too; a corrupt receipt must not enable an unguarded write.
 */
export function isTransferTrainingSession(local: { payload_json?: string | null } | null): boolean {
  let payload: unknown;
  try { payload = local?.payload_json ? JSON.parse(local.payload_json) : null; }
  catch { return false; } // Existing handling for unrelated corrupt legacy payloads.
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'trackTransferReceipt')) {
    return true;
  }
  return false;
}

export function assertOrdinaryTrainingSyncAllowed(local: { payload_json?: string | null } | null): void {
  if (isTransferTrainingSession(local)) throw new Error('TRANSFER_SYNC_REQUIRES_ATOMIC_API');
}

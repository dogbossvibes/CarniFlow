import { assertSupportedTransfer } from './androidGapSafety';
import type { TrackTransferReceipt } from './importPlan';
import { TransferImportError } from './importPlan';
import { transferRunId } from './recovery';
export interface TransferRunIdentity {
  transferReceipt?: TrackTransferReceipt | null;
  sessionId: string | null;
  dogId?: string | null;
  runId?: string | null;
  trackPoints?: readonly unknown[];
  searchPoints?: readonly unknown[];
}
/** A native dialog retains its original token, even across A -> B -> A.
 * Ordinary sessions deliberately keep their existing recording behaviour.
 */
export function createTransferRunScope(initialUserId: string | null) {
  let userId = initialUserId, epoch = 0, mounted = true;
  return {
    token: () => epoch,
    mount() { mounted = true; },
    dispose() { mounted = false; epoch++; },
    setUser(next: string | null, identityEvent = false) { if (identityEvent || next !== userId) epoch++; userId = next; },
    assert(token: number, value: TransferRunIdentity | null | undefined, expectedSessionId?: string | null, expectedDogId?: string | null) {
      if (value?.transferReceipt == null) return null;
      if (!mounted || token !== epoch || !userId) throw new TransferImportError('ACCOUNT_CHANGED');
      const runId = transferRunId(value.transferReceipt, userId, value.sessionId, value.dogId);
      if ((expectedSessionId != null && expectedSessionId !== value.sessionId)
        || (expectedDogId != null && expectedDogId !== value.dogId)
        || (value.runId != null && value.runId !== runId)) throw new TransferImportError('IMPORT_CONFLICT');
      assertSupportedTransfer(value);
      return runId;
    },
  };
}

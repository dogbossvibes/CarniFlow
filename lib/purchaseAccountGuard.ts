export type PurchaseAccountErrorCode = 'IAP_ACCOUNT_CHANGED' | 'IAP_ACCOUNT_NOT_READY';
export class PurchaseAccountError extends Error {
  constructor(readonly code: PurchaseAccountErrorCode) { super(code); }
}
export interface PurchaseAccountAdapter {
  confirmAccount(expectedUserId: string): Promise<boolean>;
  prepareIdentity(expectedUserId: string): Promise<boolean>;
}

/** Identity preparation and native Store work share a single queue.
 * Auth notifications invalidate queued/in-flight callers synchronously; SDK
 * identity changes themselves must be performed only through this queue.
 */
export function createPurchaseAccountGuard(adapter: PurchaseAccountAdapter) {
  let account: string | null = null;
  let generation = 0;
  let tail: Promise<void> = Promise.resolve();
  const accountChanged = (userId: string | null) => {
    if (account === userId) return;
    account = userId;
    generation++;
  };
  const assertCurrent = (expected: string, epoch: number) => {
    if (!expected || account !== expected || generation !== epoch) {
      throw new PurchaseAccountError('IAP_ACCOUNT_CHANGED');
    }
  };
  const confirm = async (expected: string, epoch: number) => {
    assertCurrent(expected, epoch);
    if (!await adapter.confirmAccount(expected)) {
      throw new PurchaseAccountError('IAP_ACCOUNT_CHANGED');
    }
    assertCurrent(expected, epoch);
  };
  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const result = tail.then(work);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  const run = <T>(expected: string, operation: () => Promise<T>): Promise<T> => {
    const epoch = generation;
    return enqueue(async () => {
      await confirm(expected, epoch);
      assertCurrent(expected, epoch);
      if (!await adapter.prepareIdentity(expected)) {
        throw new PurchaseAccountError('IAP_ACCOUNT_NOT_READY');
      }
      await confirm(expected, epoch);
      assertCurrent(expected, epoch);
      // No await between the last synchronous fence and starting Store work.
      const value = await operation();
      await confirm(expected, epoch);
      assertCurrent(expected, epoch);
      return value;
    });
  };
  return { accountChanged, run, prepare: (expected: string) => run(expected, async () => true) };
}

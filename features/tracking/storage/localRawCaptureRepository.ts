import { getLocalDb } from '@/lib/localDb/client';
import { activateRawCapture, type RawCaptureDeps, type RawCaptureTx } from './rawCaptureRepository';
/** Not activated by recorder yet. Capacity and authenticated scope are mandatory. */
export function activateLocalRawCapture(owner: string, scope: RawCaptureDeps['scope'], maxRecordsPerOwner: number) {
  return activateRawCapture(owner, { scope, maxRecordsPerOwner,
    async transaction<T>(fn: (tx: RawCaptureTx) => Promise<T>): Promise<T> {
      const db = await getLocalDb(); let result!: T;
      await db.withExclusiveTransactionAsync(async tx => { result = await fn(tx); });
      return result;
    },
  });
}

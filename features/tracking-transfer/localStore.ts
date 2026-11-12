import { getLocalDb } from '@/lib/localDb/client';
import type { ImportDependencies, ImportTransaction } from './importPlan';
import type { SourceDependencies, SourceReader } from './source';

/** Separate transaction connection: unrelated recorder writes must never join an import transaction. */
export function createTransferLocalStore(
  currentScope: ImportDependencies['currentScope'], sourceIsRecording: SourceDependencies['sourceIsRecording'],
): ImportDependencies & SourceDependencies {
  async function isolated<T>(action: (transaction: ImportTransaction & SourceReader) => Promise<T>): Promise<T> {
    const db = await getLocalDb();
    if (typeof db.withExclusiveTransactionAsync !== 'function') throw new Error('TRANSFER_STORAGE_UNAVAILABLE');
    let result!: T;
    await db.withExclusiveTransactionAsync(async transaction => { result = await action(transaction); });
    return result;
  }
  return { currentScope, sourceIsRecording, exclusive: isolated, snapshot: isolated };
}

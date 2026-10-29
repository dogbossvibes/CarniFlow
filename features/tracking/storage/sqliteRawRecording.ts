import type { activateRawCapture } from './rawCaptureRepository';
import type { RawMeasurement } from './rawMeasurementJournal';

type Repository = Awaited<ReturnType<typeof activateRawCapture>>;
export type SqliteRawRecordingState = 'recording' | 'closing' | 'complete' | 'interrupted' | 'failed';

/** Isolated lifecycle adapter; not enabled in the product recorder yet.
 * Callers must use the exact authenticated session and actual delivery source.
 * Writes are serialized and bounded; errors never turn a partial archive complete.
 * No deletion, retry, filtering, upload or geometry reconstruction is performed.
 */
export async function openSqliteRawRecording(repo: Repository, sessionId: string, maxPending = 128) {
  if (!Number.isSafeInteger(maxPending) || maxPending < 1) throw new Error('RAW_INVALID_QUEUE_LIMIT');
  const lease = await repo.open(sessionId);
  let state: SqliteRawRecordingState = 'recording';
  let tail = Promise.resolve();
  let pending = 0, observed = 0, stored = 0, rejected = 0;
  let failed = false;
  let finalization: Promise<boolean> | undefined;
  return {
    snapshot: () => ({ state, observed, stored, rejected, pending }),
    capture(record: RawMeasurement): Promise<boolean> {
      if (state !== 'recording') return Promise.resolve(false);
      observed++;
      if (pending >= maxPending) {
        failed = true; rejected++;
        return Promise.resolve(false);
      }
      // Copy before queuing, since a caller may reuse/mutate its location object.
      const { measuredAtMs, receivedAtMs, latitude, longitude, accuracy, altitude, speed, heading, source, delivery } = record;
      const copy = { measuredAtMs, receivedAtMs, latitude, longitude, accuracy, altitude, speed, heading, source, delivery };
      pending++;
      const write = tail.then(async () => {
        try { await repo.append(lease, [copy]); stored++; return true; }
        catch { failed = true; rejected++; return false; }
        finally { pending--; }
      });
      tail = write.then(() => undefined);
      return write;
    },
    finish(complete = true): Promise<boolean> {
      if (finalization) return finalization;
      state = 'closing'; // Fence late callbacks synchronously, before draining.
      finalization = tail.then(async () => {
        const canComplete = complete && !failed;
        try {
          await repo.close(lease, canComplete);
          state = canComplete ? 'complete' : 'interrupted';
          return canComplete;
        } catch {
          // Recovery/lease guards can reject completeness. Preserve stored rows.
          try { await repo.close(lease, false); state = 'interrupted'; }
          catch { state = 'failed'; }
          return false;
        }
      });
      return finalization;
    },
  };
}

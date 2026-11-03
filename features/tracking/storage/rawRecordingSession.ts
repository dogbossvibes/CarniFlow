import { createRawMeasurementJournal, type JournalStorage, type RawMeasurement } from './rawMeasurementJournal';

export type RawRecordingStatus = 'recording' | 'interrupted' | 'finalizing' | 'complete' | 'failed' | 'deleted';

/** Local lifecycle adapter. Not a recorder or source of rendered geometry.
 * A factory belongs to one authenticated account lifecycle. Revoke it before
 * account switching. Callers supply the actual source on every observation.
 * Multiple factories/processes are NOT mutually fenced. Production activation
 * requires durable database generations/tombstones; in-memory guards are insufficient.
 * No raw data upload, inferred points, filtering or automatic retry occurs.
 */
export function createRawRecordingSessions(storage: JournalStorage, ownerId: string) {
  let revoked = false;
  const sessions = new Map<string, ReturnType<typeof makeSession>>();
  function makeSession(sessionId: string) {
    const journal = createRawMeasurementJournal(storage, ownerId, sessionId);
    let status: RawRecordingStatus = 'recording';
    let pending: Promise<void> = Promise.resolve();
    let finalization: Promise<boolean> | undefined;
    let deletion: Promise<void> | undefined;
    let failed = false;
    const isAllowed = () => !revoked && status === 'recording' && !failed;
    const isDeleted = () => status === 'deleted';
    return {
      status: () => status,
      capture(record: RawMeasurement): Promise<boolean> {
        if (!isAllowed()) return Promise.resolve(false);
        // append snapshots synchronously, before the caller can reuse the input.
        const write = journal.append(record).then(() => true, () => {
          failed = true;
          if (!isDeleted()) status = 'failed';
          return false;
        });
        pending = Promise.all([pending, write]).then(() => undefined);
        return write;
      },
      interrupt() {
        if (status === 'recording') status = 'interrupted';
        return pending;
      },
      drain() {
        return Promise.all([pending, finalization, deletion]).then(() => undefined);
      },
      resume() {
        if (revoked || failed || status !== 'interrupted') return false;
        status = 'recording';
        return true;
      },
      finish(): Promise<boolean> {
        if (revoked || failed || status === 'deleted') return Promise.resolve(false);
        if (finalization) return finalization;
        status = 'finalizing';
        finalization = pending.then(async () => {
          if (revoked || failed || status === 'deleted') return false;
          try {
            await journal.finish();
            if (isDeleted() || revoked) return false;
            status = 'complete';
            return true;
          } catch {
            failed = true;
            if (!isDeleted()) status = 'failed';
            return false;
          }
        });
        return finalization;
      },
      read() {
        if (revoked || status === 'deleted') return Promise.reject(new Error('Raw recording access closed'));
        const read = journal.read().then(snapshot => {
          // An account switch during the read must not deliver the old account's data.
          if (revoked || status === 'deleted') throw new Error('Raw recording access closed');
          return snapshot;
        });
        pending = Promise.all([pending, read.catch(() => undefined)]).then(() => undefined);
        return read;
      },
      remove(): Promise<void> {
        status = 'deleted'; // Close every existing callback before waiting for storage.
        deletion ??= Promise.all([pending, finalization]).then(() => journal.remove()).catch(error => {
          deletion = undefined; // Explicit retry allowed; stale handles remain closed.
          throw error;
        });
        return deletion;
      },
    };
  }
  return {
    open(sessionId: string) {
      if (revoked) throw new Error('Raw recording account closed');
      let session = sessions.get(sessionId);
      if (!session) { session = makeSession(sessionId); sessions.set(sessionId, session); }
      return session;
    },
    async revoke() {
      revoked = true;
      // Logout closes access but does not silently erase recoverable measurements.
      await Promise.all([...sessions.values()].map(session => {
        void session.interrupt();
        return session.drain();
      }));
    },
  };
}

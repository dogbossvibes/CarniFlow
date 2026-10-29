import type { RawMeasurement } from './rawMeasurementJournal';
export interface RawCaptureTx {
  getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]>;
  runAsync(sql: string, ...params: (string | number)[]): Promise<{ changes: number }>;
}
export interface RawCaptureDeps {
  scope(): { userId: string | null; epoch: number };
  transaction<T>(fn: (tx: RawCaptureTx) => Promise<T>): Promise<T>;
  /** Explicit retention budget; exhaustion is an error, never silent eviction. */
  maxRecordsPerOwner: number;
}
export interface RawCaptureLease { sessionId: string; generation: number }

/** Call once for a new authenticated account lifecycle. A new activation fences
 * old callbacks durably, including callbacks from another repository/process.
 * Only use with exclusive transactions, not Expo's ambient transaction API.
 */
export async function activateRawCapture(owner: string, deps: RawCaptureDeps) {
  const initial = deps.scope();
  const scope = () => {
    const current = deps.scope();
    if (!owner || initial.userId !== owner || current.userId !== owner || initial.epoch !== current.epoch) throw new Error('RAW_ACCOUNT_CHANGED');
  };
  if (!Number.isSafeInteger(deps.maxRecordsPerOwner) || deps.maxRecordsPerOwner < 1) throw new Error('RAW_INVALID_LIMIT');
  scope();
  const accountGeneration = await deps.transaction(async tx => {
    scope();
    await tx.runAsync('insert into raw_capture_accounts(owner_id,generation,active) values(?,1,1) on conflict(owner_id) do update set generation=generation+1,active=1', owner);
    const row = await tx.getFirstAsync<{ generation: number }>('select generation from raw_capture_accounts where owner_id=?', owner);
    scope(); if (!row) throw new Error('RAW_ACCOUNT_MISSING'); return row.generation;
  });
  scope(); // Native commit can finish after an account switch.
  const account = async (tx: RawCaptureTx) => {
    scope();
    const row = await tx.getFirstAsync<{ generation: number; active: number }>('select generation,active from raw_capture_accounts where owner_id=?', owner);
    if (!row?.active || row.generation !== accountGeneration) throw new Error('RAW_ACCOUNT_REVOKED');
    scope();
  };
  const operation = async <T>(fn: (tx: RawCaptureTx) => Promise<T>): Promise<T> => {
    const result = await deps.transaction(async tx => {
      await account(tx); const value = await fn(tx); scope(); return value;
    });
    scope(); // Never deliver old-account results after asynchronous native COMMIT.
    return result;
  };
  // An uncertain/rejected observation can never become a complete archive.
  // Reopened sessions remain incomplete even across a new repository/process.
  const incomplete = new Set<string>();
  const pending = new Map<string, number>();
  const key = (lease: RawCaptureLease) => JSON.stringify([lease.sessionId, lease.generation]);
  const requireLease = async (tx: RawCaptureTx, lease: RawCaptureLease) => {
    const row = await tx.getFirstAsync<{ generation: number; state: string }>('select generation,state from raw_capture_sessions where owner_id=? and session_id=?', owner, lease.sessionId);
    if (!row || row.generation !== lease.generation || row.state !== 'open') throw new Error('RAW_SESSION_CLOSED');
  };
  return {
    open(sessionId: string): Promise<RawCaptureLease> {
      if (!sessionId || sessionId.length > 128) return Promise.reject(new Error('RAW_INVALID_ID'));
      return operation(async tx => {
        const previous = await tx.getFirstAsync<{ generation: number; state: string }>('select generation,state from raw_capture_sessions where owner_id=? and session_id=?', owner, sessionId);
        if (previous && !['open', 'interrupted'].includes(previous.state)) throw new Error('RAW_SESSION_CLOSED');
        const generation = (previous?.generation ?? 0) + 1;
        await tx.runAsync("insert into raw_capture_sessions(owner_id,session_id,generation,state) values(?,?,?,'open') on conflict(owner_id,session_id) do update set generation=excluded.generation,state='open'", owner, sessionId, generation);
        const lease = { sessionId, generation };
        if (previous) incomplete.add(key(lease));
        return lease;
      });
    },
    append(lease: RawCaptureLease, values: readonly RawMeasurement[]) {
      lease = { ...lease };
      const id = key(lease);
      const reject = (message: string) => { incomplete.add(id); return Promise.reject(new Error(message)); };
      if (values.length > 256) return reject('RAW_BATCH_LIMIT');
      // Snapshot only documented fields before asynchronous database work.
      const records = values.map(({ measuredAtMs, receivedAtMs, latitude, longitude, accuracy, altitude, speed, heading, source, delivery }) =>
        ({ measuredAtMs, receivedAtMs, latitude, longitude, accuracy, altitude, speed, heading, source, delivery }));
      if (records.some(r => ![r.measuredAtMs, r.receivedAtMs, r.latitude, r.longitude].every(Number.isFinite)
        || [r.accuracy, r.altitude, r.speed, r.heading].some(v => v !== null && !Number.isFinite(v))
        || !['expo', 'precision'].includes(r.source) || !['foreground', 'background'].includes(r.delivery))) return reject('RAW_INVALID_MEASUREMENT');
      pending.set(id, (pending.get(id) ?? 0) + 1);
      return operation(async tx => {
        await requireLease(tx, lease);
        const count = await tx.getFirstAsync<{ n: number }>('select count(*) n from raw_capture_measurements where owner_id=?', owner);
        if (!count || count.n + records.length > deps.maxRecordsPerOwner) throw new Error('RAW_STORAGE_LIMIT');
        for (const r of records) await tx.runAsync('insert into raw_capture_measurements(owner_id,session_id,generation,measured_at,received_at,payload_json) values(?,?,?,?,?,?)', owner, lease.sessionId, lease.generation, r.measuredAtMs, r.receivedAtMs, JSON.stringify(r));
      }).catch(error => { incomplete.add(id); throw error; })
        .finally(() => { const remaining = (pending.get(id) ?? 1) - 1; if (remaining) pending.set(id, remaining); else pending.delete(id); });
    },
    close(lease: RawCaptureLease, complete: boolean) {
      lease = { ...lease };
      const canClose = () => {
        if (pending.get(key(lease))) throw new Error('RAW_CAPTURE_WRITES_PENDING');
        if (complete && incomplete.has(key(lease))) throw new Error('RAW_CAPTURE_INCOMPLETE');
      };
      return operation(async tx => {
        await requireLease(tx, lease);
        canClose();
        await tx.runAsync('update raw_capture_sessions set state=? where owner_id=? and session_id=?', complete ? 'complete' : 'interrupted', owner, lease.sessionId);
      });
    },
    remove(sessionId: string) {
      return operation(async tx => {
        // Tombstone even absent sessions so a delayed open cannot recreate them.
        await tx.runAsync("insert into raw_capture_sessions(owner_id,session_id,generation,state) values(?,?,1,'deleted') on conflict(owner_id,session_id) do update set generation=generation+1,state='deleted'", owner, sessionId);
        await tx.runAsync('delete from raw_capture_measurements where owner_id=? and session_id=?', owner, sessionId);
      });
    },
    read(sessionId: string, afterArrivalId = 0) {
      if (!Number.isSafeInteger(afterArrivalId) || afterArrivalId < 0) return Promise.reject(new Error('RAW_INVALID_CURSOR'));
      return operation(async tx => tx.getAllAsync<{ arrival_id: number; payload_json: string }>('select arrival_id,payload_json from raw_capture_measurements where owner_id=? and session_id=? and arrival_id>? order by arrival_id limit 256', owner, sessionId, afterArrivalId));
    },
    revoke() {
      // May run after JS auth state changed, but cannot revoke a newer login.
      return deps.transaction(async tx => {
        await tx.runAsync('update raw_capture_accounts set active=0,generation=generation+1 where owner_id=? and generation=?', owner, accountGeneration);
      });
    },
  };
}

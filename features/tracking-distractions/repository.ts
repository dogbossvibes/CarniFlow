import { getLocalDb } from '@/lib/localDb/client';
import { DistractionError, DISTRACTION_LIMITS, parseDistractionTrack, type DistractionTrack } from './model';

export interface StoredDistraction { track: DistractionTrack; revision: number }
interface Tx {
 getFirstAsync<T>(sql: string, ...params: (string | number)[]): Promise<T | null>;
 getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]>;
 runAsync(sql: string, ...params: (string | number)[]): Promise<{ changes: number }>;
}
interface Deps { scope(): { userId: string | null; epoch: number }; transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> }
/** Independent records only. No updates to training, points, runs, quota or sync_queue. */
export function createDistractionRepository(ownerId: string, deps: Deps) {
 const scope = deps.scope();
 const check = () => { const current = deps.scope(); if (!ownerId || scope.userId !== ownerId || current.userId !== ownerId || scope.epoch !== current.epoch) throw new DistractionError('ACCOUNT_CHANGED'); };
 const parent = async (tx: Tx, id: string) => {
  check(); const row = await tx.getFirstAsync<{ local_id: string; user_id: string; type: string; deleted_at: string | null }>(
   'select local_id,user_id,type,deleted_at from local_training_sessions where local_id=? and user_id=? and deleted_at is null', id, ownerId);
  check(); if (!row || row.local_id !== id || row.user_id !== ownerId || row.type !== 'track' || row.deleted_at) throw new DistractionError('PARENT_UNAVAILABLE');
 };
 return {
  async list(parentId: string): Promise<StoredDistraction[]> {
   check(); return deps.transaction(async tx => {
    await parent(tx, parentId);
    const rows = await tx.getAllAsync<{ revision: number; payload_json: string }>('select revision,payload_json from local_track_distractions where owner_id=? and parent_session_id=? order by updated_at,id', ownerId, parentId);
    check(); return rows.map(row => { const track = parseDistractionTrack(JSON.parse(row.payload_json)); if (track.parentSessionId !== parentId) throw new DistractionError('INVALID'); return { track, revision: row.revision }; });
   });
  },
  async save(value: DistractionTrack, expectedRevision: number): Promise<StoredDistraction> {
   const track = parseDistractionTrack(value); check();
   if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new DistractionError('INVALID');
   return deps.transaction(async tx => {
    await parent(tx, track.parentSessionId);
    if (expectedRevision === 0) {
     const count = await tx.getFirstAsync<{ count: number }>('select count(*) as count from local_track_distractions where owner_id=? and parent_session_id=?', ownerId, track.parentSessionId); check();
     if (!count || count.count >= DISTRACTION_LIMITS.tracks) throw new DistractionError('LIMIT');
     await tx.runAsync('insert into local_track_distractions(id,owner_id,parent_session_id,revision,updated_at,payload_json) values(?,?,?,?,?,?)', track.id, ownerId, track.parentSessionId, 1, Date.now(), JSON.stringify(track));
    } else {
     const result = await tx.runAsync('update local_track_distractions set revision=?,updated_at=?,payload_json=? where id=? and owner_id=? and parent_session_id=? and revision=?',
      expectedRevision + 1, Date.now(), JSON.stringify(track), track.id, ownerId, track.parentSessionId, expectedRevision);
     if (result.changes !== 1) throw new DistractionError('STORAGE');
    }
    check(); return { track, revision: expectedRevision + 1 };
   });
  },
 };
}
export function distractionRepository(ownerId: string, scope: Deps['scope']) {
 return createDistractionRepository(ownerId, { scope, async transaction<T>(fn: (tx: Tx) => Promise<T>) {
  const db = await getLocalDb(); let result!: T;
  await db.withExclusiveTransactionAsync(async tx => { result = await fn(tx); }); return result;
 } });
}

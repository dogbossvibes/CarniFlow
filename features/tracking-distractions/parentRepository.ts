import { getLocalDb } from '@/lib/localDb/client';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { getTrackPointsBySession, getTrackMarkersBySession } from '@/features/tracking/repositories/localTrackRepository';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { readParentDetail } from './readParentDetail';
import { buildParentReference, parseParentReference, type ParentReference } from './parentReference';
import { DistractionError } from './model';

export interface ParentTx {
 getFirstAsync<T>(sql: string, ...args: (string | number)[]): Promise<T | null>;
 getAllAsync<T>(sql: string, ...args: (string | number)[]): Promise<T[]>;
 runAsync(sql: string, ...args: (string | number)[]): Promise<unknown>;
}
interface Deps {
 scope(): { userId: string | null; epoch: number };
 localRow(id: string): Promise<{ user_id: string; type: string; deleted_at: string | null } | null>;
 localDetail(id: string): Promise<unknown>;
 remoteDetail(id: string): Promise<{ data: unknown; error?: unknown; offline?: boolean; denied?: boolean }>;
 transaction<T>(fn: (tx: ParentTx) => Promise<T>): Promise<T>;
}
// Shared across repository instances: an in-flight read must not survive a known denial.
// Process restart ends those reads; the persistent cache row is deleted on denial.
const parentReadState = new Map<string, { revision: number; denied: boolean }>();
function readState(ownerId: string, id: string) {
 const key = JSON.stringify([ownerId, id]);
 let state = parentReadState.get(key);
 if (!state) { state = { revision: 0, denied: false }; parentReadState.set(key, state); }
 return state;
}
export function createParentRepository(ownerId: string, deps: Deps) {
 const epoch = deps.scope().epoch;
 const check = () => { const s = deps.scope(); if (!ownerId || s.userId !== ownerId || s.epoch !== epoch) throw new DistractionError('ACCOUNT_CHANGED'); };
 const cached = async (id: string, checkRead: () => void) => deps.transaction(async tx => {
  checkRead(); if (readState(ownerId, id).denied) throw new DistractionError('PARENT_UNAVAILABLE'); const row = await tx.getFirstAsync<{ payload_json: string }>('select payload_json from local_distraction_parents where owner_id=? and session_id=?', ownerId, id); checkRead();
  return row ? parseParentReference(JSON.parse(row.payload_json), ownerId, id) : null;
 });
 const invalidate = async (id: string) => {
  check(); const state = readState(ownerId, id); state.revision++; state.denied = true;
  return deps.transaction(async tx => {
  check(); await tx.runAsync('delete from local_distraction_parents where owner_id=? and session_id=?', ownerId, id); check();
  });
 };
 const save = async (ref: ParentReference, checkRead: () => void) => {
  const result = await deps.transaction(async tx => {
  checkRead(); await tx.runAsync('insert into local_distraction_parents(owner_id,session_id,payload_json) values(?,?,?) on conflict(owner_id,session_id) do update set payload_json=excluded.payload_json', ownerId, ref.id, JSON.stringify(ref)); checkRead(); return ref;
  });
  checkRead(); readState(ownerId, ref.id).denied = false; return result;
 };
 return {
  async listCached(): Promise<ParentReference[]> {
   return deps.transaction(async tx => { check(); const rows = await tx.getAllAsync<{ session_id: string; payload_json: string }>('select session_id,payload_json from local_distraction_parents where owner_id=?', ownerId); check();
    return rows.flatMap(row => { if (readState(ownerId, row.session_id).denied) return []; try { return [parseParentReference(JSON.parse(row.payload_json), ownerId, row.session_id)]; } catch { return []; } }); });
  },
  async load(id: string): Promise<ParentReference> {
   check(); const state = readState(ownerId, id), revision = state.revision;
   const checkRead = () => { check(); if (state.revision !== revision) throw new DistractionError('PARENT_UNAVAILABLE'); };
   const local = await deps.localRow(id); checkRead();
   // A local deletion or owner mismatch must never be resurrected by a cached/cloud copy.
   if (local) {
    if (local.user_id !== ownerId || local.type !== 'track' || local.deleted_at) { await invalidate(id); throw new DistractionError('PARENT_UNAVAILABLE'); }
    const detail = await deps.localDetail(id); checkRead();
    return save(buildParentReference(detail, ownerId, id), checkRead);
   }
   // Only read the server. Never manufacture a training session or a sync operation.
   const remote = await deps.remoteDetail(id); checkRead();
   if (!remote.error) {
    let ref: ParentReference;
    try { ref = buildParentReference(remote.data, ownerId, id); }
    catch (error) { await invalidate(id); throw error; }
    return save(ref, checkRead);
   }
   if (remote.denied) { await invalidate(id); throw new DistractionError('PARENT_UNAVAILABLE'); }
   if (!remote.offline) throw new DistractionError('PARENT_UNAVAILABLE');
   const fallback = await cached(id, checkRead); checkRead();
   if (!fallback) throw new DistractionError('PARENT_UNAVAILABLE');
   return fallback;
  },
 };
}
export function parentRepository(ownerId: string, scope: Deps['scope']) {
 return createParentRepository(ownerId, { scope, localRow: getLocalTrainingSessionById,
  localDetail: async id => {
   const row = await getLocalTrainingSessionById(id);
   if (!row || row.user_id !== ownerId || row.type !== 'track' || row.status !== 'completed' || row.deleted_at) throw new DistractionError('PARENT_UNAVAILABLE');
   const [points, markers] = await Promise.all([getTrackPointsBySession(id), getTrackMarkersBySession(id)]);
   const detail = buildLocalTrackDetail(row, points, markers);
   let layContinuity: unknown;
   try { layContinuity = JSON.parse(row.payload_json ?? '{}')?.layContinuity; } catch { /* Legacy malformed metadata supplies no boundary. */ }
   return { ...detail, type: 'track', status: row.status, track_data: { ...detail.track_data, layContinuity },
    // The Android historical detail adapter strips own-track continuity payloads.
    // This independent read-only reference needs the original point evidence.
    points: points.map(p => ({ latitude: p.latitude, longitude: p.longitude, point_type: p.point_type ?? 'lay',
     timestamp: p.timestamp, payload_json: p.payload_json })),
   };
  }, remoteDetail: id => readParentDetail(id, ownerId),
  async transaction<T>(fn: (tx: ParentTx) => Promise<T>) {
   const db = await getLocalDb(); let result!: T;
   await db.withExclusiveTransactionAsync(async tx => { result = await fn(tx); }); return result;
  },
 });
}

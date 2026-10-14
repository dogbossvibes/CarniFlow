import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { createLocalTrackMarker, createLocalTrackPointsBatch, getTrackMarkersBySession, getTrackPointsBySession } from '../localTrackRepository';
import { reconstructPendingFromSession } from '../../store/trackRecovery';
import type { LocalTrainingSession } from '@/features/sync/types/sync';
let mockDb: DatabaseSync;
let mockId = 0;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  runAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).run(...params),
  getAllAsync: async (sql: string, ...params: (string | number | null)[]) => mockDb.prepare(sql).all(...params),
  withTransactionAsync: async (fn: () => Promise<void>) => { mockDb.exec('BEGIN'); try {await fn(); mockDb.exec('COMMIT');} catch(e) {mockDb.exec('ROLLBACK');throw e;} },
}) }));
jest.mock('@/lib/localDb/ids', () => ({ newLocalId: () => `row-${++mockId}`, nowIso: () => new Date(1000).toISOString() }));
beforeEach(() => { mockDb = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) mockDb.exec(m.sql); });
afterEach(() => mockDb.close());
it.each(['bw', 'ow', 'gw', 'abriss'])('persists %s metadata into the existing Android completed-track recovery', async angleKind => {
  mockDb.prepare("insert into local_training_sessions(local_id,user_id,dog_id,type,status,started_at,ended_at,payload_json) values ('session','owner','dog','track','completed',?,?,?)").run(new Date(1000).toISOString(),new Date(9000).toISOString(),'{"distanceMeters":5}');
  await createLocalTrackPointsBatch('session',[0,1,2].map(i=>({latitude:47+i*0.0001,longitude:8,timestamp:new Date(1000+i*1000).toISOString()})));
  await createLocalTrackMarker('session', { sourceMarkerId:'source',recordedAtMs:2000,marker_type:'winkel',angle_kind:angleKind,latitude:47,longitude:8,distance_from_start:5,
    geometryDirection:'rechts',geometrySharpness:angleKind==='abriss'?'unresolved':'sharp',geometrySource:'manual' });
  const session=mockDb.prepare('select * from local_training_sessions').get() as unknown as LocalTrainingSession;
  const markers=await getTrackMarkersBySession('session'),layPoints=await getTrackPointsBySession('session');
  expect(JSON.parse(markers[0].payload_json!)).toMatchObject({sourceMarkerId:'source',recordedAtMs:2000,geometryDirection:'rechts'});
  expect(Date.parse(markers[0].created_at)).toBe(2000);
  const snap={session,markers,layPoints,searchPointCount:0};
  const restored=reconstructPendingFromSession(snap,'dog',{now:10000,userId:'owner'});
  expect(restored.ok).toBe(true);if(!restored.ok)return;
  expect(restored.pending.markers[0]).toMatchObject({angleKind,geometryDirection:'rechts',geometrySource:'manual'});
  expect(restored.pending.status).toBe('resting');
  expect(reconstructPendingFromSession({...snap,session:{...session,ended_at:null}},'dog',{now:10000,userId:'owner'})).toEqual({ok:false,reason:'lay_not_finished'});
});

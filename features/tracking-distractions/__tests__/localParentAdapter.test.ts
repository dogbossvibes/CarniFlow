import { DatabaseSync } from 'node:sqlite';
import { parentRepository } from '@/features/tracking-distractions/parentRepository';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { getLocalDb } from '@/lib/localDb/client';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { getTrackPointsBySession, getTrackMarkersBySession } from '@/features/tracking/repositories/localTrackRepository';
import { readParentDetail } from '@/features/tracking-distractions/readParentDetail';
afterEach(()=>jest.clearAllMocks());
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: jest.fn() }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessionById: jest.fn() }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({ getTrackPointsBySession: jest.fn(), getTrackMarkersBySession: jest.fn() }));
jest.mock('@/features/tracking-distractions/readParentDetail', () => ({ readParentDetail: jest.fn() }));
it.each([
 {status:'completed',deleted_at:null,user_id:'owner',allowed:true},
 {status:'active',deleted_at:null,user_id:'owner',allowed:false},
 {status:'completed',deleted_at:'2026-10-14T07:01:00Z',user_id:'owner',allowed:false},
 {status:'completed',deleted_at:null,user_id:'other',allowed:false},
])('production local adapter validates actual session $status / $user_id / $deleted_at', async variant => {
 const db = new DatabaseSync(':memory:');
 try {
  for (const m of MIGRATIONS) db.exec(m.sql);
  const id = '00000000-0000-4000-8000-000000000014';
  const tx = { getFirstAsync: async (sql: string, ...args: any[]) => db.prepare(sql).get(...args) ?? null,
   getAllAsync: async (sql: string, ...args: any[]) => db.prepare(sql).all(...args), runAsync: async (sql: string, ...args: any[]) => db.prepare(sql).run(...args) };
  (getLocalDb as jest.Mock).mockResolvedValue({ withExclusiveTransactionAsync: async (fn: (tx: any) => Promise<void>) => {
   db.exec('BEGIN'); try { await fn(tx); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
  } });
  (getLocalTrainingSessionById as jest.Mock).mockResolvedValue({ local_id: id, user_id: variant.user_id, dog_id: 'dog', type: 'track', status: variant.status, deleted_at: variant.deleted_at, payload_json: '{}', created_at: '2026-10-14T07:00:00Z' });
  (getTrackPointsBySession as jest.Mock).mockResolvedValue([{ latitude: 47, longitude: 8, point_type: 'lay', timestamp: '2026-10-14T07:00:00Z' }, { latitude: 47.001, longitude: 8, point_type: 'lay', timestamp: '2026-10-14T07:00:10Z' }]);
  (getTrackMarkersBySession as jest.Mock).mockResolvedValue([]);
  const repo = parentRepository('owner', () => ({ userId: 'owner', epoch: 0 }));
  if (variant.allowed) await expect(repo.load(id)).resolves.toMatchObject({ id, dogId: 'dog' });
  else await expect(repo.load(id)).rejects.toThrow('PARENT_UNAVAILABLE');
  expect(readParentDetail).not.toHaveBeenCalled();
  expect(db.prepare('select count(*) n from local_distraction_parents').get()?.n).toBe(variant.allowed ? 1 : 0);
 } finally { db.close(); }
});

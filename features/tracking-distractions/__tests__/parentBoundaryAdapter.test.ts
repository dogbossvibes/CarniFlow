import { DatabaseSync } from 'node:sqlite';
import { parentRepository } from '@/features/tracking-distractions/parentRepository';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { getLocalDb } from '@/lib/localDb/client';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { getTrackPointsBySession, getTrackMarkersBySession } from '@/features/tracking/repositories/localTrackRepository';
import { readParentDetail } from '@/features/tracking-distractions/readParentDetail';
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: jest.fn() }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({ getLocalTrainingSessionById: jest.fn() }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({ getTrackPointsBySession: jest.fn(), getTrackMarkersBySession: jest.fn() }));
jest.mock('@/features/tracking-distractions/readParentDetail', () => ({ readParentDetail: jest.fn() }));
it.each(['payload', 'timestamp'] as const)('production adapter and SQLite cache retain %s boundaries of an own unsynced track', async source => {
 const db = new DatabaseSync(':memory:');
 try {
  for (const m of MIGRATIONS) db.exec(m.sql);
  const id = '00000000-0000-4000-8000-000000000014';
  const tx = { getFirstAsync: async (sql: string, ...args: any[]) => db.prepare(sql).get(...args) ?? null,
   getAllAsync: async (sql: string, ...args: any[]) => db.prepare(sql).all(...args), runAsync: async (sql: string, ...args: any[]) => db.prepare(sql).run(...args) };
  (getLocalDb as jest.Mock).mockResolvedValue({ withExclusiveTransactionAsync: async (fn: (tx: any) => Promise<void>) => {
   db.exec('BEGIN'); try { await fn(tx); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
  } });
  (getLocalTrainingSessionById as jest.Mock).mockResolvedValue({ local_id: id, user_id: 'owner', dog_id: 'dog', type: 'track', status: 'completed', deleted_at: null, payload_json: source === 'timestamp' ? JSON.stringify({layContinuity:{version:1,breakBeforeTimestamps:['2026-10-14T07:00:20Z']}}) : '{}', created_at: '2026-10-14T07:00:00Z' });
  const points = [{ latitude: 47, longitude: 8, point_type: 'lay', timestamp: '2026-10-14T07:00:00Z' }, { latitude: 47.001, longitude: 8, point_type: 'lay', timestamp: '2026-10-14T07:00:10Z' }, {latitude:48,longitude:9,point_type:'lay',timestamp:'2026-10-14T07:00:20Z',payload_json:source==='payload'?JSON.stringify({breakBefore:true}):null}, {latitude:48.001,longitude:9,point_type:'lay',timestamp:'2026-10-14T07:00:30Z'}];
  const before=JSON.stringify(points);
  (getTrackPointsBySession as jest.Mock).mockResolvedValue(points);
  (getTrackMarkersBySession as jest.Mock).mockResolvedValue([]);
  const repo = parentRepository('owner', () => ({ userId: 'owner', epoch: 0 }));
  const ref=await repo.load(id);
  expect(ref.map.lay.map(p=>p.breakBefore===true)).toEqual([false,false,true,false]);
  expect((await repo.listCached())[0]).toEqual(ref);
  expect(JSON.stringify(points)).toBe(before);
  expect(db.prepare('select count(*) n from local_training_sessions').get()?.n).toBe(0);
  expect(db.prepare('select count(*) n from sync_queue').get()?.n).toBe(0);
  expect(readParentDetail).not.toHaveBeenCalled();
  expect(db.prepare('select count(*) n from local_distraction_parents').get()?.n).toBe(1);
 } finally { db.close(); }
});

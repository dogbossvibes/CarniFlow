import { DatabaseSync } from 'node:sqlite';
import { createParentRepository, type ParentTx } from '../parentRepository';
import { createDistractionRepository } from '../repository';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { buildParentReference } from '../parentReference';
import { fixture } from './fixture';
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: jest.fn() }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({}));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({}));
jest.mock('../readParentDetail', () => ({}));
const main = () => ({ id: fixture().parentSessionId, type: 'track', owner_id: 'owner', dog_id: 'dog', status: 'completed', points: [{ latitude: 47, longitude: 8 }, { latitude: 47.001, longitude: 8 }], markers: [] });
let db: DatabaseSync;
beforeEach(() => { db = new DatabaseSync(':memory:'); for (const m of MIGRATIONS) db.exec(m.sql); }); afterEach(() => db.close());
function setup() {
 let epoch = 0; const scope = () => ({ userId: 'owner', epoch });
 const tx = { getFirstAsync: async (sql: string,...a: (string|number)[]) => db.prepare(sql).get(...a) ?? null,
  getAllAsync: async (sql: string,...a: (string|number)[]) => db.prepare(sql).all(...a), runAsync: async (sql: string,...a: (string|number)[]) => db.prepare(sql).run(...a) } as ParentTx;
 const transaction = async <T,>(fn: (tx: ParentTx) => Promise<T>) => { db.exec('BEGIN'); try { const r = await fn(tx); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
 const localRow = jest.fn(async (): Promise<{ user_id: string; type: string; deleted_at: string | null } | null> => null);
 const localDetail = jest.fn(async () => main()); const remoteDetail = jest.fn(async (): Promise<{ data: unknown; error?: unknown; offline?: boolean; denied?: boolean }> => ({ data: main(), error: null }));
 const deps = { scope, transaction, localRow, localDetail, remoteDetail };
 return { repo: createParentRepository('owner', deps), deps, tx, invalidate: () => { epoch += 2; } };
}
it('cloud reference persists independently; no original session, run or sync write; offline reopen works', async () => {
 const h = setup(), id = main().id; const ref = await h.repo.load(id);
 expect(db.prepare('select count(*) n from local_training_sessions').get()?.n).toBe(0);
 expect(db.prepare('select count(*) n from sync_queue').get()?.n).toBe(0);
 h.deps.remoteDetail.mockResolvedValue({ data: null, error: 'network', offline: true });
 expect(await createParentRepository('owner', h.deps).load(id)).toEqual(ref);
 const child = createDistractionRepository('owner', { scope: h.deps.scope, transaction: h.deps.transaction as never });
 await child.save(fixture(), 0); expect(await child.list(id)).toHaveLength(1);
});
it.each([{ data: null, error: null }, { data: null, error: '403' }, { data: { ...main(), owner_id: 'other' }, error: null }])('cached reference never bypasses server denial/deletion/foreign owner', async result => {
 const h = setup(); await h.repo.load(main().id); h.deps.remoteDetail.mockResolvedValue(result); await expect(h.repo.load(main().id)).rejects.toThrow('PARENT_UNAVAILABLE');
});
it.each([{ user_id: 'owner', type: 'track', deleted_at: 'now' }, { user_id: 'other', type: 'track', deleted_at: null }])('local deletion/owner wins over cached cloud', async row => {
 const h = setup(); await h.repo.load(main().id); h.deps.localRow.mockResolvedValue(row); await expect(h.repo.load(main().id)).rejects.toThrow();
 db.prepare('insert into local_training_sessions(local_id,user_id,type,deleted_at) values(?,?,?,?)').run(main().id,row.user_id,row.type,row.deleted_at);
 const child = createDistractionRepository('owner', { scope: h.deps.scope, transaction: h.deps.transaction as never });
 await expect(child.save(fixture(),0)).rejects.toThrow('PARENT_UNAVAILABLE');
});
it('local main needs no network and preserves original row', async () => {
 const h = setup(); h.deps.localRow.mockResolvedValue({ user_id: 'owner', type: 'track', deleted_at: null });
 expect(await h.repo.load(main().id)).toEqual(buildParentReference(main(),'owner',main().id)); expect(h.deps.remoteDetail).not.toHaveBeenCalled();
});
it('late reads and in-transaction identity changes cannot cache a former account', async () => {
 const h = setup(); h.deps.remoteDetail.mockImplementation(async () => { h.invalidate(); return { data: main() }; }); await expect(h.repo.load(main().id)).rejects.toThrow('ACCOUNT_CHANGED');
 expect(db.prepare('select count(*) n from local_distraction_parents').get()?.n).toBe(0);
 const h2 = setup(), write = h2.tx.runAsync; h2.tx.runAsync = async (...a) => { const r = await write(...a); h2.invalidate(); return r; };
 await expect(h2.repo.load(main().id)).rejects.toThrow('ACCOUNT_CHANGED'); expect(db.prepare('select count(*) n from local_distraction_parents').get()?.n).toBe(0);
});
it('cache listing is owner scoped and ignores corrupt records', async () => {
 const h = setup(); await h.repo.load(main().id); db.prepare('insert into local_distraction_parents values(?,?,?)').run('owner','bad','{');
 db.prepare('insert into local_distraction_parents values(?,?,?)').run('other','foreign','{}'); expect(await h.repo.listCached()).toHaveLength(1);
});

it.each([{data:null,error:null},{data:null,error:'403',denied:true}])('known deletion/denial invalidates only the reference, never the recorded child', async denied => {
 const h=setup();await h.repo.load(main().id);
 const child=createDistractionRepository('owner',{scope:h.deps.scope,transaction:h.deps.transaction as never});await child.save(fixture(),0);
 h.deps.remoteDetail.mockResolvedValue(denied);await expect(h.repo.load(main().id)).rejects.toThrow();
 h.deps.remoteDetail.mockResolvedValue({data:null,error:'network',offline:true});await expect(h.repo.load(main().id)).rejects.toThrow();
 await expect(child.save(fixture(),1)).rejects.toThrow('PARENT_UNAVAILABLE');
 expect(db.prepare('select count(*) n from local_track_distractions').get()?.n).toBe(1);
});
it('transient server errors do not delete an offline reference but do not claim success',async()=>{
 const h=setup();await h.repo.load(main().id);h.deps.remoteDetail.mockResolvedValue({data:null,error:'500'});await expect(h.repo.load(main().id)).rejects.toThrow();
 h.deps.remoteDetail.mockResolvedValue({data:null,error:'network',offline:true});expect((await h.repo.load(main().id)).id).toBe(main().id);
});
it('a denial invalidates in-flight reads across recreated repositories and retains recorded children', async () => {
 const h=setup(),id=main().id;await h.repo.load(id);
 const child=createDistractionRepository('owner',{scope:h.deps.scope,transaction:h.deps.transaction as never});await child.save(fixture(),0);
 let resolve!: (value:{data:unknown})=>void;
 h.deps.remoteDetail.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 const older=createParentRepository('owner',h.deps).load(id);await Promise.resolve();await Promise.resolve();
 h.deps.remoteDetail.mockResolvedValueOnce({data:null,error:'403',denied:true});
 await expect(createParentRepository('owner',h.deps).load(id)).rejects.toThrow('PARENT_UNAVAILABLE');
 resolve({data:main()});await expect(older).rejects.toThrow('PARENT_UNAVAILABLE');
 expect(await h.repo.listCached()).toEqual([]);
 expect(db.prepare('select count(*) n from local_track_distractions').get()?.n).toBe(1);
 h.deps.remoteDetail.mockResolvedValueOnce({data:null,error:'offline',offline:true});
 await expect(createParentRepository('owner',h.deps).load(id)).rejects.toThrow('PARENT_UNAVAILABLE');
 // A fresh positive read after the denial may authorise this reference again.
 expect((await createParentRepository('owner',h.deps).load(id)).id).toBe(id);
});
it('checks the read revision inside a queued cache-write transaction', async () => {
 const h=setup(),id=main().id;await h.repo.load(id);
 const transaction=h.deps.transaction;
 let enter!:()=>void,release!:()=>void;
 const entered=new Promise<void>(r=>{enter=r;}),gate=new Promise<void>(r=>{release=r;});
 const oldRepo=createParentRepository('owner',{...h.deps,transaction:async fn=>{enter();await gate;return transaction(fn);}});
 const oldRead=oldRepo.load(id);await entered;
 h.deps.remoteDetail.mockResolvedValueOnce({data:null,error:'403',denied:true});
 await expect(h.repo.load(id)).rejects.toThrow('PARENT_UNAVAILABLE');
 release();await expect(oldRead).rejects.toThrow('PARENT_UNAVAILABLE');
 expect(db.prepare('select count(*) n from local_distraction_parents').get()?.n).toBe(0);
});

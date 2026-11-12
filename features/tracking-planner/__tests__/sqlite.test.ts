import { DatabaseSync } from 'node:sqlite';
import { createPlannerRepository, type PlannerTx } from '../repository';
import { PLANNER_SCHEMA } from '../schema';
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: jest.fn() }));
let db: DatabaseSync;
beforeEach(()=>{db=new DatabaseSync(':memory:');db.exec(PLANNER_SCHEMA);});afterEach(()=>db.close());
function repository(owner='a') {
 let epoch=0;
 const tx = {getAllAsync:async(sql:string,...args:(string|number)[])=>db.prepare(sql).all(...args),getFirstAsync:async(sql:string,...args:(string|number)[])=>db.prepare(sql).get(...args)??null,
 runAsync:async(sql:string,...args:(string|number)[])=>db.prepare(sql).run(...args)} as PlannerTx;
 const repo=createPlannerRepository(owner,{scope:()=>({userId:owner,epoch}),transaction:async fn=>{db.exec('BEGIN');try{const value=await fn(tx);db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}}});
 return {repo,tx,invalidate:()=>epoch++};
}
const plan={id:'one',name:'Test',points:[{latitude:47,longitude:8,object:false},{latitude:47.001,longitude:8,object:true}]};
it('persists/reloads with owner isolation and optimistic locking in real SQLite',async()=>{
 const a=repository(),b=repository('b');await a.repo.save(plan,0);expect(await b.repo.list()).toEqual([]);
 await expect(b.repo.save({...plan,name:'attack'},1)).rejects.toThrow('CONFLICT');
 await b.repo.save({...plan,name:'other'},0);
 await a.repo.save({...plan,name:'edited'},1);await expect(a.repo.save(plan,1)).rejects.toThrow('CONFLICT');
 expect((await a.repo.list())[0].plan.name).toBe('edited');expect((await b.repo.list())[0].plan.name).toBe('other');
 await a.repo.remove(plan.id,2);expect(await a.repo.list()).toEqual([]);expect(await b.repo.list()).toHaveLength(1);
});
it('rolls back a write when account epoch changes during SQL',async()=>{
 const h=repository(),write=h.tx.runAsync;h.tx.runAsync=async(...args)=>{const result=await write(...args);h.invalidate();return result;};
 await expect(h.repo.save(plan,0)).rejects.toThrow('ACCOUNT_CHANGED');expect(db.prepare('select count(*) n from local_track_plans').get()?.n).toBe(0);
});
it('cannot overwrite a duplicate create and new repository can reopen persisted plans',async()=>{
 const h=repository();await h.repo.save(plan,0);await expect(h.repo.save({...plan,name:'overwrite'},0)).rejects.toThrow();
 expect((await repository().repo.list())[0].plan).toEqual(plan);
});

import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createExchangeRepository,type ExchangeTx } from '../repository';
import { EXCHANGE_SCHEMA } from '../schema';
import { DISTRACTION_SCHEMA } from '@/features/tracking-distractions/schema';
import { reference,offer,returned,ids } from './fixture';
import { canonicalReference } from '../contract';
jest.mock('@/lib/localDb/client',()=>({getLocalDb:jest.fn()}));
jest.mock('expo-crypto',()=>({}));
function setup(){const db=new DatabaseSync(':memory:');db.exec(EXCHANGE_SCHEMA+DISTRACTION_SCHEMA);let owner='owner',epoch=0,n=4;let interrupt=false;
 const scope=()=>({userId:owner,epoch});const digest=async(text:string)=>createHash('sha256').update(text).digest('hex');
 const tx:ExchangeTx={getFirstAsync:async(sql,...args)=>db.prepare(sql).get(...args) as never,getAllAsync:async(sql,...args)=>db.prepare(sql).all(...args) as never,runAsync:async(sql,...args)=>{const r=db.prepare(sql).run(...args);if(interrupt){epoch++;interrupt=false;}return r;}};
 const repo=createExchangeRepository('owner',{scope,digest,randomId:()=>`${String(n++).padStart(8,'0')}-0000-4000-8000-000000000000`,now:()=>123456,transaction:async fn=>{db.exec('begin');try{const r=await fn(tx);db.exec('commit');return r;}catch(e){db.exec('rollback');throw e;}}});
 return {db,repo,digest,change:()=>{owner='other';epoch++;},aba:()=>{epoch+=2;},interrupt:()=>{interrupt=true;}};}
it('real SQLite round trip: contribution copies only once; original reference immutable',async()=>{const h=setup();const task=await h.repo.create(ids.parent,'Wiese',reference());const ret={...returned(),taskId:task.taskId,referenceDigest:task.offer.referenceDigest,contribution:{...returned().contribution,parentSessionId:task.taskId}};
 const first=await h.repo.applyReturn(ret,reference());expect(first.duplicate).toBe(false);expect((await h.repo.applyReturn(ret,reference())).duplicate).toBe(true);expect(h.db.prepare('select count(*) as n from local_track_distractions').get()).toEqual({n:1});expect((await h.repo.get(task.taskId))?.offer.reference).toEqual(reference());
 const wrong={...ret,contribution:{...ret.contribution,name:'Different'}};await expect(h.repo.applyReturn(wrong,reference())).rejects.toThrow('CONFLICT');h.db.close();});
it('rejects unknown task, wrong digest and changed original with zero child writes',async()=>{const h=setup();await expect(h.repo.applyReturn(returned(),reference())).rejects.toThrow('NOT_FOUND');const task=await h.repo.create(ids.parent,'Wiese',reference());const ret={...returned(),taskId:task.taskId,contribution:{...returned().contribution,parentSessionId:task.taskId}};await expect(h.repo.applyReturn(ret,reference())).rejects.toThrow('CONFLICT');ret.referenceDigest=task.offer.referenceDigest;const changed=reference();changed.points[0].lat=46;await expect(h.repo.applyReturn(ret,changed)).rejects.toThrow('CONFLICT');expect(h.db.prepare('select count(*) as n from local_track_distractions').get()).toEqual({n:0});h.db.close();});
it('imports are idempotent, rekeyed locally and do not become outgoing source ownership',async()=>{const h=setup();const file=offer();file.referenceDigest=await h.digest(canonicalReference(file.reference));const first=await h.repo.accept(file);expect(first.parentId).not.toBe(file.taskId);expect(await h.repo.accept(file)).toEqual(first);await expect(h.repo.accept({...file,title:'Forged'})).rejects.toThrow('CONFLICT');await expect(h.repo.applyReturn({...returned(),referenceDigest:file.referenceDigest},reference())).rejects.toThrow('NOT_FOUND');h.db.close();});
it('return export reads only the account-scoped saved finished child and uses wire task id',async()=>{const h=setup();const file=offer();file.referenceDigest=await h.digest(canonicalReference(file.reference));const task=await h.repo.accept(file);const child={...returned().contribution,parentSessionId:task.parentId};h.db.prepare('insert into local_track_distractions values(?,?,?,?,?,?)').run(child.id,'owner',task.parentId,1,1,JSON.stringify(child));expect((await h.repo.makeReturn(file.taskId,child.id)).contribution.parentSessionId).toBe(file.taskId);await expect(h.repo.makeReturn(file.taskId,ids.parent)).rejects.toThrow('NOT_FOUND');h.db.close();});
it('rolls back writes when identity changes inside a transaction and rejects ABA',async()=>{const h=setup();h.interrupt();await expect(h.repo.create(ids.parent,'Wiese',reference())).rejects.toThrow('ACCOUNT_CHANGED');expect(h.db.prepare('select count(*) as n from local_track_exchange').get()).toEqual({n:0});h.db.close();const b=setup();b.aba();await expect(b.repo.list()).rejects.toThrow('ACCOUNT_CHANGED');b.db.close();});
it('rejects corrupted reference hash before persisting incoming locations',async()=>{const h=setup();await expect(h.repo.accept(offer())).rejects.toThrow('INVALID');expect(h.db.prepare('select count(*) as n from local_track_exchange').get()).toEqual({n:0});h.db.close();});
it('read-only summaries use actual timestamps, applied receipts and owner scope',async()=>{
 const h=setup(),task=await h.repo.create(ids.parent,'Saved main',reference());
 const ret={...returned(),taskId:task.taskId,referenceDigest:task.offer.referenceDigest,contribution:{...returned().contribution,parentSessionId:task.taskId}};
 await h.repo.applyReturn(ret,reference());
 const before=h.db.prepare('select total_changes() as n').get();const summaries=await h.repo.summaries();
 expect(summaries.limited).toBe(false);expect(JSON.stringify(summaries)).not.toMatch(/"points"|"lat"|"reference":/);expect(summaries.rows[0]).toMatchObject({taskId:task.taskId,parentId:ids.parent,createdAtMs:123456,finishedContributions:1,returns:[{id:ret.contribution.id,name:ret.contribution.name,createdAtMs:123456}]});
 expect(h.db.prepare('select total_changes() as n').get()).toEqual(before);
 h.change();await expect(h.repo.summaries()).rejects.toThrow('ACCOUNT_CHANGED');h.db.close();
});
it('summary excludes group-local tasks and never reads another owner’s receipts',async()=>{
 const h=setup(),task=await h.repo.create(ids.parent,'Saved',reference());
 h.db.prepare('insert into local_track_exchange_receipts values(?,?,?,?,?,?)').run('other',task.taskId,'bad','invalid','bad',12);
 expect((await h.repo.summaries()).rows[0].returns).toEqual([]);
 h.db.prepare('insert into local_track_group_tasks values(?,?,?,?)').run('owner','server',task.taskId,task.offer.referenceDigest);
 expect(await h.repo.summaries()).toEqual({rows:[],limited:false});h.db.close();
});
it('summary distinguishes 200 entries from a truncated 201-entry selection',async()=>{
 const h=setup();
 for(let n=0;n<201;n++){
  const id=`${String(n).padStart(8,'0')}-0000-4000-8000-000000000000`,file={...offer(),taskId:id};
  h.db.prepare('insert into local_track_exchange values(?,?,?,?,?,?)').run('owner',id,'incoming',ids.parent,JSON.stringify(file),n);
  if(n===199)expect((await h.repo.summaries()).limited).toBe(false);
 }
 const result=await h.repo.summaries();expect(result.limited).toBe(true);expect(result.rows).toHaveLength(200);expect(result.rows[0].createdAtMs).toBe(200);h.db.close();
});

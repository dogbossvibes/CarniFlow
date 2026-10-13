import { createPlannerRepository, type PlannerTx } from '../repository';
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: jest.fn() }));
function harness() {
 let epoch=0, owner='owner';
 const tx = { getAllAsync: jest.fn().mockResolvedValue([]), getFirstAsync: jest.fn().mockResolvedValue({n:0}), runAsync: jest.fn().mockResolvedValue({changes:1}) };
 const repo=createPlannerRepository(owner,{scope:()=>({userId:owner,epoch}),transaction:async fn=>fn(tx as PlannerTx)});
 return {tx,repo,aba:()=>{epoch+=2;},switch:()=>{owner='other';epoch++;}};
}
const plan = {id:'test',name:'test',points:[{latitude:47,longitude:8,object:false},{latitude:47.001,longitude:8,object:true}]};
it('only persists plans and always binds owner and expected revision',async()=>{
 const h=harness(); const saved=await h.repo.save(plan,0); expect(saved.revision).toBe(1);
 await h.repo.save(plan,1); await h.repo.remove(plan.id,2);
 expect(h.tx.runAsync.mock.calls.every(c=>c[0].includes('local_track_plans'))).toBe(true);
 expect(h.tx.runAsync.mock.calls[1].slice(-3)).toEqual(['owner','test',1]);
 expect(h.tx.runAsync.mock.calls[2].slice(-3)).toEqual(['owner','test',2]);
});
it('does not overwrite or delete when revision changed',async()=>{
 const h=harness();h.tx.runAsync.mockResolvedValue({changes:0});
 await expect(h.repo.save(plan,1)).rejects.toThrow('CONFLICT');await expect(h.repo.remove(plan.id,1)).rejects.toThrow('CONFLICT');
});
it('enforces bounded storage',async()=>{const h=harness();h.tx.getFirstAsync.mockResolvedValue({n:100});await expect(h.repo.save(plan,0)).rejects.toThrow('LIMIT');expect(h.tx.runAsync).not.toHaveBeenCalled();});
it('rejects account changes and ABA before reads and writes',async()=>{
 const h=harness();h.aba();await expect(h.repo.list()).rejects.toThrow('ACCOUNT_CHANGED');await expect(h.repo.save(plan,0)).rejects.toThrow('ACCOUNT_CHANGED');
 const h2=harness();h2.switch();await expect(h2.repo.remove(plan.id,1)).rejects.toThrow('ACCOUNT_CHANGED');expect(h.tx.runAsync).not.toHaveBeenCalled();
});
it('rechecks after awaited SQL so exclusive transaction can roll back late mutations',async()=>{
 const h=harness();h.tx.runAsync.mockImplementation(async()=>{h.aba();return{changes:1};});await expect(h.repo.save(plan,0)).rejects.toThrow('ACCOUNT_CHANGED');
});
it('rejects stale read responses and mismatched or invalid persisted payloads',async()=>{
 const h=harness();h.tx.getAllAsync.mockImplementation(async()=>{h.aba();return[];});await expect(h.repo.list()).rejects.toThrow('ACCOUNT_CHANGED');
 const h2=harness();h2.tx.getAllAsync.mockResolvedValue([{id:'different',revision:1,payload_json:JSON.stringify(plan)}]);await expect(h2.repo.list()).rejects.toThrow('INVALID');
});

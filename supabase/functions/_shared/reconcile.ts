import {planOwnership,receiptKey,type Account,type Receipt,type Binding,type Catalog} from './ownership.ts';
export type State={accounts:{uid:string;version:string}[];bindings:Binding[]};
export type Proof={accounts:Account[];receipts:Receipt[];snapshots:Record<string,unknown>};
export type OwnedDeps={
 state:(uids:string[])=>Promise<State>;
 discover:(uids:string[],state:State)=>Promise<string[]>;
 acquire:(uid:string)=>Promise<string>;
 release:(uid:string,lease:string)=>Promise<void>;
 collect:(uids:string[],state:State,leases:Record<string,string>)=>Promise<Proof>;
 apply:(accounts:unknown[],receipts:unknown[])=>Promise<unknown>;
 catalog:Catalog;now?:()=>number;
};
/** Same path for normal purchase, restore and authenticated event-triggered refresh. */
export async function reconcileOwned(seed:string[],d:OwnedDeps){
 const now=d.now??Date.now;let uids=[...new Set(seed)].sort();
 if(!uids.length||uids.length>50)throw new Error('OWNERSHIP_SCOPE');
 let stable=false;
 for(let attempt=0;attempt<4;attempt++){
  const state=await d.state(uids);const found=await d.discover(uids,state);const next=[...new Set([...uids,...found])].sort();
  if(next.length>50)throw new Error('OWNERSHIP_SCOPE');
  if(JSON.stringify(next)===JSON.stringify(uids)){stable=true;break;}uids=next;
 }
 if(!stable)throw new Error('OWNERSHIP_UNSTABLE');
 const leases:Record<string,string>={};let releaseFailed=false;
 try{
  // All actors lock the exact same sorted account set; conflicting work stays pending.
  for(const uid of uids)leases[uid]=await d.acquire(uid);
  const start=now();const state=await d.state(uids);const proof=await d.collect(uids,state,leases);
  if(now()-start>=15000)throw new Error('OWNERSHIP_PROOF_EXPIRED');
  if(proof.accounts.length!==uids.length||proof.accounts.some(a=>!uids.includes(a.uid)||a.lease!==leases[a.uid]||a.version!==state.accounts.find(x=>x.uid===a.uid)?.version))throw new Error('OWNERSHIP_STATE_CHANGED');
  const plan=planOwnership(proof.accounts,proof.receipts,state.bindings,d.catalog,now());
  return await d.apply(proof.accounts.map(a=>({...a,snapshot:proof.snapshots[a.uid]})),plan.receipts.map(r=>({...r,key:receiptKey(r)})));
 }finally{
  // One release failure must not strand another acquired lease. SQL TTL remains fail-closed.
  for(const [uid,lease] of Object.entries(leases)){try{await d.release(uid,lease);}catch{releaseFailed=true;}}
  // Never mask a committed result or retry mutation automatically due to cleanup transport.
  void releaseFailed;
 }
}

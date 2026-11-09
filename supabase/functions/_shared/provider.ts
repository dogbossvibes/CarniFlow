import { DiagnosticError } from './diagnostics.ts';
import { providerReader, type Json } from './provider-read.ts';
import { receiptKey, type Receipt, type Catalog, type Account } from './ownership.ts';
import type { State, Proof } from './reconcile.ts';
import { normalizeAuthority, VERIFIED_PRODUCT_ALIASES } from './normalizer.ts';
import { canonicalizeProviderTimes, sameProviderSecond } from './provider-time.ts';
const obj=(x:unknown):Json=>{if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('PROVIDER_SHAPE');return x as Json;};
const str=(x:unknown,max=1500):string=>{if(typeof x!=='string'||!x.length||x.length>max)throw new Error('PROVIDER_SHAPE');return x;};
const ms=(x:unknown):number=>{if(typeof x!=='number'||!Number.isSafeInteger(x)||x<0)throw new Error('PROVIDER_TIME');return x;};
const date=(x:unknown):number=>{const n=Date.parse(str(x));if(!Number.isSafeInteger(n)||n<0)throw new Error('PROVIDER_TIME');return n;};
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const catalog:Catalog={project:'proj38d74453',apps:{app8ff9cf8027:'app_store',appb5d35dd723:'play_store'},products:{anyvo_active_monthly_10:{plan:'active',entitlement:'anyvo_active_monthly_10'},'anyvo_trainer_monthly_30.00':{plan:'trainer',entitlement:'anyvo_trainer_monthly_30.00'},'anyvo_founder_active_monthly_8.00':{plan:'founder_active',entitlement:'anyvo_founder_active_monthly_8.00'}}};
/** Uses only authenticated GET requests; no synthetic customer probes or provider mutations. */
export function ownershipProvider(v1Secret:string,v2Secret:string,fetcher:typeof fetch=fetch,now:()=>number=Date.now){
 if(!v1Secret||!v2Secret)throw new Error('SERVER_NOT_CONFIGURED');
 const api=providerReader(catalog.project,v2Secret,fetcher),prefix=api.prefix;
 const route=(kind:string,id:string,suffix='')=>`${prefix}${kind}/${encodeURIComponent(str(id))}${suffix}`;
 async function aliases(id:string){return (await api.list(route('customers',id,'/aliases'))).map(x=>{if(x.object!=='customer.alias')throw new Error('PROVIDER_ALIAS_SHAPE');ms(x.created_at);return str(x.id);});}
 async function observe(uids:string[],state:State){
  const ids=new Set<string>();
  for(const id of uids)for(const s of await api.list(route('customers',id,'/subscriptions'))){if(s.object!=='subscription')throw new Error('PROVIDER_SHAPE');ids.add(str(s.id,255));}
  for(const b of state.bindings){const key=JSON.parse(b.key);if(!Array.isArray(key)||key.length!==5||key[0]!==catalog.project)throw new Error('BINDING_SCOPE');ids.add(str(key[4],255));}
  if(ids.size>500)throw new Error('PROVIDER_BOUND');
  const receipts:Receipt[]=[];const aliasSets:Record<string,string[]>={};
  for(const id of uids)aliasSets[id]=[id,...await aliases(id)];
  for(const id of ids){
   const s=await api.read(route('subscriptions',id));if(s.object!=='subscription'||s.id!==id)throw new Error('PROVIDER_SHAPE');
   if(s.environment==='sandbox'){
    // Sandbox history is outside this production authority. A bound production ID
    // changing environment is contradictory evidence and must remain pending.
    if(state.bindings.some(b=>JSON.parse(b.key)[4]===id))throw new Error('PROVIDER_ENVIRONMENT_PENDING');
    if(typeof s.gives_access!=='boolean')throw new Error('PROVIDER_SHAPE');
    continue;
   }
   if(s.environment!=='production')throw new Error('PROVIDER_ENVIRONMENT_PENDING');
   if(typeof s.gives_access!=='boolean')throw new Error('PROVIDER_SHAPE');
   // Current gives_access=false is the provider's documented non-grant signal.
   // Irrelevant unbound historical/paused products need no ownership mutation;
   // every existing binding must still be fully revalidated, never silently dropped.
   if(!s.gives_access&&!state.bindings.some(b=>JSON.parse(b.key)[4]===id))continue;
   const rawOwner=str(s.customer_id);let owner=Object.keys(aliasSets).find(k=>aliasSets[k].includes(rawOwner));
   if(!owner){const set=[rawOwner,...await aliases(rawOwner)];const authIds=[...new Set(set.filter(x=>uid.test(x)))];if(authIds.length!==1)throw new Error('OWNER_NOT_CANONICAL');owner=authIds[0];aliasSets[owner]=set;}
   const productId=str(s.product_id,255),p=await api.read(route('products',productId));
   if(p.object!=='product'||p.id!==productId||p.type!=='subscription')throw new Error('PROVIDER_PRODUCT');
   const storeProduct=str(p.store_identifier,255),product=VERIFIED_PRODUCT_ALIASES[storeProduct]??storeProduct,app=str(p.app_id,255),store=str(s.store,255);
   if(catalog.apps[app]!==store||!catalog.products[product])throw new Error('PROVIDER_PRODUCT');
   const ents=await api.list(route('subscriptions',id,'/entitlements'));
   const entitlement=catalog.products[product].entitlement;
   if(s.gives_access&&!ents.some(e=>e.object==='entitlement'&&e.project_id===catalog.project&&e.lookup_key===entitlement))throw new Error('PROVIDER_ENTITLEMENT');
   const r:Receipt={project:catalog.project,app,store,environment:'production',id,owner,product,entitlement,periodStart:ms(s.current_period_starts_at),periodEnd:ms(s.current_period_ends_at),endsAt:ms(s.ends_at),status:str(s.status,100),renewal:str(s.auto_renewal_status,100),graceEnd:null,givesAccess:s.gives_access,fetchedAt:now(),expectedRevision:0};
   r.expectedRevision=state.bindings.find(b=>b.key===receiptKey(r))?.revision??0;receipts.push(r);
  }
  return {receipts,aliasSets};
 }
 async function collect(uids:string[],state:State,leases:Record<string,string>):Promise<Proof>{
  const {receipts,aliasSets}=await observe(uids,state);const accounts:Account[]=[],snapshots:Record<string,unknown>={};
  // The DB state reader has already confirmed these exact Supabase users.
  for(const id of uids){
   let response:Response;try{response=await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`,{method:'GET',headers:{Authorization:`Bearer ${v1Secret}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw new DiagnosticError('PROVIDER_NETWORK',{operation:'v1_subscriber'});}
   if(!response.ok)throw new DiagnosticError('PROVIDER_HTTP',{operation:'v1_subscriber',status:response.status});
   let decoded:unknown;try{decoded=await response.json();}catch{throw new DiagnosticError('PROVIDER_RESPONSE',{operation:'v1_subscriber'});}
   const raw=obj(decoded),subscriber=obj(raw.subscriber),allSubs=obj(subscriber.subscriptions),allEnts=obj(subscriber.entitlements);
   // Explicitly sandbox-marked records cannot grant or shadow a different production product.
   // Same-product V1 shadowing stays pending through the independent V2 agreement check.
   const productionSubs=Object.fromEntries(Object.entries(allSubs).filter(([,v])=>obj(v).is_sandbox!==true));
   const productionEnts=Object.fromEntries(Object.entries(allEnts).filter(([,v])=>{const product=obj(v).product_identifier;return typeof product!=='string'||!allSubs[product]||obj(allSubs[product]).is_sandbox!==true;}));
   const s=canonicalizeProviderTimes(normalizeAuthority({...raw,subscriber:{...subscriber,subscriptions:productionSubs,entitlements:productionEnts}},now()),receipts,id);
   if(s.observedMs<now()-15000||s.observedMs>now())throw new Error('PROVIDER_STALE');
   const subs=obj(obj(raw.subscriber).subscriptions);
   for(const r of receipts.filter(x=>x.owner===id&&x.givesAccess&&x.status==='in_grace_period')){
    const candidates=Object.entries(subs).filter(([k,v])=>(VERIFIED_PRODUCT_ALIASES[k]??k)===r.product&&obj(v).store===r.store);
    if(candidates.length!==1)throw new Error('GRACE_PROOF_PENDING');const sub=obj(candidates[0][1]);
    const sameTime=(a:number,b:number)=>r.store==='play_store'?sameProviderSecond(a,b):a===b;
    if(sub.is_sandbox!==false||!sameTime(date(sub.purchase_date),r.periodStart)||!sameTime(date(sub.expires_date),r.periodEnd))throw new Error('GRACE_PROOF_PENDING');
    r.graceEnd=date(sub.grace_period_expires_date);
   }
   const version=state.accounts.find(x=>x.uid===id)?.version;if(!version)throw new Error('STATE_MISSING');
   accounts.push({uid:id,version,lease:leases[id],fetchedAt:s.observedMs,complete:true,aliases:aliasSets[id]??[],v1Plan:s.plan,v1Product:s.productId,v1Store:s.store,v1PurchaseAt:s.purchaseAt===null?null:Date.parse(s.purchaseAt),v1ExpiresAt:s.expiresAt===null?null:Date.parse(s.expiresAt)});snapshots[id]=s;
  }
  return {accounts,receipts,snapshots};
 }
 return {observe,collect};
}

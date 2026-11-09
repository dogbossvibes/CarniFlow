/** Local ownership planner. Inputs are fresh, complete server-side provider reads, never client/event payloads. */
export type Account = { uid: string; version: string; lease: string; fetchedAt: number; complete: boolean; aliases: string[]; v1Plan: string; v1Product: string|null; v1Store: string|null; v1PurchaseAt: number|null; v1ExpiresAt: number|null };
export type Receipt = { project: string; app: string; store: string; environment: string; id: string; owner: string; product: string; entitlement: string; periodStart: number; periodEnd: number; status: string; endsAt: number; renewal: string; graceEnd: number|null; givesAccess: boolean; fetchedAt: number; expectedRevision: number };
export type Binding = { key: string; owner: string; revision: number };
export type Catalog = { project: string; apps: Record<string,string>; products: Record<string,{plan:string;entitlement:string}> };
const rank:Record<string,number>={newbie:0,active:1,founder_active:2,trainer:3};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(s:string):never=>{throw new Error(s)};
export const receiptKey=(r:Receipt)=>'['+[r.project,r.app,r.store,r.environment,r.id].map(v=>JSON.stringify(v)).join(', ')+']';
export function planOwnership(accounts:Account[], receipts:Receipt[], bindings:Binding[], catalog:Catalog, now:number) {
 if(!Number.isSafeInteger(now)||now<0||!Array.isArray(accounts)||!Array.isArray(receipts)||!Array.isArray(bindings)||!accounts.length||accounts.length>50||receipts.length>500||bindings.length>500)fail('BOUNDED_INPUT');
 const text=(v:unknown,max=1500):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
 const time=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
 const fresh=(v:unknown)=>time(v)&&Number(v)<=now&&Number(v)>=now-15000;
 const byUid=new Map<string,Account>();const aliases=new Map<string,string>();
 for(const a of accounts){
  if(!a||!text(a.uid)||!uuid.test(a.uid)||a.uid!==a.uid.toLowerCase()||byUid.has(a.uid)||a.complete!==true||!text(a.version,64)||!text(a.lease,64)||!fresh(a.fetchedAt)||!Array.isArray(a.aliases)||a.aliases.length>500||a.aliases.some(x=>!text(x))||!Object.hasOwn(rank,a.v1Plan)||!(a.v1PurchaseAt===null||time(a.v1PurchaseAt))||!(a.v1ExpiresAt===null||time(a.v1ExpiresAt)))fail('ACCOUNT_PROOF_INVALID');
  byUid.set(a.uid,a);
  for(const alias of new Set([a.uid,...a.aliases])){
   if(aliases.has(alias)&&aliases.get(alias)!==a.uid)fail('AMBIGUOUS_ALIAS');
   if(uuid.test(alias)&&alias!==a.uid)fail('MULTIPLE_AUTH_ACCOUNTS_IN_ALIAS_SET');
   aliases.set(alias,a.uid);
  }
 }
 const current=new Map<string,Receipt>();const moves:{key:string;from:string;to:string;expectedRevision:number}[]=[];
 for(const b of bindings){if(!b||!text(b.key,2000)||!text(b.owner)||!uuid.test(b.owner)||!Number.isSafeInteger(b.revision)||b.revision<1)fail('BINDING_INVALID');}
 const expected=new Map(bindings.map(b=>[b.key,b]));if(expected.size!==bindings.length)fail('DUPLICATE_BINDING');
 for(const r of receipts){
  if(!r||typeof r.givesAccess!=='boolean'||!Number.isSafeInteger(r.expectedRevision)||r.expectedRevision<0||!text(r.id,255)||!text(r.owner)||!text(r.product,255)||!text(r.entitlement,255)||r.project!==catalog.project||catalog.apps[r.app]!==r.store||!['app_store','play_store'].includes(r.store)||r.environment!=='production'||!fresh(r.fetchedAt))fail('RECEIPT_SCOPE_INVALID');
  const owner=aliases.get(r.owner)??fail('OWNER_NOT_CANONICAL');if(!byUid.has(owner))fail('OWNER_NOT_CANONICAL');
  const key=receiptKey(r);if(current.has(key))fail('DUPLICATE_RECEIPT');current.set(key,{...r,owner});
  const prev=expected.get(key);if(r.expectedRevision!==(prev?.revision??0))fail('OWNERSHIP_REVISION_CHANGED');
  if(prev&&!byUid.has(prev.owner))fail('PREVIOUS_OWNER_NOT_LOCKED');
  if(prev&&prev.owner!==owner)moves.push({key,from:prev.owner,to:owner,expectedRevision:prev.revision});
  if(!time(r.periodStart)||!time(r.periodEnd)||!time(r.endsAt)||r.periodStart>now||r.periodEnd<=r.periodStart||r.endsAt<r.periodEnd||!['trialing','active','expired','in_grace_period','in_billing_retry','paused','unknown','incomplete'].includes(r.status)||!['will_renew','will_not_renew','will_change_product','will_pause','requires_price_increase_consent','has_already_renewed'].includes(r.renewal)||(r.endsAt!==r.periodEnd&&r.renewal!=='has_already_renewed')||!(r.graceEnd===null||time(r.graceEnd)))fail('PERIOD_INVALID');
  if(r.givesAccess&&(!catalog.products[r.product]||catalog.products[r.product].entitlement!==r.entitlement))fail('PRODUCT_ENTITLEMENT_UNKNOWN');
 }
 // Every previously owned receipt must be re-observed, including other stores/products.
 for(const b of bindings){if(!byUid.has(b.owner)||!current.has(b.key))fail('INCOMPLETE_PREVIOUS_OWNERSHIP');}
 for(const a of accounts){
  const paid=[...current.values()].filter(r=>r.owner===a.uid&&r.givesAccess);
  paid.sort((x,y)=>(rank[catalog.products[y.product].plan]-rank[catalog.products[x.product].plan])||y.periodEnd-x.periodEnd);
  const top=paid[0];
  if(!top){if(a.v1Plan!=='newbie'||a.v1Product!==null||a.v1Store!==null||a.v1PurchaseAt!==null||a.v1ExpiresAt!==null)fail('V1_V2_DISAGREE');continue;}
  const p=catalog.products[top.product];
  if(a.v1Plan!==p.plan||a.v1Product!==top.product||a.v1Store!==top.store||a.v1PurchaseAt!==top.periodStart||!a.v1ExpiresAt||a.v1ExpiresAt<=now||!(top.status==='in_grace_period' ? top.periodEnd<=now&&top.graceEnd===a.v1ExpiresAt&&top.graceEnd>top.periodEnd : top.graceEnd===null&&(a.v1ExpiresAt===top.periodEnd||(top.renewal==='has_already_renewed'&&a.v1ExpiresAt===top.endsAt))))fail('V1_V2_DISAGREE');
 }
 return {accounts:[...byUid.keys()].sort(), moves, receipts:[...current.values()].sort((a,b)=>receiptKey(a).localeCompare(receiptKey(b))), expectedVersions:Object.fromEntries(accounts.map(a=>[a.uid,a.version]))};
}

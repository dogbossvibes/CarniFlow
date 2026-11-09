import { reportFailure, type Stage } from './diagnostics.ts';
export type HandlerDeps={authenticate:(token:string)=>Promise<string|null>;reserve:(token:string)=>Promise<void>;reconcile:(ids:string[])=>Promise<unknown>};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const object=(x:unknown):Record<string,unknown>=>{if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('SHAPE');return x as Record<string,unknown>;};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function syncHandler(d:HandlerDeps){return async(req:Request)=>{
 if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 const requestId=crypto.randomUUID();let stage:Stage='authenticate';
 try{const token=req.headers.get('Authorization')??'',uid=await d.authenticate(token);if(!uid||!uuid.test(uid))return json({error:'AUTH_REQUIRED'},401);
  stage='request';const text=await req.text();if(text.length>256||(text.trim()&&Object.keys(object(JSON.parse(text))).length))return json({error:'INVALID_REQUEST'},400);
  stage='reserve';await d.reserve(token);stage='reconcile';const states=object(await d.reconcile([uid]));const state=object(states[uid]);if(state.verified!==true)throw new Error('UNCONFIRMED_STATE');return json({version:1,state});
 }catch(error){reportFailure(error,'sync',stage,requestId);return json({error:'SUBSCRIPTION_SYNC_PENDING',requestId},503);}
};}
export function webhookHandler(d:HandlerDeps,secret:string|undefined){return async(req:Request)=>{
 if(req.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
 if(!secret||req.headers.get('Authorization')!==secret)return json({error:'AUTH_REQUIRED'},401);
 const requestId=crypto.randomUUID();let stage:Stage='request';
 try{const text=await req.text();if(text.length>65536)return json({error:'INVALID_REQUEST'},400);const event=object(object(JSON.parse(text)).event);
  if(event.type==='TEST')return json({ok:true});
  // Sandbox events never become production writes. No use of event plan/expiry as proof.
  if(event.environment==='SANDBOX')return json({ok:true,ignored:'sandbox'});
  const candidates=event.type==='TRANSFER'?[...(Array.isArray(event.transferred_from)?event.transferred_from:[]),...(Array.isArray(event.transferred_to)?event.transferred_to:[])]:[event.app_user_id];
  const ids=[...new Set(candidates.filter((x):x is string=>typeof x==='string'&&uuid.test(x)))];
  if(!ids.length||ids.length>50)throw new Error('OWNERSHIP_SCOPE');
  // One transaction for the full discovered ownership component, never per-event sequential grants.
  stage='reconcile';const states=object(await d.reconcile(ids));if(!Object.values(states).some(v=>object(v).verified===true)||ids.some(id=>{const s=object(states[id]);return s.verified!==true&&!(s.verified===false&&s.legacyUnboundPreserved===true);}))throw new Error('UNCONFIRMED_STATE');return json({ok:true,reconciled:ids.length});
 }catch(error){reportFailure(error,'webhook',stage,requestId);return json({error:'SUBSCRIPTION_SYNC_PENDING',requestId},503);}
};}

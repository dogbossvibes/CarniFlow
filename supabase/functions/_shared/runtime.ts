import { DiagnosticError, type Rpc } from './diagnostics.ts';
// eslint-disable-next-line import/no-unresolved -- Deno dependency checked separately.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';
import { reconcileOwned, type State } from './reconcile.ts';
import { ownershipProvider, catalog } from './provider.ts';
import { receiptKey } from './ownership.ts';
export function ownedRuntime(){
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const client=(token:string)=>createClient(url,anon,{global:{headers:{Authorization:token}},auth:{persistSession:false}});
 async function rpc(name:Rpc,args:Record<string,unknown>){const {data,error}=await admin.rpc(name,args);if(error)throw new DiagnosticError('DATABASE_RPC',{rpc:name,databaseCode:error.code});return data;}
 return {
  authenticate:async(token:string)=>{const {data,error}=await client(token).auth.getUser();return error||!data.user?.email_confirmed_at?null:data.user.id;},
  reserve:async(token:string)=>{const {error}=await client(token).rpc('subscription_client_v1',{p_action:'reserve_sync'});if(error)throw new DiagnosticError('DATABASE_RPC',{rpc:'subscription_client_v1',databaseCode:error.code});},
  reconcile:async(uids:string[])=>{
   if(Deno.env.get('SUBSCRIPTION_OWNERSHIP_ENABLED')!=='true')throw new Error('AUTHORITY_NOT_ACTIVATED');
   // Request-local keys: no account state or tokens survive in shared module memory.
   const keys=new Set<string>();const provider=ownershipProvider(Deno.env.get('REVENUECAT_SECRET_API_KEY')??'',Deno.env.get('REVENUECAT_V2_READ_KEY')??'');
   const state=async(ids:string[]):Promise<State>=>rpc('subscription_owned_state_v1',{p_users:ids,p_keys:[...keys]});
   return reconcileOwned(uids,{
    state,catalog,
    discover:async(ids,previous)=>{const observed=await provider.observe(ids,previous);for(const r of observed.receipts)keys.add(receiptKey(r));const known=await state(ids);return [...observed.receipts.map(r=>r.owner),...known.bindings.map(b=>b.owner)];},
    acquire:async(uid)=>{const lease=crypto.randomUUID();if(await rpc('subscription_reconcile_lease_v1',{p_user_id:uid,p_lease:lease,p_release:false})!==true)throw new Error('RECONCILIATION_BUSY');return lease;},
    release:async(uid,lease)=>{await rpc('subscription_reconcile_lease_v1',{p_user_id:uid,p_lease:lease,p_release:true});},
    collect:provider.collect,
    apply:async(accounts,receipts)=>rpc('subscription_apply_owned_v1',{p_accounts:accounts,p_receipts:receipts})
   });
  }
 };
}

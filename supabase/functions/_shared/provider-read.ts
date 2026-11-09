import { DiagnosticError, providerOperation } from './diagnostics.ts';
/** GET-only RevenueCat V2 transport. No caller-controlled origin or arbitrary next-page URL. */
export type Json = Record<string, unknown>;
const obj=(v:unknown):Json=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('PROVIDER_SHAPE');return v as Json;};
export function providerReader(project:string, secret:string, fetcher:typeof fetch=fetch) {
 if(!/^proj[a-zA-Z0-9]+$/.test(project)||!secret)throw new Error('PROVIDER_CONFIG');
 const prefix=`/v2/projects/${encodeURIComponent(project)}/`;
 async function read(path:string):Promise<Json>{
  const url=new URL(path,'https://api.revenuecat.com');
  if(url.origin!=='https://api.revenuecat.com'||!url.pathname.startsWith(prefix)||url.username||url.password||url.hash)throw new Error('PROVIDER_SCOPE');
  let res:Response;try{res=await fetcher(url.toString(),{method:'GET',headers:{Authorization:`Bearer ${secret}`,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});}catch{throw new DiagnosticError('PROVIDER_NETWORK',{operation:providerOperation(url.pathname)});}
  if(!res.ok)throw new DiagnosticError('PROVIDER_HTTP',{operation:providerOperation(url.pathname),status:res.status});
  try{return obj(await res.json());}catch{throw new DiagnosticError('PROVIDER_RESPONSE',{operation:providerOperation(url.pathname)});}
 }
 async function list(path:string):Promise<Json[]>{
  let next:string|null=path;const seen=new Set<string>();const items:Json[]=[];const base=new URL(path,'https://api.revenuecat.com');
  while(next){
   const u=new URL(next,'https://api.revenuecat.com');
   if(u.origin!==base.origin||u.pathname!==base.pathname||seen.has(u.toString())||seen.size>=10)throw new Error('PROVIDER_PAGINATION');
   for(const [k,v] of base.searchParams){if(k!=='starting_after'&&u.searchParams.get(k)!==v)throw new Error('PROVIDER_PAGINATION');}
   seen.add(u.toString());const page=await read(u.toString());
   if(page.object!=='list'||!Array.isArray(page.items)||!(page.next_page===null||page.next_page===undefined||typeof page.next_page==='string'))throw new Error('PROVIDER_SHAPE');
   items.push(...page.items.map(obj));if(items.length>500)throw new Error('PROVIDER_BOUND');next=typeof page.next_page==='string'?page.next_page:null;
  }return items;
 }
 return {read,list,prefix};
}

import * as Crypto from 'expo-crypto';
import { getLocalDb } from '@/lib/localDb/client';
import { parseDistractionTrack, DISTRACTION_LIMITS } from '@/features/tracking-distractions/model';
import { parseFile, canonicalReference, ExchangeError, uuid, label, type TrackOffer, type TrackReturn, type ExchangeReference } from './contract';
export interface ExchangeRow { taskId:string; parentId:string; role:'outgoing'|'incoming'; offer:TrackOffer }
export interface ExchangeSummary { taskId:string;parentId:string;role:'outgoing'|'incoming';title:string;referenceDigest:string;createdAtMs:number;finishedContributions:number;returns:{id:string;name:string;createdAtMs:number}[] }
interface RawRow { task_id:string; parent_id:string; role:'outgoing'|'incoming'; offer_json:string }
export interface ExchangeTx {
 getFirstAsync<T>(sql:string,...args:(string|number)[]):Promise<T|null>;
 getAllAsync<T>(sql:string,...args:(string|number)[]):Promise<T[]>;
 runAsync(sql:string,...args:(string|number)[]):Promise<unknown>;
}
export interface ExchangeDeps {
 scope():{userId:string|null;epoch:number}; transaction<T>(fn:(tx:ExchangeTx)=>Promise<T>):Promise<T>;
 digest(text:string):Promise<string>; randomId():string; now():number;
}
function row(raw:RawRow):ExchangeRow {
 const offer=parseFile(JSON.parse(raw.offer_json)); if(offer.kind!=='distraction-request'||offer.taskId!==raw.task_id)throw new ExchangeError('INVALID');
 return {taskId:raw.task_id,parentId:raw.parent_id,role:raw.role,offer};
}
/** All storage scoped to the signed-in account; file identities confer no backend rights. */
export function createExchangeRepository(ownerId:string,deps:ExchangeDeps) {
 const epoch=deps.scope().epoch;
 const check=()=>{const s=deps.scope();if(!ownerId||s.userId!==ownerId||s.epoch!==epoch)throw new ExchangeError('ACCOUNT_CHANGED');};
 const find=async(tx:ExchangeTx,taskId:string)=>{check();const r=await tx.getFirstAsync<RawRow>('select task_id,parent_id,role,offer_json from local_track_exchange where owner_id=? and task_id=?',ownerId,taskId);check();return r?row(r):null;};
 const verify=async(offer:TrackOffer)=>{check();const digest=await deps.digest(canonicalReference(offer.reference));check();if(digest!==offer.referenceDigest)throw new ExchangeError('INVALID');};
 return {
  /** Read-only projection of existing records. A file export is never a delivery receipt. */
  async summaries():Promise<{rows:ExchangeSummary[];limited:boolean}>{check();return deps.transaction(async tx=>{
   // Fetch metadata only: the hub must not materialise hundreds of GPS payloads.
   type Meta={task_id:string;parent_id:string;role:'outgoing'|'incoming';created_at:number;format:string;version:number;kind:string;payload_task:string;title:string;digest:string};
   const offerJson="case when json_valid(offer_json) then offer_json else '{}' end";
   const raw=await tx.getAllAsync<Meta>(`select task_id,parent_id,role,created_at,
    json_extract(${offerJson},'$.format') as format,json_extract(${offerJson},'$.version') as version,
    json_extract(${offerJson},'$.kind') as kind,json_extract(${offerJson},'$.taskId') as payload_task,
    json_extract(${offerJson},'$.title') as title,json_extract(${offerJson},'$.referenceDigest') as digest
    from local_track_exchange where owner_id=? and task_id not in (select local_task_id from local_track_group_tasks where owner_id=local_track_exchange.owner_id)
    order by created_at desc,task_id limit 201`,ownerId);check();
   const tasks=raw.slice(0,200).map(value=>{
    uuid(value.task_id);uuid(value.parent_id.startsWith('local_')?value.parent_id.slice(6):value.parent_id);
    if(value.format!=='anyvo-track'||value.version!==1||value.kind!=='distraction-request'||value.payload_task!==value.task_id||!['incoming','outgoing'].includes(value.role)||typeof value.digest!=='string'||!/^[a-f0-9]{64}$/.test(value.digest)||!Number.isSafeInteger(value.created_at)||value.created_at<0)throw new ExchangeError('INVALID');
    return {taskId:value.task_id,parentId:value.parent_id,role:value.role,title:label(value.title,80),referenceDigest:value.digest,createdAtMs:value.created_at};
   });
   const rows:ExchangeSummary[]=[];
   if(tasks.length){
    const parents=[...new Set(tasks.map(task=>task.parentId))], ids=tasks.map(task=>task.taskId);
    const placeholders=(values:string[])=>values.map(()=>'?').join(',');
    const payload="case when json_valid(payload_json) then payload_json else '{}' end";
    const children=await tx.getAllAsync<{parent_session_id:string;payload_parent:string;finished_type:string;finished_at:number|null}>(`select parent_session_id,json_extract(${payload},'$.parentSessionId') as payload_parent,json_type(${payload},'$.finishedAtMs') as finished_type,json_extract(${payload},'$.finishedAtMs') as finished_at from local_track_distractions where owner_id=? and parent_session_id in (${placeholders(parents)})`,ownerId,...parents);check();
    const finished=new Map<string,number>();
    for(const child of children){
     if(child.payload_parent!==child.parent_session_id||!['null','integer'].includes(child.finished_type)||child.finished_at!==null&&(!Number.isSafeInteger(child.finished_at)||child.finished_at<0))throw new ExchangeError('INVALID');
     if(child.finished_at!==null)finished.set(child.parent_session_id,(finished.get(child.parent_session_id)??0)+1);
    }
    type ReceiptMeta={task_id:string;contribution_id:string;created_at:number;format:string;version:number;kind:string;payload_task:string;digest:string;child_id:string;parent_id:string;name:string};
    const receipts=await tx.getAllAsync<ReceiptMeta>(`select task_id,contribution_id,created_at,json_extract(${payload},'$.format') as format,json_extract(${payload},'$.version') as version,json_extract(${payload},'$.kind') as kind,json_extract(${payload},'$.taskId') as payload_task,json_extract(${payload},'$.referenceDigest') as digest,json_extract(${payload},'$.contribution.id') as child_id,json_extract(${payload},'$.contribution.parentSessionId') as parent_id,json_extract(${payload},'$.contribution.name') as name from local_track_exchange_receipts where owner_id=? and task_id in (${placeholders(ids)}) order by created_at desc,contribution_id`,ownerId,...ids);check();
    for(const task of tasks){
     const returns=receipts.filter(receipt=>receipt.task_id===task.taskId).map(receipt=>{
      uuid(receipt.contribution_id);
      if(task.role!=='outgoing'||receipt.format!=='anyvo-track'||receipt.version!==1||receipt.kind!=='distraction-return'||receipt.payload_task!==task.taskId||receipt.child_id!==receipt.contribution_id||receipt.parent_id!==task.taskId||receipt.digest!==task.referenceDigest||!Number.isSafeInteger(receipt.created_at)||receipt.created_at<0)throw new ExchangeError('INVALID');
      return {id:receipt.contribution_id,name:label(receipt.name,DISTRACTION_LIMITS.name),createdAtMs:receipt.created_at};});
     rows.push({...task,finishedContributions:finished.get(task.parentId)??0,returns});
    }
   }
   check();return {rows,limited:raw.length>200};
  });},
  async list():Promise<ExchangeRow[]>{check();return deps.transaction(async tx=>{const rows=await tx.getAllAsync<RawRow>('select task_id,parent_id,role,offer_json from local_track_exchange where owner_id=? and task_id not in (select local_task_id from local_track_group_tasks where owner_id=local_track_exchange.owner_id) order by created_at desc limit 200',ownerId);check();return rows.map(row);});},
  async get(taskId:string){uuid(taskId);return deps.transaction(tx=>find(tx,taskId));},
  async create(parentId:string,title:string,reference:ExchangeReference):Promise<ExchangeRow>{
   check();const offer=parseFile({format:'anyvo-track',version:1,kind:'distraction-request',taskId:deps.randomId(),title,referenceDigest:await deps.digest(canonicalReference(reference)),reference}) as TrackOffer;check();
   return deps.transaction(async tx=>{check();await tx.runAsync('insert into local_track_exchange(owner_id,task_id,role,parent_id,offer_json,created_at) values(?,?,?,?,?,?)',ownerId,offer.taskId,'outgoing',parentId,JSON.stringify(offer),deps.now());check();return {taskId:offer.taskId,parentId,role:'outgoing',offer};});
  },
  async accept(input:TrackOffer):Promise<ExchangeRow>{
   const offer=parseFile(input);if(offer.kind!=='distraction-request')throw new ExchangeError('INVALID');await verify(offer);
   return deps.transaction(async tx=>{const old=await find(tx,offer.taskId);
    if(old){if(old.role!=='incoming'||JSON.stringify(old.offer)!==JSON.stringify(offer))throw new ExchangeError('CONFLICT');return old;}
    const parentId=deps.randomId();check();await tx.runAsync('insert into local_track_exchange(owner_id,task_id,role,parent_id,offer_json,created_at) values(?,?,?,?,?,?)',ownerId,offer.taskId,'incoming',parentId,JSON.stringify(offer),deps.now());check();return {taskId:offer.taskId,parentId,role:'incoming',offer};
   });
  },
  async makeReturn(taskId:string,childId:string):Promise<TrackReturn>{
   return deps.transaction(async tx=>{const task=await find(tx,taskId);if(!task||task.role!=='incoming')throw new ExchangeError('NOT_FOUND');
    const raw=await tx.getFirstAsync<{payload_json:string}>('select payload_json from local_track_distractions where owner_id=? and parent_session_id=? and id=?',ownerId,task.parentId,childId);check();if(!raw)throw new ExchangeError('NOT_FOUND');
    const contribution=parseDistractionTrack(JSON.parse(raw.payload_json));if(contribution.parentSessionId!==task.parentId)throw new ExchangeError('INVALID');
    return parseFile({format:'anyvo-track',version:1,kind:'distraction-return',taskId,referenceDigest:task.offer.referenceDigest,contribution:{...contribution,parentSessionId:taskId}}) as TrackReturn;
   });
  },
  async applyReturn(input:TrackReturn,currentReference:ExchangeReference):Promise<{parentId:string;childId:string;duplicate:boolean}>{
   const value=parseFile(input);if(value.kind!=='distraction-return')throw new ExchangeError('INVALID');check();
   const currentDigest=await deps.digest(canonicalReference(currentReference));check();
   return deps.transaction(async tx=>{const task=await find(tx,value.taskId);if(!task||task.role!=='outgoing')throw new ExchangeError('NOT_FOUND');
    if(value.referenceDigest!==task.offer.referenceDigest||currentDigest!==value.referenceDigest)throw new ExchangeError('CONFLICT');
    const payload=JSON.stringify(value);const receipt=await tx.getFirstAsync<{payload_json:string;local_child_id:string}>('select payload_json,local_child_id from local_track_exchange_receipts where owner_id=? and task_id=? and contribution_id=?',ownerId,value.taskId,value.contribution.id);check();
    if(receipt){if(receipt.payload_json!==payload)throw new ExchangeError('CONFLICT');return {parentId:task.parentId,childId:receipt.local_child_id,duplicate:true};}
    const count=await tx.getFirstAsync<{count:number}>('select count(*) as count from local_track_distractions where owner_id=? and parent_session_id=?',ownerId,task.parentId);check();if(!count||count.count>=DISTRACTION_LIMITS.tracks)throw new ExchangeError('CONFLICT');
    const childId=deps.randomId();const child=parseDistractionTrack({...value.contribution,id:childId,parentSessionId:task.parentId});
    await tx.runAsync('insert into local_track_distractions(id,owner_id,parent_session_id,revision,updated_at,payload_json) values(?,?,?,?,?,?)',childId,ownerId,task.parentId,1,deps.now(),JSON.stringify(child));check();
    await tx.runAsync('insert into local_track_exchange_receipts(owner_id,task_id,contribution_id,payload_json,local_child_id,created_at) values(?,?,?,?,?,?)',ownerId,value.taskId,value.contribution.id,payload,childId,deps.now());check();
    return {parentId:task.parentId,childId,duplicate:false};
   });
  },
 };
}
export function exchangeRepository(ownerId:string,scope:ExchangeDeps['scope']) {
 return createExchangeRepository(ownerId,{scope,randomId:Crypto.randomUUID,now:Date.now,digest:text=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,text),async transaction<T>(fn:(tx:ExchangeTx)=>Promise<T>){const db=await getLocalDb();let value!:T;await db.withExclusiveTransactionAsync(async tx=>{value=await fn(tx);});return value;}});
}

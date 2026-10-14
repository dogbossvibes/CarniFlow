import * as Crypto from 'expo-crypto';
import { getLocalDb } from '@/lib/localDb/client';
import { canonicalReference,parseFile,ExchangeError,type TrackOffer } from '../contract';
import type { ExchangeRow } from '../repository';
import type { TaskDetail } from './tasks';
/** Links a server-verified task to a distinct local exchange ID. Files cannot impersonate server task IDs. */
export async function ensureLocalGroupTask(detail:TaskDetail,ownerId:string,check:()=>void):Promise<ExchangeRow>{
 check();if(!detail.reference||(ownerId!==detail.task.creatorUserId&&ownerId!==detail.task.recipientUserId))throw new ExchangeError('NOT_FOUND');
 const role=detail.task.creatorUserId===ownerId?'outgoing':'incoming';
 const digest=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,canonicalReference(detail.reference));check();
 const offer=parseFile({format:'anyvo-track',version:1,kind:'distraction-request',taskId:Crypto.randomUUID(),title:'Verleitungsaufgabe',referenceDigest:digest,reference:detail.reference}) as TrackOffer;
 const db=await getLocalDb();let result!:ExchangeRow;
 await db.withExclusiveTransactionAsync(async tx=>{
  check();const previous=await tx.getFirstAsync<{task_id:string;parent_id:string;role:ExchangeRow['role'];offer_json:string;reference_digest:string}>('select e.task_id,e.parent_id,e.role,e.offer_json,g.reference_digest from local_track_group_tasks g join local_track_exchange e on e.owner_id=g.owner_id and e.task_id=g.local_task_id where g.owner_id=? and g.server_task_id=?',ownerId,detail.task.taskId);check();
  if(previous){const saved=parseFile(JSON.parse(previous.offer_json));if(saved.kind!=='distraction-request'||saved.referenceDigest!==digest||previous.reference_digest!==detail.task.referenceDigest||previous.role!==role)throw new ExchangeError('CONFLICT');result={taskId:previous.task_id,parentId:previous.parent_id,role,offer:saved};return;}
  const parentId=role==='outgoing'?detail.task.sourceTrainingId:Crypto.randomUUID();
  await tx.runAsync('insert into local_track_exchange(owner_id,task_id,role,parent_id,offer_json,created_at) values(?,?,?,?,?,?)',ownerId,offer.taskId,role,parentId,JSON.stringify(offer),Date.now());check();
  await tx.runAsync('insert into local_track_group_tasks(owner_id,server_task_id,local_task_id,reference_digest) values(?,?,?,?)',ownerId,detail.task.taskId,offer.taskId,detail.task.referenceDigest);check();result={taskId:offer.taskId,parentId,role,offer};
 });check();return result;
}

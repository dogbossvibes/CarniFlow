import { getLocalDb } from '@/lib/localDb/client';
import { displayReference, ExchangeError, parseFile } from './contract';
/** Foreign files live in their own account-scoped table, never in the cloud owner cache. */
export async function readImportedParent(ownerId:string,parentId:string) {
 const db=await getLocalDb();
 const row=await db.getFirstAsync<{offer_json:string}>('select offer_json from local_track_exchange where owner_id=? and parent_id=? and role=?',ownerId,parentId,'incoming');
 if(!row)return null;const offer=parseFile(JSON.parse(row.offer_json));if(offer.kind!=='distraction-request')throw new ExchangeError('INVALID');
 const group=await db.getFirstAsync<{server_task_id:string}>('select server_task_id from local_track_group_tasks where owner_id=? and local_task_id=?',ownerId,offer.taskId);
 return {...displayReference(offer.reference,parentId,ownerId),exchangeTaskId:offer.taskId,...(group?{groupTaskId:group.server_task_id}:{})};
}

import type { TrackFile } from './contract';
import { ExchangeError,parseFile,uuid } from './contract';
const pending=new Map<string,{ownerId:string;file:TrackFile;expires:number}>();
/** One-time in-memory handoff from the next build's native-intent handler. No raw URI routing. */
export function putPendingTrackFile(token:string,ownerId:string,file:TrackFile,now=Date.now()) {
 uuid(token);if(!ownerId)throw new ExchangeError('ACCOUNT_CHANGED');
 for(const [key,row]of pending)if(row.expires<=now)pending.delete(key);
 if(pending.size>=3)pending.delete(pending.keys().next().value!);
 pending.set(token,{ownerId,file:parseFile(file),expires:now+600000});
}
export function takePendingTrackFile(token:string,ownerId:string,now=Date.now()):TrackFile {
 uuid(token);const row=pending.get(token);pending.delete(token);
 if(!row||row.ownerId!==ownerId||row.expires<=now)throw new ExchangeError('NOT_FOUND');return row.file;
}

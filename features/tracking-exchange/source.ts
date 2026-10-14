import { restoreLayContinuity } from '@/features/tracking/utils/trackContinuity';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { getTrackPointsBySession, getTrackMarkersBySession } from '@/features/tracking/repositories/localTrackRepository';
import { buildLocalTrackDetail } from '@/features/tracking/utils/localTrackDetail';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { readParentDetail } from '@/features/tracking-distractions/readParentDetail';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { ExchangeError, referenceFromMap } from './contract';
/** A minimized laid reference: no search, account, dog, notes, audio or results. */
export async function readExchangeSource(id:string,ownerId:string,check:()=>void) {
 check();const state=useTrackingStore.getState();if(state.isRecording||state.isRunningTrack)throw new ExchangeError('UNAVAILABLE');
 const local=await getLocalTrainingSessionById(id);check();
 let detail:Record<string,unknown>;
 if(local){
  if(local.user_id!==ownerId||local.type!=='track'||local.deleted_at||local.status!=='completed')throw new ExchangeError('NOT_FOUND');
  const [points,markers]=await Promise.all([getTrackPointsBySession(id),getTrackMarkersBySession(id)]);check();
  const payload=JSON.parse(local.payload_json||'{}');
  if(payload.trackTransferReceipt)throw new ExchangeError('UNAVAILABLE');
  const localDetail=buildLocalTrackDetail(local,points,markers);
  // The legacy Android detail adapter discards own point payloads and session
  // continuity. Export must read that original evidence before any projection.
  detail={...localDetail,distance_meters:typeof payload.distanceMeters==='number'?payload.distanceMeters:null,status:local.status,type:local.type,
   track_data:{...localDetail.track_data,layContinuity:payload.layContinuity},
   points:points.map(p=>({latitude:p.latitude,longitude:p.longitude,point_type:p.point_type??'lay',timestamp:p.timestamp,payload_json:p.payload_json}))};
 }else{const result=await readParentDetail(id,ownerId);check();if(result.error||!result.data)throw new ExchangeError('NOT_FOUND');detail=result.data;}
 if(detail.owner_id!==ownerId||detail.id!==id||detail.status!=='completed'||detail.type!=='track'||detail.deleted_at)throw new ExchangeError('NOT_FOUND');
 // Borrowed search copies cannot be redistributed as an original laid track.
 const trackData=detail.track_data as Record<string,unknown>|null;
 if(trackData?.trackTransferReceipt)throw new ExchangeError('UNAVAILABLE');
 const date=detail.started_at??detail.created_at??detail.session_date;
 // Android's existing detail adapter drops ordinary lay break flags. Preserve
 // the saved sections in this independent export projection only.
 const points=restoreLayContinuity((detail.points??[]) as {latitude:number;longitude:number;point_type?:string;timestamp?:string;breakBefore?:boolean}[],trackData?.layContinuity).filter(p=>(p.point_type??'lay')==='lay');
 const map=buildTrackDetailMap({...detail,points,runs:[]});
 map.lay=points.map(p=>({lat:p.latitude,lng:p.longitude,breakBefore:p.breakBefore===true}));
 map.start=map.lay[0]??null;map.end=map.lay.at(-1)??null;map.hasLay=map.lay.length>1;
 return referenceFromMap(map,typeof date==='string'?date:null);
}

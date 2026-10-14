import { readExchangeSource } from '../source';
import { ids } from './fixture';
const mockLocal=jest.fn(),mockPoints=jest.fn(),mockMarkers=jest.fn(),mockRemote=jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository',()=>({getLocalTrainingSessionById:(...a:unknown[])=>mockLocal(...a)}));
jest.mock('@/features/tracking/repositories/localTrackRepository',()=>({getTrackPointsBySession:(...a:unknown[])=>mockPoints(...a),getTrackMarkersBySession:(...a:unknown[])=>mockMarkers(...a)}));
jest.mock('@/features/tracking-distractions/readParentDetail',()=>({readParentDetail:(...a:unknown[])=>mockRemote(...a)}));
jest.mock('@/features/tracking/store/trackingStore',()=>({useTrackingStore:{getState:()=>({isRecording:false,isRunningTrack:false})}}));
beforeEach(()=>{jest.clearAllMocks();mockLocal.mockResolvedValue(null);mockRemote.mockResolvedValue({data:{id:ids.parent,owner_id:'owner',dog_id:'dog',status:'completed',type:'track',started_at:'2026-10-14T12:00:00Z',distance_meters:111,points:[{latitude:47,longitude:8},{latitude:47.001,longitude:8}],markers:[],runs:[{run_points:[{lat:0,lng:0}]}],notes:'private'}});});
it('exports actual owner data only and never leaks search, notes or dog identity',async()=>{const r=await readExchangeSource(ids.parent,'owner',()=>{});expect(r.points).toHaveLength(2);expect(JSON.stringify(r)).not.toMatch(/private|dog|run_points|owner/);});
it('checks cloud ownership and incomplete/foreign data before reference projection',async()=>{await expect(readExchangeSource(ids.parent,'other',()=>{})).rejects.toThrow('NOT_FOUND');});
it('preserves BW and Abriss directions and explicit gaps from persisted metadata',async()=>{mockRemote.mockResolvedValue({data:{id:ids.parent,owner_id:'owner',status:'completed',type:'track',points:[{latitude:47,longitude:8},{latitude:47.001,longitude:8},{latitude:48,longitude:9,timestamp:'2026-10-14T12:00:30Z'}],markers:[{id:'m',marker_type:'winkel',angle_kind:'abriss',latitude:47.001,longitude:8,distance_from_start:111}],track_data:{manualAngleGeometry:[{markerKey:'abriss:47.0010000:8.0000000:111.0',manualMarkerType:'abriss',geometryDirection:'rechts',geometrySharpness:'unresolved'}],layContinuity:{version:1,breakBeforeTimestamps:['2026-10-14T12:00:30Z']}}}});const r=await readExchangeSource(ids.parent,'owner',()=>{});expect(r.points[2].breakBefore).toBe(true);expect(r.markers[0].geometryDirection).toBe('rechts');});
it('rejects borrowed local copy and never falls back to cloud on wrong local owner',async()=>{mockLocal.mockResolvedValue({user_id:'other',local_id:ids.parent,type:'track',status:'completed'});await expect(readExchangeSource(ids.parent,'owner',()=>{})).rejects.toThrow();expect(mockRemote).not.toHaveBeenCalled();});

it.each(['point','session'])('preserves local Android %s boundary evidence through actual adapter',async kind=>{
 const timestamp='2026-10-14T12:00:30.000Z';
 mockLocal.mockResolvedValue({local_id:ids.parent,user_id:'owner',dog_id:'dog',type:'track',status:'completed',deleted_at:null,created_at:'2026-10-14T12:00:00.000Z',payload_json:JSON.stringify({distanceMeters:2,...(kind==='session'?{layContinuity:{version:1,breakBeforeTimestamps:[timestamp]}}:{})})});
 mockPoints.mockResolvedValue([{latitude:47,longitude:8,point_type:'lay',timestamp:'2026-10-14T12:00:00.000Z',payload_json:'{}'},{latitude:47.00002,longitude:8,point_type:'lay',timestamp:'2026-10-14T12:00:01.000Z',payload_json:'{}'},{latitude:48,longitude:9,point_type:'lay',timestamp,payload_json:JSON.stringify(kind==='point'?{breakBefore:true}:{})}]);mockMarkers.mockResolvedValue([]);
 expect((await readExchangeSource(ids.parent,'owner',()=>{})).points[2].breakBefore).toBe(true);
});

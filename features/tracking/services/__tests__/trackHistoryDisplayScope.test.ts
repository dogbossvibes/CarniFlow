import {getLocalTrackDetail} from '../trackHistoryService';
const mockSession=jest.fn(),mockPoints=jest.fn(),mockMarkers=jest.fn();
jest.mock('@/features/training/repositories/localTrainingRepository',()=>({getLocalTrainingSessionById:(...a:unknown[])=>mockSession(...a)}));
jest.mock('@/features/tracking/repositories/localTrackRepository',()=>({getTrackPointsBySession:(...a:unknown[])=>mockPoints(...a),getTrackMarkersBySession:(...a:unknown[])=>mockMarkers(...a)}));
jest.mock('@/features/tracking/services/trackService',()=>({getUserTrackSessions:jest.fn()}));
jest.mock('@/features/sync/repositories/syncQueueRepository',()=>({enqueueSyncOperation:jest.fn()}));
beforeEach(()=>{jest.clearAllMocks();mockSession.mockResolvedValue({local_id:'s',user_id:'u',dog_id:'d',payload_json:'{}'});mockPoints.mockResolvedValue([]);mockMarkers.mockResolvedValue([]);});
it.each([undefined,null,'other'])('an owned-only display read refuses user %s before reading location rows',async user=>{
 expect(await getLocalTrackDetail('s',user,{ownedOnly:true})).toBeNull();expect(mockPoints).not.toHaveBeenCalled();expect(mockMarkers).not.toHaveBeenCalled();
});
it('does not restore a locally deleted recording into a partial remote map',async()=>{
 mockSession.mockResolvedValue({local_id:'s',user_id:'u',dog_id:'d',payload_json:'{}',deleted_at:'2026-10-22'});
 expect(await getLocalTrackDetail('s','u',{ownedOnly:true})).toBeNull();expect(mockPoints).not.toHaveBeenCalled();
});
it('loads a matching owned recording read-only',async()=>{
 expect(await getLocalTrackDetail('s','u',{ownedOnly:true})).toMatchObject({id:'s',owner_id:'u',dog_id:'d',points:[],runs:[]});expect(mockPoints).toHaveBeenCalledWith('s');
});

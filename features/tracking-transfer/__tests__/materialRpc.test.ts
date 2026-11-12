import { createSupabaseTransferClient } from '../rpc';
const mockRpc=jest.fn();
jest.mock('@/lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'owner'}}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:jest.fn()}}})},rpc:(...args:unknown[])=>({abortSignal:()=>mockRpc(...args)})}}));
beforeEach(()=>jest.resetAllMocks());
it('uses the versioned marker protocol without mutating the persisted operation identity',async()=>{
 mockRpc.mockResolvedValue({data:{version:1,markerContractVersion:2,serverNowMs:100},error:null});
 const client=createSupabaseTransferClient(),request={transferId:'transfer',receiptId:'receipt'};
 await client.call('owner','accept',request);
 expect(mockRpc).toHaveBeenCalledWith('track_transfer_v2',{p_action:'accept',p_request:{...request,markerContractVersion:2}});
 expect(request).toEqual({transferId:'transfer',receiptId:'receipt'});client.dispose();
});
it('does not accept an unversioned legacy response or fall back to an old write endpoint',async()=>{
 mockRpc.mockResolvedValue({data:{version:1,serverNowMs:100},error:null});
 const client=createSupabaseTransferClient();await expect(client.call('owner','accept',{})).rejects.toMatchObject({code:'INVALID_RESPONSE'});
 expect(mockRpc).toHaveBeenCalledTimes(1);client.dispose();
});

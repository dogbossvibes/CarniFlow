import {useActiveTrialOffer} from '../useActiveTrialOffer';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
const mockBuy=jest.fn(),mockActivate=jest.fn(),mockStarted=jest.fn(),mockRefresh=jest.fn(),mockLog=jest.fn(),mockInvalidate=jest.fn();
let mockUid:string|null='A',mockCurrent=true;
jest.mock('@/hooks/useSession',()=>({useSession:()=>({session:mockUid?{user:{id:mockUid,created_at:'2020-01-01'}}:null})}));
jest.mock('@/hooks/useCapabilities',()=>({useCapabilities:()=>({loading:false,isPro:false,isTrainerModule:false,hasLifetimeAccess:false,refresh:mockRefresh})}));
jest.mock('@/hooks/useTrainingFeed',()=>({useTrainingFeed:()=>({feed:[{}]})}));
jest.mock('@tanstack/react-query',()=>({useQuery:()=>({data:null,isPending:false,refetch:jest.fn()}),useQueryClient:()=>({invalidateQueries:mockInvalidate})}));
jest.mock('@/lib/purchases',()=>({getActiveTrialOffer:jest.fn(),buyActiveTrial:(...a:unknown[])=>mockBuy(...a),isPurchaseAccountCurrent:()=>mockCurrent}));
jest.mock('@/services/subscriptionService',()=>({activatePlan:(...a:unknown[])=>mockActivate(...a)}));
jest.mock('@/services/activeTrialService',()=>({getActiveTrialStatus:jest.fn(),markActiveTrialOffered:jest.fn(),markActiveTrialStarted:()=>mockStarted(),logActiveTrialEvent:(...a:unknown[])=>mockLog(...a)}));
let trial:ReturnType<typeof useActiveTrialOffer>,tree:ReturnType<typeof TestRenderer.create>;
function Probe(){trial=useActiveTrialOffer();return null;}
beforeEach(()=>{mockUid='A';mockCurrent=true;mockBuy.mockReset().mockResolvedValue({ok:true,expiration:'2099-01-01'});mockActivate.mockReset().mockResolvedValue({error:null});mockRefresh.mockReset();mockStarted.mockClear();mockLog.mockClear();mockInvalidate.mockClear();act(()=>{tree=TestRenderer.create(<Probe/>);});});
afterEach(()=>act(()=>tree.unmount()));
test.each([{error:'SUBSCRIPTION_SYNC_PENDING',pending:true},{error:'SERVER_FAILURE'}])('trial activation %p is not consumed or successful',async activation=>{
  mockActivate.mockResolvedValue(activation);let result;await act(async()=>{result=await trial.startTrial();});
  expect(result).toMatchObject({ok:false,error:activation.error});expect(mockBuy).toHaveBeenCalledWith('A');expect(mockStarted).not.toHaveBeenCalled();expect(mockRefresh).not.toHaveBeenCalled();expect(mockLog.mock.calls.some(x=>String(x[0]).includes('started'))).toBe(false);
});
test('confirmed trial uses server confirmation without writing client trial-start',async()=>{
  await expect(trial.startTrial()).resolves.toEqual({ok:true});expect(mockActivate).toHaveBeenCalledWith(expect.objectContaining({userId:'A',plan:'active'}));expect(mockStarted).not.toHaveBeenCalled();expect(mockRefresh).toHaveBeenCalledTimes(1);
});
test('cancelled purchase performs no activation, eligibility write or success',async()=>{
  mockBuy.mockResolvedValue({ok:false,cancelled:true});await expect(trial.startTrial()).resolves.toEqual({ok:false,cancelled:true});expect(mockActivate).not.toHaveBeenCalled();expect(mockStarted).not.toHaveBeenCalled();
});
test('switch during server confirmation prevents success refresh',async()=>{
  mockActivate.mockImplementation(async()=>{mockCurrent=false;return{error:null};});await expect(trial.startTrial()).resolves.toEqual({ok:false,error:'SUBSCRIPTION_ACCOUNT_CHANGED'});expect(mockRefresh).not.toHaveBeenCalled();
});
test('signed-out trial starts no native purchase',async()=>{
  mockUid=null;act(()=>{tree.update(<Probe/>);});await expect(trial.startTrial()).resolves.toEqual({ok:false,error:'no_user'});expect(mockBuy).not.toHaveBeenCalled();
});

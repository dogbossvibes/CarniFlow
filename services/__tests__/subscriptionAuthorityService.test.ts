import {syncSubscriptionAuthority} from '../subscriptionAuthorityService';
/** @jest-environment node */
const mockGetUser=jest.fn(),mockInvoke=jest.fn(),mockUnsubscribe=jest.fn();
let mockListener: (event:string,session:{user:{id:string}}|null)=>void=()=>{};
jest.mock('@/lib/supabase',()=>({supabase:{auth:{getUser:()=>mockGetUser(),onAuthStateChange:(callback:typeof mockListener)=>{mockListener=callback;return{data:{subscription:{unsubscribe:mockUnsubscribe}}};}},functions:{invoke:(...args:unknown[])=>mockInvoke(...args)}}}));
const state=(plan='active',overrides={})=>({data:{version:1,state:{verified:true,plan,expiresAt:'2099-01-01T00:00:00Z',...overrides}},error:null});
beforeEach(()=>{jest.useFakeTimers();mockGetUser.mockResolvedValue({data:{user:{id:'A'}},error:null});mockInvoke.mockReset();mockUnsubscribe.mockReset();});
afterEach(()=>jest.useRealTimers());
async function settle<T>(promise:Promise<T>):Promise<T>{await jest.runAllTimersAsync();return promise;}
test('confirmed canonical trainer satisfies active; only an empty body is sent to the authenticated endpoint',async()=>{
  mockInvoke.mockResolvedValue(state('trainer'));await expect(syncSubscriptionAuthority('A','active')).resolves.toEqual({error:null,plan:'trainer'});
  expect(mockInvoke).toHaveBeenCalledWith('subscription-sync',{body:{},signal:expect.any(AbortSignal)});expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
test.each([state('newbie'),state('active',{verified:false}),state('active',{expiresAt:'invalid'}),state('active',{expiresAt:'2000-01-01'}),{data:{version:2,state:{verified:true,plan:'trainer',expiresAt:'2099-01-01'}},error:null},{data:null,error:new Error('offline')}])('invalid/lower/unverified/error response remains pending: %p',async reply=>{
  mockInvoke.mockResolvedValue(reply);const result=await settle(syncSubscriptionAuthority('A','trainer'));expect(result).toEqual({error:'SUBSCRIPTION_SYNC_PENDING',pending:true});expect(mockInvoke).toHaveBeenCalledTimes(3);
});
test('transient invoke failure retries without any second Store purchase',async()=>{
  mockInvoke.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(state());await expect(settle(syncSubscriptionAuthority('A','active'))).resolves.toEqual({error:null,plan:'active'});expect(mockInvoke).toHaveBeenCalledTimes(2);
});
test('A-B-A during synchronization is rejected even when final getUser returns A',async()=>{
  mockInvoke.mockImplementation(async()=>{mockListener('SIGNED_OUT',null);mockListener('SIGNED_IN',{user:{id:'A'}});return state();});
  await expect(syncSubscriptionAuthority('A','active')).resolves.toEqual({error:'SUBSCRIPTION_ACCOUNT_CHANGED'});expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
test('wrong authenticated UID is rejected before invoking server',async()=>{
  mockGetUser.mockResolvedValue({data:{user:{id:'B'}},error:null});await expect(syncSubscriptionAuthority('A','active')).resolves.toEqual({error:'SUBSCRIPTION_ACCOUNT_CHANGED'});expect(mockInvoke).not.toHaveBeenCalled();
});
test('hung read-only account verification times out without reaching server',async()=>{
  mockGetUser.mockReturnValue(new Promise(()=>{}));await expect(settle(syncSubscriptionAuthority('A','active'))).resolves.toEqual({error:'SUBSCRIPTION_SYNC_PENDING',pending:true});expect(mockInvoke).not.toHaveBeenCalled();expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
test('aborted network request is retried within the bounded attempt count',async()=>{
  mockInvoke.mockImplementation((_name:string,{signal}:{signal:AbortSignal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))));
  await expect(settle(syncSubscriptionAuthority('A','active'))).resolves.toEqual({error:'SUBSCRIPTION_SYNC_PENDING',pending:true});expect(mockInvoke).toHaveBeenCalledTimes(3);
});

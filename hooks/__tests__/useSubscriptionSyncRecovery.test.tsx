import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {AppState,type AppStateStatus} from 'react-native';
import {useSubscriptionSyncRecovery} from '../useSubscriptionSyncRecovery';
const mockRetry=jest.fn(),mockPending=new Set<(uid:string)=>void>();
let mockNetwork:(state:{isConnected:boolean;isInternetReachable:boolean})=>void;
const mockNetworkRemove=jest.fn();
jest.mock('@/services/subscriptionAuthorityService',()=>({retryPendingSubscriptionSync:(uid:string)=>mockRetry(uid)}));
jest.mock('@/services/pendingSubscriptionSync',()=>({onPendingSubscriptionSync:(cb:(uid:string)=>void)=>{mockPending.add(cb);return()=>mockPending.delete(cb)}}));
jest.mock('@react-native-community/netinfo',()=>({default:{addEventListener:(cb:typeof mockNetwork)=>{mockNetwork=cb;return mockNetworkRemove}}}));
type Renderer=ReturnType<typeof TestRenderer.create>&{update(e:React.ReactElement):void};
const originalState=Object.getOwnPropertyDescriptor(AppState,'currentState')!;
let renderer:Renderer,handlers:((s:AppStateStatus)=>void)[],remove:jest.Mock,spy:jest.SpyInstance;
function Probe({uid}:{uid?:string}){useSubscriptionSyncRecovery(uid);return null}
beforeEach(()=>{jest.useFakeTimers();Object.defineProperty(AppState,'currentState',{configurable:true,value:'active'});handlers=[];remove=jest.fn();spy=jest.spyOn(AppState,'addEventListener').mockImplementation((_e,cb)=>{handlers.push(cb);return{remove}});mockRetry.mockReset().mockResolvedValue(null);mockNetworkRemove.mockClear();mockPending.clear()});
afterEach(()=>{if(renderer)act(()=>renderer.unmount());spy?.mockRestore();Object.defineProperty(AppState,'currentState',originalState);jest.restoreAllMocks();jest.useRealTimers()});
async function mount(uid?:string){await act(async()=>{renderer=TestRenderer.create(<Probe uid={uid}/>) as Renderer})}
test('session restoration replays once; logged out session never replays',async()=>{await mount();expect(mockRetry).not.toHaveBeenCalled();await act(async()=>renderer.update(<Probe uid="A"/>));expect(mockRetry).toHaveBeenCalledWith('A')});
test('background, reconnect and foreground are bounded and scoped to current session',async()=>{await mount('A');expect(mockRetry).toHaveBeenCalledTimes(1);act(()=>handlers[0]('background'));expect(mockRetry).toHaveBeenCalledTimes(1);act(()=>mockNetwork({isConnected:false,isInternetReachable:false}));await act(async()=>mockNetwork({isConnected:true,isInternetReachable:true}));expect(mockRetry).toHaveBeenCalledTimes(2);await act(async()=>handlers[0]('active'));expect(mockRetry).toHaveBeenCalledTimes(3)});
test('pending write from another UID does not start replay',async()=>{await mount('A');await act(async()=>{for(const cb of mockPending)cb('B')});expect(mockRetry).toHaveBeenCalledTimes(1);await act(async()=>{for(const cb of mockPending)cb('A')});expect(mockRetry).toHaveBeenCalledTimes(2)});
test('cooldown is scheduled while active and removed on logout',async()=>{mockRetry.mockResolvedValue(Date.now()+60000);await mount('A');expect(mockRetry).toHaveBeenCalledTimes(1);await act(async()=>{jest.advanceTimersByTime(59999)});expect(mockRetry).toHaveBeenCalledTimes(1);await act(async()=>renderer.update(<Probe/>));await act(async()=>{jest.advanceTimersByTime(60001)});expect(mockRetry).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledTimes(1);expect(mockNetworkRemove).toHaveBeenCalledTimes(1)});
test('old account completion cannot install a retry timer after switch',async()=>{let finish!:(n:number)=>void;mockRetry.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));await mount('A');await act(async()=>renderer.update(<Probe uid="B"/>));await act(async()=>finish(Date.now()+60000));await act(async()=>{jest.advanceTimersByTime(60000)});expect(mockRetry.mock.calls.map(x=>x[0])).toEqual(['A','B'])});
test('overlapping notifications share one running recovery',async()=>{mockRetry.mockImplementation(()=>new Promise(()=>{}));await mount('A');await act(async()=>{handlers[0]('active');for(const cb of mockPending)cb('A')});expect(mockRetry).toHaveBeenCalledTimes(1)});

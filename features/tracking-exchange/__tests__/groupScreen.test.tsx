import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import GroupTasksScreen from '../groups/GroupTasksScreen';
import {offer,returned,ids} from './fixture';
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',recipient='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let mockFocus:()=>void|(()=>void);
let mockReady=true,mockDetail:ReturnType<typeof detail>,mockChanged=false;
const mockScope={current:{userId:owner,epoch:0}},mockPush=jest.fn(),mockGet=jest.fn(),mockReview=jest.fn(),mockAccept=jest.fn(),mockApply=jest.fn(),mockRead=jest.fn();
const mockT=(s:string)=>s,mockParams:{taskId?:string}={taskId:ids.task};
let mockChildren:unknown[]=[];const mockEnsure=jest.fn();
const mockClient={dispose:jest.fn()},mockCore={list:jest.fn(async()=>({groups:[],invitations:[]}))};
const mockService={get:mockGet,review:mockReview,accept:mockAccept};
const mockRepo={applyReturn:mockApply};
function detail(){return {task:{taskId:ids.task,groupId:ids.parent,creatorUserId:owner,recipientUserId:recipient,sourceTrainingId:ids.child,referenceDigest:'a'.repeat(64),acceptedAtMs:2000,expiresAtMs:10000},reference:offer().reference,submissions:[{submissionId:ids.child,contribution:returned().contribution,decision:null}]};}
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush,back:jest.fn()}),useLocalSearchParams:()=>mockParams,useFocusEffect:(fn:()=>void|(()=>void))=>{mockFocus=fn;jest.requireActual('react').useEffect(fn,[fn]);}}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:'SafeAreaView'}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:mockT})}));
jest.mock('../groups/i18n',()=>({}));
jest.mock('../ExchangeScreen',()=>({styles:{},ExchangeButton:({label,onPress,disabled}:any)=>jest.requireActual('react').createElement('Button',{label,onPress,disabled})}));
jest.mock('../groups/releaseGate',()=>({get GROUP_DISTRACTION_RELEASE_READY(){return mockReady;}}));
jest.mock('@/features/tracking/components/TrackingMap',()=>({TrackingMap:'TrackingMap'}));
jest.mock('@/features/tracking-distractions/useDistractions',()=>({useDistractions:()=>({userId:mockScope.current.userId,epoch:mockScope.current.epoch,scope:mockScope})}));
jest.mock('@/features/tracking-distractions/repository',()=>({distractionRepository:()=>({list:async()=>mockChildren})}));
jest.mock('@/features/tracking/services/trackHistoryService',()=>({getTrackHistory:async()=>[]}));
jest.mock('@/features/training-groups/useConnectedInviteTargets',()=>({useConnectedInviteTargets:()=>[]}));
jest.mock('../groups/groupRpc',()=>({createSupabaseGroupClient:()=>mockClient}));
jest.mock('../groups/groupService',()=>({createTrainingGroupService:()=>mockCore}));
jest.mock('../groups/tasks',()=>({groupTaskService:()=>mockService}));
jest.mock('../groups/localTask',()=>({ensureLocalGroupTask:async(...args:unknown[])=>{await mockEnsure(...args);const {ids,offer}=jest.requireActual('./fixture');return {taskId:ids.task,parentId:ids.parent,role:mockScope.current.userId==='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'?'outgoing':'incoming',offer:offer()};}}));
jest.mock('../repository',()=>({exchangeRepository:()=>mockRepo}));
jest.mock('../source',()=>({readExchangeSource:(...a:unknown[])=>mockRead(...a)}));
let screen:ReturnType<typeof TestRenderer.create>|undefined;
async function mount(){await act(async()=>{screen=TestRenderer.create(<GroupTasksScreen/>);});}
function maps(){return screen!.root.findAll(n=>n.props.currentPosition===null&&Array.isArray(n.props.distractionTracks));}
async function press(label:string){const b=screen!.root.findAll(n=>n.props.label===label)[0];expect(b).toBeTruthy();await act(async()=>{b.props.onPress();});}
beforeEach(()=>{jest.clearAllMocks();mockChildren=[];mockParams.taskId=ids.task;mockEnsure.mockResolvedValue(undefined);mockReady=true;mockChanged=false;mockScope.current={userId:owner,epoch:0};mockDetail=detail();mockGet.mockImplementation(async()=>mockDetail);mockAccept.mockImplementation(async()=>({...mockDetail,task:{...mockDetail.task,acceptedAtMs:3000},reference:offer().reference}));mockReview.mockImplementation(async()=>mockDetail);mockRead.mockImplementation(async()=>{const r=offer().reference;if(mockChanged)r.points[0].lat+=0.1;return r;});mockApply.mockResolvedValue({duplicate:false});});
afterEach(()=>{if(screen)act(()=>screen!.unmount());screen=undefined;});
it('closed gate makes no group RPC and exposes no geometry',async()=>{mockReady=false;await mount();expect(mockCore.list).not.toHaveBeenCalled();expect(mockGet).not.toHaveBeenCalled();expect(maps()).toHaveLength(0);});
it('unaccepted recipient sees acceptance, no reference and no recording action',async()=>{mockScope.current={userId:recipient,epoch:0};mockDetail={...detail(),task:{...detail().task,acceptedAtMs:null as any},reference:null as any,submissions:[]};await mount();expect(maps()).toHaveLength(0);expect(screen!.root.findAll(n=>n.props.label==='record')).toHaveLength(0);await press('acceptTask');expect(mockAccept).toHaveBeenCalledWith(ids.task);expect(maps()).toHaveLength(1);expect(screen!.root.findAll(n=>n.props.label==='record').length).toBeGreaterThan(0);});
it('preview contains returned overlay and never accepts automatically',async()=>{await mount();expect(maps()[0].props.distractionTracks).toHaveLength(1);expect(mockReview).not.toHaveBeenCalled();expect(mockApply).not.toHaveBeenCalled();});
it('changed source is refused before irreversible server review',async()=>{await mount();mockChanged=true;await press('reviewApply');expect(mockReview).not.toHaveBeenCalled();expect(mockApply).not.toHaveBeenCalled();expect(maps()).toHaveLength(0);});
it('explicit valid review checks source first and then adds locally',async()=>{await mount();await press('reviewApply');expect(mockRead.mock.invocationCallOrder[0]).toBeLessThan(mockReview.mock.invocationCallOrder[0]);expect(mockReview).toHaveBeenCalledWith(ids.task,ids.child,'accepted');expect(mockApply).toHaveBeenCalledTimes(1);expect(screen!.root.findAll(n=>n.props.children==='added').length).toBeGreaterThan(0);});
it('revoked or unreachable refresh clears previously shown geometry',async()=>{await mount();mockGet.mockRejectedValue(new Error('GROUP_REVOKED'));await press('refreshTask');expect(maps()).toHaveLength(0);expect(screen!.root.findAll(n=>n.props.label==='record')).toHaveLength(0);});
it('auth change during source read prevents review and local writes',async()=>{await mount();mockRead.mockImplementation(async()=>{mockScope.current={userId:owner,epoch:2};return offer().reference;});await press('reviewApply');expect(mockReview).not.toHaveBeenCalled();expect(mockApply).not.toHaveBeenCalled();expect(maps()).toHaveLength(0);});

it('recording revalidates server access and refuses revoked tasks',async()=>{mockScope.current={userId:recipient,epoch:0};await mount();mockGet.mockRejectedValue(new Error('GROUP_REVOKED'));await press('record');expect(mockPush).not.toHaveBeenCalled();expect(maps()).toHaveLength(0);});
it('accepted recipient can open the recorder after fresh server access check',async()=>{mockScope.current={userId:recipient,epoch:0};await mount();const before=mockGet.mock.calls.length;await press('record');expect(mockGet.mock.calls.length).toBe(before+1);expect(mockPush).toHaveBeenCalledWith({pathname:'/track/verleitungen',params:{id:ids.parent}});});

it('late focus response cannot restore geometry after newer revoked refresh',async()=>{await mount();let resolveOld!:(v:unknown)=>void;mockGet.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;}));await act(async()=>{mockFocus();});mockGet.mockRejectedValueOnce(new Error('GROUP_REVOKED'));await press('refreshTask');expect(maps()).toHaveLength(0);await act(async()=>{resolveOld(detail());});expect(maps()).toHaveLength(0);});
it('late focus failure cannot erase a newer successful refresh',async()=>{await mount();let rejectOld!:(e:Error)=>void;mockGet.mockImplementationOnce(()=>new Promise((_r,reject)=>{rejectOld=reject;}));await act(async()=>{mockFocus();});await press('refreshTask');expect(maps()).toHaveLength(1);await act(async()=>{rejectOld(new Error('GROUP_REVOKED'));});expect(maps()).toHaveLength(1);});
it('back navigation invalidates pending focus read',async()=>{await mount();let resolveOld!:(v:unknown)=>void;mockGet.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;}));await act(async()=>{mockFocus();});await press('back');expect(maps()).toHaveLength(0);await act(async()=>{resolveOld(detail());});expect(maps()).toHaveLength(0);});
it('blur invalidates pending focus read before geometry arrives',async()=>{await mount();let resolveOld!:(v:unknown)=>void,cleanup:void|(()=>void);mockGet.mockImplementationOnce(()=>new Promise(r=>{resolveOld=r;}));await act(async()=>{cleanup=mockFocus();});await act(async()=>{if(cleanup)cleanup();});await press('back');await act(async()=>{resolveOld(detail());});expect(maps()).toHaveLength(0);});

it('superseded local preparation cannot restore recorder actions',async()=>{mockScope.current={userId:recipient,epoch:0};await mount();let finish!:()=>void;mockEnsure.mockImplementationOnce(()=>new Promise<void>(r=>{finish=r;}));await act(async()=>{mockFocus();});mockGet.mockRejectedValueOnce(new Error('GROUP_REVOKED'));await press('refreshTask');await act(async()=>{finish();});expect(maps()).toHaveLength(0);expect(screen!.root.findAll(n=>n.props.label==='record')).toHaveLength(0);});
it('returning from recorder reloads current task and lists newly finished recording without sending',async()=>{mockScope.current={userId:recipient,epoch:0};await mount();delete mockParams.taskId;mockChildren=[{track:returned().contribution}];await act(async()=>{mockFocus();});expect(mockGet).toHaveBeenLastCalledWith(ids.task);expect(screen!.root.findAll(n=>n.props.label==='return').length).toBeGreaterThan(0);});

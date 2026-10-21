import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { findNodeHandle } from 'react-native';
import Detail from '@/app/track/[id]';
import { TrackResumeCta } from '@/features/tracking/components/TrackResumeCta';
import { TrackingMap } from '@/features/tracking/components/TrackingMap';

let mockRoute = 's', mockUser = 'u';
const mockDetail = jest.fn(), mockCompletion = jest.fn(), mockLocal = jest.fn();
const mockReset = jest.fn(), mockRemove = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({id:mockRoute}), useRouter: () => ({push:jest.fn(),replace:jest.fn(),back:jest.fn(),canGoBack:()=>true}),
 useFocusEffect:(cb:()=>void)=>{const R=jest.requireActual('react');R.useEffect(cb,[cb]);} }));
jest.mock('@/hooks/useSession',()=>({useSession:()=>({session:{user:{id:mockUser}}})}));
jest.mock('@/lib/supabase',()=>({supabase:{auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe:jest.fn()}}}),getUser:async()=>({data:{user:{id:mockUser}}})}}}));
jest.mock('@/features/tracking/services/trackService',()=>({getTrackSessionById:(...args:unknown[])=>mockDetail(...args),getTrackCompletionById:(...args:unknown[])=>mockCompletion(...args),saveTrackEvaluation:jest.fn()}));
jest.mock('@/features/tracking/services/trackHistoryService',()=>({getLocalTrackDetail:(...args:unknown[])=>mockLocal(...args),getLocalRunSupplement:async()=>null,saveLocalTrackEvaluation:jest.fn()}));
jest.mock('@/features/tracking/store/trackingStore',()=>({useTrackingStore:{getState:()=>({reset:mockReset,sessionStatus:'completed',trackPoints:[],isRecording:false})}}));
jest.mock('@/features/tracking/store/activeFaehrten',()=>({useActiveFaehrten:{getState:()=>({get:()=>null,remove:mockRemove})}}));
jest.mock('@/features/tracking-transfer/i18n',()=>({transferErrorKey:(key:string)=>key}));
jest.mock('@/features/tracking-transfer/runtime',()=>({ensureOwnTransferLocal:jest.fn()}));
jest.mock('@/features/tracking-distractions/useDistractions',()=>({useDistractionOverlays:()=>[]}));
jest.mock('@/features/tracking/hooks/useDogTrackColor',()=>({useDogTrackColor:()=>({color:'#B07CFF'})}));
jest.mock('@/features/tracking/hooks/useTrackObjectReview',()=>({useTrackObjectReview:()=>({review:null})}));
jest.mock('@/features/tracking/utils/qaDiagnosticsMode',()=>({isQaDiagnosticsEnabled:()=>false}));
jest.mock('@/features/sync/services/syncEngine',()=>({retryFailedSyncForSession:async()=>{}}));
jest.mock('@/services/trackShareService',()=>({getTrackShare:async()=>({data:[]}),listTrackFeedback:async()=>({data:[]}),listAcceptedTrainers:async()=>[]}));
jest.mock('@/features/ai/services/trainingEmbeddingService',()=>({createEmbeddingForTrackSummary:jest.fn()}));
jest.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string)=>key})}));
jest.mock('@expo/vector-icons',()=>({Ionicons:()=>null}));
jest.mock('react-native-safe-area-context',()=>({SafeAreaView:({children}:{children:React.ReactNode})=>children,useSafeAreaInsets:()=>({top:0,bottom:0,left:0,right:0})}));
jest.mock('@/features/tracking/components/TrackResumeCta',()=>({TrackResumeCta:()=>null}));
jest.mock('@/features/tracking/components/TrackingMap',()=>({TrackingMap:jest.fn(()=>null)}));
jest.mock('@/features/tracking/components/FaehrtenChrome',()=>({FaehrtenHeader:()=>null,SectionLabel:()=>null,relDate:()=> 'today'}));
jest.mock('@/features/tracking/components/TrackAngleList',()=>({TrackAngleList:()=>null}));
jest.mock('@/components/help/HelpButton',()=>({HelpButton:()=>null}));
jest.mock('@/features/tracking-distractions/DistractionEntry',()=>({DistractionEntry:()=>null}));
jest.mock('@/features/tracking-exchange/ExchangeEntry',()=>({ExchangeEntry:()=>null}));
jest.mock('@/features/tracking/components/TrackObjectCorrections',()=>({TrackObjectCorrections:()=>null}));
jest.mock('@/features/tracking/components/TrackExportActions',()=>({TrackExportActions:()=>null}));
jest.mock('@/components/ui/AnyvoButton',()=>({AnyvoButton:()=>null}));
jest.mock('@/features/tracking/components/MarkerDetailSheet',()=>({MarkerDetailSheet:()=>null}));
jest.mock('@/features/tracking/components/TrackSketch',()=>({TrackSketch:()=>null}));
jest.mock('@/features/tracking/components/TrackScoreRing',()=>({TrackScoreRing:()=>null}));
jest.mock('@/features/tracking/components/LegBars',()=>({LegBars:()=>null}));
jest.mock('@/features/ai/components/SmartFeedbackSection',()=>({SmartFeedbackSection:()=>null}));
jest.mock('@/features/tracking/components/CustomerTrackDiagnosisCard',()=>({CustomerTrackDiagnosisCard:()=>null}));

const localTrack=(id='s',owner='u')=>({id,owner_id:owner,dog_id:'d',status:'resting',points:[{latitude:47,longitude:8,point_type:'lay'},{latitude:47.0001,longitude:8,point_type:'lay'}],markers:[],runs:[],track_data:{},distance_meters:11});
const completion=(id='s',owner='u',final=false)=>({data:{id,owner_id:owner,dog_id:'d',runs:final?[{ended_at:'2026-10-21'}]:[],track_data:{}},error:null});
let view:ReactTestRenderer;
beforeAll(()=>{findNodeHandle(null);});
beforeEach(()=>{jest.clearAllMocks();mockRoute='s';mockUser='u';mockDetail.mockResolvedValue({data:null,error:'points timeout'});mockLocal.mockImplementation(async(id:string)=>localTrack(id));mockCompletion.mockResolvedValue({data:null,error:null});});
afterEach(()=>{if(view)act(()=>view.unmount());});
async function mount(){await act(async()=>{view=TestRenderer.create(<Detail/>);});}
interface TestNode { props: { testID?: string; onPress: () => void } }
const recoveries=()=>(view.root as unknown as {findAllByType:(type:unknown)=>unknown[]}).findAllByType(TrackResumeCta);
const retries=()=>(view.root as unknown as {findAll:(predicate:(node:TestNode)=>boolean)=>TestNode[]}).findAll(n=>n.props.testID==='track-detail-retry-completion');
it.each(['points timeout','markers timeout'])('keeps local geometry read-only when %s accompanies a confirmed remote final run',async error=>{
 mockDetail.mockResolvedValue({data:null,error});mockCompletion.mockResolvedValue(completion('s','u',true));await mount();
 expect(recoveries()).toHaveLength(0);
 expect((TrackingMap as jest.Mock).mock.calls.some(([props])=>props.layPoints.length===2)).toBe(true);
 expect(mockReset).toHaveBeenCalled();expect(mockRemove).not.toHaveBeenCalled();
});
it('unknown completion blocks recovery; retry can verify the same owned open session',async()=>{
 mockCompletion.mockResolvedValueOnce({data:null,error:'run timeout'}).mockResolvedValueOnce(completion());await mount();
 expect(recoveries()).toHaveLength(0);expect(retries().length).toBeGreaterThan(0);
 await act(async()=>{retries()[0].props.onPress();});
 expect(view.root.findByType(TrackResumeCta).props).toMatchObject({sessionId:'s',dogId:'d',userId:'u',hasRemoteSearchRun:false});
});
it('verified absence of a remote parent retains local recovery',async()=>{
 mockDetail.mockResolvedValue({data:null,error:null});await mount();
 expect(view.root.findByType(TrackResumeCta).props.sessionId).toBe('s');
});
it('an offline detail retains local geometry without treating unknown completion as open',async()=>{
 mockCompletion.mockRejectedValue(new Error('offline'));await mount();
 expect(recoveries()).toHaveLength(0);expect(retries().length).toBeGreaterThan(0);
 expect((TrackingMap as jest.Mock).mock.calls.some(([props])=>props.layPoints.length===2)).toBe(true);
});
it('rejects an owner-mismatched completion even if local geometry is available',async()=>{
 mockCompletion.mockResolvedValue(completion('s','other'));await mount();expect(recoveries()).toHaveLength(0);
});
it('ignores a late open completion from a previous route',async()=>{
 let finish!:(value:unknown)=>void;mockCompletion.mockImplementation((id:string)=>id==='s'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(completion(id,'u',true)));
 await mount();mockRoute='new';await act(async()=>{view.update(<Detail/>);});
 await act(async()=>{finish(completion());});expect(recoveries()).toHaveLength(0);
 expect(mockCompletion.mock.calls.map(([id])=>id)).toContain('new');
});
it('ignores a late open completion after an account change',async()=>{
 let finish!:(value:unknown)=>void;mockCompletion.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(completion('s','other',true));
 await mount();mockUser='other';await act(async()=>{view.update(<Detail/>);});
 await act(async()=>{finish(completion());});expect(recoveries()).toHaveLength(0);
});

it('does not display another account local fallback or request its completion',async()=>{
 mockLocal.mockResolvedValue(localTrack('s','other'));await mount();
 expect(recoveries()).toHaveLength(0);expect(TrackingMap).not.toHaveBeenCalled();expect(mockCompletion).not.toHaveBeenCalled();
});

it('retains a parent payload final run even without a separate final run row',async()=>{
 mockCompletion.mockResolvedValue({data:{...completion().data,track_data:{run:{run_id:'known'}}},error:null});await mount();
 expect(recoveries()).toHaveLength(0);
});

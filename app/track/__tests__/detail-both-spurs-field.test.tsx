import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { findNodeHandle } from 'react-native';
import Detail from '@/app/track/[id]';
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
let view:ReactTestRenderer;
beforeAll(()=>{findNodeHandle(null);});
beforeEach(()=>{jest.clearAllMocks();mockRoute='s';mockUser='u';mockDetail.mockResolvedValue({data:null,error:'points timeout'});mockLocal.mockImplementation(async(id:string)=>localTrack(id));mockCompletion.mockResolvedValue({data:null,error:null});});
afterEach(()=>{if(view)act(()=>view.unmount());});
async function mount(){await act(async()=>{view=TestRenderer.create(<Detail/>);});}

const points = Array.from({length:4},(_,i)=>({latitude:47+i*0.00002,longitude:8,point_type:'lay',timestamp:new Date(i*1000).toISOString()}));
const runPoints = points.map((p,i)=>({lat:p.latitude,lng:p.longitude,t:i}));
const saved = () => ({...localTrack(),status:'completed',points,owner_id:'u',runs:[{id:'run',ended_at:'2026-10-22',run_points:runPoints}],track_data:{run:{run_id:'run',ended_at:'2026-10-22',run_points:runPoints,replay_points:runPoints}},score:83});
const mapProps=()=>(TrackingMap as jest.Mock).mock.calls.map(([props])=>props);
it('shows both persisted lines in the embedded and fullscreen maps during a partial point sync',async()=>{
 const remote={...saved(),points:points.slice(0,1)};
 mockDetail.mockResolvedValue({data:remote,error:null});mockLocal.mockResolvedValue(saved());await mount();
 act(()=>mapProps().find(props=>props.onFullscreen).onFullscreen());
 expect(mapProps().length).toBeGreaterThanOrEqual(2);
 for(const props of mapProps()) {expect(props.layPoints).toHaveLength(4);expect(props.runPoints).toHaveLength(4);expect(props.comparison).toBe(true);}
 expect(remote.points).toHaveLength(1);expect(remote.score).toBe(83);
});
it('an existing empty remote run does not hide a finalized local replay of that same run',async()=>{
 const remote={...saved(),runs:[{id:'run',ended_at:'2026-10-22',run_points:[]}],track_data:{run:{run_id:'run'}}};
 mockDetail.mockResolvedValue({data:remote,error:null});mockLocal.mockResolvedValue(saved());await mount();
 expect(mapProps().length).toBeGreaterThan(0);
 for(const props of mapProps())expect(props.runPoints).toHaveLength(4);
 expect(remote.runs[0].run_points).toEqual([]);
});
it('never supplements a shared remote track with another account local geometry',async()=>{
 mockDetail.mockResolvedValue({data:{...saved(),owner_id:'other',points:points.slice(0,2),track_data:{},runs:[]},error:null});mockLocal.mockResolvedValue(saved());await mount();
 for(const props of mapProps())expect(props.layPoints).toHaveLength(2);
});

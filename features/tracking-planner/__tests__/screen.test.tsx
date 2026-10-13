import React from 'react';
import Renderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import PlannerScreen from '../PlannerScreen';
let mockScope = {userId:'owner',epoch:0};
const mockScopeRef = { get current() { return mockScope; } };
const mockRepo = {list:jest.fn(),save:jest.fn(),remove:jest.fn()};
const mockBack=jest.fn(),mockDispatch=jest.fn();let mockPrevent:(arg:any)=>void;
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router',()=>({useRouter:()=>({back:mockBack}),useFocusEffect:(cb:any)=>require('react').useEffect(cb,[cb])}));
jest.mock('@react-navigation/native',()=>({useNavigation:()=>({dispatch:mockDispatch}),usePreventRemove:(_flag:boolean,cb:any)=>{mockPrevent=cb;}}));
jest.mock('../usePlannerScope',()=>({usePlannerScope:()=>({userId:mockScope.userId,epoch:mockScope.epoch,repository:mockRepo,scope:mockScopeRef})}));
jest.mock('../PlannerMap',()=>({PlannerMap:()=>null}));
jest.mock('../i18n',()=>({}));
jest.mock('react-i18next',()=>{const t=(s:string)=>s;return{useTranslation:()=>({t})};});
jest.mock('expo-crypto',()=>({randomUUID:()=> 'new-plan'}));
const plan={id:'one',name:'Existing',points:[{latitude:47,longitude:8,object:false},{latitude:47.001,longitude:8,object:true}]};
let tree:ReactTestRenderer;
const flush=async()=>{await act(async()=>{await Promise.resolve();});};
const button=(label:string)=>tree.root.findAll(n=>n.props.accessibilityRole==='button' && typeof n.props.onPress==='function').find(n=>n.findAll(child=>child.props.children===label).length>0)!;
async function mount(){await act(async()=>{tree=Renderer.create(<PlannerScreen/>);});}
beforeEach(()=>{jest.clearAllMocks();mockScope={userId:'owner',epoch:0};mockRepo.remove.mockResolvedValue(undefined);mockRepo.list.mockResolvedValue([{plan,revision:1}]);mockRepo.save.mockImplementation(async(p,r)=>({plan:p,revision:r+1}));jest.spyOn(Alert,'alert').mockImplementation(()=>{});});
afterEach(()=>{act(()=>tree?.unmount());jest.restoreAllMocks();});
it('reopens saved geometry, saves a copy with a new id and leaves the original alone',async()=>{
 await mount();act(()=>button('Existing').props.onPress());
 act(()=>tree.root.findByType(TextInput).props.onChangeText('Copy'));
 await act(async()=>{button('copy').props.onPress();});await flush();
 expect(mockRepo.save).toHaveBeenCalledWith({...plan,id:'new-plan',name:'Copy'},0);
 expect(mockRepo.remove).not.toHaveBeenCalled();
});
it('keeps edits after persistence failure and prevents double save',async()=>{
 await mount();act(()=>button('Existing').props.onPress());act(()=>tree.root.findByType(TextInput).props.onChangeText('Changed'));
 let reject!:(e:Error)=>void;mockRepo.save.mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
 act(()=>{button('save').props.onPress();button('save').props.onPress();});expect(mockRepo.save).toHaveBeenCalledTimes(1);
 await act(async()=>reject(new Error('disk')));expect(tree.root.findByType(TextInput).props.value).toBe('Changed');expect(tree.root.findAll(n=>typeof n.props.children==='string').map(n=>n.props.children).join(' ')).toContain('error');
});
it('requires explicit discard and delete confirmation',async()=>{
 await mount();act(()=>button('Existing').props.onPress());act(()=>tree.root.findByType(TextInput).props.onChangeText('Unsaved'));
 act(()=>button('back').props.onPress());expect(Alert.alert).toHaveBeenCalledWith('unsaved','discardQuestion',expect.any(Array));
 expect(tree.root.findByType(TextInput).props.value).toBe('Unsaved');act(()=>button('remove').props.onPress());expect(mockRepo.remove).not.toHaveBeenCalled();
 const actions=(Alert.alert as jest.Mock).mock.calls.at(-1)[2];await act(async()=>actions[1].onPress());await flush();expect(mockRepo.remove).toHaveBeenCalledWith('one',1);
});
it('does not display a late previous-account load',async()=>{
 let resolve!:(v:unknown)=>void;mockRepo.list.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await mount();
 mockScope.userId='other';mockScope.epoch++;mockRepo.list.mockResolvedValue([]);
 await act(async()=>tree.update(<PlannerScreen/>));await act(async()=>resolve([{plan,revision:1}]));expect(tree.root.findAll(n=>typeof n.props.children==='string').map(n=>n.props.children).join(' ')).not.toContain('Existing');
});
it('does not trap an account-change navigation behind a dirty prompt',async()=>{
 await mount();act(()=>button('Existing').props.onPress());act(()=>tree.root.findByType(TextInput).props.onChangeText('Unsaved'));
 mockScope.userId='other';act(()=>mockPrevent({data:{action:{type:'RESET'}}}));expect(mockDispatch).toHaveBeenCalledWith({type:'RESET'});
});

import React from 'react';
import renderer,{act,type ReactTestRenderer} from 'react-test-renderer';
import * as RN from 'react-native';
import { FaehrtenHeader } from '../FaehrtenChrome';
import type { Dog } from '@/types';

jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('react-native-safe-area-context',()=>({useSafeAreaInsets:()=>({top:44,bottom:34,left:12,right:16})}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string,params?:{dog?:string})=>key==='training.chooseDogA11y'?`Hund wählen: ${params?.dog}`:key})}));
jest.mock('@/features/tracking/utils/dogVisual',()=>({dogVisual:(dog:Dog)=>({initial:dog.name[0],level:'IGP',c1:'#00a88a',c2:'#004438'})}));
jest.mock('../TrackSketch',()=>({TrackSketch:()=>null}));
const longName='Beispielhündin mit einem sehr langen vollständigen Namen';
const dogs=[{id:'a',name:longName},{id:'b',name:'Zweiter Beispielhund'}]as Dog[];
let tree:ReactTestRenderer;
const pick=jest.fn(),back=jest.fn();
let dims={width:320,height:600,scale:3,fontScale:2};
beforeEach(()=>{pick.mockClear();back.mockClear();dims={width:320,height:600,scale:3,fontScale:2};jest.spyOn(jest.requireActual('react-native'),'useWindowDimensions').mockImplementation(()=>dims);});
afterEach(()=>{act(()=>tree?.unmount());jest.restoreAllMocks();});
function mount(dog:Dog|null=dogs[0]){act(()=>{tree=renderer.create(<FaehrtenHeader title="Fährtenverlauf und Auswertung" onBack={back} dog={dog} dogs={dogs} onDog={pick}/>);});}
const button=(label:string)=>tree.root.find(n=>n.props.accessibilityRole==='button'&&n.props.accessibilityLabel===label);
it('keeps full accessible names for a visibly shortened dog and a wrapping title',()=>{
  mount();const select=button(`Hund wählen: ${longName}`);
  expect(select.props.accessibilityState.expanded).toBe(false);
  const name=select.findAllByType(RN.Text).find(n=>n.props.children===longName)!;
  expect(name.props.numberOfLines).toBe(1);expect(name.props.allowFontScaling).not.toBe(false);
  const title=tree.root.find(n=>n.props.accessibilityRole==='header');
  expect(title.props.children).toBe('Fährtenverlauf und Auswertung');expect(title.props.allowFontScaling).not.toBe(false);
  act(()=>button('common.back').props.onPress());expect(back).toHaveBeenCalledTimes(1);expect(pick).not.toHaveBeenCalled();
});
it('opens a bounded scrollable choice, reports selection and closes after choosing exactly one dog',()=>{
  mount();act(()=>button(`Hund wählen: ${longName}`).props.onPress());
  expect(button(`Hund wählen: ${longName}`).props.accessibilityState.expanded).toBe(true);
  expect(tree.root.findByType(RN.Modal).props.visible).toBe(true);
  expect(button(longName).props.accessibilityState.selected).toBe(true);
  expect(button(dogs[1].name).props.accessibilityState.selected).toBe(false);
  const dropdown=tree.root.find(n=>n.props.testID==='dog-switch-dropdown');
  const s=RN.StyleSheet.flatten(dropdown.props.style);
  expect(s.width).toBeLessThanOrEqual(320-12-16-36);
  expect(s.top+s.maxHeight).toBeLessThanOrEqual(600-34-18);
  expect(dropdown.findByType(RN.ScrollView)).toBeDefined();
  act(()=>button(dogs[1].name).props.onPress());expect(pick).toHaveBeenCalledTimes(1);expect(pick).toHaveBeenCalledWith('b');
  expect(tree.root.findByType(RN.Modal).props.visible).toBe(false);
});
it('Android Back and backdrop dismiss without changing the selected dog',()=>{
  mount();act(()=>button(`Hund wählen: ${longName}`).props.onPress());
  act(()=>tree.root.findByType(RN.Modal).props.onRequestClose());
  expect(tree.root.findByType(RN.Modal).props.visible).toBe(false);
  act(()=>button(`Hund wählen: ${longName}`).props.onPress());
  act(()=>button('common.close').props.onPress());
  expect(tree.root.findByType(RN.Modal).props.visible).toBe(false);expect(pick).not.toHaveBeenCalled();
});
it('keeps an open selection usable through width/font changes and then shows the new selection',()=>{
  function Header(){const[id,setId]=React.useState('a');return <FaehrtenHeader title="History" dog={dogs.find(x=>x.id===id)!} dogs={dogs} onDog={setId}/>;}
  act(()=>{tree=renderer.create(<Header/>);});act(()=>button(`Hund wählen: ${longName}`).props.onPress());
  dims={width:1024,height:768,scale:2,fontScale:1};act(()=>tree.update(<Header/>));
  expect(tree.root.findByType(RN.Modal).props.visible).toBe(true);
  act(()=>button(dogs[1].name).props.onPress());expect(button(`Hund wählen: ${dogs[1].name}`).props.accessibilityState.expanded).toBe(false);
});
it('keeps navigation/title available with no dog and does not open a choice',()=>{
  mount(null);expect(tree.root.findAllByType(RN.Modal)).toHaveLength(0);
  act(()=>button('common.back').props.onPress());expect(back).toHaveBeenCalledTimes(1);
});
it('reserves the title natural height above the dog row at enlarged font sizes',()=>{
  mount();
  const titleRow=()=>RN.StyleSheet.flatten(tree.root.find(n=>n.props.testID==='faehrten-title-row').props.style);
  expect(titleRow()).toMatchObject({flexGrow:0,flexShrink:0,flexBasis:'auto'});
  expect(titleRow().flex).toBeUndefined();
  dims={width:1024,height:768,scale:2,fontScale:1};
  act(()=>tree.update(<FaehrtenHeader title="History" onBack={back} dog={dogs[0]} dogs={dogs} onDog={pick}/>));
  expect(titleRow()).toMatchObject({flexGrow:1,flexShrink:1,flexBasis:0});
});
it.each([{width:320,height:600,scale:3,fontScale:2},{width:600,height:768,scale:2,fontScale:1.5},{width:1024,height:768,scale:2,fontScale:1}])
('preserves the existing Android trailing help action alongside the title at %o',size=>{
  dims=size;const help=jest.fn();
  act(()=>{tree=renderer.create(<FaehrtenHeader title="Fährtenverlauf und Auswertung" onBack={back}
    dog={dogs[0]} dogs={dogs} onDog={pick} trailing={<RN.TouchableOpacity accessibilityRole="button" accessibilityLabel="help" onPress={help}><RN.Text>?</RN.Text></RN.TouchableOpacity>}/>);});
  const titleRow=tree.root.find(n=>n.props.testID==='faehrten-title-row');
  expect(titleRow.findAll(n=>n.props.accessibilityLabel==='help').length).toBeGreaterThan(0);
  act(()=>button('help').props.onPress());expect(help).toHaveBeenCalledTimes(1);
  expect(pick).not.toHaveBeenCalled();expect(back).not.toHaveBeenCalled();
  expect(button(`Hund wählen: ${longName}`)).toBeDefined();
});

import React from 'react';
import renderer,{act,type ReactTestRenderer} from 'react-test-renderer';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput } from 'react-native';
import { AnyvoButton } from '../AnyvoButton';
import { Button } from '../Button';
import { Input } from '../Input';
import { DateField } from '../DateField';
import { AnimatedPressable } from '../AnimatedPressable';

const mockHaptic=jest.fn(),mockPicker=jest.fn();
jest.mock('@/lib/haptics',()=>({haptic:{light:()=>mockHaptic()}}));
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('expo-linear-gradient',()=>({LinearGradient:'Gradient'}));
jest.mock('../AnimatedPressable',()=>({AnimatedPressable:({children,...p}:React.PropsWithChildren<object>)=>{
  const {Pressable}=jest.requireActual('react-native');return <Pressable {...p}>{children}</Pressable>;
}}));
jest.mock('@react-native-community/datetimepicker',()=>({__esModule:true,default:'NativePicker',DateTimePickerAndroid:{open:(...a:unknown[])=>mockPicker(...a)}}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string)=>({
  'auth.showPassword':'Passwort anzeigen','auth.hidePassword':'Passwort verbergen','common.delete':'Löschen',
  'date.chooseDate':'Datum wählen','date.chooseTime':'Zeit wählen',
}as Record<string,string>)[key]??key})}));
let tree:ReactTestRenderer;
const originalOS=Platform.OS;
beforeEach(()=>{mockHaptic.mockClear();mockPicker.mockClear();});
afterEach(()=>{act(()=>tree?.unmount());jest.restoreAllMocks();Platform.OS=originalOS;});
function mount(element:React.ReactElement){act(()=>{tree=renderer.create(element);});}
const action=()=>tree.root.findByType(AnimatedPressable);
const eye=()=>tree.root.find(n=>n.props.accessibilityRole==='button'&&String(n.props.accessibilityLabel).startsWith('Passwort '));

it.each(['primary','secondary','danger','ghost']as const)('AnyvoButton %s keeps a complete growing label and its press contract',variant=>{
  const press=jest.fn();mount(<AnyvoButton label="Kalender-Erinnerung erneut synchronisieren" icon="calendar-outline" variant={variant} onPress={press}/>);
  const s=StyleSheet.flatten(action().props.style);expect(s.height).toBeUndefined();expect(s.minHeight).toBe(48);
  const label=tree.root.findAllByType(Text).find(n=>n.props.children==='Kalender-Erinnerung erneut synchronisieren')!;
  expect(label.props.numberOfLines).toBeUndefined();expect(label.props.allowFontScaling).not.toBe(false);
  expect(StyleSheet.flatten(label.props.style).textAlign).toBe('center');
  act(()=>action().props.onPress());expect(press).toHaveBeenCalledTimes(1);expect(mockHaptic).toHaveBeenCalledTimes(1);
});
it('keeps the big design minimum without imposing a fixed height',()=>{
  mount(<AnyvoButton big label="Hochladen & speichern" onPress={()=>{}}/>);
  expect(StyleSheet.flatten(action().props.style)).toMatchObject({minHeight:60});
  expect(StyleSheet.flatten(action().props.style).height).toBeUndefined();
});
it.each(['primary','outline','ghost','danger']as const)('Button %s can grow and keeps its full accessible label',variant=>{
  const press=jest.fn();mount(<Button label="Änderungen speichern" variant={variant} onPress={press}/>);
  expect(StyleSheet.flatten(action().props.style).height).toBeUndefined();expect(StyleSheet.flatten(action().props.style).minHeight).toBe(56);
  expect(action().props.accessibilityLabel).toBe('Änderungen speichern');
  act(()=>action().props.onPress());expect(press).toHaveBeenCalledTimes(1);
});
it.each(['anyvo','classic']as const)('%s keeps disabled/loading handlers inert, exposes busy and renders a spinner',kind=>{
  const press=jest.fn(),Component=kind==='anyvo'?AnyvoButton:Button;
  mount(<Component label="Speichern" loading onPress={press}/>);
  act(()=>action().props.onPress());expect(press).not.toHaveBeenCalled();expect(mockHaptic).not.toHaveBeenCalled();
  expect(tree.root.findByType(ActivityIndicator)).toBeDefined();expect(action().props.accessibilityState.busy).toBe(true);
  act(()=>tree.update(<Component label="Speichern" disabled onPress={press}/>));
  act(()=>action().props.onPress());expect(press).not.toHaveBeenCalled();expect(action().props.disabled).toBe(true);
});
it('password eye has a48px action and toggles only visibility, retaining value, input instance and focus callbacks',()=>{
  const change=jest.fn(),focus=jest.fn(),blur=jest.fn();
  mount(<Input label="Neues Passwort" password value="synthetic-only" onChangeText={change} onFocus={focus} onBlur={blur}/>);
  const input=tree.root.findByType(TextInput);expect(input.props.secureTextEntry).toBe(true);
  expect(eye().props.accessibilityLabel).toContain('anzeigen');
  expect(StyleSheet.flatten(eye().props.style)).toMatchObject({minHeight:48,minWidth:48});
  act(()=>input.props.onFocus({}));expect(focus).toHaveBeenCalledTimes(1);
  act(()=>eye().props.onPress());expect(tree.root.findByType(TextInput)).toBe(input);
  expect(input.props.value).toBe('synthetic-only');expect(input.props.secureTextEntry).toBe(false);
  expect(eye().props.accessibilityLabel).toContain('verbergen');expect(eye().props.accessibilityLabel).not.toContain('synthetic-only');
  act(()=>eye().props.onPress());expect(input.props.secureTextEntry).toBe(true);expect(change).not.toHaveBeenCalled();
  act(()=>input.props.onBlur({}));expect(blur).toHaveBeenCalledTimes(1);
});
it.each([{editable:false},{readOnly:true}])('does not toggle a noneditable password %o',props=>{
  mount(<Input password value="synthetic-only" {...props}/>);
  expect(eye().props.accessibilityState.disabled).toBe(true);expect(eye().props.disabled).toBe(true);
  act(()=>eye().props.onPress());expect(tree.root.findByType(TextInput).props.secureTextEntry).toBe(true);
});
it('preserves explicit native secureTextEntry and placeholder overrides when not in password mode',()=>{
  mount(<Input secureTextEntry placeholderTextColor="#aabbcc"/>);
  expect(tree.root.findByType(TextInput).props.secureTextEntry).toBe(true);
  expect(tree.root.findByType(TextInput).props.placeholderTextColor).toBe('#aabbcc');
});
it.each(['ios','android']as const)('date clear and open are distinct accessible targets on %s; clear does not open picker or change another value',os=>{
  Platform.OS=os;const value=new Date(2020,9,12),change=jest.fn(),clear=jest.fn();
  mount(<DateField label="Geburtsdatum" value={value} onChange={change} onClear={clear}/>);
  const open=tree.root.find(n=>n.props.testID==='date-field');
  const clean=tree.root.find(n=>n.props.accessibilityRole==='button'&&String(n.props.accessibilityLabel).startsWith('Löschen'));
  expect(clean.props.accessibilityLabel).toContain('Geburtsdatum');
  expect(StyleSheet.flatten(clean.props.style)).toMatchObject({minHeight:48,minWidth:48});
  expect(open.findAll(n=>n.props===clean.props)).toHaveLength(0);
  const stop=jest.fn();act(()=>clean.props.onPress({stopPropagation:stop}));expect(clear).toHaveBeenCalledTimes(1);expect(change).not.toHaveBeenCalled();expect(mockPicker).not.toHaveBeenCalled();
  expect(tree.root.findAll(n=>n.props.accessibilityRole==='button'&&typeof n.props.onPress==='function').length).toBeGreaterThanOrEqual(2);
  act(()=>open.props.onPress());
  if(os==='android'){
    const options=mockPicker.mock.calls[0][0];expect(options.value).toBe(value);
    act(()=>options.onChange({type:'dismissed'},undefined));expect(change).not.toHaveBeenCalled();
    const next=new Date(2021,1,4);act(()=>options.onChange({type:'set'},next));expect(change).toHaveBeenCalledWith(next);
  }else expect(tree.root.findByType('NativePicker').props.value).toBe(value);
});

import React from 'react';
import renderer,{act,type ReactTestRenderer} from 'react-test-renderer';
import {StyleSheet,Text,TextInput,View}from 'react-native';
import {Input}from '../Input';
import {DateField}from '../DateField';
import {DogHubStatsGrid}from '@/components/dogs/DogHubStatsGrid';
import {C}from '@/constants/colors';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Icon'}));
jest.mock('@react-native-community/datetimepicker',()=>({__esModule:true,default:'Picker',DateTimePickerAndroid:{open:jest.fn()}}));
jest.mock('@/i18n',()=>({useT:()=>({t:(key:string)=>key})}));
type RGB=readonly[number,number,number];
function rgb(s:string,bg:RGB=[0,0,0]):RGB{
  if(s.startsWith('#'))return [0,2,4].map(i=>parseInt(s.slice(i+1,i+3),16))as unknown as RGB;
  const v=s.match(/[\d.]+/g)!.map(Number),a=v[3]??1;
  return [0,1,2].map(i=>v[i]*a+bg[i]*(1-a))as unknown as RGB;
}
function lum(c:RGB){return c.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);}
function contrast(fg:string,bg:string){const back=rgb(bg),a=lum(rgb(fg,back)),b=lum(back);return(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);}
let tree:ReactTestRenderer;
afterEach(()=>act(()=>tree?.unmount()));
it('input placeholder and label meet4.5 on the actual dark input and supported parent cards',()=>{
  act(()=>{tree=renderer.create(<Input label="Rufname" placeholder="Name"/>);});
  const placeholder=tree.root.findByType(TextInput).props.placeholderTextColor;
  expect(contrast(placeholder,C.input)).toBeGreaterThanOrEqual(4.5);
  const label=tree.root.findAllByType(Text).find(n=>n.props.children==='Rufname')!;
  for(const bg of [C.bg,C.card,C.cardAlt,C.trackCard,C.trackCardAlt])expect(contrast(StyleSheet.flatten(label.props.style).color,bg)).toBeGreaterThanOrEqual(4.5);
});
it('date placeholder and label meet4.5 on their real field/parent surfaces',()=>{
  act(()=>{tree=renderer.create(<DateField label="Datum" value={null} onChange={()=>{}}/>);});
  for(const name of ['Datum','date.chooseDate']){
    const label=tree.root.findAllByType(Text).find(n=>n.props.children===name)!;
    expect(contrast(StyleSheet.flatten(label.props.style).color,C.card)).toBeGreaterThanOrEqual(4.5);
  }
});
it('statistic labels meet4.5 on the actual DogHubStatsGrid parent panel rather than an assumed black background',()=>{
  act(()=>{tree=renderer.create(<DogHubStatsGrid stats={[{key:'weight',value:'24kg',label:'Gewicht'}]}/>);});
  const panel=tree.root.findAllByType(View).map(n=>StyleSheet.flatten(n.props.style)).find(s=>s?.backgroundColor===C.trackCard);
  expect(panel).toBeDefined();
  const label=tree.root.findAllByType(Text).find(n=>n.props.children==='Gewicht')!;
  expect(contrast(StyleSheet.flatten(label.props.style).color,panel!.backgroundColor)).toBeGreaterThanOrEqual(4.5);
});

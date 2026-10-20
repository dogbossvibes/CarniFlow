import { C } from '@/constants/colors';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useT } from '@/i18n';
import type { SpecialGeometry } from '../utils/specialAngleGeometry';
import { registerGroupResources } from '@/features/training-groups/registerResources';
import { useTranslation } from 'react-i18next';
registerGroupResources('specialAngles', {
 de:{auto:'Richtung aus der Spur bestimmen',choose:'Richtung wählen',back:'Zurück'},gsw:{auto:'Richtung us de Spur bestimme',choose:'Richtig wähle',back:'Zrugg'},
 en:{auto:'Determine direction from track',choose:'Choose direction',back:'Back'},fr:{auto:'Déterminer le sens depuis la piste',choose:'Choisir le sens',back:'Retour'},
 it:{auto:'Determina la direzione dalla traccia',choose:'Scegli la direzione',back:'Indietro'},es:{auto:'Determinar dirección del rastro',choose:'Elegir dirección',back:'Atrás'},
});
type Kind='gw'|'ow'|'bw'|'abriss'|'absatz';
export function SpecialAnglePicker({onSelect}:{onSelect:(kind:Kind,geometry?:SpecialGeometry)=>void}) {
 const [kind,setKind]=useState<Kind|null>(null),{t}=useT(),{t:tr}=useTranslation('specialAngles');
 const submitted=useRef(false);
 const select=(value:Kind,geometry?:SpecialGeometry)=>{if(submitted.current)return;submitted.current=true;if(geometry)onSelect(value,geometry);else onSelect(value);};
 const button=(label:string,press:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={press} style={{minHeight:48,minWidth:90,padding:12,borderRadius:12,backgroundColor:C.trackCardAlt,justifyContent:'center'}}><Text style={{color:C.trackText,fontWeight:'700'}}>{label}</Text></Pressable>;
 return <ScrollView><View style={{gap:8}}>
  {!kind?<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['gw','ow','bw','abriss'] as const).map(k=>button(k==='abriss'?t('track.angleBreak'):k.toUpperCase(),()=>setKind(k)))}{button(t('track.angleStep'),()=>select('absatz'))}</View>:<>
   <Text accessibilityRole="header" style={{color:C.trackText,fontSize:16,fontWeight:'700'}}>{kind==='abriss'?t('track.angleBreak'):kind.toUpperCase()} · {tr('choose')}</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['links','rechts'] as const).flatMap(direction=>(kind==='abriss'?['unresolved'] as const:['normal','sharp'] as const).map(sharpness=>button(t(sharpness==='sharp'?(direction==='links'?'track.detailSharpLeft':'track.detailSharpRight'):(direction==='links'?'track.detailLeft':'track.detailRight')),()=>select(kind,{geometryDirection:direction,geometrySharpness:sharpness,geometrySource:'manual'}))))}</View>
   {kind!=='abriss'&&button(tr('auto'),()=>select(kind))}
   {button(tr('back'),()=>setKind(null))}
  </>}
 </View></ScrollView>;
}

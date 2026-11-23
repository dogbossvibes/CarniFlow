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
// T-219: OW/GW/BW sind immer rund 90° nach links oder rechts → keine Spitz-Auswahl.
// Ältere Marker mit gespeicherter Schärfe «sharp» bleiben unverändert lesbar.
type Kind='gw'|'ow'|'bw'|'abriss'|'absatz';
// Eigene Komponente statt Render-Helfer: Handler mit Doppel-Tipp-Schutz laufen nur beim Tippen.
function ChoiceButton({label,onPress}:{label:string;onPress:()=>void}) {
 return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{minHeight:48,minWidth:90,padding:12,borderRadius:12,backgroundColor:C.trackCardAlt,justifyContent:'center'}}><Text style={{color:C.trackText,fontWeight:'700'}}>{label}</Text></Pressable>;
}
export function SpecialAnglePicker({onSelect}:{onSelect:(kind:Kind,geometry?:SpecialGeometry)=>void}) {
 const [kind,setKind]=useState<Kind|null>(null),{t}=useT(),{t:tr}=useTranslation('specialAngles');
 const submitted=useRef(false);
 const select=(value:Kind,geometry?:SpecialGeometry)=>{if(submitted.current)return;submitted.current=true;if(geometry)onSelect(value,geometry);else onSelect(value);};
 return <ScrollView><View style={{gap:8}}>
  {!kind?<View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['gw','ow','bw','abriss'] as const).map(k=><ChoiceButton key={k} label={k==='abriss'?t('track.angleBreak'):k.toUpperCase()} onPress={()=>setKind(k)} />)}<ChoiceButton label={t('track.angleStep')} onPress={()=>select('absatz')} /></View>:<>
   <Text accessibilityRole="header" style={{color:C.trackText,fontSize:16,fontWeight:'700'}}>{kind==='abriss'?t('track.angleBreak'):kind.toUpperCase()} · {tr('choose')}</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['links','rechts'] as const).map(direction=><ChoiceButton key={direction} label={t(direction==='links'?'track.detailLeft':'track.detailRight')} onPress={()=>select(kind,{geometryDirection:direction,geometrySharpness:kind==='abriss'?'unresolved':'normal',geometrySource:'manual'})} />)}</View>
   {kind!=='abriss'&&<ChoiceButton label={tr('auto')} onPress={()=>select(kind)} />}
   <ChoiceButton label={tr('back')} onPress={()=>setKind(null)} />
  </>}
 </View></ScrollView>;
}

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { shareTrackUserExport, type UserExportFormat } from '../services/trackUserExportService';
import type { ReportLabels } from '../utils/trackReportPdf';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { buildTrackUserExport } from '../utils/trackUserExport';
import { applyHomeZones } from '@/features/home-zone/zones';
import { homeZoneHintSeen, loadHomeZones, markHomeZoneHintSeen, useHomeZones } from '@/features/home-zone/store';
import { HomeZonePreview, type HomeZonePreviewData } from '@/features/home-zone/HomeZonePreview';
import { HOME_ZONE_NS } from '@/features/home-zone/i18n';

const EXPORT_ROWS = [
  { format: 'pdf', icon: 'document-text-outline' },
  { format: 'gpx', icon: 'map-outline' },
  { format: 'json', icon: 'code-slash-outline' },
] as const;

export function TrackExportActions({ data }: { data: unknown }) {
  const { t }=useT(); const [activeFormat,setActiveFormat]=useState<UserExportFormat | null>(null); const busyRef=useRef(false);
  const busy=activeFormat!==null;
  const [includeNotes,setIncludeNotes]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const { t: z } = useTranslation(HOME_ZONE_NS); const router = useRouter(); const zones = useHomeZones();
  const [hintFor,setHintFor]=useState<UserExportFormat | null>(null);
  const [preview,setPreview]=useState<(HomeZonePreviewData & { format: UserExportFormat }) | null>(null);
  const release=()=>{busyRef.current=false;if(mounted.current)setActiveFormat(null);};
  /** Vor dem Export: einmaliger Hinweis ohne Zone, Vorschau, wenn die Fährte eine Zone berührt. */
  async function request(format: UserExportFormat, confirmed=false) {
    if(busyRef.current)return;busyRef.current=true;setActiveFormat(format);
    AccessibilityInfo.announceForAccessibility(t('track.export.preparing', { format: format.toUpperCase() }));
    if(!confirmed){
      try {
        const current=await loadHomeZones();
        if(!current.length){
          if(!await homeZoneHintSeen()){ release(); if(mounted.current)setHintFor(format); return; }
        } else {
          const original=buildTrackUserExport(data,new Date().toISOString(),false);
          const { data: clipped, effect }=applyHomeZones(original,current);
          if(clipped!==original){ release(); if(mounted.current)setPreview({ format, original, clipped, effect, zones: current, emptyFile: format==='gpx'&&effect.allRemoved }); return; }
        }
      } catch { release(); if(mounted.current)Alert.alert(t('track.export.title'),z('storageFailed')); return; }
    }
    try {
      const keys=['title','reference','search','duration','objects','score','confidence','conditions','notes','map','source','unknown','date','glyphNotice', 'partialNotice'] as const;
      const labels=Object.fromEntries(keys.map(key=>[key,t(`track.report.${key}` as TranslationKey)])) as unknown as ReportLabels;
      labels.noGeometry=t('track.export.unavailable');
      labels.reviewLabels = { title: t('track.review.exportLabel'), history: t('track.review.history'),
        truncated: t('track.review.truncated'), score: t('track.review.score', { score: '{score}' }), noScore: t('track.review.noScore'),
        original: t('track.review.original', { status: '' }).replace(/[:：]\s*$/, ''),
        status: Object.fromEntries((['found','not_found','unobserved','unknown'] as const).map(status => [status, t(`track.review.${status}`)])) };
      labels.confidenceLabels={ excellent:t('track.replay.legend.confidenceExcellent'), good:t('track.replay.legend.confidenceGood'), limited:t('track.replay.legend.confidenceLimited'), unreliable:t('track.replay.legend.confidenceUnreliable') };
      labels.materialLabels={ holz:t('track.materialWood'), duebel:t('track.materialDowel'), ball:t('track.materialBall'), gummi:t('track.materialRubber'), stoff:t('track.materialFabric'), filz:t('track.materialFelt'), leder:t('track.materialLeather'), plastik:t('track.materialPlastic'), metall:t('track.materialMetal'), teppich:t('track.materialCarpet'), diverses:t('track.materialOther'), gegenstand:t('track.object'), winkel:t('track.angle') };
      await shareTrackUserExport(data,format,labels,includeNotes);
    } catch {if(mounted.current)Alert.alert(t('track.export.title'),t('track.export.failed'));}
    finally {release();}
  }
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t('track.export.title')}</Text>
    <Text style={s.hint}>{t('track.export.privacy')}</Text>
    <View style={s.options}>
      <View style={s.copy}>
        <Text style={s.optionTitle}>{t('track.export.notes')}</Text>
        <Text style={s.hint}>{t('track.export.notesFormats')}</Text>
      </View>
      <Switch value={includeNotes} onValueChange={setIncludeNotes} disabled={busy}
        accessibilityLabel={t('track.export.notes')} accessibilityHint={t('track.export.notesFormats')}
        accessibilityState={{ checked:includeNotes, disabled:busy }} />
    </View>
    {hintFor&&<View style={s.zoneHint} accessibilityRole="alert">
      <View style={s.zoneHead}><Ionicons name="shield-checkmark-outline" size={20} color={C.trackPrimary} accessible={false} /><Text style={s.rowTitle}>{z('hintTitle')}</Text></View>
      <Text style={s.hint}>{z('hintBody')}</Text>
      <Pressable testID="home-zone-hint-setup" accessibilityRole="button" style={[s.zoneButton,s.zonePrimary]} onPress={()=>{setHintFor(null);void markHomeZoneHintSeen();router.push('/home-zone' as never);}}>
        <Text style={s.zonePrimaryText}>{z('hintSetup')}</Text></Pressable>
      <Pressable testID="home-zone-hint-skip" accessibilityRole="button" style={s.zoneButton} onPress={()=>{const format=hintFor;setHintFor(null);void markHomeZoneHintSeen().then(()=>request(format,true));}}>
        <Text style={s.rowTitle}>{z('hintSkip')}</Text></Pressable>
    </View>}
    <Pressable testID="home-zone-row" accessibilityRole="button" accessibilityLabel={`${z('profileRow')}, ${zones?.length?z('rowOn',{n:zones.length}):z('rowOff')}`}
      accessibilityHint={z('rowHint')} onPress={()=>router.push('/home-zone' as never)} style={({pressed})=>[s.row,s.zoneRow,pressed&&s.pressed]}>
      <Ionicons name="shield-checkmark-outline" size={22} color={C.trackPrimary} accessible={false} />
      <Text style={[s.rowTitle,s.copy]}>{z('profileRow')}</Text>
      <Text style={s.hint}>{zones?.length?z('rowOn',{n:zones.length}):z('rowOff')}</Text>
      <Ionicons name="chevron-forward" size={18} color={C.trackTextSec} accessible={false} />
    </Pressable>
    <HomeZonePreview data={preview} onCancel={()=>setPreview(null)} onConfirm={()=>{const format=preview?.format;setPreview(null);if(format)void request(format,true);}} />
    <View>{EXPORT_ROWS.map(({format,icon})=><Pressable key={format} testID={`export-${format}`}
      accessibilityRole="button" accessibilityLabel={`${t(`track.export.${format}`)}, ${format.toUpperCase()}`}
      accessibilityHint={t(`track.export.${format}Hint`)} accessibilityState={{disabled:busy,busy:activeFormat===format}}
      disabled={busy} onPress={()=>void request(format)} style={({pressed})=>[s.row,pressed&&s.pressed]}>
      <Ionicons name={icon} size={22} color={C.trackPrimary} accessible={false} />
      <View style={s.copy}>
        <Text style={s.rowTitle}>{t(`track.export.${format}`)}<Text style={s.format}> · {format.toUpperCase()}</Text></Text>
        <Text style={s.hint}>{t(`track.export.${format}Hint`)}</Text>
      </View>
      <Ionicons name="share-outline" size={20} color={C.trackTextSec} accessible={false} />
    </Pressable>)}</View>
    {activeFormat&&<View style={s.progress}>
      <ActivityIndicator color={C.trackPrimary} accessible={false} />
      <Text accessibilityLiveRegion="polite" style={[s.hint,s.copy]}>
        {t('track.export.preparing', { format:activeFormat.toUpperCase() })}
      </Text>
    </View>}
  </View>;
}
const s=StyleSheet.create({
  card:{padding:16,gap:12,marginBottom:16,borderRadius:20,backgroundColor:C.trackCard,borderWidth:1,borderColor:C.trackBorder},
  title:{fontSize:16,fontWeight:'700',color:C.trackText},
  hint:{fontSize:14,lineHeight:21,color:C.trackTextSec,flexShrink:1},
  options:{minHeight:48,flexDirection:'row',alignItems:'center',gap:12},
  optionTitle:{fontSize:15,lineHeight:22,color:C.trackText},
  copy:{flex:1,minWidth:0},
  row:{minHeight:64,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:14,borderTopWidth:1,borderTopColor:C.trackBorder},
  pressed:{backgroundColor:C.trackCardAlt},
  rowTitle:{fontSize:15,lineHeight:22,fontWeight:'600',color:C.trackText},
  format:{fontWeight:'400',color:C.trackTextSec},
  zoneRow:{minHeight:56,borderTopWidth:1},
  zoneHint:{padding:14,gap:10,borderRadius:16,borderWidth:1,borderColor:C.trackPrimary},
  zoneHead:{flexDirection:'row',alignItems:'center',gap:8},
  zoneButton:{minHeight:48,borderRadius:12,borderWidth:1,borderColor:'rgba(255,255,255,0.3)',alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  zonePrimary:{backgroundColor:C.trackPrimary,borderColor:C.trackPrimary},
  zonePrimaryText:{fontSize:15,lineHeight:22,fontWeight:'700',color:'#04110F'},
  progress:{flexDirection:'row',alignItems:'center',gap:10},
});

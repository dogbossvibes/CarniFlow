import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { shareTrackUserExport, type UserExportFormat } from '../services/trackUserExportService';
import type { ReportLabels } from '../utils/trackReportPdf';

export function TrackExportActions({ data }: { data: unknown }) {
  const { t }=useT(); const [busy,setBusy]=useState(false); const busyRef=useRef(false);
  const [includeNotes,setIncludeNotes]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function run(format: UserExportFormat) {
    if(busyRef.current)return;busyRef.current=true;setBusy(true);
    try {
      const keys=['title','reference','search','duration','objects','score','confidence','conditions','notes','map','source','unknown','date','glyphNotice'] as const;
      const labels=Object.fromEntries(keys.map(key=>[key,t(`track.report.${key}` as TranslationKey)])) as unknown as ReportLabels;
      labels.noGeometry=t('track.export.unavailable');
      labels.confidenceLabels={ excellent:t('track.replay.legend.confidenceExcellent'), good:t('track.replay.legend.confidenceGood'), limited:t('track.replay.legend.confidenceLimited'), unreliable:t('track.replay.legend.confidenceUnreliable') };
      labels.materialLabels={ holz:t('track.materialWood'), duebel:t('track.materialDowel'), stoff:t('track.materialFabric'), filz:t('track.materialFelt'), leder:t('track.materialLeather'), plastik:t('track.materialPlastic'), metall:t('track.materialMetal'), teppich:t('track.materialCarpet'), diverses:t('track.materialOther'), gegenstand:t('track.object'), winkel:t('track.angle') };
      await shareTrackUserExport(data,format,labels,includeNotes);
    } catch {if(mounted.current)Alert.alert(t('track.export.title'),t('track.export.failed'));}
    finally {busyRef.current=false;if(mounted.current)setBusy(false);}
  }
  return <View style={s.card}>
    <Text style={s.title}>{t('track.export.title')}</Text>
    <Text style={s.hint}>{t('track.export.privacy')}</Text>
    <View style={s.options}><Text style={s.hint}>{t('track.export.notes')}</Text><Switch value={includeNotes} onValueChange={setIncludeNotes} disabled={busy} accessibilityLabel={t('track.export.notes')} /></View>
    <View style={s.actions}>{(['pdf','gpx','json'] as const).map(format=><Pressable key={format} testID={`export-${format}`} accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy} onPress={()=>void run(format)} style={s.button}>
      <Text style={s.buttonText}>{t(`track.export.${format}`)}</Text>
    </Pressable>)}</View>
    {busy&&<ActivityIndicator color={C.trackPrimary} />}
  </View>;
}
const s=StyleSheet.create({card:{padding:16,gap:12,marginBottom:16,borderRadius:16,backgroundColor:C.trackCard},title:{fontSize:16,fontWeight:'700',color:C.trackText},hint:{fontSize:12,lineHeight:18,color:C.trackTextMut,flexShrink:1},options:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{minHeight:44,justifyContent:'center',paddingHorizontal:14,borderRadius:10,backgroundColor:C.trackPrimary},buttonText:{color:'#04110F',fontWeight:'700'}});

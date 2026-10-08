import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { shareTrackUserExport, type UserExportFormat } from '../services/trackUserExportService';
import type { ReportLabels } from '../utils/trackReportPdf';

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
  async function run(format: UserExportFormat) {
    if(busyRef.current)return;busyRef.current=true;setActiveFormat(format);
    AccessibilityInfo.announceForAccessibility(t('track.export.preparing', { format: format.toUpperCase() }));
    try {
      const keys=['title','reference','search','duration','objects','score','confidence','conditions','notes','map','source','unknown','date','glyphNotice'] as const;
      const labels=Object.fromEntries(keys.map(key=>[key,t(`track.report.${key}` as TranslationKey)])) as unknown as ReportLabels;
      labels.noGeometry=t('track.export.unavailable');
      labels.confidenceLabels={ excellent:t('track.replay.legend.confidenceExcellent'), good:t('track.replay.legend.confidenceGood'), limited:t('track.replay.legend.confidenceLimited'), unreliable:t('track.replay.legend.confidenceUnreliable') };
      labels.materialLabels={ holz:t('track.materialWood'), duebel:t('track.materialDowel'), stoff:t('track.materialFabric'), filz:t('track.materialFelt'), leder:t('track.materialLeather'), plastik:t('track.materialPlastic'), metall:t('track.materialMetal'), teppich:t('track.materialCarpet'), diverses:t('track.materialOther'), gegenstand:t('track.object'), winkel:t('track.angle') };
      await shareTrackUserExport(data,format,labels,includeNotes);
    } catch {if(mounted.current)Alert.alert(t('track.export.title'),t('track.export.failed'));}
    finally {busyRef.current=false;if(mounted.current)setActiveFormat(null);}
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
    <View>{EXPORT_ROWS.map(({format,icon})=><Pressable key={format} testID={`export-${format}`}
      accessibilityRole="button" accessibilityLabel={`${t(`track.export.${format}`)}, ${format.toUpperCase()}`}
      accessibilityHint={t(`track.export.${format}Hint`)} accessibilityState={{disabled:busy,busy:activeFormat===format}}
      disabled={busy} onPress={()=>void run(format)} style={({pressed})=>[s.row,pressed&&s.pressed]}>
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
  progress:{flexDirection:'row',alignItems:'center',gap:10},
});

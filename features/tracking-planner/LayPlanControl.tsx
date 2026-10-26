import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useLayPlan } from './useLayPlan';
import './i18n';
export function LayPlanControl({ plan, locked = false }: { plan: ReturnType<typeof useLayPlan>; locked?: boolean }) {
 const { t } = useTranslation('trackPlanner');
 const [openKey, setOpenKey] = useState<string | null>(null);
 const open = openKey === plan.key && !locked;
 return <>
  <Pressable accessibilityRole="button" disabled={locked || !plan.enabled} accessibilityState={{ disabled: locked || !plan.enabled }} style={s.button}
   onPress={() => { setOpenKey(plan.key); void plan.refresh(); }}>
   <Text style={[s.label, plan.selected && { color: '#FFD166' }]}>{plan.selected ? `${t('reference')}: ${plan.selected.plan.name}` : t('chooseReference')}</Text>
  </Pressable>
  <Modal visible={open} animationType="slide" onRequestClose={() => setOpenKey(null)}>
   <SafeAreaProvider><SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={s.safe}>
    <View style={s.header}><Pressable accessibilityRole="button" style={s.close} onPress={() => setOpenKey(null)}><Text style={s.label}>{t('done')}</Text></Pressable></View>
    <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={s.title}>{t('chooseReference')}</Text>
    <Text style={s.text}>{t('referenceHint')}</Text>

    <Pressable accessibilityRole="button" style={s.button} onPress={() => { plan.select(null); setOpenKey(null); }}><Text style={s.label}>{t('noReference')}</Text></Pressable>
    {plan.loading ? <ActivityIndicator /> : plan.failed ? <Text accessibilityRole="alert" style={s.text}>{t('referenceError')}</Text> : plan.rows.length ? plan.rows.map(row =>
     <Pressable key={row.plan.id} accessibilityRole="button" style={s.button} onPress={() => { plan.select(row); setOpenKey(null); }}><Text style={s.label}>{row.plan.name}</Text></Pressable>) : <Text style={s.text}>{t('referenceEmpty')}</Text>}
   </ScrollView></SafeAreaView></SafeAreaProvider>
  </Modal>
 </>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: '#080b0c' }, header: { paddingHorizontal: 20, alignItems: 'flex-end' }, close: { minHeight: 48, minWidth: 72, justifyContent: 'center', alignItems: 'center' }, content: { padding: 20, paddingBottom: 32, gap: 16 }, button: { minHeight: 44, padding: 16, marginHorizontal: 14, justifyContent: 'center', backgroundColor: '#141819', borderRadius: 16, borderWidth: 1, borderColor: '#303638' }, label: { color: '#02dbc0', fontSize: 16 }, text: { color: '#c6cdd0', fontSize: 15, lineHeight: 22 }, title: { color: '#fff', fontSize: 24, fontWeight: '700' } });

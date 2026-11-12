import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDogs } from '@/hooks/useDogs';
import { getTrackHistory } from '@/features/tracking/services/trackHistoryService';
import type { TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';
import { TrackSketch } from '@/features/tracking/components/TrackSketch';
import { C } from '@/constants/colors';
import type { ParentReference } from './parentReference';
import type { useDistractions } from './useDistractions';
import './i18n';

export function ParentPicker({ data, dogId }: { data: ReturnType<typeof useDistractions>; dogId?: string }) {
 const { t } = useTranslation('distractions'), router = useRouter(), { dogs } = useDogs();
 const [selectedDog, setDog] = useState(dogId ?? ''), [rows, setRows] = useState<TrackHistoryRow[]>([]);
 const [cached, setCached] = useState<ParentReference[]>([]), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
 const [limit, setLimit] = useState(20); const generation = useRef(0);
 const load = useCallback(async () => {
  const token = ++generation.current; setLoading(true); setFailed(false); setRows([]); setCached([]);
  if (!data.userId || !data.parents) { setLoading(false); return; }
  try {
   const [history, cache] = await Promise.all([getTrackHistory(data.userId), data.parents.listCached()]);
   if (token !== generation.current) return;
   const merged = new Map(history.filter(r => r.status === 'completed').map(r => [r.id, r]));
   // Cached cloud references remain discoverable offline; selecting rechecks identity/deletion.
   for (const ref of cache) if (!merged.has(ref.id)) merged.set(ref.id, { id: ref.id, dog_id: ref.dogId,
    status: 'completed', session_date: ref.date, distance_meters: ref.distanceM } as TrackHistoryRow);
   setRows([...merged.values()].sort((a,b) => (Date.parse(b.session_date ?? '') || 0) - (Date.parse(a.session_date ?? '') || 0))); setCached(cache);
  } catch { if (token === generation.current) setFailed(true); }
  finally { if (token === generation.current) setLoading(false); }
 }, [data.userId, data.parents]);
 useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
 const filtered = rows.filter(row => (!selectedDog || row.dog_id === selectedDog));
 const action = (label: string, press: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={label} style={s.button} onPress={press}><Text style={s.action}>{label}</Text></Pressable>;
 return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
  {action(t('back'), () => router.canGoBack() ? router.back() : router.replace('/track' as never))}
  <Text accessibilityRole="header" style={s.title}>{t('chooseMain')}</Text><Text style={s.text}>{t('chooseHint')}</Text>
  <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
   {[{ id: '', name: t('allDogs') }, ...dogs].map(dog => <Pressable key={dog.id} accessibilityRole="button" accessibilityState={{ selected: selectedDog === dog.id }} onPress={() => { setDog(dog.id); setLimit(20); }} style={[s.button, selectedDog === dog.id && s.selected]}><Text style={s.action}>{dog.name}</Text></Pressable>)}
  </ScrollView>
  {loading && <ActivityIndicator accessibilityLabel={t('loadingMain')} color={C.trackPrimary} />}
  {failed && <Text accessibilityRole="alert" style={s.text}>{t('failure')}</Text>}
  {!loading && !filtered.length && <Text style={s.text}>{t('emptyMain')}</Text>}
  {!loading && filtered.slice(0,limit).map(row => {
   const date = row.session_date && Number.isFinite(Date.parse(row.session_date)) ? new Date(row.session_date).toLocaleDateString() : t('unknownDate');
   const name = dogs.find(dog => dog.id === row.dog_id)?.name ?? t('dogFallback');
   const summary = `${name} · ${date} · ${typeof row.distance_meters === 'number' && Number.isFinite(row.distance_meters) ? Math.round(row.distance_meters) + ' m' : t('unknownDistance')}`;
   const preview = cached.find(ref => ref.id === row.id);
   return <Pressable key={row.id} accessibilityRole="button" accessibilityLabel={`${t('openMain')}: ${summary}`} style={s.card}
    onPress={() => router.push({ pathname: '/track/verleitungen', params: { id: row.id } } as never)}>
    <Text style={s.heading}>{summary}</Text><Text style={s.text}>{row.surface_types?.join(' · ')}</Text>
    {preview && <TrackSketch points={preview.map.lay} w={260} h={80} />}
    <Text style={s.action}>{t('openMain')} →</Text>
   </Pressable>;
  })}
  {filtered.length > limit && action(t('more'), () => setLimit(n => n + 20))}
  {action(t('refresh'), () => { void load(); })}
 </ScrollView></SafeAreaView>;
}
const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: C.bg }, content: { padding: 20, paddingBottom: 40, gap: 16 },
 title: { color: C.trackText, fontSize: 26, fontWeight: '800' }, heading: { color: C.trackText, fontSize: 17, fontWeight: '700' },
 text: { color: C.trackTextSec, fontSize: 15, lineHeight: 22 }, action: { color: C.trackPrimary, fontSize: 16, fontWeight: '700' },
 button: { minHeight: 48, justifyContent: 'center', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border },
 selected: { borderColor: C.trackPrimary, backgroundColor: C.trackCard }, card: { padding: 18, gap: 10, borderRadius: 20, backgroundColor: C.card, borderColor: C.border, borderWidth: 1 } });

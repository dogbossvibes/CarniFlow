import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { formatDate } from '@/i18n/format';
import { useDogs } from '@/hooks/useDogs';
import { useDogTrainingHistory } from '@/hooks/useDogTrainingSummary';
import { buildMatrix, type MatrixCell } from '@/features/training/continue/matrix';
import type { LearningLevel } from '@/features/training/documentation/learningLevel';

// Trainingsdoku neu, Etappe 3 (T-184): Verlauf mit Übungs-Matrix – nur lesend.
// Farben aus dem Mockup; jede Stufe zusätzlich mit Symbol/Text (nie Farbe allein).
// Helligkeit steigt/fällt klar von Stufe zu Stufe (neu hell → sitzt dunkel);
// Symbol-Kontrast je Punkt ≥ 4,5:1 (siehe Test).
export const LEVEL_STYLE: Record<LearningLevel, { bg: string; fg: string; mark: string }> = {
  neu:      { bg: '#CFE9FF', fg: '#0B1F30', mark: 'N' },
  lernen:   { bg: '#F2C14E', fg: '#2A2112', mark: 'L' },
  festigen: { bg: '#2FA88C', fg: '#04201A', mark: 'F' },
  sitzt:    { bg: '#127C65', fg: '#FFFFFF', mark: '✓' },
};
// Rückschritt: Stufenpunkt bleibt, dazu ↓ und ein oranger Rand.
export const DOWN_RING = '#FF8A5B';
export const LEGACY = { bg: '#8A8A8A', fg: '#111111', mark: '★' };

export default function ProgressScreen() {
  const router = useRouter();
  const { t, locale } = useT();
  const { dogId, discipline: initial } = useLocalSearchParams<{ dogId?: string; discipline?: string }>();
  const { dogs } = useDogs();
  const dog = dogs.find(d => d.id === dogId);
  const { data, isLoading, isError, refetch } = useDogTrainingHistory(dogId);
  const [chosen, setTab] = useState<string | null>(initial ?? null);
  const today = useMemo(() => new Date(), []);
  const tabs = useMemo(() => buildMatrix(data?.units ?? [], null, today).disciplines, [data, today]);
  // Unbekannte/verschwundene Sparte (URL-Parameter, gelöschtes Training) → „Alle“.
  const tab = chosen && tabs.includes(chosen) ? chosen : null;
  const matrix = useMemo(() => buildMatrix(data?.units ?? [], tab, today), [data, tab, today]);
  const day = (d: string) => formatDate(new Date(`${d.slice(0, 10)}T12:00:00`), undefined, locale ?? 'de');
  const shortDay = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}`;
  // Hinweise hängen am Sparten-Schlüssel; im Sparten-Tab nur die Schlüssel dieser Sparte.
  const tabKeys = new Set((data?.units ?? []).flatMap(u => u.exercises ?? []).filter(e => e.discipline === tab && e.discipline_key).map(e => e.discipline_key));
  const openHints = (data?.focuses ?? []).filter(f => (f.status === 'open' || f.status === 'practice') && (!tab || tabKeys.has(f.discipline_key)))
    .sort((a, b) => b.source_date_snapshot.localeCompare(a.source_date_snapshot) || b.revision - a.revision || b.id.localeCompare(a.id));
  const openUnit = (id: string, source: 'unit' | 'session') =>
    source === 'session' ? router.push(`/training/${id}` as never) : router.push({ pathname: '/unit/detail', params: { id } });
  const cellLabel = (c: MatrixCell) => c.kind === 'level' ? `${t(`trainingLevel.${c.level}`)}${c.down ? `, ${t('progress.down')}` : ''}`
    : c.kind === 'legacy' ? t('trainingLevel.legacy', { value: c.stars })
    : c.kind === 'unrated' ? t('progress.unrated') : t('progress.notTrained');

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <View style={s.flex}>
          <Text style={s.eyebrow}>{t('progress.title')}</Text>
          <Text style={s.title} accessibilityRole="header" numberOfLines={1}>{dog?.name ?? '—'}{tab ? ` · ${tab}` : ''}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {tabs.length > 0 && <View style={s.tabs} accessibilityRole="tablist">
          {[...tabs, null].map(d => {
            const active = tab === d;
            return <TouchableOpacity key={d ?? 'all'} onPress={() => setTab(d)} style={[s.tab, active && s.tabActive]}
              accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <Text style={[s.tabTxt, active && s.tabTxtActive]} numberOfLines={1}>{d ?? t('progress.all')}</Text>
            </TouchableOpacity>;
          })}
        </View>}

        {isLoading && <ActivityIndicator color={C.accent} accessibilityLabel={t('common.loading')} />}
        {isError && !data && <TouchableOpacity onPress={() => refetch()} style={s.row} accessibilityRole="button">
          <Text style={s.muted}>{t('continueTraining.loadError')}</Text>
        </TouchableOpacity>}
        {data && !matrix.columns.length && !matrix.trainings.length && <Text style={s.muted}>{t('progress.none')}</Text>}

        {matrix.columns.length > 0 && <View style={s.card}>
          <View style={s.cardHead}>
            <Text style={s.h2} accessibilityRole="header">{t('progress.matrixTitle')}</Text>
            <Text style={s.muted}>{t('progress.lastN', { count: matrix.columns.length })}</Text>
          </View>
          <View style={s.gridRow}>
            <View style={s.nameCol} />
            {matrix.columns.map(c => <Text key={c.unitId} style={s.colHead}>{shortDay(c.date)}</Text>)}
          </View>
          {matrix.rows.map(r => <View key={r.key} style={s.gridRow}>
            <Text style={[s.nameCol, s.rowName]} numberOfLines={2}>{r.name}</Text>
            {r.cells.map((c, i) => {
              const st = c.kind === 'level' ? LEVEL_STYLE[c.level] : c.kind === 'legacy' ? LEGACY : null;
              const down = c.kind === 'level' && c.down;
              return <View key={i} style={s.cellBox} accessible
                accessibilityLabel={`${day(matrix.columns[i].date)}, ${r.name}: ${cellLabel(c)}`}>
                {st ? <View style={[s.dot, { backgroundColor: st.bg }, down && s.dotDown]}><Text style={[s.dotTxt, { color: st.fg }]}>{down ? `${st.mark}↓` : st.mark}</Text></View>
                  : <View style={c.kind === 'unrated' ? s.unrated : s.empty} />}
              </View>;
            })}
          </View>)}
          <View style={s.legend}>
            {(Object.keys(LEVEL_STYLE) as LearningLevel[]).map(l => <Legend key={l} {...LEVEL_STYLE[l]} label={t(`trainingLevel.${l}`)} />)}
            <View style={s.legendItem}><View style={[s.dot, s.dotSmall, s.dotDown, { backgroundColor: LEVEL_STYLE.lernen.bg }]}><Text style={[s.dotTxtSmall, { color: LEVEL_STYLE.lernen.fg }]}>↓</Text></View><Text style={s.legendTxt}>{t('progress.down')}</Text></View>
            <Legend {...LEGACY} label={t('progress.legacyShort')} />
            <View style={s.legendItem}><View style={s.unrated} /><Text style={s.legendTxt}>{t('progress.unrated')}</Text></View>
            <View style={s.legendItem}><View style={s.empty} /><Text style={s.legendTxt}>{t('progress.notTrained')}</Text></View>
          </View>
        </View>}

        {matrix.fallback && <View style={s.fallback} accessibilityRole="alert">
          <Ionicons name="time-outline" size={20} color="#F2C14E" />
          <Text style={s.fallbackTxt}>{t('progress.fallback', { name: matrix.fallback.name, days: matrix.fallback.days })}</Text>
        </View>}

        {openHints.length > 0 && <View style={s.section}>
          <Text style={s.h2} accessibilityRole="header">{t('progress.openHints', { count: openHints.length })}</Text>
          {openHints.map(f => <View key={f.id} style={s.hint}>
            <Text style={s.hintTxt}>{f.text}</Text>
            <Text style={s.muted}>{[f.exercise_name_snapshot, day(f.source_date_snapshot)].filter(Boolean).join(' · ')}</Text>
          </View>)}
        </View>}

        {matrix.trainings.length > 0 && <View style={s.section}>
          <Text style={s.h2} accessibilityRole="header">{t('progress.allTrainings')}</Text>
          {matrix.trainings.map(tr => <TouchableOpacity key={tr.id} onPress={() => openUnit(tr.id, tr.source)} style={s.training} accessibilityRole="button">
            <Text style={s.trDate}>{day(tr.date)}</Text>
            <Text style={s.trNames} numberOfLines={2}>{tr.names.join(', ') || tr.disciplines.join(', ')}</Text>
            {tr.durationSec ? <Text style={s.muted}>{t('progress.minutes', { count: Math.max(1, Math.round(tr.durationSec / 60)) })}</Text> : null}
          </TouchableOpacity>)}
        </View>}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Legend({ bg, fg, mark, label }: { bg: string; fg: string; mark: string; label: string }) {
  return <View style={s.legendItem}>
    <View style={[s.dot, s.dotSmall, { backgroundColor: bg }]}><Text style={[s.dotTxtSmall, { color: fg }]}>{mark}</Text></View>
    <Text style={s.legendTxt}>{label}</Text>
  </View>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.cardAlt, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, color: C.textMuted, fontWeight: '700', letterSpacing: 1.2 },
  title: { fontSize: 20, color: C.white, fontWeight: '800' },
  content: { paddingHorizontal: 16, gap: 16, paddingBottom: 24 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  tabActive: { backgroundColor: C.white, borderColor: C.white },
  tabTxt: { fontSize: 14, color: C.textMuted, fontWeight: '600' },
  tabTxtActive: { color: '#0E0F10', fontWeight: '700' },
  card: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 20, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  h2: { fontSize: 15, color: C.white, fontWeight: '700' },
  gridRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  nameCol: { width: 110, paddingRight: 6 },
  rowName: { fontSize: 13, color: C.white, fontWeight: '600' },
  colHead: { flex: 1, textAlign: 'center', fontSize: 11, color: C.textMuted },
  cellBox: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  dot: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  dotDown: { borderWidth: 2, borderColor: DOWN_RING },
  dotTxt: { fontSize: 11, fontWeight: '800' },
  dotSmall: { minWidth: 18, height: 18, borderRadius: 9 },
  dotTxtSmall: { fontSize: 10, fontWeight: '800' },
  empty: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#8A8E94' },
  unrated: { width: 10, height: 4, borderRadius: 2, backgroundColor: '#8A8E94' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendTxt: { fontSize: 12, color: C.textMuted },
  fallback: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#5A4720', backgroundColor: '#2A2112' },
  fallbackTxt: { flex: 1, fontSize: 14, color: C.white, lineHeight: 19 },
  section: { gap: 8 },
  hint: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, gap: 2 },
  hintTxt: { fontSize: 14, color: C.white, fontWeight: '600' },
  training: { minHeight: 44, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card, gap: 2 },
  trDate: { fontSize: 13, color: C.textMuted, fontWeight: '700' },
  trNames: { fontSize: 14, color: C.white, fontWeight: '600' },
  row: { minHeight: 44, justifyContent: 'center' },
  muted: { fontSize: 13, color: C.textMuted },
});

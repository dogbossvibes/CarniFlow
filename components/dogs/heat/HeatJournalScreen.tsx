import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { C } from '@/constants/colors';
import { DateField } from '@/components/ui/DateField';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useSession } from '@/lib/session-context';
import { useT } from '@/i18n';
import { fromISODate, toISODate } from '@/features/dogs/dateInput';
import { getHeatCycleDetails, fmtDate, heatCycleDay, durationDays, type HeatCycle, type HeatObservation } from '@/features/dogs/heatCycles';
import { dailyHeatRows, recordedActiveCycle, saveDailyHeatRows, finishRecordedHeat, type ObservationInput } from '@/features/dogs/heatJournal';
import { heatUxCopy } from '@/features/dogs/heatUxCopy';
import { HeatOverviewCalendar } from './HeatOverviewCalendar';
import { HeatForecast } from './HeatForecast';
import type { Dog } from '@/types';

type Details = Awaited<ReturnType<typeof getHeatCycleDetails>>;
const EMPTY: Details = { cycles: [], phases: [], observations: [] };
const BLEEDING = ['Keine', 'Leicht', 'Mittel', 'Stark'] as const;
const BEHAVIOR = ['Wie üblich', 'Unruhig', 'Anhänglicher'] as const;

export function HeatJournalScreen({ dog }: { dog: Dog }) {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useSession();
  const { locale } = useT();
  const copy = heatUxCopy(locale);
  const { isPro, loading: capLoading } = useCapabilities();
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState<Details>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  const [formCycle, setFormCycle] = useState<HeatCycle | null>(null);
  const [date, setDate] = useState<Date | null>(new Date());
  const [bleeding, setBleeding] = useState<string | null>(null);
  const [behavior, setBehavior] = useState<string | null>(null);
  const [standing, setStanding] = useState(false);
  const [discharge, setDischarge] = useState('');
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [ending, setEnding] = useState<HeatCycle | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const pendingRows = useRef<ObservationInput[] | null>(null);
  const writeLock = useRef(false);
  const mounted = useRef(true);
  const generation = useRef(0);
  const isOwner = !!user?.id && dog.owner_id === user.id;
  const today = toISODate(new Date());
  const active = recordedActiveCycle(details.cycles, today);
  const dirty = !!formCycle && (!!bleeding || !!behavior || standing || !!discharge.trim() || !!notes.trim());
  useEffect(() => () => { mounted.current = false; generation.current++; }, []);
  useEffect(() => { if (!capLoading && !isPro) router.replace('/premium' as never); }, [capLoading, isPro, router]);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setRefreshing(true);
    try {
      const data = await getHeatCycleDetails(dog.id);
      if (mounted.current && current === generation.current) { setDetails(data); setFailed(false); setLoaded(true); }
    } catch { if (mounted.current && current === generation.current) setFailed(true); }
    finally { if (mounted.current && current === generation.current) { setLoading(false); setRefreshing(false); } }
  }, [dog.id]);
  useFocusEffect(useCallback(() => { if (isPro && !capLoading) void load(); return () => { generation.current++; }; }, [load, isPro, capLoading]));
  usePreventRemove(dirty || saving, ({ data }) => {
    if (saving) return;
    Alert.alert(copy.discard, undefined, [{ text: copy.cancel, style: 'cancel' }, { text: copy.discardYes, style: 'destructive', onPress: () => navigation.dispatch(data.action) }]);
  });
  const closeForm = () => {
    if (saving) return;
    const close = () => { setFormCycle(null); pendingRows.current = null; setSaveFailed(false); };
    if (dirty) Alert.alert(copy.discard, undefined, [{ text: copy.cancel, style: 'cancel' }, { text: copy.discardYes, style: 'destructive', onPress: close }]); else close();
  };
  const openForm = (cycle: HeatCycle) => {
    if (!isOwner || writeLock.current) return;
    setFormCycle(cycle); setDate(new Date()); setBleeding(null); setBehavior(null); setStanding(false); setDischarge(''); setNotes(''); setMore(false); setSaveFailed(false); setNotice(''); pendingRows.current = null;
  };
  const save = async () => {
    if (!formCycle || !date || !user?.id || !isOwner || !isPro || writeLock.current) return;
    const rows = pendingRows.current ?? dailyHeatRows({ date: toISODate(date), bleeding, behavior, standing, discharge, notes }, () => Crypto.randomUUID());
    if (!rows.length) return;
    pendingRows.current = rows;
    writeLock.current = true; setSaving(true); setSaveFailed(false);
    try {
      await saveDailyHeatRows(dog.id, formCycle.id, user.id, rows);
      if (!mounted.current) return;
      pendingRows.current = null; setFormCycle(null); setNotice(copy.saved); void load();
    } catch { if (mounted.current) setSaveFailed(true); }
    finally { writeLock.current = false; if (mounted.current) setSaving(false); }
  };
  const finish = async () => {
    if (!ending || !endDate || !user?.id || !isOwner || !isPro || writeLock.current) return;
    writeLock.current = true; setSaving(true); setSaveFailed(false);
    try {
      await finishRecordedHeat(dog.id, ending.id, user.id, toISODate(endDate));
      if (mounted.current) { setEnding(null); void load(); }
    } catch { if (mounted.current) setSaveFailed(true); }
    finally { writeLock.current = false; if (mounted.current) setSaving(false); }
  };
  const openCycle = (cycle: HeatCycle) => router.push(`/dog-heat/${cycle.id}` as never);
  const newCycle = (historical = false) => router.push({ pathname: '/dog-heat-new', params: { id: dog.id, historical: historical ? '1' : '0' } } as never);
  const recent = active ? details.observations.filter(o => o.heatCycleId === active.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)) : [];
  const todayRows = recent.filter(o => o.date === today);
  const locked = saving || !!pendingRows.current;
  const observationText = (o: HeatObservation) => {
    const labels: Record<string, string> = { Blutung: copy.bleeding, Verhalten: copy.behavior, Notiz: copy.note, Standreflex: copy.standing, Ausfluss: copy.discharge };
    const values: Record<string, string> = { Keine: copy.none, Leicht: copy.light, Mittel: copy.medium, Stark: copy.strong, 'Wie üblich': copy.usual, Unruhig: copy.restless, Anhänglicher: copy.affectionate };
    return `${labels[o.type] ?? o.type}${o.value ? `: ${values[o.value] ?? o.value}` : ''}`;
  };
  const observationRows = (rows: HeatObservation[]) => rows.map(o => <View key={o.id} style={s.observation}><Text style={s.muted}>{fmtDate(o.date)}</Text><Text style={s.body}>{observationText(o)}</Text>{o.notes ? <Text style={s.body}>{o.notes}</Text> : null}</View>);
  if (capLoading || !isPro) return <View style={s.center}><ActivityIndicator color={C.trackPrimary} /></View>;
  return <SafeAreaView edges={['top']} style={s.root}>
    <View style={s.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.back} style={s.iconButton} onPress={formCycle ? closeForm : () => router.back()} disabled={saving}><Ionicons name="chevron-back" size={22} color={C.trackText} /></TouchableOpacity>
      <View style={s.flex}><Text style={s.eyebrow}>{copy.health.toUpperCase()}</Text><Text style={s.title}>{formCycle ? copy.observation : copy.title}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.title} style={s.iconButton} onPress={() => Alert.alert(copy.title, copy.help)}><Ionicons name="help-circle-outline" size={25} color={C.trackText} /></TouchableOpacity>
    </View>
    <View style={s.dog}><Ionicons name="paw-outline" size={18} color={C.trackPrimary} /><Text style={s.body}>{dog.name} · {copy.female}</Text></View>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshControl={!formCycle && !ending ? <RefreshControl refreshing={refreshing && !loading} onRefresh={() => void load()} tintColor={C.trackPrimary} /> : undefined}>
        {failed && <View style={s.card} accessibilityRole="alert"><Text style={s.body}>{copy.error}</Text><HeatButton label={copy.retry} onPress={() => void load()} secondary /></View>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.muted}>{notice}</Text>}
        {formCycle ? <>
          <View pointerEvents={locked ? 'none' : 'auto'} accessibilityElementsHidden={locked} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'} style={s.form}>
            <DateField label={copy.date} value={date} onChange={setDate} minimumDate={fromISODate(formCycle.startDate) ?? undefined} maximumDate={formCycle.endDate ? fromISODate(formCycle.endDate) ?? new Date() : new Date()} />
            <View style={s.card}><Text style={s.section}>{copy.bleeding}</Text><View style={s.choices}>{BLEEDING.map((value, i) => <Choice key={value} label={[copy.none, copy.light, copy.medium, copy.strong][i]} selected={bleeding === value} disabled={locked} onPress={() => setBleeding(bleeding === value ? null : value)} />)}</View></View>
            <View style={s.card}><Text style={s.section}>{copy.behavior}</Text><View style={s.choices}>{BEHAVIOR.map((value, i) => <Choice key={value} label={[copy.usual, copy.restless, copy.affectionate][i]} selected={behavior === value} disabled={locked} onPress={() => setBehavior(behavior === value ? null : value)} />)}</View></View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.breeding} accessibilityState={{ expanded: more, disabled: locked }} disabled={locked} style={s.card} onPress={() => setMore(!more)}><Text style={s.body}>{copy.breeding} {more ? '−' : '+'}</Text></TouchableOpacity>
            {more && <View style={s.card}><Choice label={copy.standing} selected={standing} disabled={locked} onPress={() => setStanding(!standing)} /><Text style={s.section}>{copy.discharge}</Text><TextInput accessibilityLabel={copy.discharge} editable={!locked} value={discharge} onChangeText={setDischarge} maxLength={500} multiline style={s.input} /><Text style={s.muted}>{copy.phaseCaution}</Text></View>}
            <View style={s.card}><Text style={s.section}>{copy.note}</Text><TextInput accessibilityLabel={copy.note} editable={!locked} value={notes} onChangeText={setNotes} maxLength={2000} multiline style={s.input} placeholder={copy.note} placeholderTextColor={C.trackTextMut} /></View>
          </View>
          {!dirty && <Text style={s.muted}>{copy.select}</Text>}
          {saveFailed && <Text accessibilityRole="alert" style={s.error}>{copy.saveError}</Text>}
          <HeatButton label={saveFailed ? copy.retry : copy.save} onPress={() => void save()} disabled={!dirty || !date || saving} />
          <HeatButton label={copy.cancel} onPress={closeForm} secondary disabled={saving} />
        </> : loading ? <ActivityIndicator color={C.trackPrimary} /> : !loaded ? null : <>
          <View style={s.tabs}>{(['overview', 'history'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} style={[s.tab, tab === value && s.selected]} onPress={() => setTab(value)}><Text style={[s.body, tab === value && s.selectedText]}>{copy[value]}</Text></TouchableOpacity>)}</View>
          {tab === 'overview' ? <>
            <HeatOverviewCalendar cycles={details.cycles} phases={details.phases} observations={details.observations} onOpenCycle={openCycle} />
            <HeatForecast cycles={details.cycles} />
            <HeatButton label={copy.calendar} secondary onPress={() => router.push(`/dog-heat-calendar/${dog.id}` as never)} />
            <View style={s.card}>
              <Text style={s.mint}>{active ? copy.active : details.cycles.length ? copy.inactive : copy.empty}</Text>
              {active && <><Text style={s.day}>{copy.day} {heatCycleDay(active.startDate, today)}</Text><Text style={s.body}>{copy.since}: {fmtDate(active.startDate)}</Text><Text style={s.muted}>{copy.recorded}</Text></>}
              {!active && isOwner && !failed && <HeatButton label={copy.start} onPress={() => newCycle()} />}
            </View>
            {active && <><View style={s.card}><Text style={s.section}>{copy.today}</Text>{todayRows.length ? observationRows(todayRows) : <Text style={s.muted}>{copy.noToday}</Text>}{isOwner && <HeatButton label={copy.add} onPress={() => openForm(active)} />}</View>
              <Text style={s.section}>{copy.latest}</Text><View style={s.card}>{recent.length ? observationRows(recent.slice(0, 3)) : <Text style={s.muted}>{copy.noToday}</Text>}<HeatButton label={copy.all} secondary onPress={() => openCycle(active)} /></View>
              {isOwner && !ending && <HeatButton label={copy.end} secondary onPress={() => { setEnding(active); setEndDate(new Date()); setSaveFailed(false); }} />}
            </>}
            <View style={s.card}><Text style={s.section}>{copy.phaseGuide}</Text><Text style={s.body}>{copy.phaseSequence}</Text><Text style={s.muted}>{copy.phaseCaution}</Text></View>
            <Text style={s.section}>{copy.records}</Text>
            {[...details.cycles].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(cycle => <View key={cycle.id} style={s.card}><Text style={s.body}>{fmtDate(cycle.startDate)}{cycle.endDate ? ` – ${fmtDate(cycle.endDate)}` : ''}</Text>{cycle.phase && <Text style={s.muted}>{copy.recordedPhases}: {cycle.phase}</Text>}{details.phases.filter(p => p.heatCycleId === cycle.id).map(p => <Text key={p.id} style={s.muted}>{copy.recordedPhases}: {p.phaseType} · {fmtDate(p.startDate)}{p.endDate ? ` – ${fmtDate(p.endDate)}` : ''}</Text>)}{observationRows(details.observations.filter(o => o.heatCycleId === cycle.id && ['Standreflex', 'Ausfluss'].includes(o.type)))}<HeatButton label={isOwner ? copy.manageEntry : copy.details} secondary onPress={() => openCycle(cycle)} /></View>)}
            {ending && <View style={s.card}><Text style={s.section}>{copy.end}</Text><Text style={s.body}>{copy.endBody}</Text><DateField label={copy.endDate} value={endDate} onChange={setEndDate} minimumDate={fromISODate(ending.startDate) ?? undefined} maximumDate={new Date()} />{saveFailed && <Text accessibilityRole="alert" style={s.error}>{copy.saveError}</Text>}<HeatButton label={copy.endConfirm} onPress={() => void finish()} disabled={!endDate || saving} /><HeatButton label={copy.cancel} secondary disabled={saving} onPress={() => setEnding(null)} /></View>}
          </> : <>
            <Text style={s.section}>{copy.records}</Text>
            {[...details.cycles].sort((a, b) => b.startDate.localeCompare(a.startDate)).map(cycle => {
              const rows = details.observations.filter(o => o.heatCycleId === cycle.id).sort((a, b) => b.date.localeCompare(a.date));
              const duration = durationDays(cycle.startDate, cycle.endDate);
              return <View key={cycle.id} style={s.card}><Text style={s.section}>{cycle.id === active?.id ? copy.current : copy.previous}</Text><Text style={s.body}>{fmtDate(cycle.startDate)}{cycle.endDate ? ` – ${fmtDate(cycle.endDate)}` : ''}</Text><Text style={s.muted}>{duration != null ? `${duration} ${copy.days} · ` : ''}{rows.length} {copy.observations}</Text>{observationRows(rows.slice(0, 2))}<HeatButton label={copy.details} secondary onPress={() => openCycle(cycle)} /></View>;
            })}
            <Text style={s.muted}>{copy.kept}</Text>
            {isOwner && !failed && <HeatButton label={copy.earlier} secondary onPress={() => newCycle(true)} />}
            <HeatButton label={copy.calendar} secondary onPress={() => router.push(`/dog-heat-calendar/${dog.id}` as never)} />
          </>}
          {!isOwner && <Text style={s.muted}>{copy.readonly}</Text>}
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={[s.choice, selected && s.selected]}><Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={selected ? '#04110F' : C.trackTextSec} /><Text style={[s.body, selected && s.selectedText]}>{label}</Text></TouchableOpacity>;
}
export function HeatButton({ label, secondary, disabled, onPress }: { label: string; secondary?: boolean; disabled?: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.5 }]}><Text style={[s.buttonText, secondary && { color: C.trackText }]}>{label}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg }, flex: { flex: 1 }, center: { flex: 1, justifyContent: 'center', backgroundColor: C.trackBg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: C.trackCard }, eyebrow: { color: C.trackTextSec, fontSize: 11, letterSpacing: 2 }, title: { color: C.trackText, fontSize: 26, fontWeight: '800' },
  dog: { marginHorizontal: 20, marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: C.trackCard, flexDirection: 'row', alignItems: 'center', gap: 10 }, content: { padding: 20, gap: 18 }, form: { gap: 16 }, card: { padding: 18, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard }, section: { color: C.trackText, fontSize: 19, fontWeight: '700' }, body: { color: C.trackText, fontSize: 16, flexShrink: 1, lineHeight: 23 }, muted: { color: C.trackTextSec, fontSize: 14, lineHeight: 21 }, mint: { color: C.trackPrimary, fontSize: 16, fontWeight: '600' }, day: { color: C.trackText, fontSize: 40, fontWeight: '800' }, tabs: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: C.trackCard, gap: 4 }, tab: { flex: 1, minHeight: 48, padding: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, selected: { backgroundColor: C.trackPrimary, borderColor: C.trackPrimary }, selectedText: { color: '#04110F', fontWeight: '700' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { flexGrow: 1, minWidth: 90, minHeight: 60, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', gap: 7 }, input: { color: C.trackText, fontSize: 16, lineHeight: 23, minHeight: 100, textAlignVertical: 'top', padding: 12, backgroundColor: C.trackBg, borderRadius: 12 }, button: { minHeight: 52, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: C.trackPrimary, justifyContent: 'center', alignItems: 'center' }, secondary: { backgroundColor: C.trackCard, borderColor: C.trackBorder, borderWidth: 1 }, buttonText: { color: '#04110F', fontWeight: '700', fontSize: 16, textAlign: 'center' }, observation: { gap: 3, paddingVertical: 6 }, error: { color: C.trackDanger, fontSize: 15, lineHeight: 22 },
});

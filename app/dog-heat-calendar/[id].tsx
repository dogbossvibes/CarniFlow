import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnyvoBottomSheet } from '@/components/ui/AnyvoBottomSheet';
import { fromISODate } from '@/features/dogs/dateInput';
import {
  getHeatCycleDetails, heatCycleDay, isActiveCycle, durationDays, fmtDate,
  type HeatCycle, type HeatObservation, type HeatPhase,
} from '@/features/dogs/heatCycles';
import {
  buildHeatCalendarDays, currentHeatPhase, dayKey, filterHeatCycles,
  getHeatCalendarStats, getMonthGrid, heatHistoryMetadata, phaseTone, type HeatCalendarDay, type HeatCalendarFilter, type HeatPhaseTone,
} from '@/features/dogs/heatCalendar';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useT } from '@/i18n';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const PHASE_LABELS = ['Proöstrus', 'Östrus', 'Diöstrus', 'Anöstrus'] as const;

const PHASE_COLORS: Record<HeatPhaseTone, { background: string; text: string }> = {
  proestrus: { background: '#F9A8D4', text: '#3C1028' },
  estrus: { background: '#F472B6', text: '#3C1028' },
  diestrus: { background: C.trackPurple, text: '#FFFFFF' },
  anestrus: { background: C.trackBlue, text: '#FFFFFF' },
  default: { background: 'rgba(244,114,182,0.62)', text: '#FFFFFF' },
};

const formatDate = (iso: string) => {
  const date = fromISODate(iso);
  return date ? date.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : iso;
};

const moveMonth = (cursor: { year: number; month: number }, offset: number) => {
  const date = new Date(cursor.year, cursor.month + offset, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
};

export default function DogHeatCalendarScreen() {
  const { t } = useT();
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const { isPro, loading: capabilityLoading } = useCapabilities();
  const insets = useSafeAreaInsets();
  const today = useMemo(() => dayKey(new Date()), []);
  const initialDate = fromISODate(today) ?? new Date();
  const [cursor, setCursor] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() });
  const [filter, setFilter] = useState<HeatCalendarFilter>('all');
  const [cycles, setCycles] = useState<HeatCycle[]>([]);
  const [phases, setPhases] = useState<HeatPhase[]>([]);
  const [observations, setObservations] = useState<HeatObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedDay, setSelectedDay] = useState<HeatCalendarDay | null>(null);

  useEffect(() => {
    if (!capabilityLoading && !isPro) router.replace('/premium' as never);
  }, [capabilityLoading, isPro, router]);

  const load = useCallback(async () => {
    if (!dogId) return;
    setLoading(true);
    setLoadError(false);
    try {
      const details = await getHeatCycleDetails(dogId);
      setCycles(details.cycles);
      setPhases(details.phases);
      setObservations(details.observations);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [dogId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const visibleCycles = useMemo(() => filterHeatCycles(cycles, filter), [cycles, filter]);
  const days = useMemo(() => buildHeatCalendarDays({
    year: cursor.year, month: cursor.month, cycles: visibleCycles, phases, observations, today,
  }), [cursor, visibleCycles, phases, observations, today]);
  const daysByKey = useMemo(() => new Map(days.map(day => [day.key, day])), [days]);
  const stats = useMemo(() => getHeatCalendarStats(cycles, phases), [cycles, phases]);
  const activeCycle = useMemo(
    () => cycles.filter(isActiveCycle).sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null,
    [cycles],
  );
  const activePhase = useMemo(
    () => activeCycle ? currentHeatPhase(activeCycle, phases, today) : null,
    [activeCycle, phases, today],
  );
  const histories = useMemo(
    () => cycles.filter(cycle => !isActiveCycle(cycle)).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [cycles],
  );
  const phaseCounts = useMemo(() => phases.reduce<Record<string, number>>((counts, phase) => {
    counts[phase.heatCycleId] = (counts[phase.heatCycleId] ?? 0) + 1;
    return counts;
  }, {}), [phases]);
  const observationCounts = useMemo(() => observations.reduce<Record<string, number>>((counts, observation) => {
    counts[observation.heatCycleId] = (counts[observation.heatCycleId] ?? 0) + 1;
    return counts;
  }, {}), [observations]);
  const selectedCycle = useMemo(() => selectedDay?.cycle ?? cycles.find(cycle =>
    selectedDay?.observations.some(observation => observation.heatCycleId === cycle.id),
  ) ?? null, [cycles, selectedDay]);

  if (!capabilityLoading && !isPro) return null;
  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#F472B6" /></View>;
  if (loadError) return (
    <View style={s.center}>
      <Text style={s.errorText}>{t('heat.calendarLoadError')}</Text>
      <TouchableOpacity style={s.retryButton} onPress={() => void load()}><Text style={s.retryText}>{t('common.retry')}</Text></TouchableOpacity>
    </View>
  );

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8} accessibilityLabel="Zurück">
            <Ionicons name="chevron-back" size={20} color={C.trackText} />
          </TouchableOpacity>
          <View style={s.barTitleWrap}>
            <Text style={s.barTitle}>{t('heat.calendarTitle')}</Text>
            <Text style={s.barSubtitle}>Verlauf & Phasen</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push({ pathname: '/dog-heat-new', params: { id: dogId } } as never)} hitSlop={8} accessibilityLabel={t('heat.add')}>
            <Ionicons name="add" size={20} color={C.trackText} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]} showsVerticalScrollIndicator={false}>
          <View style={s.calendarCard}>
            <View style={s.monthNav}>
              <TouchableOpacity style={s.monthButton} onPress={() => setCursor(value => moveMonth(value, -1))} hitSlop={8} accessibilityLabel={t('heat.calendarPrevMonth')}>
                <Ionicons name="chevron-back" size={18} color={C.trackText} />
              </TouchableOpacity>
              <Text style={s.monthTitle}>{MONTHS[cursor.month]} {cursor.year}</Text>
              <TouchableOpacity style={s.monthButton} onPress={() => setCursor(value => moveMonth(value, 1))} hitSlop={8} accessibilityLabel={t('heat.calendarNextMonth')}>
                <Ionicons name="chevron-forward" size={18} color={C.trackText} />
              </TouchableOpacity>
            </View>

            <View style={s.filters}>
              {([['all', 'Alle'], ['current', 'Aktuell'], ['past', 'Vergangen']] as const).map(([value, label]) => (
                <TouchableOpacity key={value} style={[s.filter, filter === value && s.filterOn]} onPress={() => setFilter(value)} activeOpacity={0.8}>
                  <Text style={[s.filterText, filter === value && s.filterTextOn]}>{label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.todayButton} onPress={() => setCursor({ year: initialDate.getFullYear(), month: initialDate.getMonth() })}>
                <Text style={s.todayText}>{t('date.today')}</Text>
              </TouchableOpacity>
            </View>

            <View style={s.weekdays}>{WEEKDAYS.map(day => <Text key={day} style={s.weekday}>{day}</Text>)}</View>
            <View style={s.grid}>
              {getMonthGrid(cursor.year, cursor.month).map((key, index) => {
                if (!key) return <View key={`empty-${index}`} style={s.dayCell} />;
                const day = daysByKey.get(key)!;
                const tone = phaseTone(day.phase?.phaseType ?? day.cycle?.phase);
                const colors = PHASE_COLORS[tone];
                const hasData = !!day.cycle || day.observations.length > 0;
                const starts = day.phase?.startDate === key || (!day.phase && day.cycle?.startDate === key);
                const ends = day.phase?.endDate === key || (!day.phase && day.cycle?.endDate === key) || key === today;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[s.dayCell, hasData && s.dayCellData, key === today && s.dayCellToday]}
                    onPress={() => hasData && setSelectedDay(day)}
                    disabled={!hasData}
                    activeOpacity={0.72}
                    accessibilityRole={hasData ? 'button' : undefined}
                    accessibilityLabel={hasData ? `${formatDate(key)}, ${day.phase?.phaseType ?? 'Läufigkeit'}` : undefined}
                  >
                    <Text style={[s.dayNumber, key === today && s.dayNumberToday]}>{day.day}</Text>
                    {day.cycle ? <View style={[s.phaseBar, { backgroundColor: colors.background }, starts && s.phaseStart, ends && s.phaseEnd]} /> : null}
                    {day.observations.length > 0 ? <View style={[s.observationDot, { backgroundColor: day.cycle ? C.trackPrimary : C.trackTextMut }]} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.legend}>
              {PHASE_LABELS.map(label => {
                const colors = PHASE_COLORS[phaseTone(label)];
                return <View key={label} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.background }]} /><Text style={s.legendText}>{label}</Text></View>;
              })}
            </View>
          </View>

          {activeCycle ? (
            <TouchableOpacity style={s.activeCard} onPress={() => router.push(`/dog-heat/${activeCycle.id}` as never)} activeOpacity={0.82}>
              <View style={s.activeHead}><View style={s.activeDot} /><Text style={s.activeEyebrow}>{t('heat.currentCycle')}</Text><Ionicons name="chevron-forward" size={16} color={C.trackTextMut} /></View>
              <View style={s.activeDetails}>
                <View><Text style={s.activeValue}>{formatDate(activeCycle.startDate)}</Text><Text style={s.activeLabel}>{t('common.start')}</Text></View>
                 <View><Text style={s.activeValue}>Tag {heatCycleDay(activeCycle.startDate, today)}</Text><Text style={s.activeLabel}>{t('date.today')}</Text></View>
                <View><Text style={s.activeValue}>{activePhase?.phaseType ?? '—'}</Text><Text style={s.activeLabel}>{t('track.current')}</Text></View>
              </View>
              <View style={s.cycleLine}>
                {PHASE_LABELS.map(label => {
                  const active = phaseTone(activePhase?.phaseType) === phaseTone(label);
                  const color = PHASE_COLORS[phaseTone(label)].background;
                  return <View key={label} style={[s.cycleSegment, { backgroundColor: active ? color : 'rgba(255,255,255,0.10)' }]} />;
                })}
              </View>
              <View style={s.cycleLabels}>{PHASE_LABELS.map(label => <Text key={label} style={s.cycleLabel}>{label}</Text>)}</View>
            </TouchableOpacity>
          ) : null}

          {histories.length > 0 ? <View style={s.sectionBlock}>
            <Text style={s.sectionTitle}>{t('heat.history')}</Text>
            {histories.map(cycle => {
               const duration = durationDays(cycle.startDate, cycle.endDate);
               const metadata = heatHistoryMetadata(duration, phaseCounts[cycle.id] ?? 0, observationCounts[cycle.id] ?? 0);
              return <TouchableOpacity key={cycle.id} style={s.historyRow} onPress={() => router.push(`/dog-heat/${cycle.id}` as never)} activeOpacity={0.8}>
                <View style={s.historyIcon}><Ionicons name="heart-outline" size={16} color="#F472B6" /></View>
                <View style={s.historyBody}>
                  <Text style={s.historyTitle}>{fmtDate(cycle.startDate)} – {fmtDate(cycle.endDate)}</Text>
                   <Text style={s.historyMeta}>{metadata}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.trackTextMut} />
              </TouchableOpacity>;
            })}
          </View> : null}

          {(stats.lastCompleted || stats.averageCycleDays || stats.averageHeatDays || stats.averageEstrusDays || stats.nextExpected) ? <View style={s.sectionBlock}>
            <Text style={s.sectionTitle}>{t('training.stats')}</Text>
            <View style={s.statsGrid}>
              {stats.lastCompleted ? <Stat label="Letzte Läufigkeit" value={fmtDate(stats.lastCompleted.startDate) ?? '—'} /> : null}
              {stats.lastCompleted ? <Stat label="Dauer letzte" value={durationDays(stats.lastCompleted.startDate, stats.lastCompleted.endDate) ? `${durationDays(stats.lastCompleted.startDate, stats.lastCompleted.endDate)} Tage` : '—'} /> : null}
              {stats.averageCycleDays ? <Stat label="Ø Zyklus" value={`${stats.averageCycleDays} Tage`} /> : null}
              {stats.averageHeatDays ? <Stat label="Ø Läufigkeit" value={`${stats.averageHeatDays} Tage`} /> : null}
              {stats.averageEstrusDays ? <Stat label="Ø Östrus" value={`${stats.averageEstrusDays} Tage`} /> : null}
               {stats.nextExpected ? <Stat label="Nächste erwartet" value={`ca. ${formatDate(stats.nextExpected)}`} /> : null}
            </View>
          </View> : null}
        </ScrollView>

        <AnyvoBottomSheet visible={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? formatDate(selectedDay.key) : undefined}>
          {selectedDay && selectedCycle ? <View style={s.sheetContent}>
            <View style={s.sheetPhaseRow}>
              <View style={[s.sheetPhaseDot, { backgroundColor: PHASE_COLORS[phaseTone(selectedDay.phase?.phaseType ?? selectedCycle.phase)].background }]} />
              <View style={s.flex}><Text style={s.sheetPhase}>{selectedDay.phase?.phaseType ?? 'Läufigkeit'}</Text><Text style={s.sheetMeta}>Tag {heatCycleDay(selectedCycle.startDate, selectedDay.key)} im Zyklus</Text></View>
            </View>
            <Text style={s.sheetObservationTitle}>{t('heat.observations')}</Text>
            {selectedDay.observations.length ? selectedDay.observations.map(observation => <ObservationRow key={observation.id} observation={observation} />) : <Text style={s.sheetEmpty}>{t('heat.noObservationsDay')}</Text>}
            <TouchableOpacity style={s.sheetAction} onPress={() => { const cycleId = selectedCycle.id; setSelectedDay(null); router.push(`/dog-heat/${cycleId}` as never); }}>
              <Text style={s.sheetActionText}>{t('heat.viewDetails')}</Text><Ionicons name="arrow-forward" size={16} color={C.accentText} />
            </TouchableOpacity>
          </View> : null}
        </AnyvoBottomSheet>
      </SafeAreaView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>;
}

function ObservationRow({ observation }: { observation: HeatObservation }) {
  return <View style={s.observationRow}><View style={s.observationBullet} /><View style={s.flex}><Text style={s.observationType}>{observation.type}{observation.value ? ` · ${observation.value}` : ''}</Text>{observation.notes ? <Text style={s.observationNotes}>{observation.notes}</Text> : null}</View></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg },
  flex: { flex: 1 },
  center: { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: C.trackTextSec, fontSize: 14, textAlign: 'center', marginHorizontal: 32 },
  retryButton: { marginTop: 14, borderRadius: 12, backgroundColor: C.trackCard, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 15, paddingVertical: 10 },
  retryText: { color: C.trackPrimary, fontSize: 13, fontWeight: '800' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitleWrap: { flex: 1, alignItems: 'center' },
  barTitle: { fontSize: 16, fontWeight: '900', color: C.trackText },
  barSubtitle: { fontSize: 10.5, fontWeight: '700', color: C.trackTextMut, marginTop: 1 },
  scroll: { padding: 16, gap: 14 },
  calendarCard: { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 14, gap: 13 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.trackCardAlt, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 17, color: C.trackText, fontWeight: '900' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { borderRadius: 9, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 9, paddingVertical: 7 },
  filterOn: { backgroundColor: 'rgba(244,114,182,0.16)', borderColor: 'rgba(244,114,182,0.50)' },
  filterText: { fontSize: 11, color: C.trackTextSec, fontWeight: '700' },
  filterTextOn: { color: '#F9A8D4' },
  todayButton: { marginLeft: 'auto', paddingHorizontal: 4, paddingVertical: 7 },
  todayText: { color: C.trackPrimary, fontSize: 11, fontWeight: '800' },
  weekdays: { flexDirection: 'row' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: C.trackTextMut, fontWeight: '800', fontSize: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: `${100 / 7}%`, height: 48, alignItems: 'center', paddingTop: 6, position: 'relative', borderRadius: 7 },
  dayCellData: { backgroundColor: 'rgba(255,255,255,0.018)' },
  dayCellToday: { backgroundColor: 'rgba(21,230,195,0.10)' },
  dayNumber: { zIndex: 1, fontSize: 12, color: C.trackTextSec, fontWeight: '700' },
  dayNumberToday: { color: C.trackPrimary, fontWeight: '900' },
  phaseBar: { position: 'absolute', left: 1, right: 1, bottom: 7, height: 8 },
  phaseStart: { borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  phaseEnd: { borderTopRightRadius: 5, borderBottomRightRadius: 5 },
  observationDot: { position: 'absolute', right: 5, top: 8, width: 4, height: 4, borderRadius: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, borderTopWidth: 1, borderTopColor: C.trackBorder, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: C.trackTextSec, fontSize: 10, fontWeight: '600' },
  activeCard: { borderRadius: 20, borderWidth: 1, borderColor: 'rgba(244,114,182,0.36)', backgroundColor: 'rgba(244,114,182,0.10)', padding: 16, gap: 12 },
  activeHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#F472B6' },
  activeEyebrow: { flex: 1, color: '#F9A8D4', fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  activeDetails: { flexDirection: 'row', gap: 10 },
  activeValue: { color: C.trackText, fontSize: 13, fontWeight: '800' },
  activeLabel: { color: C.trackTextMut, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 3 },
  cycleLine: { flexDirection: 'row', gap: 2, marginTop: 1 },
  cycleSegment: { flex: 1, height: 7, borderRadius: 4 },
  cycleLabels: { flexDirection: 'row', gap: 2 },
  cycleLabel: { flex: 1, color: C.trackTextMut, textAlign: 'center', fontSize: 8.5, fontWeight: '700' },
  sectionBlock: { gap: 8 },
  sectionTitle: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase', marginLeft: 2 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 15, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 13 },
  historyIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(244,114,182,0.14)', alignItems: 'center', justifyContent: 'center' },
  historyBody: { flex: 1 },
  historyTitle: { color: C.trackText, fontSize: 14, fontWeight: '800' },
  historyMeta: { color: C.trackTextSec, fontSize: 11, fontWeight: '600', marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { width: '48.5%', minHeight: 76, borderRadius: 15, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 12, justifyContent: 'space-between' },
  statValue: { color: C.trackText, fontSize: 15, fontWeight: '900' },
  statLabel: { color: C.trackTextMut, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 8 },
  sheetContent: { gap: 11, paddingBottom: 12 },
  sheetPhaseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sheetPhaseDot: { width: 13, height: 13, borderRadius: 7 },
  sheetPhase: { color: C.trackText, fontSize: 16, fontWeight: '900' },
  sheetMeta: { color: C.trackTextSec, fontSize: 12, marginTop: 2 },
  sheetObservationTitle: { color: C.trackTextMut, fontSize: 10.5, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  sheetEmpty: { color: C.trackTextSec, fontSize: 13 },
  observationRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  observationBullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.trackPrimary, marginTop: 6 },
  observationType: { color: C.trackText, fontSize: 13, fontWeight: '700' },
  observationNotes: { color: C.trackTextSec, fontSize: 12, marginTop: 2 },
  sheetAction: { height: 46, marginTop: 4, borderRadius: 13, backgroundColor: C.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sheetActionText: { color: C.accentText, fontSize: 14, fontWeight: '900' },
});

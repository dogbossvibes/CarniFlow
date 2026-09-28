import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import {
  durationDays, fmtDate, heatCycleDay, isActiveCycle,
  type HeatCycle, type HeatHistoryStats, type HeatObservation, type HeatPhase, type HeatPrediction,
} from '@/features/dogs/heatCycles';
import { currentHeatPhase } from '@/features/dogs/heatCalendar';

// ANYVO Läufigkeit-in-Gesundheitsakte-Integration (29.09.2026).
//
// Reuses the existing Läufigkeit data model and calculations end-to-end —
// dog_heat_cycles/dog_heat_phases/dog_heat_observations (features/dogs/
// heatCycles.ts), predictHeat's already-verified forecast, durationDays,
// isActiveCycle, heatCycleDay, currentHeatPhase (features/dogs/
// heatCalendar.ts). Nothing here computes a second, parallel medical
// forecast — it only formats what those functions already return. Detail/
// edit/phases/observations stay entirely in the existing
// app/dog-heat/[id].tsx screen; this file only renders a compact card and a
// read-mostly "modern verlauf" view that hands off to it.
//
// Gender gating happens ENTIRELY in the caller (app/dog-health-record/
// [id].tsx, via isFemaleDog) — this component assumes it is only ever
// rendered for a female dog and does not re-check gender itself, matching
// the same responsibility split already used by DogHubScreen.tsx (isFemale
// computed once, passed down).

const PINK = '#F472B6';
const PINK_DIM = 'rgba(244,114,182,0.14)';

function fmtMonthYear(iso: string): string {
  const d = fmtDate(iso); // "12. Sept. 2026" — Monat+Jahr reicht für die Prognose-Aussage
  return d ?? iso;
}
function fmtRange(start: string, end: string | null): string {
  const s = fmtDate(start) ?? start;
  if (!end) return `Seit ${s}`;
  return `${s} – ${fmtDate(end) ?? end}`;
}

// ── Kompakte Übersichtskarte (Gesundheitsakte → Übersicht) ─────────────────

export function HealthHeatCard({
  cycles, prediction, onPress, onAdd,
}: {
  cycles: HeatCycle[];
  prediction: HeatPrediction | null;
  onPress: () => void;
  onAdd: () => void;
}) {
  const { t } = useT();

  if (cycles.length === 0) {
    return (
      <TouchableOpacity testID="health-heat-card" style={hs.emptyCard} onPress={onAdd} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('heat.addFirst')}>
        <View style={hs.emptyIcon}><Ionicons name="heart-outline" size={22} color={PINK} /></View>
        <View style={{ flex: 1 }}>
          <Text style={hs.eyebrow}>{t('heat.title').toUpperCase()}</Text>
          <Text style={hs.emptyTitle}>{t('heat.emptyTitle')}</Text>
        </View>
        <Ionicons name="add-circle" size={26} color={PINK} />
      </TouchableOpacity>
    );
  }

  const active = cycles.find(isActiveCycle) ?? null;
  const last = active ?? [...cycles].sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  const lastDuration = durationDays(last.startDate, last.endDate);
  const today = new Date();
  const sinceLast = last.endDate ? Math.max(0, Math.round((today.getTime() - new Date(last.endDate).getTime()) / 86400000)) : null;
  const hasForecast = prediction && !prediction.estimate;

  return (
    <TouchableOpacity testID="health-heat-card" style={hs.card} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${t('heat.title')}. ${active ? t('heat.active') : fmtRange(last.startDate, last.endDate)}`}>
      <View style={hs.cardHead}>
        <View style={hs.icon}><Ionicons name="heart" size={20} color={PINK} /></View>
        <View style={{ flex: 1 }}>
          <Text style={hs.eyebrow}>{t('heat.title').toUpperCase()}</Text>
          {active ? (
            <View style={hs.statusRow}>
              <View style={hs.statusDot} />
              <Text style={hs.statusTxt}>{t('heat.active')} · {t('heat.cycleDay')} {heatCycleDay(active.startDate)}</Text>
            </View>
          ) : (
            <Text style={hs.rangeTxt}>{fmtRange(last.startDate, last.endDate)}</Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.trackTextMut} />
      </View>

      <View style={hs.metaRow}>
        {lastDuration != null ? <MetaChip label={`${lastDuration} ${t('heat.days')}`} /> : null}
        {!active && sinceLast != null ? <MetaChip label={`${sinceLast} Tage seit letzter Läufigkeit`} /> : null}
      </View>

      <View style={hs.forecastRow}>
        <Ionicons name="calendar-outline" size={15} color={C.trackTextMut} />
        <Text style={hs.forecastTxt}>
          {hasForecast ? `Nächster Zeitraum: voraussichtlich ${fmtMonthYear(prediction!.nextDate)}` : 'Noch keine Prognose verfügbar'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function MetaChip({ label }: { label: string }) {
  return <View style={hs.chip}><Text style={hs.chipTxt}>{label}</Text></View>;
}

// ── Reichhaltige Läufigkeit-Ansicht (öffnet in einem AnyvoBottomSheet) ──────

export function HealthHeatSheetContent({
  cycles, phases, observations, prediction, stats, isOwner, onOpenCycle, onDeleteCycle, onAdd,
}: {
  cycles: HeatCycle[];
  phases: HeatPhase[];
  observations: HeatObservation[];
  prediction: HeatPrediction | null;
  stats: HeatHistoryStats;
  isOwner: boolean;
  onOpenCycle: (cycle: HeatCycle) => void;
  onDeleteCycle: (cycle: HeatCycle) => void;
  onAdd: () => void;
}) {
  const { t } = useT();

  if (cycles.length === 0) {
    return (
      <View style={hs.sheetEmpty}>
        <View style={hs.emptyIconLg}><Ionicons name="heart-outline" size={30} color={PINK} /></View>
        <Text style={hs.sheetEmptyTitle}>{t('heat.emptyTitle')}</Text>
        <Text style={hs.sheetEmptyDesc}>{t('heat.emptyDesc')}</Text>
        <AnyvoButton label={t('heat.addFirst')} icon="add" onPress={onAdd} />
      </View>
    );
  }

  const active = cycles.find(isActiveCycle) ?? null;
  const activePhase = active ? currentHeatPhase(active, phases) : null;
  const sortedDesc = [...cycles].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const phaseCounts = new Map<string, number>();
  phases.forEach(p => phaseCounts.set(p.heatCycleId, (phaseCounts.get(p.heatCycleId) ?? 0) + 1));
  const obsCounts = new Map<string, number>();
  observations.forEach(o => obsCounts.set(o.heatCycleId, (obsCounts.get(o.heatCycleId) ?? 0) + 1));

  return (
    <View style={hs.sheetRoot}>
      {/* Status-Hero */}
      {active ? (
        <View style={[hs.hero, { borderColor: `${PINK}55`, backgroundColor: PINK_DIM }]}>
          <Text style={hs.heroEyebrow}>{t('heat.currentCycle').toUpperCase()}</Text>
          <Text style={hs.heroBig}>{t('heat.active')} · {t('heat.cycleDay')} {heatCycleDay(active.startDate)}</Text>
          <View style={hs.heroFacts}>
            <HeroFact label={t('heat.cycleStart')} value={fmtDate(active.startDate) ?? '—'} />
            {activePhase ? <HeroFact label="Phase" value={activePhase.phaseType} /> : null}
          </View>
        </View>
      ) : (
        <View style={hs.hero}>
          <Text style={hs.heroEyebrow}>{t('heat.title').toUpperCase()}</Text>
          <Text style={hs.heroBig}>{fmtRange(sortedDesc[0].startDate, sortedDesc[0].endDate)}</Text>
          <View style={hs.heroFacts}>
            {durationDays(sortedDesc[0].startDate, sortedDesc[0].endDate) != null ? <HeroFact label={t('heat.days')} value={`${durationDays(sortedDesc[0].startDate, sortedDesc[0].endDate)}`} /> : null}
          </View>
          <Text style={hs.heroForecast}>
            {prediction && !prediction.estimate ? `Nächster Zeitraum: voraussichtlich ${fmtMonthYear(prediction.nextDate)}` : 'Noch keine Prognose verfügbar'}
          </Text>
        </View>
      )}

      {/* Verlaufsstatistik — rein rechnerisch aus vorhandenen Zyklen, keine medizinische Bewertung */}
      <Text style={hs.sectionLabel}>DEIN VERLAUF</Text>
      <View style={hs.statsGrid}>
        <StatTile value={String(stats.count)} label={stats.count === 1 ? 'Läufigkeit' : 'Läufigkeiten'} />
        {stats.averageDays != null ? <StatTile value={`${stats.averageDays} Tage`} label="Ø Dauer" /> : null}
        {stats.averageGapDays != null ? <StatTile value={`${stats.averageGapDays} Tage`} label="Ø Abstand" /> : null}
        {stats.minGapDays != null ? <StatTile value={`${stats.minGapDays} Tage`} label="Kürzester Abstand" /> : null}
        {stats.maxGapDays != null ? <StatTile value={`${stats.maxGapDays} Tage`} label="Längster Abstand" /> : null}
      </View>

      {/* Verlauf — chronologisch, neueste zuerst; wiederverwendet die exakt
          selbe Detailansicht (app/dog-heat/[id].tsx) und denselben
          Long-Press-Delete-Standard wie app/dog-heat-calendar/[id].tsx —
          keine zweite parallele Implementierung. */}
      <Text style={hs.sectionLabel}>{t('heat.history').toUpperCase()}</Text>
      {sortedDesc.map(cycle => {
        const duration = durationDays(cycle.startDate, cycle.endDate);
        const pc = phaseCounts.get(cycle.id) ?? 0;
        const oc = obsCounts.get(cycle.id) ?? 0;
        const cycleActive = isActiveCycle(cycle);
        return (
          <TouchableOpacity
            key={cycle.id}
            style={hs.historyCard}
            activeOpacity={0.85}
            onPress={() => onOpenCycle(cycle)}
            onLongPress={isOwner ? () => onDeleteCycle(cycle) : undefined}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={isOwner ? `${fmtRange(cycle.startDate, cycle.endDate)}, lange drücken zum Löschen` : fmtRange(cycle.startDate, cycle.endDate)}
          >
            <Text style={hs.historyMonth}>{fmtMonthYear(cycle.startDate).toUpperCase()}</Text>
            <View style={hs.historyTitleRow}>
              <Text style={hs.historyRange}>{fmtRange(cycle.startDate, cycle.endDate)}</Text>
              {cycleActive ? <View style={hs.activeChip}><Text style={hs.activeChipTxt}>{t('heat.active')}</Text></View> : null}
            </View>
            {duration != null ? <Text style={hs.historyDuration}>{duration} {t('heat.days')}</Text> : null}
            <View style={hs.historyFacts}>
              <HistoryFact label="Beginn" value={fmtDate(cycle.startDate) ?? '—'} />
              <HistoryFact label="Ende" value={cycle.endDate ? (fmtDate(cycle.endDate) ?? '—') : '—'} />
              {duration != null ? <HistoryFact label="Dauer" value={`${duration} ${t('heat.days')}`} /> : null}
              {pc > 0 ? <HistoryFact label={t('heat.phases')} value={`${pc} dokumentiert`} /> : null}
              {oc > 0 ? <HistoryFact label={t('heat.observations')} value={`${oc} Einträge`} /> : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return <View style={hs.heroFact}><Text style={hs.heroFactValue}>{value}</Text><Text style={hs.heroFactLabel}>{label}</Text></View>;
}
function StatTile({ value, label }: { value: string; label: string }) {
  return <View style={hs.statTile}><Text style={hs.statValue}>{value}</Text><Text style={hs.statLabel}>{label}</Text></View>;
}
function HistoryFact({ label, value }: { label: string; value: string }) {
  return <View style={hs.historyFact}><Text style={hs.historyFactLabel}>{label}</Text><Text style={hs.historyFactValue}>{value}</Text></View>;
}

const hs = StyleSheet.create({
  eyebrow: { color: C.trackTextMut, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },

  emptyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 14 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: PINK_DIM, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: C.trackText, fontSize: 14.5, fontWeight: '800', marginTop: 3 },

  card: { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 14, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, backgroundColor: PINK_DIM, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PINK },
  statusTxt: { color: C.trackText, fontSize: 15, fontWeight: '800' },
  rangeTxt: { color: C.trackText, fontSize: 15, fontWeight: '800', marginTop: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 9, backgroundColor: C.trackCardAlt, paddingHorizontal: 10, paddingVertical: 5 },
  chipTxt: { color: C.trackTextSec, fontSize: 12, fontWeight: '700' },
  forecastRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  forecastTxt: { flex: 1, color: C.trackTextSec, fontSize: 12.5, fontWeight: '600' },

  sheetRoot: { gap: 14, paddingBottom: 12 },
  sheetEmpty: { alignItems: 'center', gap: 12, paddingVertical: 20 },
  emptyIconLg: { width: 60, height: 60, borderRadius: 20, backgroundColor: PINK_DIM, alignItems: 'center', justifyContent: 'center' },
  sheetEmptyTitle: { color: C.trackText, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  sheetEmptyDesc: { color: C.trackTextSec, fontSize: 13.5, textAlign: 'center', lineHeight: 19, paddingHorizontal: 10 },

  hero: { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 16, gap: 8 },
  heroEyebrow: { color: PINK, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  heroBig: { color: C.trackText, fontSize: 21, fontWeight: '900' },
  heroFacts: { flexDirection: 'row', gap: 20, marginTop: 4 },
  heroFact: { gap: 2 },
  heroFactValue: { color: C.trackText, fontSize: 15, fontWeight: '800' },
  heroFactLabel: { color: C.trackTextMut, fontSize: 10.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroForecast: { color: C.trackTextSec, fontSize: 12.5, fontWeight: '600', marginTop: 4 },

  sectionLabel: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.3, textTransform: 'uppercase' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: { flexBasis: '30%', flexGrow: 1, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', gap: 2 },
  statValue: { color: C.trackText, fontSize: 17, fontWeight: '900' },
  statLabel: { color: C.trackTextSec, fontSize: 10.5, fontWeight: '700', textAlign: 'center' },

  historyCard: { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 14, gap: 6 },
  historyMonth: { color: PINK, fontSize: 10.5, fontWeight: '900', letterSpacing: 1 },
  historyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyRange: { color: C.trackText, fontSize: 16, fontWeight: '800', flexShrink: 1 },
  activeChip: { borderRadius: 8, backgroundColor: PINK_DIM, paddingHorizontal: 8, paddingVertical: 3 },
  activeChipTxt: { color: PINK, fontSize: 10.5, fontWeight: '900' },
  historyDuration: { color: C.trackTextSec, fontSize: 13, fontWeight: '700' },
  historyFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  historyFact: { gap: 2, minWidth: 84 },
  historyFactLabel: { color: C.trackTextMut, fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  historyFactValue: { color: C.trackText, fontSize: 13, fontWeight: '700' },
});

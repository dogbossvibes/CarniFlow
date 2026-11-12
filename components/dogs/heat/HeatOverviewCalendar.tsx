import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { AppLocale } from '@/i18n/config';
import { fromISODate, toISODate } from '@/features/dogs/dateInput';
import { buildHeatCalendarDays, getMonthGrid } from '@/features/dogs/heatCalendar';
import { fmtDate, predictHeat, type HeatCycle, type HeatObservation, type HeatPhase } from '@/features/dogs/heatCycles';
import { heatUxCopy } from '@/features/dogs/heatUxCopy';

const labels = {
  de: ['Kalender', 'Vorheriger Monat', 'Nächster Monat', 'Erfasste Läufigkeit', 'Geschätzter Beginn', 'Beobachtung', 'Keine Einträge an diesem Tag', 'Zum geschätzten Beginn'],
  en: ['Calendar', 'Previous month', 'Next month', 'Recorded heat', 'Estimated start', 'Observation', 'No entries on this day', 'Go to estimated start'],
  fr: ['Calendrier', 'Mois précédent', 'Mois suivant', 'Chaleurs enregistrées', 'Début estimé', 'Observation', 'Aucune entrée ce jour', 'Voir le début estimé'],
  it: ['Calendario', 'Mese precedente', 'Mese successivo', 'Calore registrato', 'Inizio stimato', 'Osservazione', 'Nessuna registrazione in questo giorno', 'Vai all’inizio stimato'],
  gsw: ['Kalender', 'Vorherige Monet', 'Nächste Monet', 'Erfassti Läufigkeit', 'Gschätzte Beginn', 'Beobachtig', 'Kei Iiträg a dem Tag', 'Zum gschätzte Beginn'],
} satisfies Record<AppLocale, string[]>;
const intlLocales: Record<AppLocale, string> = { de: 'de-CH', en: 'en-GB', fr: 'fr-CH', it: 'it-CH', gsw: 'de-CH' };

/** Read-only calendar over the same aggregate as the overview. No extra reads or writes. */
export function HeatOverviewCalendar({ cycles, phases, observations, onOpenCycle }: {
  cycles: HeatCycle[]; phases: HeatPhase[]; observations: HeatObservation[]; onOpenCycle: (cycle: HeatCycle) => void;
}) {
  const { locale } = useT();
  const copy = heatUxCopy(locale);
  const [title, previous, next, recorded, expected, observation, noEntries, jump] = labels[locale] ?? labels.de;
  const intl = intlLocales[locale] ?? intlLocales.de;
  const today = toISODate(new Date());
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selection, setSelection] = useState(today);
  const prediction = predictHeat(cycles.filter(cycle => cycle.startDate <= today));
  const days = buildHeatCalendarDays({ year: month.getFullYear(), month: month.getMonth(), cycles, phases, observations, today });
  const byKey = new Map(days.map(day => [day.key, day]));
  const selected = byKey.get(selection);
  const grid = getMonthGrid(month.getFullYear(), month.getMonth());
  const move = (offset: number) => {
    const date = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(date); setSelection(toISODate(date));
  };
  const goTo = (iso: string) => {
    const date = fromISODate(iso);
    if (date) { setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); setSelection(iso); }
  };
  return <View testID="heat-overview-calendar" style={s.card}>
    <Text style={s.title}>{title}</Text>
    <View style={s.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={previous} style={s.arrow} onPress={() => move(-1)}><Text style={s.title}>‹</Text></TouchableOpacity>
      <Text accessibilityLiveRegion="polite" style={[s.title, s.month]}>{month.toLocaleDateString(intl, { month: 'long', year: 'numeric' })}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={next} style={s.arrow} onPress={() => move(1)}><Text style={s.title}>›</Text></TouchableOpacity>
    </View>
    <View style={s.grid}>
      {Array.from({ length: 7 }, (_, i) => <Text key={`weekday-${i}`} style={s.weekday}>{new Date(2026, 0, 5 + i).toLocaleDateString(intl, { weekday: 'short' })}</Text>)}
      {grid.map((key, index) => {
        if (!key) return <View key={`blank-${index}`} style={s.cell} />;
        const day = byKey.get(key)!;
        const estimated = key === prediction?.nextDate;
        const label = [fmtDate(key), key === today ? copy.today : null, day.cycle ? recorded : null, estimated ? expected : null, day.observations.length ? `${day.observations.length} ${copy.observations}` : null].filter(Boolean).join(' · ');
        return <TouchableOpacity key={key} testID={`heat-day-${key}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: selection === key }} style={[s.cell, day.cycle && s.recorded, estimated && s.estimated, selection === key && s.selected]} onPress={() => setSelection(key)}>
          <Text style={[s.number, key === today && s.today]}>{day.day}</Text>
          <Text style={s.marker}>{day.cycle ? '●' : estimated ? '○' : ' '}{day.observations.length ? ' ·' : ''}</Text>
        </TouchableOpacity>;
      })}
    </View>
    <View style={s.legend}><Text style={s.caption}>● {recorded}</Text><Text style={s.caption}>○ {expected}</Text><Text style={s.caption}>· {observation}</Text></View>
    <View style={s.legend}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.today} style={s.link} onPress={() => goTo(today)}><Text style={s.linkText}>{copy.today}</Text></TouchableOpacity>
      {prediction && <TouchableOpacity accessibilityRole="button" accessibilityLabel={jump} style={s.link} onPress={() => goTo(prediction.nextDate)}><Text style={s.linkText}>{jump}</Text></TouchableOpacity>}
    </View>
    {selected && <View style={s.details}>
      <Text style={s.title}>{fmtDate(selection)}</Text>
      {selected.cycle && <Text style={s.caption}>{recorded}: {fmtDate(selected.cycle.startDate)}{selected.cycle.endDate ? ` – ${fmtDate(selected.cycle.endDate)}` : ''}</Text>}
      {selected.phase && <Text style={s.caption}>{copy.recordedPhases}: {selected.phase.phaseType}</Text>}
      {selection === prediction?.nextDate && <Text style={s.caption}>{expected} · {prediction.estimate ? copy.roughEstimate : copy.historyEstimate}</Text>}
      {selected.observations.map(row => <Text key={row.id} style={s.caption}>{row.type}{row.value ? `: ${row.value}` : ''}{row.notes ? ` · ${row.notes}` : ''}</Text>)}
      {!selected.cycle && !selected.observations.length && selection !== prediction?.nextDate && <Text style={s.caption}>{noEntries}</Text>}
      {selected.cycle && <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.details} style={s.link} onPress={() => onOpenCycle(selected.cycle!)}><Text style={s.linkText}>{copy.details}</Text></TouchableOpacity>}
    </View>}
  </View>;
}
const s = StyleSheet.create({
  card: { padding: 12, gap: 10, borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard },
  header: { flexDirection: 'row', alignItems: 'center' }, month: { flex: 1, textAlign: 'center' },
  title: { color: C.trackText, fontSize: 17, fontWeight: '700' },
  arrow: { minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' }, weekday: { width: '14.285714%', textAlign: 'center', color: C.trackTextSec, fontSize: 12, paddingVertical: 8 },
  cell: { width: '14.285714%', minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, borderWidth: 1, borderColor: 'transparent', borderRadius: 8 },
  number: { color: C.trackText, fontSize: 15 }, marker: { color: C.trackPrimary, fontSize: 11 },
  today: { fontWeight: '900', textDecorationLine: 'underline' }, recorded: { backgroundColor: 'rgba(39,216,178,0.15)' },
  estimated: { borderColor: C.trackTextSec, borderStyle: 'dashed' }, selected: { borderColor: C.trackPrimary, borderWidth: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6 }, caption: { color: C.trackTextSec, fontSize: 14, lineHeight: 21 },
  link: { minHeight: 48, justifyContent: 'center', paddingVertical: 8 }, linkText: { color: C.trackPrimary, fontSize: 14, fontWeight: '600' },
  details: { gap: 6, borderTopWidth: 1, borderTopColor: C.trackBorder, paddingTop: 12 },
});

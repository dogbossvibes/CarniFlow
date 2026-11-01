import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT, type TranslationKey } from '@/i18n';
import { formatDate, formatNumber } from '@/i18n/format';
import { fromISODate } from '@/features/dogs/dateInput';
import { journalMeasurements, weightChart, weightDay, weightSeries, type WeightMeasurement, type WeightPeriod } from '@/features/dogs/weightJournal';
import type { DogHealthEntryRow } from '@/services/dogHub';

const PERIODS: { value: WeightPeriod; label: TranslationKey }[] = [
  { value: 'month', label: 'weightJournal.month' }, { value: 'quarter', label: 'weightJournal.quarter' },
  { value: 'year', label: 'weightJournal.year' }, { value: 'all', label: 'journal.period.all' },
];

export function WeightJournal({ entries, profileWeight, isOwner, onAdd, onEdit }: {
  entries: DogHealthEntryRow[]; profileWeight: number | null; isOwner: boolean;
  onAdd: () => void; onEdit: (entry: WeightMeasurement) => void;
}) {
  const { t, locale } = useT();
  const { fontScale } = useWindowDimensions();
  const [period, setPeriod] = useState<WeightPeriod>('quarter');
  const [all, setAll] = useState(false);
  const [width, setWidth] = useState(280);
  const measurements = useMemo(() => journalMeasurements(entries), [entries]);
  const series = weightSeries(measurements, period);
  const scale = Math.max(1, Math.min(fontScale, 2));
  const height = 200 + (scale - 1) * 90;
  const chart = weightChart(series, width, height, scale);
  const latest = measurements.at(-1), previous = measurements.at(-2);
  const current = latest?.weight_kg ?? (typeof profileWeight === 'number' && Number.isFinite(profileWeight) ? profileWeight : null);
  const number = (value: number) => formatNumber(value, { minimumFractionDigits: 1, maximumFractionDigits: 3 }, locale);
  const date = (value: string, short = false) => {
    const local = fromISODate(value);
    return local && weightDay(value) !== null ? formatDate(local, { day: 'numeric', month: short ? 'short' : 'long', ...(short ? {} : { year: 'numeric' }) }, locale) : value;
  };
  const rows = measurements.slice().reverse();
  const firstPoint = series[0], lastPoint = series.at(-1);
  const graphLabel = firstPoint && lastPoint ? t('weightJournal.chartSummary', {
    count: series.length, firstDate: date(firstPoint.entry.entry_date), firstWeight: number(firstPoint.entry.weight_kg),
    lastDate: date(lastPoint.entry.entry_date), lastWeight: number(lastPoint.entry.weight_kg),
  }) : t('weightJournal.noPeriod');
  const delta = latest && previous ? latest.weight_kg - previous.weight_kg : null;
  const deltaText = delta === null ? null : `${delta < 0 ? '−' : delta > 0 ? '+' : ''}${number(Math.abs(delta))} kg`;

  return <View style={s.journal}>
    <View style={s.current}>
      <View style={s.summary}>
        {current === null ? <Text style={s.empty}>{t('health.uxNoWeight')}</Text> : <Text style={s.value}>{number(current)} <Text style={s.unit}>kg</Text></Text>}
        <Text style={s.caption}>{latest ? date(latest.entry_date) : current !== null ? t('weightJournal.profileValue') : t('weightJournal.noMeasurements')}</Text>
      </View>
      {deltaText && previous ? <View style={s.change}><Text style={s.delta}>{deltaText}</Text><Text style={s.caption}>{t('weightJournal.since', { date: date(previous.entry_date, true) })}</Text></View> : null}
    </View>
    <View style={s.periods} accessibilityRole="tablist">
      {PERIODS.map(item => <TouchableOpacity key={item.value} accessibilityRole="tab" accessibilityLabel={t(item.label)} accessibilityState={{ selected: period === item.value }} onPress={() => setPeriod(item.value)} style={[s.period, fontScale > 1.4 && s.largePeriod, period === item.value && s.selected]}>
        <Text style={[s.periodText, period === item.value && s.selectedText]}>{t(item.label)}</Text>
      </TouchableOpacity>)}
    </View>
    <View onLayout={event => { const next = event.nativeEvent.layout.width; if (next > 0 && next !== width) setWidth(next); }}>
      {chart ? <View accessible accessibilityRole="image" accessibilityLabel={graphLabel}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {chart.ticks.map((tick, index) => <ViewlessTick key={index} {...tick} left={chart.left} right={chart.right} fontSize={11 * scale} label={number(tick.value)} />)}
          {chart.points.length > 1 ? <Path d={chart.path} fill="none" stroke={C.trackPrimary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {chart.points.map(point => <Circle key={point.entry.id} cx={point.x} cy={point.y} r={3} fill={C.trackPrimary} />)}
          {chart.points.length ? <SvgText x={chart.left} y={height - 5} fill={C.trackTextSec} fontSize={11 * scale}>{date(chart.points[0].entry.entry_date, true)}</SvgText> : null}
          {chart.points.length > 1 && firstPoint?.day !== lastPoint?.day ? <SvgText x={chart.right} y={height - 5} textAnchor="end" fill={C.trackTextSec} fontSize={11 * scale}>{date(chart.points[chart.points.length - 1].entry.entry_date, true)}</SvgText> : null}
        </Svg>
      </View> : <Text style={s.chartEmpty}>{t(measurements.length ? 'weightJournal.noPeriod' : 'weightJournal.noMeasurements')}</Text>}
    </View>
    <Text style={s.caption}>{t('weightJournal.chartUnit')}</Text>
    <View style={s.historyHeader}>
      <Text accessibilityRole="header" style={s.historyTitle}>{t('weightJournal.measurements')}</Text>
      {rows.length > 3 ? <TouchableOpacity accessibilityRole="button" onPress={() => setAll(value => !value)} style={s.textButton}><Text style={s.link}>{t(all ? 'health.uxShowLess' : 'weightJournal.showAll', { count: rows.length })}</Text></TouchableOpacity> : null}
    </View>
    {(all ? rows : rows.slice(0, 3)).map(entry => {
      const content = <><View style={s.rowCopy}><Text style={s.date}>{date(entry.entry_date)}</Text>{isOwner && entry.note ? <Text style={s.caption}>{entry.note}</Text> : null}</View><View style={s.rowValue}><Text style={s.measurement}>{number(entry.weight_kg)} kg</Text>{isOwner ? <Ionicons name="chevron-forward" size={16} color={C.trackTextSec} /> : null}</View></>;
      return isOwner ? <TouchableOpacity key={entry.id} style={s.row} accessibilityRole="button" accessibilityLabel={t('weightJournal.editMeasurement', { date: date(entry.entry_date), weight: number(entry.weight_kg) })} onPress={() => onEdit(entry)}>{content}</TouchableOpacity> : <View key={entry.id} style={s.row}>{content}</View>;
    })}
    {!rows.length ? <Text style={s.emptyHistory}>{t('weightJournal.noMeasurements')}</Text> : null}
    {isOwner ? <TouchableOpacity accessibilityRole="button" style={s.add} onPress={onAdd}><Text style={s.addText}>{t('weightJournal.add')}</Text></TouchableOpacity> : null}
  </View>;
}

function ViewlessTick({ y, left, right, fontSize, label }: { y: number; value: number; left: number; right: number; fontSize: number; label: string }) {
  return <><Line x1={left} y1={y} x2={right} y2={y} stroke={C.borderLight} strokeWidth={1} /><SvgText x={left - 7} y={y + 4} textAnchor="end" fill={C.trackTextSec} fontSize={fontSize}>{label}</SvgText></>;
}

const s = StyleSheet.create({
  journal: { paddingHorizontal: 8, paddingTop: 16, gap: 10 },
  current: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 10 },
  summary: { flexShrink: 1 }, value: { color: C.trackText, fontSize: 38, fontWeight: '600', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 20, fontWeight: '400' }, caption: { color: C.trackTextSec, fontSize: 13, lineHeight: 20 },
  change: { alignItems: 'flex-end', flexShrink: 1 }, delta: { color: C.trackText, fontSize: 16, fontVariant: ['tabular-nums'] },
  periods: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderColor: C.borderLight },
  period: { width: '25%', minHeight: 48, paddingHorizontal: 3, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  largePeriod: { width: '50%' }, selected: { borderBottomColor: C.trackPrimary },
  periodText: { color: C.trackTextSec, fontSize: 13, textAlign: 'center' }, selectedText: { color: C.trackText, fontWeight: '600' },
  chartEmpty: { color: C.trackTextSec, fontSize: 15, paddingVertical: 54, textAlign: 'center' },
  historyHeader: { borderTopWidth: 1, borderColor: C.borderLight, marginTop: 14, paddingTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  historyTitle: { color: C.trackText, fontSize: 16, fontWeight: '600' }, textButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: C.trackPrimary, fontSize: 14 }, row: { minHeight: 64, paddingVertical: 14, borderBottomWidth: 1, borderColor: C.borderLight, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowCopy: { flexShrink: 1 }, date: { color: C.trackText, fontSize: 15 }, rowValue: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  measurement: { color: C.trackText, fontSize: 16, fontVariant: ['tabular-nums'] },
  empty: { color: C.trackText, fontSize: 20 }, emptyHistory: { color: C.trackTextSec, fontSize: 15, paddingVertical: 16 },
  add: { minHeight: 50, marginTop: 16, borderRadius: 11, backgroundColor: C.trackPrimary, padding: 14, alignItems: 'center', justifyContent: 'center' },
  addText: { color: C.accentText, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});

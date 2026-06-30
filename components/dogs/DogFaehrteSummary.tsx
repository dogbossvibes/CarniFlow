import { StyleSheet, Text, View } from 'react-native';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { C } from '@/constants/colors';
import type { DogFaehrteSummary } from './types';

// Fährten-Zusammenfassung: Kennzahlen + Qualität % + Mini-Fortschrittslinie.
export function DogFaehrteSummary({ data, onStart }: { data: DogFaehrteSummary; onStart: () => void }) {
  const cells = [
    { v: String(data.thisWeek), l: 'Diese Woche' },
    { v: data.avgLengthLabel ?? '—', l: 'Ø Länge' },
    { v: data.articles != null ? String(data.articles) : '—', l: 'Gegenstände' },
    { v: data.angles != null ? String(data.angles) : '—', l: 'Winkel' },
  ];
  const max = Math.max(1, ...data.trend);

  return (
    <View style={s.wrap}>
      <View style={s.card}>
        <View style={s.topRow}>
          <ProgressRing progress={(data.qualityPct ?? 0) / 100} color={C.trackPrimary} label="Fährtenqualität" size={84} />
          <View style={s.statsCol}>
            {cells.map(c => (
              <View key={c.l} style={s.statLine}>
                <Text style={s.statLabel}>{c.l}</Text>
                <Text style={s.statValue} numberOfLines={1}>{c.v}</Text>
              </View>
            ))}
          </View>
        </View>

        {data.trend.length > 0 ? (
          <View style={s.spark}>
            {data.trend.map((t, i) => (
              <View key={i} style={[s.sparkBar, { height: 6 + (t / max) * 34 }]} />
            ))}
          </View>
        ) : (
          <Text style={s.empty}>Noch keine Fährten erfasst.</Text>
        )}
      </View>
      <AnyvoButton label="Fährte starten" icon="footsteps" onPress={onStart} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:      { gap: 12 },
  card:      { borderRadius: 20, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 16, gap: 16 },
  topRow:    { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statsCol:  { flex: 1, gap: 8 },
  statLine:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statLabel: { fontSize: 12.5, color: C.trackTextSec, fontWeight: '600' },
  statValue: { fontSize: 14.5, color: C.trackText, fontWeight: '800', flexShrink: 1, textAlign: 'right' },
  spark:     { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 44, paddingTop: 4 },
  sparkBar:  { flex: 1, borderRadius: 4, backgroundColor: C.trackPrimary, opacity: 0.85 },
  empty:     { fontSize: 13, color: C.trackTextMut, textAlign: 'center', paddingVertical: 6 },
});

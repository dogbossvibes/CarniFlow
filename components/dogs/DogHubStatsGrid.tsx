import { StyleSheet, View } from 'react-native';
import { AnyvoStatCard } from '@/components/ui/AnyvoStatCard';
import { C } from '@/constants/colors';
import type { DogStat } from './types';

// Bento-Kacheln für Kennzahlen. `columns` steuert das responsive Layout
// (1 = Phone schmal, 2 = Standard/Tablet). Werte schrumpfen → kein Abschnitt.
export function DogHubStatsGrid({ stats, columns = 2 }: { stats: DogStat[]; columns?: number }) {
  const basis = columns >= 2 ? '47.5%' : '100%';
  return (
    <View style={s.grid}>
      {stats.map(st => (
        <View key={st.key} style={[s.cell, { flexBasis: basis }]}>
          <AnyvoStatCard value={st.value} label={st.label} accent={st.accent} />
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexGrow: 1, minHeight: 78, justifyContent: 'center', backgroundColor: C.trackCard, borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 14, paddingHorizontal: 10 },
});

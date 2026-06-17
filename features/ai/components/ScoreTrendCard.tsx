import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { ScoreTrend } from '@/features/ai/types/aiCoach';

const DIR = {
  up:   { icon: 'trending-up' as const,   color: C.success },
  down: { icon: 'trending-down' as const, color: C.danger },
  flat: { icon: 'remove' as const,        color: C.muted },
};

// Score-Trends pro Sparte (letzte 3 vs. davor).
export function ScoreTrendCard({ trends }: { trends: ScoreTrend[] }) {
  if (trends.length === 0) return null;
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>Score-Trends</Text>
      <View style={{ marginTop: 12 }}>
        {trends.map((t, i) => {
          const d = DIR[t.direction];
          return (
            <View key={t.category} style={[s.row, i > 0 && s.rowBorder]}>
              <Text style={s.cat}>{t.category}</Text>
              <View style={s.right}>
                {t.current != null && <Text style={s.current}>Ø {t.current}</Text>}
                <View style={[s.pill, { backgroundColor: `${d.color}1F` }]}>
                  <Ionicons name={d.icon} size={13} color={d.color} />
                  <Text style={[s.delta, { color: d.color }]}>{t.deltaPct > 0 ? '+' : ''}{t.deltaPct}%</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:    { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16 },
  eyebrow: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  row:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  rowBorder:{ borderTopWidth: 1, borderTopColor: C.border },
  cat:     { fontSize: 14, color: C.white, fontWeight: '700' },
  right:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  current: { fontSize: 13, color: '#8B8B8B', fontWeight: '700' },
  pill:    { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  delta:   { fontSize: 12.5, fontWeight: '800' },
});

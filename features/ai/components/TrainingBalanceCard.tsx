import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import type { TrainingBalance } from '@/features/ai/types/aiCoach';

const COLORS = [C.accent, C.trackBlue, C.trackPurple, C.warning, '#7fe6b0'];

// Trainingsbalance der letzten 30 Tage als Balken pro Sparte.
export function TrainingBalanceCard({ balance }: { balance: TrainingBalance[] }) {
  if (balance.length === 0) return null;
  const max = Math.max(...balance.map(b => b.pct), 1);
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>Trainingsbalance · 30 Tage</Text>
      <View style={{ gap: 12, marginTop: 14 }}>
        {balance.map((b, i) => {
          const col = COLORS[i % COLORS.length];
          return (
            <View key={b.category}>
              <View style={s.row}>
                <Text style={s.cat}>{b.category}</Text>
                <Text style={s.pct}>{b.pct}%<Text style={s.count}>  ·  {b.count}×</Text></Text>
              </View>
              <View style={s.track}>
                <View style={[s.fill, { width: `${(b.pct / max) * 100}%`, backgroundColor: col }]} />
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
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  cat:     { fontSize: 13.5, color: C.white, fontWeight: '700' },
  pct:     { fontSize: 13, color: C.white, fontWeight: '800' },
  count:   { fontSize: 11, color: C.muted, fontWeight: '600' },
  track:   { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
  fill:    { height: '100%', borderRadius: 4 },
});

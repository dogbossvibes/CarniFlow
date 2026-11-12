import { StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { toISODate } from '@/features/dogs/dateInput';
import { fmtDate, predictHeat, type HeatCycle } from '@/features/dogs/heatCycles';
import { heatUxCopy } from '@/features/dogs/heatUxCopy';

/** Presentation only: future entries remain in history, not in observed intervals. */
export function HeatForecast({ cycles, compact = false }: { cycles: HeatCycle[]; compact?: boolean }) {
  const { locale } = useT();
  const copy = heatUxCopy(locale);
  const today = toISODate(new Date());
  const prediction = predictHeat(cycles.filter(cycle => cycle.startDate <= today));
  if (!prediction) return null;
  const countdown = prediction.daysUntil === 0 ? copy.expectedToday
    : prediction.daysUntil === 1 ? copy.remainingOne
    : prediction.daysUntil === -1 ? copy.expectedYesterday
    : (prediction.daysUntil > 0 ? copy.remaining : copy.expectedPast).replace('{n}', String(Math.abs(prediction.daysUntil)));
  return <View style={[styles.content, !compact && styles.card]}>
    <Text style={styles.title}>{copy.nextEstimate}</Text>
    <Text style={styles.date}>{fmtDate(prediction.nextDate)}</Text>
    <Text style={styles.body}>{countdown}</Text>
    <Text style={styles.body}>{prediction.estimate ? copy.roughEstimate : copy.historyEstimate}</Text>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 6 },
  card: { backgroundColor: C.trackCard, borderColor: C.trackBorder, borderWidth: 1, borderRadius: 20, padding: 18 },
  title: { color: C.trackPrimary, fontSize: 16, fontWeight: '600' },
  date: { color: C.trackText, fontSize: 20, fontWeight: '700' },
  body: { color: C.trackTextSec, fontSize: 14, lineHeight: 21 },
});

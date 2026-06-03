import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { METRIC_LABELS } from '@/types/analytics';
import type { TrainingMetrics } from '@/types/analytics';

type MetricKey = keyof TrainingMetrics;
const KEYS: MetricKey[] = ['motivation', 'konzentration', 'praezision', 'ausdauer', 'trieblage', 'impulskontrolle'];

// Optionale 1–5-Metriken (Basis für die KI-Auswertung). 0/null = nicht erfasst.
interface Props {
  value:    TrainingMetrics;
  onChange: (v: TrainingMetrics) => void;
}

export function MetricsInput({ value, onChange }: Props) {
  const set = (key: MetricKey, n: number) => {
    tapHaptic();
    onChange({ ...value, [key]: value[key] === n ? null : n });
  };

  return (
    <View style={s.wrap}>
      {KEYS.map(key => {
        const val = value[key] ?? 0;
        return (
          <View key={key} style={s.row}>
            <Text style={s.label}>{METRIC_LABELS[key]}</Text>
            <View style={s.dots}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[s.dot, n <= val && s.dotActive]}
                  onPress={() => set(key, n)}
                  activeOpacity={0.7}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
  row:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 12, color: C.muted, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  dots:  { flexDirection: 'row', gap: 8 },
  dot:   { width: 18, height: 18, borderRadius: 9, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  dotActive: { backgroundColor: C.accent, borderColor: C.accent },
});

import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';

// Kleine Bedienelemente der Mantrailing-Bildschirme (Spec 02). Ziele mind. 44 pt.

/** Sparten-Farbe Mantrailing (constants/disciplines.ts). */
export const MANTRAIL_ACCENT = '#38BDF8';
const ACCENT = MANTRAIL_ACCENT;

export function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <View style={{ flex: 1 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        {hint ? <Text style={s.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  chipActive: { borderColor: ACCENT, backgroundColor: `${ACCENT}22` },
  chipText: { color: C.white, fontSize: 14 },
  chipTextActive: { color: ACCENT, fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, minHeight: 44 },
  toggleLabel: { color: C.white, fontSize: 15, fontWeight: '600' },
  toggleHint: { color: C.muted, fontSize: 12, marginTop: 2 },
  stat: { alignItems: 'center' },
  statValue: { color: C.white, fontSize: 18, fontWeight: '800' },
  statLabel: { color: C.muted, fontSize: 11, marginTop: 2 },
});

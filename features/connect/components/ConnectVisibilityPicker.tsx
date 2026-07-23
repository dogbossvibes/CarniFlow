import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import type { ConnectProfileVisibility } from '@/features/connect/types/connect.types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Segmentierte Sichtbarkeitsauswahl (privat / Freunde / öffentlich). Reine Anzeige;
// die tatsächliche Durchsetzung erfolgt serverseitig via RLS. Bestehende Tokens.
const OPTIONS: { value: ConnectProfileVisibility; label: string; icon: IconName }[] = [
  { value: 'private', label: 'Privat',       icon: 'lock-closed-outline' },
  { value: 'friends', label: 'Freunde',      icon: 'people-outline' },
  { value: 'public',  label: 'Öffentlich',   icon: 'globe-outline' },
];

export function ConnectVisibilityPicker({
  label, value, onChange, hint,
}: {
  label?: string;
  value: ConnectProfileVisibility;
  onChange: (v: ConnectProfileVisibility) => void;
  hint?: string;
}) {
  return (
    <View>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.row} accessibilityRole="radiogroup">
        {OPTIONS.map(opt => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.seg, active && s.segOn]}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
            >
              <Ionicons name={opt.icon} size={15} color={active ? C.accent : C.muted} />
              <Text style={[s.segTxt, active && { color: C.white }]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  row:   { flexDirection: 'row', gap: 6, backgroundColor: C.cardAlt, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: C.border },
  seg:   { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  segOn: { backgroundColor: C.accentDim, borderWidth: 1, borderColor: C.accentMid },
  segTxt:{ fontSize: 12.5, color: C.muted, fontWeight: '800' },
  hint:  { fontSize: 12, color: C.subtle, marginTop: 8, lineHeight: 17 },
});

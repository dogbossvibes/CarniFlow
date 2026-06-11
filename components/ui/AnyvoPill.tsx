import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Status-Pill (Ort · Wetter · GPS · Hund). Tönung optional über `tint`.
export function AnyvoPill({ icon, label, tint }: { icon?: IconName; label: string; tint?: string }) {
  const color = tint ?? C.trackTextSec;
  return (
    <View style={[s.pill, tint ? { borderColor: `${tint}55` } : null]}>
      {icon && <Ionicons name={icon} size={12} color={color} />}
      <Text style={[s.txt, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.trackCard, borderRadius: 999, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 11, paddingVertical: 6 },
  txt:  { fontSize: 11.5, fontWeight: '700' },
});

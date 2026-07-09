import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { C } from '@/constants/colors';

// Grosse, klare Zahl + Label (Stats-Panel).
export function AnyvoStatCard({ value, label, accent, style }: { value: string; label: string; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.wrap, style]}>
      <Text style={[s.value, accent && { color: C.trackPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap:  { alignItems: 'center', justifyContent: 'center', paddingVertical: 4, flex: 1 },
  value: { fontSize: 24, color: C.trackText, fontWeight: '900', letterSpacing: -0.8 },
  label: { fontSize: 9.5, color: C.trackTextMut, fontWeight: '700', letterSpacing: 1, marginTop: 3 },
});

import { Alert, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';

export type TrackingMapLayer = 'standard' | 'satellite' | 'hybrid';
const LAYERS: { value: TrackingMapLayer; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'satellite', label: 'Satellit' },
  { value: 'hybrid', label: 'Hybrid' },
];

/** Presentation only: changing tiles must never restart or modify a recording. */
export function MapLayerButton({ value, onChange, style }: {
  value: string; onChange: (value: TrackingMapLayer) => void; style?: StyleProp<ViewStyle>;
}) {
  const label = LAYERS.find(layer => layer.value === value)?.label ?? 'Hybrid';
  return <Pressable accessibilityRole="button" accessibilityLabel={`Kartenart: ${label}. Ändern`}
    style={[styles.button, style]} onPress={() => Alert.alert('Kartenart', 'Hybrid zeigt Luftbilder mit Orts- und Straßennamen.',
      LAYERS.map(layer => ({ text: `${layer.value === value ? '✓ ' : ''}${layer.label}`, onPress: () => onChange(layer.value) })),
      { cancelable: true })}>
    <Ionicons name="layers-outline" size={22} color={C.trackText} />
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 48, minWidth: 64, padding: 8, borderRadius: 14, backgroundColor: '#15191B', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#414749' },
  label: { color: C.trackText, fontSize: 11, marginTop: 3 },
});

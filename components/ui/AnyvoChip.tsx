import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C } from '@/constants/colors';

// Auswahl-Chip (Mehrfachauswahl) im Fährten-Design.
export function AnyvoChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[s.chip, active && s.active]} onPress={onPress} activeOpacity={0.8}>
      {active && <LinearGradient colors={[C.trackPrimary, C.trackPrimaryDk]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
      <Text style={[s.txt, active && s.txtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  chip:     { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  active:   { borderColor: C.trackPrimary },
  txt:      { fontSize: 13, color: C.trackTextSec, fontWeight: '600' },
  txtActive:{ color: '#04110F', fontWeight: '800' },
});

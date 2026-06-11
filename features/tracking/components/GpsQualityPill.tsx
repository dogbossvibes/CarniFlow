import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { GPS_QUALITY_LABEL, type GpsQuality } from '@/features/tracking/utils/gpsFilter';

const COLOR: Record<GpsQuality, string> = {
  'sehr-gut': C.trackPrimary,
  'gut':      C.trackPrimary,
  'mittel':   C.trackWarning,
  'schwach':  C.trackDanger,
};

// Zeigt GPS-Qualität immer an; warnt bei „schwach".
export function GpsQualityPill({ quality, accuracy }: { quality: GpsQuality | null; accuracy: number | null }) {
  const q = quality ?? 'schwach';
  const color = COLOR[q];
  const acc = accuracy != null ? `±${Math.round(accuracy)} m` : '–';
  return (
    <View style={[s.pill, { borderColor: `${color}55` }]}>
      <Ionicons name="locate" size={12} color={color} />
      <Text style={[s.txt, { color }]}>GPS {acc}</Text>
      {q === 'schwach' && <Text style={s.warn}>· ungenau</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.trackCard, borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 6 },
  txt:  { fontSize: 11.5, fontWeight: '800' },
  warn: { fontSize: 11, color: C.trackDanger, fontWeight: '700' },
});

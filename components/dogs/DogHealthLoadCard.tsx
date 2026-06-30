import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { C } from '@/constants/colors';
import type { DogHealth } from './types';

// Gesundheit & Belastung. Fehlende Werte erscheinen als „—".
export function DogHealthLoadCard({ health, onAddEntry }: { health: DogHealth; onAddEntry: () => void }) {
  const cells = [
    { v: health.weightKg != null ? `${health.weightKg} kg` : '—', l: 'Gewicht' },
    { v: health.loadLabel ?? '—', l: 'Belastung' },
    { v: health.restDays != null ? String(health.restDays) : '—', l: 'Ruhetage' },
    { v: health.intenseSessions != null ? String(health.intenseSessions) : '—', l: 'Intensiv' },
  ];
  return (
    <View style={s.wrap}>
      <View style={s.grid}>
        {cells.map(c => (
          <View key={c.l} style={s.cell}>
            <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit>{c.v}</Text>
            <Text style={s.label}>{c.l}</Text>
          </View>
        ))}
      </View>

      {health.nextVetLabel ? (
        <View style={s.info}>
          <Ionicons name="medkit-outline" size={15} color={C.trackPrimary} />
          <Text style={s.infoTxt}>Nächster Tierarzttermin: <Text style={s.infoStrong}>{health.nextVetLabel}</Text></Text>
        </View>
      ) : (
        <View style={s.info}>
          <Ionicons name="medkit-outline" size={15} color={C.trackTextMut} />
          <Text style={s.infoMut}>Kein Tierarzttermin hinterlegt.</Text>
        </View>
      )}

      {health.note ? (
        <View style={s.note}><Text style={s.noteTxt}>{health.note}</Text></View>
      ) : null}

      <AnyvoButton label="Eintrag hinzufügen" icon="add" variant="secondary" onPress={onAddEntry} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap:      { gap: 12 },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell:      { flexBasis: '47.5%', flexGrow: 1, alignItems: 'center', backgroundColor: C.trackCard, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, paddingVertical: 16 },
  value:     { fontSize: 22, color: C.trackText, fontWeight: '900', letterSpacing: -0.6 },
  label:     { fontSize: 10, color: C.trackTextMut, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  info:      { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, padding: 12 },
  infoTxt:   { flex: 1, fontSize: 13, color: C.trackTextSec, fontWeight: '500' },
  infoStrong:{ color: C.trackText, fontWeight: '700' },
  infoMut:   { flex: 1, fontSize: 13, color: C.trackTextMut },
  note:      { backgroundColor: C.accentDim, borderRadius: 14, borderWidth: 1, borderColor: C.accentMid, padding: 12 },
  noteTxt:   { fontSize: 13, color: C.trackText, fontWeight: '500', lineHeight: 18 },
});

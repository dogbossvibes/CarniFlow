import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';

// Auswahllisten für den Hunde-Sport.
export const DOG_DISCIPLINES = ['IGP', 'IBGH', 'Mondioring', 'Obedience', 'Fährte', 'Rettung', 'Agility'] as const;
export const DOG_LEVELS      = ['BH', '1', '2', '3'] as const;

// Einfache Einfach-Auswahl als Chips (Pillen). Nochmaliges Tippen auf den
// aktiven Chip hebt die Auswahl wieder auf ('' = nichts gewählt).
export function ChipSelect({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={s.row}>
        {options.map(opt => {
          const aktiv = value === opt;
          return (
            <TouchableOpacity
              key={opt}
              style={[s.chip, aktiv && s.chipAktiv]}
              onPress={() => onChange(aktiv ? '' : opt)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipText, aktiv && s.chipTextAktiv]}>{opt}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  row:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.input,
  },
  chipAktiv:     { borderColor: C.accent, backgroundColor: C.accentDim },
  chipText:      { fontSize: 13.5, color: C.muted, fontWeight: '600' },
  chipTextAktiv: { color: C.accent, fontWeight: '700' },
});

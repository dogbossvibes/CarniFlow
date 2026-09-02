import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { useT } from '@/i18n';

// Kompakter Ersatz für DurationDrumPicker (grosser Trommel-Picker) in
// app/unit/document.tsx: „[-] 20 min [+]" statt eines eigenen grossen Blocks.
// Gleiche {value, onChange}-Minuten-Signatur → reiner Drop-in, keine
// Datenformat-Änderung. 5-Minuten-Schritte (gleiche Granularität wie die
// bisherigen Presets 5/10/…/40).
const STEP = 5;
const MIN = 5;
const MAX = 240;

interface Props {
  value:    number;
  onChange: (val: number) => void;
}

export function CompactDurationStepper({ value, onChange }: Props) {
  const { t } = useT();
  const atMin = value <= MIN;
  const atMax = value >= MAX;

  const dec = () => {
    if (atMin) return;
    tapHaptic();
    onChange(Math.max(MIN, value - STEP));
  };
  const inc = () => {
    if (atMax) return;
    tapHaptic();
    onChange(Math.min(MAX, value + STEP));
  };

  return (
    <View style={s.row}>
      <TouchableOpacity
        style={[s.btn, atMin && s.btnDisabled]}
        onPress={dec}
        disabled={atMin}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('training.durationDecrease')}
      >
        <Ionicons name="remove" size={18} color={atMin ? C.muted : C.white} />
      </TouchableOpacity>
      <View style={s.valueWrap}>
        <Text style={s.value}>{value}</Text>
        <Text style={s.unit}>{t('training.minutesShort')}</Text>
      </View>
      <TouchableOpacity
        style={[s.btn, atMax && s.btnDisabled]}
        onPress={inc}
        disabled={atMax}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('training.durationIncrease')}
      >
        <Ionicons name="add" size={18} color={atMax ? C.muted : C.white} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, alignSelf: 'flex-start',
    backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  btn: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.4 },
  valueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 5, minWidth: 60, justifyContent: 'center' },
  value: { fontSize: 18, color: C.white, fontWeight: '900' },
  unit:  { fontSize: 12, color: C.muted, fontWeight: '600' },
});

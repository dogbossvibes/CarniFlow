import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import type { Discipline } from '@/constants/disciplines';

// Große Premium-Card für eine Sparte (Dashboard / Start-Screen).
interface Props {
  discipline: Discipline;
  onPress:    () => void;
  onEdit?:    () => void;   // optionaler Stift-Button (z.B. für eigene Kategorien)
}

export function DisciplineCard({ discipline, onPress, onEdit }: Props) {
  const { label, subtitle, icon, accent } = discipline;

  return (
    <AnimatedPressable
      style={s.card}
      scale={0.97}
      onPress={() => { tapHaptic(); onPress(); }}
    >
      {/* Akzent-Schimmer von links */}
      <LinearGradient
        colors={[`${accent}22`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={s.accentBar} />
      <View style={[s.iconWrap, { backgroundColor: `${accent}1A`, borderColor: `${accent}44` }]}>
        <Ionicons name={icon} size={26} color={accent} />
      </View>
      <View style={s.texts}>
        <Text style={s.title}>{label}</Text>
        <Text style={s.subtitle}>{subtitle}</Text>
      </View>
      {onEdit ? (
        <TouchableOpacity
          style={s.editBtn}
          onPress={() => { tapHaptic(); onEdit(); }}
          hitSlop={10}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={20} color={C.muted} />
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={20} color={C.muted} />
      )}
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             16,
    backgroundColor: C.card,
    borderRadius:    24,
    borderWidth:     1,
    borderColor:     C.border,
    paddingVertical: 20,
    paddingLeft:     22,
    paddingRight:    18,
    overflow:        'hidden',
  },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  iconWrap: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  texts:    { flex: 1, gap: 3 },
  title:    { fontSize: 18, color: C.white, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: C.muted, fontWeight: '500' },
  editBtn:  { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

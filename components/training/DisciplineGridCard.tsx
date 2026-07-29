import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import type { Discipline } from '@/constants/disciplines';

// Kompakte Sparten-Kachel für das 2-Spalten-Raster (Premium Dark).
// Die Spartenfarbe (accent) trägt NUR Icon, Icon-Outline, feine Karten-Outline
// und einen sehr dezenten Glow — die Fläche bleibt dunkel/anthrazit.
export function DisciplineGridCard({
  discipline,
  onPress,
  onEdit,
}: {
  discipline: Discipline;
  onPress: () => void;
  onEdit?: () => void;
}) {
  const { label, subtitle, icon, accent } = discipline;

  return (
    <AnimatedPressable
      style={[s.card, { borderColor: `${accent}33` }]}
      scale={0.97}
      onPress={() => { tapHaptic(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={`${label} starten`}
    >
      {/* sehr dezenter Glow aus der Ecke (Spartenfarbe, niedrige Deckkraft) */}
      <LinearGradient
        colors={[`${accent}14`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={s.topRow}>
        <View style={[s.iconWrap, { borderColor: `${accent}55` }]}>
          <Ionicons name={icon} size={24} color={accent} />
        </View>
        {onEdit ? (
          <TouchableOpacity
            onPress={() => { tapHaptic(); onEdit(); }}
            hitSlop={10}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${label} bearbeiten`}
          >
            <Ionicons name="create-outline" size={18} color={C.muted} />
          </TouchableOpacity>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={C.muted} />
        )}
      </View>

      <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
      <Text style={s.subtitle} numberOfLines={2}>{subtitle}</Text>
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  card: {
    width: '48%',              // zwei Spalten; Container nutzt justifyContent: space-between
    minHeight: 132,
    backgroundColor: C.card,   // dunkel/anthrazit — NICHT vollflächig eingefärbt
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconWrap: {
    width: 46, height: 46, borderRadius: 14, borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',   // dunkler Icon-Container
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 16, color: C.white, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.muted, fontWeight: '500', lineHeight: 17 },
});

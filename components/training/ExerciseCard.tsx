import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AnimatedPressable } from '@/components/ui/AnimatedPressable';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Grid-Zelle für eine Übung im Sparten-Screen.
interface Props {
  name:    string;
  accent:  string;
  icon?:   IconName;
  onPress: () => void;
}

export function ExerciseCard({ name, accent, icon = 'ellipse-outline', onPress }: Props) {
  return (
    <AnimatedPressable
      style={s.card}
      scale={0.95}
      onPress={() => { tapHaptic(); onPress(); }}
    >
      <LinearGradient
        colors={[`${accent}14`, 'transparent']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[s.iconWrap, { backgroundColor: `${accent}1A` }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <Text style={s.name} numberOfLines={2}>{name}</Text>
    </AnimatedPressable>
  );
}

const s = StyleSheet.create({
  card: {
    width:           '47%',
    minHeight:       110,
    backgroundColor: C.card,
    borderRadius:    24,
    borderWidth:     1,
    borderColor:     C.border,
    padding:         16,
    gap:             12,
    justifyContent:  'space-between',
    overflow:        'hidden',
  },
  iconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name:     { fontSize: 14, color: C.white, fontWeight: '700', letterSpacing: -0.2 },
});

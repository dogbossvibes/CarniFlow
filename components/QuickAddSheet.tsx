import { Platform, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { useActiveTraining } from '@/stores/activeTraining';
import { LiveTrainingBar } from '@/components/training/LiveTrainingBar';

// Schwebendes „+": Shortcut in den vereinheitlichten units-Flow.
// Während eines laufenden Trainings wird der Button durch die Live-Bar ersetzt.
export function QuickAddSheet() {
  const router = useRouter();
  const active = useActiveTraining();
  const insets = useSafeAreaInsets();

  if (active.unitId) return <LiveTrainingBar />;

  return (
    <TouchableOpacity
      style={[s.fab, { bottom: 28 + (Platform.OS === 'android' ? insets.bottom : 0) }]}
      onPress={() => { tapHaptic(); router.push('/unit/start'); }}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={['#00FFCC', '#00FFCC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Ionicons name="add" size={28} color={C.accentText} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  fab: {
    position:       'absolute',
    bottom:         28,
    right:          20,
    width:          58,
    height:         58,
    borderRadius:   29,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
    shadowColor:    '#00FFCC',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.35,
    shadowRadius:   12,
    elevation:      8,
  },
});

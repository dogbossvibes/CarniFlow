import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';

// Schwebendes „+": Shortcut in den vereinheitlichten units-Flow.
// (Früher ein eigenes Schnell-Formular für training_sessions — abgelöst, damit
// es nur noch EINEN Erfassungsweg gibt.)
export function QuickAddSheet() {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={s.fab}
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

import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { tapHaptic } from '@/lib/haptics';
import { EVENT_TYPES, type EventType } from '@/types/calendar';

const ORDER: EventType[] = ['training', 'tracking', 'trainer', 'video', 'seminar', 'pruefung', 'sd', 'uo', 'reminder', 'custom'];
const ACCENT = '#00F5D4';

export function AppointmentTypeGrid({ selected, onToggle }: { selected: EventType[]; onToggle: (t: EventType) => void }) {
  return (
    <View style={s.grid}>
      {ORDER.map(t => (
        <TypeCard key={t} type={t} active={selected.includes(t)} onPress={() => { tapHaptic(); onToggle(t); }} />
      ))}
    </View>
  );
}

function TypeCard({ type, active, onPress }: { type: EventType; active: boolean; onPress: () => void }) {
  const m = EVENT_TYPES[type];
  const scale = useSharedValue(1);
  useEffect(() => { scale.value = withTiming(active ? 1.03 : 1, { duration: 180 }); }, [active]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[s.cardWrap, st]}>
      <Pressable
        onPress={onPress}
        style={[s.card, active && { borderColor: ACCENT, backgroundColor: 'rgba(0,245,212,0.12)' }, active && s.glow]}
      >
        <View style={[s.icon, { backgroundColor: active ? 'rgba(0,245,212,0.18)' : `${m.color}1A` }]}>
          <Ionicons name={m.icon} size={20} color={active ? ACCENT : m.color} />
        </View>
        <Text style={[s.label, active && { color: C.white }]} numberOfLines={1}>{m.label}</Text>
        {active && (
          <View style={s.check}><Ionicons name="checkmark" size={12} color="#001210" /></View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  grid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cardWrap: { width: '47.8%', flexGrow: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 72, borderRadius: 18, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.card,
  },
  glow:  { shadowColor: ACCENT, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  icon:  { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, color: C.muted, fontWeight: '700' },
  check: { position: 'absolute', top: 8, right: 8, width: 18, height: 18, borderRadius: 9, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
});

import { StyleSheet, Text, View } from 'react-native';
import type { EventStatus } from '@/types/calendar';

const MAP: Record<EventStatus, { label: string; color: string }> = {
  pending:   { label: 'Ausstehend', color: '#FFB800' },
  confirmed: { label: 'Bestätigt',  color: '#00F5D4' },
  cancelled: { label: 'Abgesagt',   color: '#FF3B30' },
  completed: { label: 'Erledigt',   color: '#8A8A8F' },
};

export function TrainerStatusBadge({ status }: { status: EventStatus }) {
  const m = MAP[status];
  return (
    <View style={[s.badge, { borderColor: `${m.color}55`, backgroundColor: `${m.color}1A` }]}>
      <View style={[s.dot, { backgroundColor: m.color }]} />
      <Text style={[s.txt, { color: m.color }]}>{m.label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  dot:   { width: 6, height: 6, borderRadius: 3 },
  txt:   { fontSize: 11, fontWeight: '800' },
});

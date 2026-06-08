import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';
import { fmtTime } from '@/lib/eventFormat';
import { eventMeta, STATUS_LABEL, type CalendarEvent } from '@/types/calendar';

export function DogEventCard({ event, onPress }: { event: CalendarEvent; onPress?: () => void }) {
  const m = eventMeta(event.type);
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.85} disabled={!onPress}>
      <View style={[s.stripe, { backgroundColor: m.color }]} />
      <View style={[s.icon, { backgroundColor: `${m.color}1A` }]}>
        <Text style={{ fontSize: 18 }}>{m.emoji}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>{event.title}</Text>
        <View style={s.metaRow}>
          {event.dog?.name  ? <Text style={s.meta} numberOfLines={1}>🐕 {event.dog.name}</Text> : null}
          {event.location   ? <Text style={s.meta} numberOfLines={1}>📍 {event.location}</Text> : null}
        </View>
      </View>
      <View style={s.right}>
        <Text style={[s.time, { color: m.color }]}>{fmtTime(event.start_at)}</Text>
        {event.status !== 'confirmed' && (
          <Text style={[s.status, event.status === 'cancelled' && { color: C.danger }]}>
            {STATUS_LABEL[event.status]}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card:   { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12, overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  icon:   { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  title:  { fontSize: 15, color: C.white, fontWeight: '700' },
  metaRow:{ flexDirection: 'row', gap: 10, marginTop: 3 },
  meta:   { fontSize: 12, color: C.muted, flexShrink: 1 },
  right:  { alignItems: 'flex-end', gap: 2 },
  time:   { fontSize: 15, fontWeight: '900' },
  status: { fontSize: 10, color: C.warning, fontWeight: '700' },
});

import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { fmtTime, relativeDayLabel } from '@/lib/eventFormat';
import { TrainerStatusBadge } from '@/components/calendar/TrainerStatusBadge';
import { eventMeta, type CalendarEvent } from '@/types/calendar';

export function TrainerAppointmentRequest({
  event, onAccept, onDecline, onSuggest,
}: {
  event: CalendarEvent;
  onAccept: () => void;
  onDecline: () => void;
  onSuggest?: () => void;
}) {
  const m = eventMeta(event.type);
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={[s.icon, { backgroundColor: `${m.color}1A` }]}><Text style={{ fontSize: 18 }}>{m.emoji}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{event.title}</Text>
          <Text style={s.sub}>
            {relativeDayLabel(event.start_at)} · {fmtTime(event.start_at)}
            {event.dog?.name ? ` · 🐕 ${event.dog.name}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </Text>
        </View>
        <TrainerStatusBadge status={event.status} />
      </View>

      <View style={s.btnRow}>
        <TouchableOpacity style={s.declineBtn} onPress={onDecline} activeOpacity={0.8}>
          <Ionicons name="close" size={16} color={C.danger} />
          <Text style={s.declineTxt}>Ablehnen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.acceptBtn} onPress={onAccept} activeOpacity={0.85}>
          <Ionicons name="checkmark" size={16} color="#001210" />
          <Text style={s.acceptTxt}>Annehmen</Text>
        </TouchableOpacity>
      </View>

      {onSuggest && (
        <TouchableOpacity style={s.suggest} onPress={onSuggest} activeOpacity={0.7}>
          <Ionicons name="time-outline" size={15} color={C.muted} />
          <Text style={s.suggestTxt}>Andere Zeit vorschlagen</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const ACCENT = '#00F5D4';
const s = StyleSheet.create({
  card:  { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: '#FFB80040', padding: 14, gap: 12 },
  head:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon:  { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, color: C.white, fontWeight: '700' },
  sub:   { fontSize: 12, color: C.muted, marginTop: 2 },
  btnRow:{ flexDirection: 'row', gap: 10 },
  declineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, borderWidth: 1, borderColor: `${C.danger}40`, backgroundColor: C.dangerDim },
  declineTxt: { fontSize: 14, color: C.danger, fontWeight: '700' },
  acceptBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 12, backgroundColor: ACCENT },
  acceptTxt:  { fontSize: 14, color: '#001210', fontWeight: '800' },
  suggest:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4 },
  suggestTxt: { fontSize: 13, color: C.muted, fontWeight: '600' },
});

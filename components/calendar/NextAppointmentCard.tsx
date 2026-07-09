import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { fmtTime, relativeDayLabel } from '@/lib/eventFormat';
import { eventMeta, STATUS_LABEL, type CalendarEvent } from '@/types/calendar';

const ACCENT = '#00F5D4';

export function NextAppointmentCard({ event }: { event: CalendarEvent | null }) {
  const { t } = useT();
  if (!event) {
    return (
      <View style={[s.card, s.empty]}>
        <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
        <Ionicons name="calendar-outline" size={26} color={C.muted} />
        <Text style={s.emptyTxt}>{t('calendar.noAppointment')}</Text>
        <Text style={s.emptySub}>{t('calendar.noAppointmentSub')}</Text>
      </View>
    );
  }
  const m = eventMeta(event.type);
  return (
    <View style={s.card}>
      <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,245,212,0.06)' }]} />

      <Text style={s.eyebrow}>{t('calendar.nextAppointment')}</Text>
      <View style={s.timeRow}>
        <Text style={s.day}>{relativeDayLabel(event.start_at)}</Text>
        <View style={s.dot} />
        <Text style={s.time}>{fmtTime(event.start_at)}</Text>
      </View>

      <View style={s.titleRow}>
        <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
        <Text style={s.title} numberOfLines={1}>{event.title}</Text>
      </View>

      <View style={s.metaGrid}>
        {event.dog?.name  ? <Meta icon="paw"           label={event.dog.name} /> : null}
        {event.location   ? <Meta icon="location"      label={event.location} /> : null}
        <View style={[s.statusPill, { borderColor: `${m.color}55` }]}>
          <View style={[s.statusDot, { backgroundColor: m.color }]} />
          <Text style={[s.statusTxt, { color: m.color }]}>{STATUS_LABEL[event.status]}</Text>
        </View>
      </View>
    </View>
  );
}

function Meta({ icon, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string }) {
  return (
    <View style={s.meta}>
      <Ionicons name={icon} size={13} color={C.muted} />
      <Text style={s.metaTxt} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 28, overflow: 'hidden', padding: 20,
    borderWidth: 1, borderColor: 'rgba(0,245,212,0.2)',
    backgroundColor: 'rgba(20,20,20,0.65)', minHeight: 150,
  },
  empty:    { alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 150 },
  emptyTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  emptySub: { fontSize: 12, color: C.muted, textAlign: 'center' },

  eyebrow: { fontSize: 10, color: ACCENT, fontWeight: '800', letterSpacing: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  day:     { fontSize: 14, color: C.white, fontWeight: '700' },
  dot:     { width: 4, height: 4, borderRadius: 2, backgroundColor: C.muted },
  time:    { fontSize: 14, color: ACCENT, fontWeight: '900' },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  title:    { flex: 1, fontSize: 20, color: C.white, fontWeight: '900', letterSpacing: -0.4 },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14, alignItems: 'center' },
  meta:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt:  { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  statusPill:{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusTxt: { fontSize: 11, fontWeight: '800' },
});

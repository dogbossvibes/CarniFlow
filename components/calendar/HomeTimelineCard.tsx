import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { NextAppointmentCard } from '@/components/calendar/NextAppointmentCard';
import { useTrainingCalendar, nextEvent, eventsOnDay, localDayKey } from '@/hooks/useTrainingCalendar';
import { eventMeta } from '@/types/calendar';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const ACCENT = '#00F5D4';

export function HomeTimelineCard() {
  const router = useRouter();
  const { t } = useT();
  const { events } = useTrainingCalendar();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const wd = (today.getDay() + 6) % 7;
  const monday = new Date(today); monday.setDate(today.getDate() - wd);
  const todayKey = localDayKey(today.toISOString());

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const key = localDayKey(d.toISOString());
    return { key, label: WD[i], events: eventsOnDay(events, key) };
  });

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={() => router.push('/training-hub')}>
      <View style={s.head}>
        <Text style={s.label}>SMART TRAINING TIMELINE</Text>
        <View style={s.allRow}>
          <Text style={s.all}>{t('calendar.viewAll')}</Text>
          <Ionicons name="chevron-forward" size={13} color={ACCENT} />
        </View>
      </View>

      <NextAppointmentCard event={nextEvent(events)} />

      <View style={s.week}>
        {days.map(d => {
          const isToday = d.key === todayKey;
          return (
            <View key={d.key} style={[s.day, isToday && s.dayToday]}>
              <Text style={[s.wd, isToday && s.wdToday]}>{d.label}</Text>
              <View style={s.icons}>
                {d.events.length === 0 ? (
                  <View style={s.emptyDot} />
                ) : (
                  d.events.slice(0, 2).map((e, i) => (
                    <Text key={i} style={{ fontSize: 12 }}>{eventMeta(e.type).emoji}</Text>
                  ))
                )}
              </View>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  head:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  label:  { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5 },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  all:    { fontSize: 12, color: ACCENT, fontWeight: '700' },

  week:   { flexDirection: 'row', gap: 6, marginTop: 12 },
  day:    { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  dayToday:{ borderColor: ACCENT, backgroundColor: 'rgba(0,245,212,0.1)' },
  wd:     { fontSize: 10, color: C.muted, fontWeight: '700' },
  wdToday:{ color: ACCENT },
  icons:  { flexDirection: 'row', gap: 2, height: 16, alignItems: 'center' },
  emptyDot:{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.border },
});

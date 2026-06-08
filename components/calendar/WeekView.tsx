import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';
import { DogEventCard } from '@/components/calendar/DogEventCard';
import { eventsOnDay, localDayKey } from '@/hooks/useTrainingCalendar';
import { eventMeta, type CalendarEvent } from '@/types/calendar';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function mondayOf(base: Date): Date {
  const d = new Date(base); d.setHours(0, 0, 0, 0);
  const wd = (d.getDay() + 6) % 7;          // 0 = Montag
  d.setDate(d.getDate() - wd);
  return d;
}

export function WeekView({ events, onEventPress }: { events: CalendarEvent[]; onEventPress: (e: CalendarEvent) => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState(localDayKey(new Date().toISOString()));

  const start = mondayOf(new Date());
  start.setDate(start.getDate() + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = localDayKey(d.toISOString());
    return { d, key, count: eventsOnDay(events, key).length };
  });

  const todayKey = localDayKey(new Date().toISOString());
  const selEvents = eventsOnDay(events, selected).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  return (
    <View style={{ gap: 16 }}>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} hitSlop={10}><Text style={s.navBtn}>‹</Text></TouchableOpacity>
        <Text style={s.navLabel}>
          {weekOffset === 0 ? 'Diese Woche' : `${start.getDate()}.${start.getMonth() + 1}. – ${days[6].d.getDate()}.${days[6].d.getMonth() + 1}.`}
        </Text>
        <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} hitSlop={10}><Text style={s.navBtn}>›</Text></TouchableOpacity>
      </View>

      <View style={s.week}>
        {days.map(({ d, key, count }) => {
          const aktiv = key === selected;
          const isToday = key === todayKey;
          const dayEvents = eventsOnDay(events, key);
          return (
            <TouchableOpacity key={key} style={[s.day, aktiv && s.dayActive]} onPress={() => setSelected(key)} activeOpacity={0.8}>
              <Text style={[s.wd, aktiv && s.wdActive]}>{WD[(d.getDay() + 6) % 7]}</Text>
              <Text style={[s.num, aktiv && s.numActive, isToday && !aktiv && { color: '#00F5D4' }]}>{d.getDate()}</Text>
              <View style={s.dots}>
                {dayEvents.slice(0, 3).map((e, i) => (
                  <View key={i} style={[s.dot, { backgroundColor: eventMeta(e.type).color }]} />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        {selEvents.length === 0 ? (
          <Text style={s.none}>Keine Termine an diesem Tag.</Text>
        ) : (
          selEvents.map(e => <DogEventCard key={e.id} event={e} onPress={() => onEventPress(e)} />)
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  nav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  navBtn:   { fontSize: 26, color: C.muted, fontWeight: '700', paddingHorizontal: 12 },
  navLabel: { fontSize: 14, color: C.white, fontWeight: '700' },
  week:     { flexDirection: 'row', gap: 6 },
  day:      { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  dayActive:{ borderColor: '#00F5D4', backgroundColor: 'rgba(0,245,212,0.1)' },
  wd:       { fontSize: 10, color: C.muted, fontWeight: '700' },
  wdActive: { color: '#00F5D4' },
  num:      { fontSize: 16, color: C.white, fontWeight: '800' },
  numActive:{ color: '#00F5D4' },
  dots:     { flexDirection: 'row', gap: 3, height: 6 },
  dot:      { width: 5, height: 5, borderRadius: 3 },
  none:     { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 20 },
});

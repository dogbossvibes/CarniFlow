import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';
import { DogEventCard } from '@/components/calendar/DogEventCard';
import { eventsOnDay, localDayKey } from '@/hooks/useTrainingCalendar';
import { eventMeta, type CalendarEvent } from '@/types/calendar';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export function MonthView({ events, onEventPress }: { events: CalendarEvent[]; onEventPress: (e: CalendarEvent) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(localDayKey(new Date().toISOString()));

  const first = new Date(cursor.y, cursor.m, 1);
  const lead = (first.getDay() + 6) % 7;                 // Mo-basiert
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const todayKey = localDayKey(new Date().toISOString());

  const cells: (number | null)[] = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const move = (delta: number) => {
    let m = cursor.m + delta, y = cursor.y;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setCursor({ y, m });
  };

  const selEvents = eventsOnDay(events, selected).sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  return (
    <View style={{ gap: 14 }}>
      <View style={s.nav}>
        <TouchableOpacity onPress={() => move(-1)} hitSlop={10}><Text style={s.navBtn}>‹</Text></TouchableOpacity>
        <Text style={s.navLabel}>{MONTHS[cursor.m]} {cursor.y}</Text>
        <TouchableOpacity onPress={() => move(1)} hitSlop={10}><Text style={s.navBtn}>›</Text></TouchableOpacity>
      </View>

      <View style={s.wdRow}>{WD.map(d => <Text key={d} style={s.wd}>{d}</Text>)}</View>

      <View style={s.grid}>
        {cells.map((n, i) => {
          if (n == null) return <View key={`b${i}`} style={s.cell} />;
          const key = localDayKey(new Date(cursor.y, cursor.m, n).toISOString());
          const dayEvents = eventsOnDay(events, key);
          const aktiv = key === selected;
          const isToday = key === todayKey;
          return (
            <TouchableOpacity key={key} style={[s.cell, aktiv && s.cellActive]} onPress={() => setSelected(key)} activeOpacity={0.7}>
              <Text style={[s.num, isToday && { color: '#00F5D4', fontWeight: '900' }, aktiv && s.numActive]}>{n}</Text>
              <View style={s.dots}>
                {dayEvents.slice(0, 3).map((e, j) => <View key={j} style={[s.dot, { backgroundColor: eventMeta(e.type).color }]} />)}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ gap: 10, marginTop: 4 }}>
        {selEvents.length === 0
          ? <Text style={s.none}>Keine Termine an diesem Tag.</Text>
          : selEvents.map(e => <DogEventCard key={e.id} event={e} onPress={() => onEventPress(e)} />)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  nav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  navBtn:   { fontSize: 26, color: C.muted, fontWeight: '700', paddingHorizontal: 12 },
  navLabel: { fontSize: 15, color: C.white, fontWeight: '800' },
  wdRow:    { flexDirection: 'row' },
  wd:       { flex: 1, textAlign: 'center', fontSize: 10, color: C.muted, fontWeight: '700' },
  grid:     { flexDirection: 'row', flexWrap: 'wrap' },
  cell:     { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 10 },
  cellActive:{ backgroundColor: 'rgba(0,245,212,0.12)', borderWidth: 1, borderColor: '#00F5D4' },
  num:      { fontSize: 14, color: C.white, fontWeight: '600' },
  numActive:{ color: '#00F5D4' },
  dots:     { flexDirection: 'row', gap: 2, height: 5 },
  dot:      { width: 4, height: 4, borderRadius: 2 },
  none:     { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 16 },
});

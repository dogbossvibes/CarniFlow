import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { DogEventCard } from '@/components/calendar/DogEventCard';
import { dayHeadingFromKey } from '@/lib/eventFormat';
import { localDayKey } from '@/hooks/useTrainingCalendar';
import type { CalendarEvent } from '@/types/calendar';

export function TimelineView({ events, onEventPress }: { events: CalendarEvent[]; onEventPress: (e: CalendarEvent) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter(e => new Date(e.start_at).getTime() >= today.getTime())
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  if (upcoming.length === 0) {
    return (
      <View style={s.empty}>
        <Ionicons name="calendar-outline" size={32} color={C.subtle} />
        <Text style={s.emptyTxt}>Keine anstehenden Termine</Text>
        <Text style={s.emptySub}>Erstelle deinen ersten Termin mit dem „+"-Button.</Text>
      </View>
    );
  }

  // nach Tag gruppieren (Reihenfolge bleibt aufsteigend)
  const groups: { key: string; items: CalendarEvent[] }[] = [];
  for (const e of upcoming) {
    const key = localDayKey(e.start_at);
    const g = groups.find(x => x.key === key);
    if (g) g.items.push(e);
    else groups.push({ key, items: [e] });
  }

  return (
    <View style={{ gap: 22 }}>
      {groups.map(g => (
        <View key={g.key} style={{ gap: 10 }}>
          <Text style={s.heading}>{dayHeadingFromKey(g.key)}</Text>
          {g.items.map(e => <DogEventCard key={e.id} event={e} onPress={() => onEventPress(e)} />)}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  heading:  { fontSize: 12, color: '#00F5D4', fontWeight: '800', letterSpacing: 1 },
  empty:    { alignItems: 'center', paddingVertical: 50, gap: 8 },
  emptyTxt: { fontSize: 15, color: C.white, fontWeight: '700' },
  emptySub: { fontSize: 13, color: C.muted, textAlign: 'center', paddingHorizontal: 40 },
});

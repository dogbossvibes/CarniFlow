import { useQuery } from '@tanstack/react-query';
import { getCalendarEvents } from '@/services/calendarService';
import { useSession } from '@/hooks/useSession';
import type { CalendarEvent } from '@/types/calendar';

// Vereinheitlichte Terminliste (über React Query gecacht).
export function useTrainingCalendar() {
  const { session } = useSession();
  const uid = session?.user.id;

  const query = useQuery({
    queryKey: ['calendar', uid],
    enabled:  !!uid,
    queryFn:  async (): Promise<CalendarEvent[]> => {
      const { data } = await getCalendarEvents(uid!);
      return (data as CalendarEvent[]) ?? [];
    },
  });

  return {
    events:  query.data ?? [],
    loading: uid ? query.isPending : false,
    refresh: query.refetch,
  };
}

// Termine eines Tages (YYYY-MM-DD lokal) filtern.
export function eventsOnDay(events: CalendarEvent[], dayKey: string): CalendarEvent[] {
  return events.filter(e => localDayKey(e.start_at) === dayKey);
}

export function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Nächster anstehender Termin (>= jetzt, nicht abgesagt).
export function nextEvent(events: CalendarEvent[]): CalendarEvent | null {
  const now = Date.now();
  const upcoming = events
    .filter(e => e.status !== 'cancelled' && new Date(e.start_at).getTime() >= now)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  return upcoming[0] ?? null;
}

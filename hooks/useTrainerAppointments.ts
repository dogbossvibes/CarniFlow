import { useCallback } from 'react';
import { setEventStatus } from '@/services/calendarService';
import { useTrainingCalendar } from '@/hooks/useTrainingCalendar';
import { useSession } from '@/hooks/useSession';
import type { CalendarEvent, EventStatus } from '@/types/calendar';

// Trainer-Termin-Anfragen aus beiden Richtungen:
// - pending:  Trainer hat FÜR mich (Kund:in) angelegt → ich bestätige.
// - incoming: Kund:in hat MICH (Trainer:in) gewählt → ich bestätige.
export function useTrainerAppointments() {
  const { session } = useSession();
  const uid = session?.user.id;
  const { events, refresh } = useTrainingCalendar();

  const pending = events.filter(
    e => e.owner_id === uid && e.created_by !== uid && e.trainer_id != null && e.status === 'pending',
  );
  const incoming = events.filter(
    e => e.trainer_id === uid && e.created_by !== uid && e.status === 'pending',
  );

  const respond = useCallback(async (id: string, status: EventStatus) => {
    await setEventStatus(id, status);
    refresh();
  }, [refresh]);

  const accept  = useCallback((id: string) => respond(id, 'confirmed'), [respond]);
  const decline = useCallback((id: string) => respond(id, 'cancelled'), [respond]);

  return { pending, incoming, accept, decline, respond, refresh };
}

export function isTrainerAppointment(e: CalendarEvent, uid?: string): boolean {
  return e.trainer_id != null && e.trainer_id !== uid;
}

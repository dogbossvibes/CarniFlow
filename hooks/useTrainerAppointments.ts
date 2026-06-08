import { useCallback } from 'react';
import { setEventStatus } from '@/services/calendarService';
import { useTrainingCalendar } from '@/hooks/useTrainingCalendar';
import { useSession } from '@/hooks/useSession';
import type { CalendarEvent, EventStatus } from '@/types/calendar';

// Trainer-Termine, die der/die Kund:in noch beantworten muss (Status „pending"),
// plus Annehmen/Ablehnen-Aktionen.
export function useTrainerAppointments() {
  const { session } = useSession();
  const uid = session?.user.id;
  const { events, refresh } = useTrainingCalendar();

  // Offen für mich als Kund:in (Trainer hat angelegt, wartet auf Antwort).
  const pending = events.filter(
    e => e.owner_id === uid && e.trainer_id != null && e.status === 'pending',
  );

  const respond = useCallback(async (id: string, status: EventStatus) => {
    await setEventStatus(id, status);
    refresh();
  }, [refresh]);

  const accept  = useCallback((id: string) => respond(id, 'confirmed'), [respond]);
  const decline = useCallback((id: string) => respond(id, 'cancelled'), [respond]);

  return { pending, accept, decline, refresh };
}

export function isTrainerAppointment(e: CalendarEvent, uid?: string): boolean {
  return e.trainer_id != null && e.trainer_id !== uid;
}

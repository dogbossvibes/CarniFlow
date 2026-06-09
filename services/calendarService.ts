import { supabase } from '@/lib/supabase';
import type { CalendarEvent, NewCalendarEvent, EventStatus } from '@/types/calendar';

const SELECT = '*, dog:dogs(name, photo_url)';

// Alle für den Nutzer relevanten Termine (eigene + als Trainer angelegte).
export function getCalendarEvents(userId: string) {
  return supabase
    .from('calendar_events')
    .select(SELECT)
    .or(`owner_id.eq.${userId},created_by.eq.${userId},trainer_id.eq.${userId}`)
    .order('start_at', { ascending: true });
}

// Eigenen Termin anlegen. Mit verknüpfter Trainer:in wird daraus eine
// Anfrage (Status „pending"), die der/die Trainer:in bestätigen muss.
export async function createOwnEvent(userId: string, ev: NewCalendarEvent) {
  const status = ev.trainer_id ? 'pending' : 'confirmed';
  const res = await supabase
    .from('calendar_events')
    .insert({ ...ev, owner_id: userId, created_by: userId, status })
    .select(SELECT)
    .single();
  // Bucht die Kund:in einen Termin mit Trainer:in → diese benachrichtigen.
  if (!res.error && ev.trainer_id) notifyAppointment(userId, ev.trainer_id, ev.title, '📅 Neue Terminanfrage').catch(() => {});
  return res;
}

// Trainer legt Termin für eine:n Kund:in an (Status „pending").
export async function createTrainerEvent(trainerId: string, clientOwnerId: string, ev: NewCalendarEvent) {
  const res = await supabase
    .from('calendar_events')
    .insert({ ...ev, owner_id: clientOwnerId, created_by: trainerId, trainer_id: trainerId, status: 'pending' })
    .select(SELECT)
    .single();
  if (!res.error) notifyAppointment(trainerId, clientOwnerId, ev.title, '📅 Neuer Termin').catch(() => {});
  return res;
}

// Termin-Push (best-effort): senderId informiert recipientId.
async function notifyAppointment(senderId: string, recipientId: string, title: string, heading: string) {
  try {
    const { data: prof } = await supabase.from('profiles').select('full_name, trainer_name').eq('id', senderId).single();
    const name = (prof?.trainer_name ?? prof?.full_name ?? 'Jemand') as string;
    await supabase.functions.invoke('notify', {
      body: { user_ids: [recipientId], title: heading, body: `${name}: ${title}`, data: { type: 'appointment' } },
    });
  } catch { /* best-effort */ }
}

export function updateCalendarEvent(id: string, updates: Partial<CalendarEvent>) {
  return supabase.from('calendar_events').update(updates).eq('id', id).select(SELECT).single();
}

export function setEventStatus(id: string, status: EventStatus) {
  return supabase.from('calendar_events').update({ status }).eq('id', id).select(SELECT).single();
}

export function deleteCalendarEvent(id: string) {
  return supabase.from('calendar_events').delete().eq('id', id);
}

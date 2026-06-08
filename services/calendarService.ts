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

// Eigenen Termin anlegen (sofort bestätigt).
export async function createOwnEvent(userId: string, ev: NewCalendarEvent) {
  return supabase
    .from('calendar_events')
    .insert({ ...ev, owner_id: userId, created_by: userId, status: 'confirmed' })
    .select(SELECT)
    .single();
}

// Trainer legt Termin für eine:n Kund:in an (Status „pending").
export async function createTrainerEvent(trainerId: string, clientOwnerId: string, ev: NewCalendarEvent) {
  return supabase
    .from('calendar_events')
    .insert({ ...ev, owner_id: clientOwnerId, created_by: trainerId, trainer_id: trainerId, status: 'pending' })
    .select(SELECT)
    .single();
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

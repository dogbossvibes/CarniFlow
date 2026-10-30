import { supabase } from '@/lib/supabase';
import type { CalendarEvent, NewCalendarEvent, EventStatus } from '@/types/calendar';
import { notifyDailyWidgetDataChanged } from '@/features/widgets/dailyWidgetRefresh';

import { canDeleteOwnEvent, canEditOwnEvent, EDITABLE_EVENT_FIELDS, type EventEditPatch } from '@/features/calendar/eventEditing';

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
  if (!res.error) notifyDailyWidgetDataChanged();
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
  if (!res.error) notifyDailyWidgetDataChanged();
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
  return supabase.from('calendar_events').update(updates).eq('id', id).select(SELECT).single()
    .then(result => { if (!result.error) notifyDailyWidgetDataChanged(); return result; });
}

// Owner editor: update the same record, preserving identity, trainer negotiation,
// source metadata and every field the form does not expose. RLS remains decisive.
export async function updateOwnCalendarEvent(userId: string, original: CalendarEvent, changes: EventEditPatch) {
  const patch = Object.fromEntries(EDITABLE_EVENT_FIELDS.filter(key => key in changes).map(key => [key, changes[key]]));
  return updateOwnCalendarFields(userId, original, patch);
}

// Explicit user action only; retain the same ownership and stale-snapshot guards as the editor.
export async function finishOwnCalendarEvent(userId: string, original: CalendarEvent, status: 'completed' | 'cancelled') {
  if (status !== 'completed' && status !== 'cancelled') return { data: null, error: { message: 'CALENDAR_INVALID_STATUS' } };
  return updateOwnCalendarFields(userId, original, { status });
}

async function updateOwnCalendarFields(userId: string, original: CalendarEvent, patch: Record<string, unknown>) {
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError || auth.session?.user.id !== userId || !canEditOwnEvent(original, userId)) {
    return { data: null, error: { message: 'CALENDAR_ACCESS_CHANGED' } };
  }
  if (!Object.keys(patch).length) return { data: original, error: null };
  let query = supabase.from('calendar_events').update(patch).eq('id', original.id).eq('owner_id', userId);
  // Fail closed when this snapshot was changed/deleted in another client.
  for (const key of [...EDITABLE_EVENT_FIELDS, 'status', 'trainer_id', 'created_by', 'source_type', 'source_id'] as const) {
    const value = original[key];
    if (value == null) query = query.is(key, null);
    else if (Array.isArray(value)) query = query.filter(key, 'eq', `{${value.map(item => JSON.stringify(item)).join(',')}}`);
    else query = query.eq(key, value);
  }
  const result = await query.select(SELECT).maybeSingle();
  if (result.error || !result.data) return { data: null, error: result.error ?? { message: 'CALENDAR_CONFLICT' } };
  notifyDailyWidgetDataChanged();
  return { data: result.data as unknown as CalendarEvent, error: null };
}

export function setEventStatus(id: string, status: EventStatus) {
  return supabase.from('calendar_events').update({ status }).eq('id', id).select(SELECT).single()
    .then(result => { if (!result.error) notifyDailyWidgetDataChanged(); return result; });
}

export function deleteCalendarEvent(id: string) {
  return supabase.from('calendar_events').delete().eq('id', id)
    .then(result => { if (!result.error) notifyDailyWidgetDataChanged(); return result; });
}

export async function deleteOwnCalendarEvent(userId: string, original: CalendarEvent) {
  const { data: auth, error: authError } = await supabase.auth.getSession();
  if (authError || auth.session?.user.id !== userId || !canDeleteOwnEvent(original, userId)) {
    return { data: null, error: { message: 'CALENDAR_ACCESS_CHANGED' } };
  }
  let query = supabase.from('calendar_events').delete().eq('id', original.id).eq('owner_id', userId);
  // A changed or newly source-linked record must be reopened before deletion.
  for (const key of [...EDITABLE_EVENT_FIELDS, 'status', 'trainer_id', 'created_by', 'source_type', 'source_id'] as const) {
    const value = original[key];
    if (value == null) query = query.is(key, null);
    else if (Array.isArray(value)) query = query.filter(key, 'eq', `{${value.map(item => JSON.stringify(item)).join(',')}}`);
    else query = query.eq(key, value);
  }
  const result = await query.select('id').maybeSingle();
  if (result.error || !result.data) return { data: null, error: result.error ?? { message: 'CALENDAR_CONFLICT' } };
  notifyDailyWidgetDataChanged();
  return { data: result.data, error: null };
}

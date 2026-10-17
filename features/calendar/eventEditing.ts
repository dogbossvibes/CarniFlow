import type { CalendarEvent, NewCalendarEvent } from '@/types/calendar';

// Trainer negotiations and health-source appointments keep their existing flows.
export function canEditOwnEvent(event: CalendarEvent, userId?: string): boolean {
  return !!userId && event.owner_id === userId && event.created_by === userId && !event.trainer_id && !event.source_type && !event.source_id;
}

export const EDITABLE_EVENT_FIELDS = ['title', 'type', 'types', 'dog_id', 'dog_ids', 'start_at', 'end_at', 'location', 'notes', 'reminder_minutes'] as const;
export type EventEditPatch = Partial<Pick<CalendarEvent, typeof EDITABLE_EVENT_FIELDS[number]>>;

export function eventEditPatch(original: CalendarEvent, draft: NewCalendarEvent): EventEditPatch {
  return Object.fromEntries(EDITABLE_EVENT_FIELDS
    .filter(key => JSON.stringify(original[key]) !== JSON.stringify(draft[key]))
    .map(key => [key, draft[key]]));
}

// Preserve the exact original instant unless the user actually changes its day
// or clock time. In particular, reopening an autumn DST time must not choose the
// other occurrence or discard seconds. Overnight ends retain their day offset.
export function eventFormInstant(date: Date, time: Date, original?: string, originalStart?: string): string {
  const old = original ? new Date(original) : null;
  const start = originalStart ? new Date(originalStart) : old;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (old && start && sameDay(date, start) && old.getHours() === time.getHours() && old.getMinutes() === time.getMinutes()) return original!;
  const offset = old && start ? Math.round((Date.UTC(old.getFullYear(), old.getMonth(), old.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000) : 0;
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
  const result = new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes());
  if (result.getHours() !== time.getHours() || result.getMinutes() !== time.getMinutes()) throw new Error('INVALID_LOCAL_TIME');
  return result.toISOString();
}

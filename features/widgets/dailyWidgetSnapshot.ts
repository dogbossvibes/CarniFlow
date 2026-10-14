import type { CalendarEvent } from '@/types/calendar';

export const DAILY_WIDGET_SCHEMA = 1;
export const DAILY_WIDGET_FRESH_MS = 15 * 60_000;
export const DAILY_WIDGET_EXPIRES_MS = 6 * 60 * 60_000;
export const DAILY_WIDGET_MAX_DOGS = 128;
export const DAILY_WIDGET_MAX_ITEMS = 256;

export type WidgetDog = { id: string; name: string };
export type WidgetItem = {
  id: string;
  kind: 'appointment' | 'reminder';
  dogIds: string[];
  startAtMs: number;
  endAtMs: number | null;
  status: 'confirmed' | 'pending';
  carPlayEligible: boolean;
};
export type DailyWidgetSnapshot = {
  schemaVersion: 1;
  generatedAtMs: number;
  freshUntilMs: number;
  expiresAtMs: number;
  timeZone: string;
  dogs: WidgetDog[];
  items: WidgetItem[];
  truncated: boolean;
};
export type WidgetOwnedDog = WidgetDog & { owner_id: string };
export type WidgetCalendarSource = Pick<CalendarEvent, 'id' | 'owner_id' | 'dog_id' | 'dog_ids'
  | 'type' | 'types' | 'start_at' | 'end_at' | 'status' | 'source_type'>;

// Calendar reminder records are the only task source. No recurrence expansion,
// past-appointment overdue inference, health calculation or customer free text.
export function buildDailyWidgetSnapshot(input: {
  ownerId: string;
  dogs: readonly WidgetOwnedDog[];
  events: readonly WidgetCalendarSource[];
  nowMs: number;
  timeZone: string;
  truncated?: boolean;
}): DailyWidgetSnapshot {
  const { nowMs, ownerId } = input;
  if (!ownerId || !Number.isFinite(nowMs) || nowMs <= 0) throw new Error('Invalid widget identity/time');
  // Validate the IANA timezone before creating a cross-platform snapshot.
  new Intl.DateTimeFormat('en', { timeZone: input.timeZone }).format(nowMs);
  const uniqueDogs = new Map<string, WidgetDog>();
  for (const dog of input.dogs) {
    if (dog.owner_id === ownerId && dog.id && dog.id.length <= 128) {
      uniqueDogs.set(dog.id, { id: dog.id, name: String(dog.name).replace(/[\u0000-\u001f]/g, '').slice(0, 60) });
    }
  }
  const dogs = [...uniqueDogs.values()].slice(0, DAILY_WIDGET_MAX_DOGS);
  const allowed = new Set(dogs.map(d => d.id));
  const dayKey = (time: number) => new Intl.DateTimeFormat('en-CA', {
    timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(time);
  const today = dayKey(nowMs);
  const uniqueItems = new Map<string, WidgetItem>();
  for (const event of input.events) {
    if (event.owner_id !== ownerId || !event.id || event.id.length > 128
      || !['confirmed', 'pending'].includes(event.status)) continue;
    const start = Date.parse(event.start_at);
    const parsedEnd = event.end_at ? Date.parse(event.end_at) : NaN;
    const end = Number.isFinite(parsedEnd) && parsedEnd > start ? parsedEnd : null;
    if (!Number.isFinite(start) || start <= 0) continue;
    const reminder = event.type === 'reminder' || event.types?.includes('reminder');
    // Explicit reminders today may be due already. Past appointments are never tasks.
    if (start < nowMs && !(reminder ? dayKey(start) === today : end != null && end > nowMs)) continue;
    const dogIds = [...new Set([...(event.dog_ids ?? []), ...(event.dog_id ? [event.dog_id] : [])])];
    if (dogIds.some(id => !allowed.has(id))) continue;
    uniqueItems.set(event.id, {
      id: event.id, kind: reminder ? 'reminder' : 'appointment', dogIds,
      startAtMs: start, endAtMs: end, status: event.status as 'confirmed' | 'pending',
      // The car gets no reminders, health-linked events or unconfirmed requests.
      carPlayEligible: !reminder && !event.source_type && event.status === 'confirmed',
    });
  }
  const allItems = [...uniqueItems.values()].sort((a, b) => a.startAtMs - b.startAtMs || a.id.localeCompare(b.id));
  return {
    schemaVersion: DAILY_WIDGET_SCHEMA, generatedAtMs: nowMs,
    freshUntilMs: nowMs + DAILY_WIDGET_FRESH_MS, expiresAtMs: nowMs + DAILY_WIDGET_EXPIRES_MS,
    timeZone: input.timeZone, dogs, items: allItems.slice(0, DAILY_WIDGET_MAX_ITEMS),
    truncated: !!input.truncated || uniqueDogs.size > dogs.length || allItems.length > DAILY_WIDGET_MAX_ITEMS,
  };
}

import type { CalendarEvent, EventType, NewCalendarEvent } from '@/types/calendar';
import type { CoachDiscipline, CoachSuggestion } from './types';

// Coach PR C (Entscheid der Nutzerin 2026-11-27: «Normale Termine»): ein übernommener
// Vorschlag wird ein ganz normaler eigener Trainingstermin – ohne source_type/source_id,
// darum wie jeder andere Termin bearbeit-, verschieb- und löschbar (auch in älteren Apps).
// «Schon im Kalender» erkennt der Coach über die gemerkte Termin-ID auf dem Gerät und über
// einen Abgleich gleicher Hund · Tag · Termintyp. Bestehende Termine werden nie verändert.

export const COACH_START_HOUR = 18;
export const COACH_DEFAULT_MINUTES = 60;

export function eventTypeFor(d: CoachDiscipline): EventType {
  switch (d) {
    case 'faehrte': return 'tracking';
    case 'schutzdienst': return 'sd';
    case 'unterordnung': return 'uo';
    default: return 'training';
  }
}

/** Lokale Uhrzeit am Vorschlagstag als ISO-Zeitpunkt. */
export function localInstant(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0).toISOString();
}

/** Lokaler Kalendertag eines ISO-Zeitpunkts. */
export function localDay(iso: string): string {
  const t = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

export function coachEventDraft(sg: CoachSuggestion, dogId: string, texts: { title: string; notes: string }): NewCalendarEvent {
  const type = eventTypeFor(sg.discipline);
  const minutes = sg.params.minutes && sg.params.minutes > 0 ? sg.params.minutes : COACH_DEFAULT_MINUTES;
  const start = localInstant(sg.date, COACH_START_HOUR);
  return {
    type, types: [type], dog_id: dogId, dog_ids: [dogId], trainer_id: null,
    title: texts.title.slice(0, 120), start_at: start,
    end_at: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(),
    location: null, discipline: null, notes: texts.notes.slice(0, 1000) || null,
    reminder_minutes: [], repeat: 'none',
  };
}

type EventLike = Pick<CalendarEvent, 'id' | 'dog_id' | 'dog_ids' | 'type' | 'types' | 'start_at' | 'status'>;

const forDog = (e: EventLike, dogId: string) => e.dog_id === dogId || (e.dog_ids ?? []).includes(dogId);
const hasType = (e: EventLike, t: EventType) => e.type === t || (e.types ?? []).includes(t);

/** Ist dieser Vorschlag schon im Kalender? Gemerkte ID zuerst, sonst gleicher Hund · Tag · Typ. */
export function isPlanned(sg: CoachSuggestion, dogId: string, events: readonly EventLike[], remembered: Readonly<Record<string, string>>): boolean {
  const live = events.filter(e => e.status !== 'cancelled');
  const id = remembered[sg.key];
  if (id && live.some(e => e.id === id)) return true;
  const type = eventTypeFor(sg.discipline);
  return live.some(e => forDog(e, dogId) && hasType(e, type) && localDay(e.start_at) === sg.date);
}

export function plannedKeys(suggestions: readonly CoachSuggestion[], dogId: string, events: readonly EventLike[], remembered: Readonly<Record<string, string>>): string[] {
  return suggestions.filter(sg => isPlanned(sg, dogId, events, remembered)).map(sg => sg.key);
}

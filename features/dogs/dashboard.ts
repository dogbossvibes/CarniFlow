import type { CalendarEvent } from '@/types/calendar';
import { backpackStatus, type BackpackStatus } from '@/features/dogs/backpack';

export { backpackStatus };
export type { BackpackStatus };

// Reine Logik für das persönliche Hunde-Dashboard (Overview-Tab). Seiteneffektfrei
// → direkt testbar. KEINE eigene Datenquelle: arbeitet auf bereits geladenen
// CalendarEvents + bereits abgeleiteten Kennzahlen (Heat/Ziel/Backpack/letztes Training).
// Ändert keine Kalender-/Trainings-/Zyklus-/Abo-Logik.

export interface DogAppointment {
  id:         string;
  title:      string;
  startAt:    string;          // ISO
  discipline: string | null;
  type:       string;          // EventType
  overdue:    boolean;
}

// ── Datum-Helfer (lokale Tagesgrenzen) ───────────────────────────────────────
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const isSameDay = (iso: string, now: Date): boolean => {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && startOfDay(d).getTime() === startOfDay(now).getTime();
};
export const isTomorrow = (iso: string, now: Date): boolean => {
  const d = new Date(iso);
  const t = new Date(startOfDay(now).getTime() + 86400000);
  return !Number.isNaN(d.getTime()) && startOfDay(d).getTime() === t.getTime();
};
const isOverdue = (iso: string, now: Date): boolean => {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < now.getTime();
};

// ── Termine für EINEN Hund: filtern, entdoppeln, sortieren ───────────────────
// Nur offene Termine (nicht abgesagt/erledigt), die diesem Hund zugeordnet sind.
// Sortierung: überfällig zuerst (chronologisch), danach kommende aufsteigend.
export function toDogAppointments(events: CalendarEvent[], dogId: string, now: Date = new Date()): DogAppointment[] {
  const belongs = (e: CalendarEvent) => e.dog_id === dogId || (Array.isArray(e.dog_ids) && e.dog_ids.includes(dogId));
  const open = (e: CalendarEvent) => e.status !== 'cancelled' && e.status !== 'completed';

  const mapped = events
    .filter(e => belongs(e) && open(e) && !!e.start_at)
    .map<DogAppointment>(e => ({
      id: e.id, title: e.title, startAt: e.start_at, discipline: e.discipline ?? null,
      type: e.type, overdue: isOverdue(e.start_at, now),
    }));

  return mapped.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;   // überfällig zuerst
    return a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : 0;   // dann chronologisch
  });
}

// ── „Heute mit {Hund}": priorisierte Hinweise (max. 4) ───────────────────────
export type TodayHintKind =
  | 'appointment_today' | 'appointment_overdue' | 'heat' | 'goal' | 'backpack' | 'last_activity';

export interface TodayHint {
  kind:        TodayHintKind;
  appointment?: DogAppointment;
}

export interface TodayContext {
  appointments:      DogAppointment[];
  heat?:             { daysUntil: number; active: boolean } | null;   // aus predictHeat
  goalTitle?:        string | null;
  backpackActive?:   number;
  backpackPacked?:   number;
  lastTrainingLabel?: string | null;
  now?:              Date;
}

const HEAT_SOON_DAYS = 45;

// Deterministisch, ohne erfundene Empfehlungen — nur reale, vorhandene Daten.
export function buildTodayHints(ctx: TodayContext): TodayHint[] {
  const now = ctx.now ?? new Date();
  const hints: TodayHint[] = [];

  // 1) Termin heute (nicht überfällig)
  const todayAppt = ctx.appointments.find(a => !a.overdue && isSameDay(a.startAt, now));
  if (todayAppt) hints.push({ kind: 'appointment_today', appointment: todayAppt });

  // 2) Überfälliger Termin
  const overdue = ctx.appointments.find(a => a.overdue);
  if (overdue) hints.push({ kind: 'appointment_overdue', appointment: overdue });

  // 3) Läufigkeit bald erwartet / aktuell
  if (ctx.heat && (ctx.heat.active || (ctx.heat.daysUntil >= 0 && ctx.heat.daysUntil <= HEAT_SOON_DAYS))) {
    hints.push({ kind: 'heat' });
  }

  // 4) Aktives Trainingsziel
  if (ctx.goalTitle) hints.push({ kind: 'goal' });

  // 5) Backpack offen (aktive Gegenstände, aber nicht alles eingepackt)
  if ((ctx.backpackActive ?? 0) > 0 && (ctx.backpackPacked ?? 0) < (ctx.backpackActive ?? 0)) {
    hints.push({ kind: 'backpack' });
  }

  // 6) Letzte Trainingsaktivität
  if (ctx.lastTrainingLabel) hints.push({ kind: 'last_activity' });

  return hints.slice(0, 4);
}

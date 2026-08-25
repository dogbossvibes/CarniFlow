import { supabase } from '@/lib/supabase';

// Läufigkeits-Zyklen — serverseitig in public.dog_heat_cycles (siehe
// DOG_HEAT_CYCLES.sql; RLS: owner voll, verbundene Trainer lesend).
// Phasen und Beobachtungen sind eigene Tabellen, die zu einem
// `heat_cycle_id` gehören. Ein Läufigkeits-Eintrag bleibt während der
// kompletten Läufigkeit identisch — Phasen werden als Sub-Records
// hinzugefügt, NIEMALS als neuer Heat-Cycle.

// ── Types ───────────────────────────────────────────────────────────────────

export interface HeatCycle {
  id:        string;
  dogId:     string;
  startDate: string;         // yyyy-mm-dd (Beginn der Läufigkeit)
  endDate:   string | null;  // yyyy-mm-dd (optional)
  status:    'active' | 'completed';
  notes:     string | null;
  /** Legacy: einzelne Phase auf dem Cycle (alt). Neue Phasen in HeatPhase. */
  phase:     string | null;
  createdAt: string;
}

export interface HeatPhase {
  id:           string;
  heatCycleId:  string;
  phaseType:    string;       // 'Proöstrus' | 'Östrus' | 'Diöstrus' | 'Anöstrus' | custom
  startDate:    string;       // yyyy-mm-dd
  endDate:      string | null;
  notes:        string | null;
  createdAt:    string;
}

export interface HeatObservation {
  id:           string;
  heatCycleId:  string;
  date:         string;       // yyyy-mm-dd
  type:         string;       // 'Blutung' | 'Vulva' | 'Rüdeninteresse' | etc.
  value:        string | null;
  notes:        string | null;
  createdAt:    string;
}

export interface HeatPrediction {
  nextDate:        string;         // yyyy-mm-dd (voraussichtlicher nächster Beginn)
  daysUntil:       number;         // Tage bis dahin (negativ = überfällig)
  avgCycleDays:    number | null;  // gemessene Ø-Zykluslänge (null = nur Schätzung)
  cycleDay:        number;         // Tage seit letztem Beginn
  cycleLengthDays: number;         // verwendete Zykluslänge (gemessen oder Default)
  estimate:        boolean;        // true = grobe Schätzung (nur 1 Zyklus / Default)
  active:          boolean;        // aktuell (vermutlich) läufig
  activeSinceDays: number | null;
  dateRange:       string | null;  // z.B. "20. Aug. – 8. Sep."
}

// ── Constants ───────────────────────────────────────────────────────────────

// Grobe Default-Zykluslänge, wenn noch nichts Gemessenes vorliegt (~6 Monate).
export const DEFAULT_CYCLE_DAYS = 180;
// Ohne Enddatum gilt eine Läufigkeit bis zu ~3 Wochen als „aktiv".
const ACTIVE_MAX_DAYS = 21;

// Erweiterte Phasen-Typen
export const HEAT_PHASE_TYPES = [
  'Proöstrus',
  'Östrus',
  'Diöstrus',
  'Anöstrus',
] as const;

// Einfache Phasen-Typen (Legacy / Kurzform)
export const HEAT_PHASE_TYPES_SIMPLE = [
  'Beginn',
  'Standhitze vermutet',
  'Standhitze',
  'Abklingphase',
  'Beendet',
] as const;

// Beobachtungs-Typen
export const HEAT_OBSERVATION_TYPES = [
  'Blutung',
  'Farbe der Blutung',
  'Vulva',
  'Rüdeninteresse',
  'Hündin duldet Rüden',
  'Standreflex',
  'Verhalten',
  'Temperatur',
  'Progesteronwert',
  'Tierarzt / Abstrich',
  'Notiz',
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

const DAY = 86400000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToCycle = (r: any): HeatCycle => ({
  id: r.id,
  dogId: r.dog_id,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status ?? 'active',
  notes: r.notes,
  phase: r.phase ?? null,
  createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToPhase = (r: any): HeatPhase => ({
  id: r.id,
  heatCycleId: r.heat_cycle_id,
  phaseType: r.phase_type,
  startDate: r.start_date,
  endDate: r.end_date,
  notes: r.notes,
  createdAt: r.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToObservation = (r: any): HeatObservation => ({
  id: r.id,
  heatCycleId: r.heat_cycle_id,
  date: r.date,
  type: r.type,
  value: r.value,
  notes: r.notes,
  createdAt: r.created_at,
});

// ── CRUD: Heat Cycles ───────────────────────────────────────────────────────

export async function getHeatCycles(dogId: string): Promise<HeatCycle[]> {
  const { data } = await supabase.from('dog_heat_cycles')
    .select('*').eq('dog_id', dogId).order('start_date', { ascending: false });
  return (data ?? []).map(rowToCycle);
}

export async function getHeatCycle(id: string): Promise<HeatCycle | null> {
  const { data } = await supabase.from('dog_heat_cycles')
    .select('*').eq('id', id).single();
  return data ? rowToCycle(data) : null;
}

export async function addHeatCycle(dogId: string, input: Omit<HeatCycle, 'id' | 'createdAt' | 'dogId'>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');
  return supabase.from('dog_heat_cycles').insert({
    owner_id: user.id,
    dog_id: dogId,
    start_date: input.startDate,
    end_date: input.endDate,
    status: input.status ?? 'active',
    notes: input.notes,
    phase: input.phase,
  }).select('id').single();
}

export async function updateHeatCycle(id: string, updates: {
  startDate?: string;
  endDate?: string | null;
  status?: 'active' | 'completed';
  notes?: string | null;
}) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.startDate !== undefined) payload.start_date = updates.startDate;
  if (updates.endDate !== undefined) payload.end_date = updates.endDate;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  return supabase.from('dog_heat_cycles').update(payload).eq('id', id);
}

export async function endHeatCycle(id: string) {
  return updateHeatCycle(id, {
    endDate: todayISO(),
    status: 'completed',
  });
}

export async function deleteHeatCycle(id: string) {
  return supabase.from('dog_heat_cycles').delete().eq('id', id);
}

// ── CRUD: Phases ────────────────────────────────────────────────────────────

export async function getHeatPhases(heatCycleId: string): Promise<HeatPhase[]> {
  const { data } = await supabase.from('dog_heat_phases')
    .select('*').eq('heat_cycle_id', heatCycleId).order('start_date', { ascending: true });
  return (data ?? []).map(rowToPhase);
}

export async function addHeatPhase(heatCycleId: string, input: Omit<HeatPhase, 'id' | 'createdAt' | 'heatCycleId'>, dogId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');
  return supabase.from('dog_heat_phases').insert({
    owner_id: user.id,
    dog_id: dogId ?? '',
    heat_cycle_id: heatCycleId,
    phase_type: input.phaseType,
    start_date: input.startDate,
    end_date: input.endDate,
    notes: input.notes,
  });
}

export async function updateHeatPhase(id: string, updates: {
  phaseType?: string;
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
}) {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.phaseType !== undefined) payload.phase_type = updates.phaseType;
  if (updates.startDate !== undefined) payload.start_date = updates.startDate;
  if (updates.endDate !== undefined) payload.end_date = updates.endDate;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  return supabase.from('dog_heat_phases').update(payload).eq('id', id);
}

export async function deleteHeatPhase(id: string) {
  return supabase.from('dog_heat_phases').delete().eq('id', id);
}

// ── CRUD: Observations ──────────────────────────────────────────────────────

export async function getHeatObservations(heatCycleId: string): Promise<HeatObservation[]> {
  const { data } = await supabase.from('dog_heat_observations')
    .select('*').eq('heat_cycle_id', heatCycleId).order('date', { ascending: true });
  return (data ?? []).map(rowToObservation);
}

export async function addHeatObservation(heatCycleId: string, input: Omit<HeatObservation, 'id' | 'createdAt' | 'heatCycleId'>, dogId?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');
  return supabase.from('dog_heat_observations').insert({
    owner_id: user.id,
    dog_id: dogId ?? '',
    heat_cycle_id: heatCycleId,
    date: input.date,
    type: input.type,
    value: input.value,
    notes: input.notes,
  });
}

export async function deleteHeatObservation(id: string) {
  return supabase.from('dog_heat_observations').delete().eq('id', id);
}

// ── Forecast ────────────────────────────────────────────────────────────────

// Prognose — NUR eine Schätzung. Bei ≥ 2 abgeschlossenen Zyklen: Ø der
// Start-zu-Start-Abstände; bei 1 Zyklus: grobe Default-Schätzung; bei 0: null.
export function predictHeat(cycles: HeatCycle[]): HeatPrediction | null {
  if (cycles.length === 0) return null;
  const asc = [...cycles].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)); // älteste zuerst
  const last = asc[asc.length - 1];
  const today = todayISO();
  const sinceStart = dayDiff(last.startDate, today);

  const active = sinceStart >= 0 && (
    last.endDate
      ? dayDiff(today, last.endDate) >= 0
      : last.status === 'active' || sinceStart <= ACTIVE_MAX_DAYS
  );

  let avgCycleDays: number | null = null;
  if (asc.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < asc.length; i++) gaps.push(dayDiff(asc[i - 1].startDate, asc[i].startDate));
    const valid = gaps.filter(g => g > 30 && g < 600); // unplausible Abstände ignorieren
    if (valid.length) avgCycleDays = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }
  const cycleLengthDays = avgCycleDays ?? DEFAULT_CYCLE_DAYS;
  const nextDate = addDays(last.startDate, cycleLengthDays);

  // Datumsbereich formatieren
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  };
  const dateRange = last.endDate
    ? `${fmtDate(last.startDate)} – ${fmtDate(last.endDate)}`
    : `Seit ${fmtDate(last.startDate)}`;

  return {
    nextDate,
    daysUntil:       dayDiff(today, nextDate),
    avgCycleDays,
    cycleDay:        Math.max(0, sinceStart),
    cycleLengthDays,
    estimate:        avgCycleDays == null,
    active,
    activeSinceDays: active ? Math.max(0, sinceStart) : null,
    dateRange,
  };
}

// ── Utility ─────────────────────────────────────────────────────────────────

/** Formatiert ein ISO-Datum als lokales Kurzformat */
export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Berechnet die Dauer in Tagen zwischen zwei Daten (inkl. Enddatum) */
export function durationDays(start: string, end: string | null): number | null {
  if (!end) return null;
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY) + 1);
}

/** Prüft ob ein Zyklus "aktiv" ist (basierend auf Status oder Datum) */
export function isActiveCycle(c: HeatCycle): boolean {
  if (c.status === 'active') return true;
  if (!c.endDate) {
    const sinceStart = dayDiff(c.startDate, todayISO());
    return sinceStart >= 0 && sinceStart <= ACTIVE_MAX_DAYS;
  }
  return dayDiff(todayISO(), c.endDate) >= 0;
}

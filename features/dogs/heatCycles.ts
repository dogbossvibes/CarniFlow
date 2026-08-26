import { supabase } from '@/lib/supabase';
import { fromISODate, toISODate } from '@/features/dogs/dateInput';

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
  cycleDay:        number;         // Zyklustag, Startdatum = Tag 1
  cycleLengthDays: number;         // verwendete Zykluslänge (gemessen oder Default)
  estimate:        boolean;        // true = grobe Schätzung (nur 1 Zyklus / Default)
  active:          boolean;        // aktuell (vermutlich) läufig
  /** Legacy alias for the inclusive cycle day while a cycle is active. */
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
const todayISO = () => toISODate(new Date());
const dayDiff = (a: string, b: string) => {
  const start = fromISODate(a);
  const end = fromISODate(b);
  return start && end ? Math.round((end.getTime() - start.getTime()) / DAY) : 0;
};
const addDays = (iso: string, n: number) => {
  const date = fromISODate(iso);
  if (!date) return iso;
  date.setDate(date.getDate() + n);
  return toISODate(date);
};

/**
 * Inclusive heat-cycle day using date-only local calendar values.
 * The start date is always day 1, including over month/year/DST boundaries.
 */
export function heatCycleDay(startDate: string, onDate = todayISO()): number {
  return Math.max(1, dayDiff(startDate, onDate) + 1);
}

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

const rowToPhase = (r: any): HeatPhase => ({
  id: r.id,
  heatCycleId: r.heat_cycle_id,
  phaseType: r.phase_type,
  startDate: r.start_date,
  endDate: r.end_date,
  notes: r.notes,
  createdAt: r.created_at,
});

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

/**
 * Calendar/list views need all heat children at once. Keep the existing CRUD
 * methods intact, but avoid one phase/observation query per cycle.
 */
export async function getHeatCycleDetails(dogId: string): Promise<{
  cycles: HeatCycle[];
  phases: HeatPhase[];
  observations: HeatObservation[];
}> {
  const cycles = await getHeatCycles(dogId);
  if (cycles.length === 0) return { cycles, phases: [], observations: [] };

  const cycleIds = cycles.map(cycle => cycle.id);
  const [{ data: phaseRows, error: phaseError }, { data: observationRows, error: observationError }] = await Promise.all([
    supabase.from('dog_heat_phases').select('*').in('heat_cycle_id', cycleIds).order('start_date', { ascending: true }),
    supabase.from('dog_heat_observations').select('*').in('heat_cycle_id', cycleIds).order('date', { ascending: true }),
  ]);
  if (phaseError) throw phaseError;
  if (observationError) throw observationError;
  return {
    cycles,
    phases: (phaseRows ?? []).map(rowToPhase),
    observations: (observationRows ?? []).map(rowToObservation),
  };
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
  const cycleDay = heatCycleDay(last.startDate, today);

  // Datumsbereich formatieren
  const fmtDate = (iso: string) => {
    const d = fromISODate(iso);
    if (!d) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' });
  };
  const dateRange = last.endDate
    ? `${fmtDate(last.startDate)} – ${fmtDate(last.endDate)}`
    : `Seit ${fmtDate(last.startDate)}`;

  return {
    nextDate,
    daysUntil:       dayDiff(today, nextDate),
    avgCycleDays,
    cycleDay,
    cycleLengthDays,
    estimate:        avgCycleDays == null,
    active,
    activeSinceDays: active ? cycleDay : null,
    dateRange,
  };
}

// ── Utility ─────────────────────────────────────────────────────────────────

/** Formatiert ein ISO-Datum als lokales Kurzformat */
export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = fromISODate(iso);
  if (!d) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Berechnet die Dauer in Tagen zwischen zwei Daten (inkl. Enddatum) */
export function durationDays(start: string, end: string | null): number | null {
  if (!end) return null;
  const startDate = fromISODate(start);
  const endDate = fromISODate(end);
  if (!startDate || !endDate) return null;
  return Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / DAY) + 1);
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

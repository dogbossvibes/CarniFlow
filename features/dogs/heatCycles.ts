import { supabase } from '@/lib/supabase';

// Läufigkeits-Zyklen — serverseitig in public.dog_heat_cycles (siehe
// DOG_HEAT_CYCLES.sql; RLS: owner voll, verbundene Trainer lesend). Bis die
// Tabelle angelegt ist, liefern die Reads defensiv [] (kein Crash).

export interface HeatCycle {
  id:        string;
  startDate: string;         // yyyy-mm-dd (Beginn der Läufigkeit)
  endDate:   string | null;  // yyyy-mm-dd (optional)
  phase:     string | null;  // Proöstrus | Östrus | Diöstrus | Anöstrus (optional)
  notes:     string | null;
  createdAt: string;
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
}

// Grobe Default-Zykluslänge, wenn noch nichts Gemessenes vorliegt (~6 Monate).
export const DEFAULT_CYCLE_DAYS = 180;
// Ohne Enddatum gilt eine Läufigkeit bis zu ~3 Wochen als „aktiv".
const ACTIVE_MAX_DAYS = 21;

const DAY = 86400000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY).toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rowToCycle = (r: any): HeatCycle => ({
  id: r.id, startDate: r.start_date, endDate: r.end_date, phase: r.phase, notes: r.notes, createdAt: r.created_at,
});

export async function getHeatCycles(dogId: string): Promise<HeatCycle[]> {
  const { data } = await supabase.from('dog_heat_cycles')
    .select('*').eq('dog_id', dogId).order('start_date', { ascending: false }); // neueste zuerst
  return (data ?? []).map(rowToCycle);
}

export async function addHeatCycle(dogId: string, input: Omit<HeatCycle, 'id' | 'createdAt'>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Nicht eingeloggt');
  return supabase.from('dog_heat_cycles').insert({
    owner_id: user.id, dog_id: dogId,
    start_date: input.startDate, end_date: input.endDate, phase: input.phase, notes: input.notes,
  });
}

export async function deleteHeatCycle(id: string) {
  return supabase.from('dog_heat_cycles').delete().eq('id', id);
}

// Prognose — NUR eine Schätzung. Bei ≥ 2 Zyklen: Ø der Start-zu-Start-Abstände;
// bei 1 Zyklus: grobe Default-Schätzung; bei 0: null (Empty State).
export function predictHeat(cycles: HeatCycle[]): HeatPrediction | null {
  if (cycles.length === 0) return null;
  const asc = [...cycles].sort((a, b) => (a.startDate < b.startDate ? -1 : 1)); // älteste zuerst
  const last = asc[asc.length - 1];
  const today = todayISO();
  const sinceStart = dayDiff(last.startDate, today);

  const active = sinceStart >= 0 && (last.endDate ? dayDiff(today, last.endDate) >= 0 : sinceStart <= ACTIVE_MAX_DAYS);

  let avgCycleDays: number | null = null;
  if (asc.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < asc.length; i++) gaps.push(dayDiff(asc[i - 1].startDate, asc[i].startDate));
    const valid = gaps.filter(g => g > 30 && g < 600); // unplausible Abstände ignorieren
    if (valid.length) avgCycleDays = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  }
  const cycleLengthDays = avgCycleDays ?? DEFAULT_CYCLE_DAYS;
  const nextDate = addDays(last.startDate, cycleLengthDays);

  return {
    nextDate,
    daysUntil:       dayDiff(today, nextDate),
    avgCycleDays,
    cycleDay:        Math.max(0, sinceStart),
    cycleLengthDays,
    estimate:        avgCycleDays == null,
    active,
    activeSinceDays: active ? Math.max(0, sinceStart) : null,
  };
}

import { supabase } from '@/lib/supabase';
import { isFemaleDog } from '@/components/dogs/types';
import { fromISODate, toISODate } from './dateInput';
import type { HeatCycle, HeatObservation } from './heatCycles';

export type DailyHeatDraft = { date: string; bleeding: string | null; behavior: string | null; standing: boolean; notes: string };
export type ObservationInput = Pick<HeatObservation, 'id' | 'date' | 'type' | 'value' | 'notes'>;

// Use existing, language-independent legacy values; never translate stored data.
export function dailyHeatRows(draft: DailyHeatDraft, id: () => string): ObservationInput[] {
  const rows: ObservationInput[] = [];
  const add = (type: string, value: string | null, notes: string | null = null) => rows.push({ id: id(), date: draft.date, type, value, notes });
  if (draft.bleeding) add('Blutung', draft.bleeding);
  if (draft.behavior) add('Verhalten', draft.behavior);
  if (draft.standing) add('Standreflex', 'Beobachtet');
  if (draft.notes.trim()) add('Notiz', null, draft.notes.trim());
  return rows;
}

// The overview describes the recorded state, not a medically inferred phase.
export function recordedActiveCycle(cycles: HeatCycle[], today: string): HeatCycle | null {
  return [...cycles].filter(c => c.status === 'active' && !c.endDate && c.startDate <= today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

async function assertHeatWriter(dogId: string, cycleId: string, expectedUserId: string) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.id !== expectedUserId) throw new Error('Heat access changed');
  const { data: dog, error: dogError } = await supabase.from('dogs').select('id,gender,owner_id').eq('id', dogId).single();
  if (dogError || !isFemaleDog(dog) || dog?.owner_id !== expectedUserId) throw new Error('Heat write unavailable');
  const { data: cycle, error } = await supabase.from('dog_heat_cycles').select('id,dog_id,owner_id,start_date,end_date,status').eq('id', cycleId).single();
  if (error || !cycle || cycle.dog_id !== dogId || cycle.owner_id !== expectedUserId) throw new Error('Heat cycle unavailable');
  return cycle;
}

export async function saveDailyHeatRows(dogId: string, cycleId: string, userId: string, rows: ObservationInput[]) {
  if (!rows.length || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Empty or invalid observation');
  const cycle = await assertHeatWriter(dogId, cycleId, userId);
  const today = toISODate(new Date());
  if (rows.some(row => (!fromISODate(row.date) || toISODate(fromISODate(row.date)!) !== row.date) || row.date < cycle.start_date || row.date > today || (cycle.end_date && row.date > cycle.end_date))) throw new Error('Invalid observation date');
  // Stable client IDs make a retry after a lost response safe. No upsert and no
  // overwrite of existing observations; confirm an earlier identical insert.
  const confirmExisting = async () => {
    const { data: existing, error: readError } = await supabase.from('dog_heat_observations').select('*').in('id', rows.map(row => row.id));
    if (readError) throw readError;
    if (!existing?.length) return false;
    if (existing.length !== rows.length || !rows.every(row => existing.some(old =>
      old.id === row.id && old.heat_cycle_id === cycleId && old.dog_id === dogId && old.owner_id === userId &&
      old.date === row.date && old.type === row.type && old.value === row.value && old.notes === row.notes))) throw new Error('Observation conflict');
    return true;
  };
  if (await confirmExisting()) return;
  // One PostgreSQL INSERT statement: all selected observations succeed or none.
  // If the response was lost or another identical retry won the race, read back
  // exactly these IDs. A conflicting or partial result is never called success.
  try {
    const { error } = await supabase.from('dog_heat_observations').insert(rows.map(row => ({ ...row, heat_cycle_id: cycleId, dog_id: dogId, owner_id: userId })));
    if (error) throw error;
  } catch (error) {
    if (await confirmExisting()) return;
    throw error;
  }
}

export async function finishRecordedHeat(dogId: string, cycleId: string, userId: string, endDate: string) {
  const cycle = await assertHeatWriter(dogId, cycleId, userId);
  if ((!fromISODate(endDate) || toISODate(fromISODate(endDate)!) !== endDate) || endDate < cycle.start_date || endDate > toISODate(new Date())) throw new Error('Invalid end date');
  if (cycle.status !== 'active' || cycle.end_date) throw new Error('Heat cycle already ended');
  const { data, error } = await supabase.from('dog_heat_cycles').update({ end_date: endDate, status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', cycleId).eq('dog_id', dogId).eq('owner_id', userId).eq('status', 'active').is('end_date', null).select('id');
  if (error || data?.length !== 1) throw error ?? new Error('Heat cycle changed');
}

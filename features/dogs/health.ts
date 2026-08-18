import type { DogDewormingEntryRow, DogHealthEntryRow } from '@/services/dogHub';

export interface WeightChange {
  current: number;
  previous: number | null;
  delta: number | null;
}

function timestamp(entry: Pick<DogHealthEntryRow, 'entry_date' | 'created_at'>): number {
  const value = `${entry.entry_date}T${entry.created_at ? new Date(entry.created_at).toTimeString().slice(0, 8) : '00:00:00'}`;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

// Nur echte Messwerte gehören in die Premium-Zeitreihe. Die Sortierung ist auch
// bei mehreren Einträgen am selben Tag stabil (created_at als zweiter Schlüssel).
export function weightMeasurements(entries: DogHealthEntryRow[]): DogHealthEntryRow[] {
  return entries
    .filter((entry): entry is DogHealthEntryRow & { weight_kg: number } =>
      typeof entry.weight_kg === 'number' && Number.isFinite(entry.weight_kg))
    .slice()
    .sort((a, b) => timestamp(a) - timestamp(b));
}

export function weightChange(entries: DogHealthEntryRow[]): WeightChange | null {
  const measurements = weightMeasurements(entries);
  const current = measurements.at(-1)?.weight_kg;
  if (current == null) return null;
  const previous = measurements.at(-2)?.weight_kg ?? null;
  return { current, previous, delta: previous == null ? null : current - previous };
}

export function latestDeworming(entries: DogDewormingEntryRow[]): DogDewormingEntryRow | null {
  return entries.slice().sort((a, b) => {
    const date = b.treatment_date.localeCompare(a.treatment_date);
    return date || (b.created_at ?? '').localeCompare(a.created_at ?? '');
  })[0] ?? null;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

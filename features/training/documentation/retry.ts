import type { TrainingExercise, TrainingUnit } from '@/types/trainingUnit';

const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = Object.keys(a).sort(); const right = Object.keys(b).sort();
    return equal(left, right) && left.every(k => equal((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
};
export function trainingUnitFingerprint(unit: TrainingUnit): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
    return value;
  };
  const { dog: _dog, exercises, ...row } = unit;
  return JSON.stringify(canonical({ row, exercises: [...(exercises ?? [])]
    .sort((a, b) => (a.id ?? String(a.seq_index)).localeCompare(b.id ?? String(b.seq_index))) }));
}
// Conservative reconciliation for a lost create acknowledgement. A partial or
// changed record is never overwritten/reinserted as a supposed retry repair.
// This is not an atomic server transaction or a cross-device lock.
export function isConfirmedDocumentedRetry(existing: TrainingUnit, ownerId: string,
  unit: object, exercises: readonly Omit<TrainingExercise, 'id' | 'unit_id' | 'created_at'>[]): boolean {
  if (existing.owner_id !== ownerId || existing.status !== 'completed') return false;
  if (Object.entries(unit).some(([k, v]) => !equal((existing as unknown as Record<string, unknown>)[k] ?? null, v ?? null))) return false;
  const fields = (e: Omit<TrainingExercise, 'id' | 'unit_id' | 'created_at'>) => ({
    discipline: e.discipline, exercise_name: e.exercise_name, rating: e.rating ?? null,
    notes: e.notes ?? null, duration_sec: e.duration_sec ?? null, seq_index: e.seq_index,
  });
  const sorted = (rows: readonly Omit<TrainingExercise, 'id' | 'unit_id' | 'created_at'>[]) =>
    [...rows].sort((a, b) => a.seq_index - b.seq_index).map(fields);
  return equal(sorted(existing.exercises ?? []), sorted(exercises));
}

import type { TrainingExercise, TrainingUnit } from '@/types/trainingUnit';

export type PlannedExercise = {
  key: string;
  discipline: string;
  name: string;
  rating: number | null;
  notes: string | null;
  performed: boolean;
  durationSec?: number | null;
  nextFocus?: string;
  nextFocusId?: string;
  sourceUnitId?: string;
  sourceExerciseId?: string;
  exerciseKey?: string;
  disciplineKey?: string | null;
  identityNew?: boolean;
};

export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function measuredMinutes(seconds?: string): number | null {
  if (!seconds?.trim()) return null;
  const n = Number(seconds);
  return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n / 60)) : null;
}

export function relevantUnits(units: readonly TrainingUnit[], ownerId: string, dogId: string, discipline: string): TrainingUnit[] {
  return units.filter(u => u.owner_id === ownerId && u.dog_id === dogId && u.status === 'completed'
    && u.exercises?.some(e => e.discipline === discipline))
    .sort((a, b) => b.session_date.localeCompare(a.session_date) || b.created_at.localeCompare(a.created_at));
}

// Explicit reuse of a selected historical row. Never infer identity from its
// display name, and never copy a past performance, media or trainer permission.
export function planFromHistory(unit: TrainingUnit, exercise: TrainingExercise, key: string): PlannedExercise {
  return {
    key, discipline: exercise.discipline, name: exercise.exercise_name,
    rating: null, notes: null, performed: false,
    sourceUnitId: unit.id, sourceExerciseId: exercise.id,
    exerciseKey: exercise.exercise_identity_id ?? undefined,
    disciplineKey: exercise.discipline_key,
  };
}

export function lastExerciseHistory(units: readonly TrainingUnit[], exercise: PlannedExercise): { unit: TrainingUnit; exercise: TrainingExercise }[] {
  const result: { unit: TrainingUnit; exercise: TrainingExercise }[] = [];
  for (const unit of units) {
    const matches = unit.exercises?.filter(e => e.discipline === exercise.discipline && (
      (exercise.exerciseKey && e.exercise_identity_id === exercise.exerciseKey)
        || (unit.id === exercise.sourceUnitId && !!exercise.sourceExerciseId && e.id === exercise.sourceExerciseId)
    )) ?? [];
    // Ambiguous legacy records are not assigned by name or array position.
    if (matches.length === 1) result.push({ unit, exercise: matches[0] });
  }
  return result;
}

export function performedExercises(selected: readonly PlannedExercise[]) {
  return selected.filter(e => e.performed).map((e, i) => ({
    discipline: e.discipline, exercise_name: e.name, rating: e.rating,
    notes: e.notes?.trim() || null, duration_sec: e.durationSec ?? null, seq_index: i,
  }));
}

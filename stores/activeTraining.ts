import { useSyncExternalStore } from 'react';

// Flüchtiger Zustand der LAUFENDEN Trainingseinheit (vor dem Speichern).
// Bewusst ohne externe State-Lib: ein minimaler Store über
// useSyncExternalStore, geteilt über alle unit/-Screens hinweg.

export interface DraftExercise {
  discipline:    string;
  exercise_name: string;
  rating:        number | null;
  notes:         string | null;
  duration_sec:  number | null;
}

interface ActiveTrainingState {
  unitId:    string | null;
  dogId:     string | null;
  dogName:   string | null;
  startedAt: number | null;        // Date.now() beim Start
  exercises: DraftExercise[];
}

const EMPTY: ActiveTrainingState = {
  unitId:    null,
  dogId:     null,
  dogName:   null,
  startedAt: null,
  exercises: [],
};

let state: ActiveTrainingState = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function set(patch: Partial<ActiveTrainingState>) {
  state = { ...state, ...patch };
  emit();
}

// ── Actions ───────────────────────────────────────────────────
export function startUnit(args: { unitId: string; dogId: string; dogName: string | null }) {
  state = { unitId: args.unitId, dogId: args.dogId, dogName: args.dogName, startedAt: Date.now(), exercises: [] };
  emit();
}

export function addExercise(ex: DraftExercise) {
  set({ exercises: [...state.exercises, ex] });
}

export function updateExercise(index: number, patch: Partial<DraftExercise>) {
  set({
    exercises: state.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)),
  });
}

export function removeExercise(index: number) {
  set({ exercises: state.exercises.filter((_, i) => i !== index) });
}

export function resetUnit() {
  state = EMPTY;
  emit();
}

// ── Hook ──────────────────────────────────────────────────────
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

export function useActiveTraining(): ActiveTrainingState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

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
  // Pause-Verwaltung (geteilt von Live-Screen + Live-Bar)
  paused:        boolean;
  pausedAt:      number | null;    // Date.now() beim Pausieren
  accumPausedMs: number;           // bisher pausierte Gesamtzeit
}

const EMPTY: ActiveTrainingState = {
  unitId:    null,
  dogId:     null,
  dogName:   null,
  startedAt: null,
  exercises: [],
  paused:        false,
  pausedAt:      null,
  accumPausedMs: 0,
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
  state = {
    unitId: args.unitId, dogId: args.dogId, dogName: args.dogName,
    startedAt: Date.now(), exercises: [],
    paused: false, pausedAt: null, accumPausedMs: 0,
  };
  emit();
}

export function pauseUnit() {
  if (state.paused || state.startedAt == null) return;
  state = { ...state, paused: true, pausedAt: Date.now() };
  emit();
}

export function resumeUnit() {
  if (!state.paused) return;
  const add = state.pausedAt != null ? Date.now() - state.pausedAt : 0;
  state = { ...state, paused: false, pausedAt: null, accumPausedMs: state.accumPausedMs + add };
  emit();
}

// Vergangene Trainingszeit in ms (Pausen herausgerechnet). `now` von außen,
// damit Komponenten im Sekundentakt aktualisieren können.
export function elapsedMs(s: ActiveTrainingState, now: number): number {
  if (s.startedAt == null) return 0;
  const pausedNow = s.paused && s.pausedAt != null ? now - s.pausedAt : 0;
  return Math.max(0, now - s.startedAt - s.accumPausedMs - pausedNow);
}

// Zuletzt gewählte Sparte (für die Live-Bar-Anzeige).
export function currentDiscipline(s: ActiveTrainingState): string | null {
  return s.exercises.length ? s.exercises[s.exercises.length - 1].discipline : null;
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

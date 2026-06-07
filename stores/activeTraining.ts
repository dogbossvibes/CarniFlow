import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Zustand der LAUFENDEN Trainingseinheit (vor dem Speichern). Über
// useSyncExternalStore geteilt + in AsyncStorage persistiert, damit eine
// laufende Einheit App-Wechsel/Neustart übersteht. Der Timer ist zeitstempel-
// basiert (startedAt/pausedAt) und läuft dadurch korrekt weiter.

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
  goalMinutes:   number;           // Trainingsziel (steuert den Fortschrittsring)
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
  goalMinutes:   60,
};

const STORAGE_KEY = 'active_training';
const MAX_AGE_MS  = 24 * 60 * 60 * 1000;   // ältere Einheiten verwerfen

let state: ActiveTrainingState = EMPTY;
const listeners = new Set<() => void>();

function persist() {
  // Nur eine echte laufende Einheit speichern, sonst Eintrag entfernen.
  if (state.unitId) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  else              AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

function emit() {
  for (const l of listeners) l();
  persist();
}

// Beim App-Start eine noch laufende Einheit wiederherstellen.
AsyncStorage.getItem(STORAGE_KEY)
  .then(raw => {
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as ActiveTrainingState;
      if (saved?.unitId && saved.startedAt && Date.now() - saved.startedAt < MAX_AGE_MS) {
        state = { ...EMPTY, ...saved };
        for (const l of listeners) l();   // ohne erneutes persist
      } else {
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      }
    } catch { /* defekt → ignorieren */ }
  })
  .catch(() => {});

function set(patch: Partial<ActiveTrainingState>) {
  state = { ...state, ...patch };
  emit();
}

// ── Actions ───────────────────────────────────────────────────
export function startUnit(args: { unitId: string; dogId: string; dogName: string | null }) {
  state = {
    unitId: args.unitId, dogId: args.dogId, dogName: args.dogName,
    startedAt: Date.now(), exercises: [],
    paused: false, pausedAt: null, accumPausedMs: 0, goalMinutes: 60,
  };
  emit();
}

export function setGoalMinutes(min: number) {
  state = { ...state, goalMinutes: min };
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

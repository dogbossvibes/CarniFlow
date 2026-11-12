import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/hooks/useSession';
import { getAtomicTrainingDocument } from '@/services/trainingDocumentService';
import { clearDocumentDraft, loadDocumentDraft, saveDocumentDraft } from '@/features/training/documentation/draft';
import type { TrainingMetrics } from '@/types/analytics';

export interface TrainingSummaryDraft {
  operationId: string; rating: number | null; notes: string; metrics: TrainingMetrics; durationSec: number; pending: boolean;
}

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
  hydrating?: boolean;
  hydrationError?: boolean;
  summaryDraft?: TrainingSummaryDraft;
  ownerId: string | null;
  sourceFingerprint: string | null;
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
  ownerId: null, sourceFingerprint: null,
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

const LOADING: ActiveTrainingState = { ...EMPTY, hydrating: true };
const LEGACY_KEY = 'active_training';
const keyFor = (owner: string) => `active_training_v2:${encodeURIComponent(owner)}`;
let state: ActiveTrainingState = EMPTY;
let desiredOwner: string | null = null;
let generation = 0;
let mutation = 0;
let hydratedOwner: string | null = null;
const cached = new Map<string, ActiveTrainingState>();
const listeners = new Set<() => void>();
function persist(value = state) {
  if (!value.ownerId || (!value.unitId && hydratedOwner !== value.ownerId)) return Promise.resolve();
  cached.set(value.ownerId, value);
  return value.unitId ? saveDocumentDraft(keyFor(value.ownerId), value) : clearDocumentDraft(keyFor(value.ownerId));
}
function emit() {
  mutation++;
  for (const l of listeners) l();
  void persist().catch(() => {});
}
function valid(value: unknown): value is ActiveTrainingState {
  if (!value || typeof value !== 'object') return false;
  const v = value as ActiveTrainingState;
  return typeof v.unitId === 'string' && typeof v.dogId === 'string' && Number.isFinite(v.startedAt)
    && Array.isArray(v.exercises) && v.exercises.every(e => e && typeof e.exercise_name === 'string' && typeof e.discipline === 'string');
}
function activateOwner(owner: string | null) {
  if (desiredOwner === owner) return;
  void persist().catch(() => {});
  desiredOwner = owner;
  const ticket = ++generation;
  const hasCached = !!owner && cached.has(owner);
  state = owner ? cached.get(owner) ?? { ...EMPTY, ownerId: owner, hydrating: true } : EMPTY;
  hydratedOwner = hasCached ? owner : null;
  const version = ++mutation;
  for (const l of listeners) l();
  if (!owner || hasCached) return;
  void (async () => {
    const stored = await loadDocumentDraft<unknown>(keyFor(owner));
    if (stored != null && (!valid(stored) || stored.ownerId !== owner)) throw new Error('Invalid active training draft');
    let saved: ActiveTrainingState | null = valid(stored) && stored.ownerId === owner ? stored : null;
    let legacy = false;
    if (!saved && !state.unitId) {
      const raw = await AsyncStorage.getItem(LEGACY_KEY);
      if (raw) {
        const candidate: unknown = JSON.parse(raw);
        if (valid(candidate) && (!candidate.ownerId || candidate.ownerId === owner)) {
          const verified = await getAtomicTrainingDocument(owner, candidate.unitId!, () => desiredOwner === owner && generation === ticket);
          if (verified.error && verified.error.code !== 'NOT_FOUND') throw new Error('Legacy training verification unavailable');
          if (!verified.error && verified.data.unit.dog_id === candidate.dogId) { saved = { ...EMPTY, ...candidate, ownerId: owner }; legacy = true; }
        }
      }
    }
    // A delayed A read must never replace B, or a newly started local unit.
    if (desiredOwner !== owner || ticket !== generation || version !== mutation) return;
    hydratedOwner = owner;
    state = saved ? { ...EMPTY, ...saved, hydrating: false, hydrationError: false } : { ...EMPTY, ownerId: owner, hydrating: false };
    emit();
    if (legacy) {
      // Copy must succeed before retiring the old global key. No time-based
      // deletion of customer drafts, even when older than24hours.
      await persist(state);
      await AsyncStorage.removeItem(LEGACY_KEY);
    }
  })().catch(() => {
    // Keep old bytes; never overwrite a draft that could not be read.
    if (desiredOwner === owner && ticket === generation && version === mutation) {
      state = { ...EMPTY, ownerId: owner, hydrating: false, hydrationError: true };
      for (const l of listeners) l();
    }
  });
}

const writable = (owner?: string, allowPending = false) => !!desiredOwner && state.ownerId === desiredOwner && (!owner || owner === desiredOwner) && (allowPending || !state.summaryDraft?.pending);
function set(patch: Partial<ActiveTrainingState>, owner?: string) {
  if (!writable(owner)) return;
  state = { ...state, ...patch };
  emit();
}

// ── Actions ───────────────────────────────────────────────────
export function startUnit(args: { unitId: string; dogId: string; dogName: string | null; ownerId?: string; sourceFingerprint?: string }) {
  if (args.ownerId && (desiredOwner !== args.ownerId || hydratedOwner !== args.ownerId) || state.summaryDraft?.pending) return false;
  void persist().catch(() => {});
  state = {
    unitId: args.unitId, dogId: args.dogId, dogName: args.dogName,
    ownerId: args.ownerId ?? desiredOwner, sourceFingerprint: args.sourceFingerprint ?? null,
    startedAt: Date.now(), exercises: [],
    paused: false, pausedAt: null, accumPausedMs: 0, goalMinutes: 60,
  };
  hydratedOwner = state.ownerId;
  emit();
  return true;
}

export function setGoalMinutes(min: number, owner?: string) {
  if (!writable(owner)) return;
  state = { ...state, goalMinutes: min };
  emit();
}

export function pauseUnit(owner?: string) {
  if (!writable(owner)) return;
  if (state.paused || state.startedAt == null) return;
  state = { ...state, paused: true, pausedAt: Date.now() };
  emit();
}

export function resumeUnit(owner?: string) {
  if (!writable(owner)) return;
  if (!state.paused) return;
  const add = state.pausedAt != null ? Date.now() - state.pausedAt : 0;
  state = { ...state, paused: false, pausedAt: null, accumPausedMs: state.accumPausedMs + add };
  emit();
}

// Vergangene Trainingszeit in ms (Pausen herausgerechnet). `now` von aussen,
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

export function addExercise(ex: DraftExercise, owner?: string) {
  set({ exercises: [...state.exercises, ex] }, owner);
}

export function updateExercise(index: number, patch: Partial<DraftExercise>, owner?: string) {
  set({
    exercises: state.exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)),
  }, owner);
}

export function removeExercise(index: number, owner?: string) {
  set({ exercises: state.exercises.filter((_, i) => i !== index) }, owner);
}

export function resetUnit(owner?: string) {
  if (!writable(owner, true)) return false;
  state = { ...EMPTY, ownerId: desiredOwner };
  hydratedOwner = desiredOwner;
  emit();
  return true;
}

export function updateSummaryDraft(draft: TrainingSummaryDraft, owner: string) {
  if (!writable(owner, true) || !state.unitId) return;
  state = { ...state, summaryDraft: draft }; emit();
}
export function saveActiveTrainingDraft(owner: string): Promise<void> {
  return writable(owner, true) ? persist(state) : Promise.reject(new Error('Training context changed'));
}

// ── Hook ──────────────────────────────────────────────────────
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

export function retryActiveTrainingLoad(owner: string) {
  if (desiredOwner !== owner || state.unitId) return;
  cached.delete(owner); hydratedOwner = null; desiredOwner = null;
  activateOwner(owner);
}

export function useActiveTraining(): ActiveTrainingState {
  const { session } = useSession();
  const owner = session?.user.id ?? null;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { activateOwner(owner); }, [owner]);
  return owner ? snapshot.ownerId === owner ? snapshot : LOADING : EMPTY;
}

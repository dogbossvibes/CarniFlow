import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useSession } from '@/hooks/useSession';
import { localToday } from '@/features/ai/coachWeek/input';
import { EMPTY_PROGRESS, loadProgress, saveProgress, withAnswer, withQuizDay, withRead } from './progress';
import type { KnowledgeProgress } from './types';

// Lernfortschritt der angemeldeten Person (nur auf dem Gerät), gemeinsam für alle offenen
// Wissen-Bildschirme. Ohne Anmeldung bleibt der Stand im Speicher und wird nicht abgelegt.

let state: { uid: string | null; progress: KnowledgeProgress; loaded: boolean } = { uid: null, progress: EMPTY_PROGRESS, loaded: false };
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const snapshot = () => state;

function ensureLoaded(uid: string | null) {
  if (state.uid === uid && state.loaded) return;
  state = { uid, progress: EMPTY_PROGRESS, loaded: false };
  emit();
  (uid ? loadProgress(uid) : Promise.resolve(EMPTY_PROGRESS)).then(p => {
    if (state.uid !== uid) return;
    state = { uid, progress: p, loaded: true };
    emit();
  });
}

function update(fn: (p: KnowledgeProgress) => KnowledgeProgress) {
  if (!state.loaded) return;
  const next = fn(state.progress);
  if (next === state.progress) return;
  state = { ...state, progress: next };
  emit();
  if (state.uid) saveProgress(state.uid, next).catch(() => { /* bleibt im Speicher; nächster Schritt speichert erneut */ });
}

/** Nur für Tests. */
export function __resetKnowledgeStore() { state = { uid: null, progress: EMPTY_PROGRESS, loaded: false }; emit(); }

export function useKnowledge() {
  const { session } = useSession();
  const uid = session?.user.id ?? null;
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { ensureLoaded(uid); }, [uid]);
  const current = s.uid === uid ? s : { uid, progress: EMPTY_PROGRESS, loaded: false };

  return {
    progress: current.progress,
    loaded: current.loaded,
    today: localToday(),
    seed: uid ?? '',
    answer: useCallback((questionId: string, right: boolean) => update(p => withAnswer(p, questionId, right, localToday())), []),
    finishDaily: useCallback(() => update(p => withQuizDay(p, localToday())), []),
    markRead: useCallback((articleId: string) => update(p => withRead(p, articleId)), []),
  };
}

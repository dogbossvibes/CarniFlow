import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HELP_TOPICS, type HelpTopicId } from '@/features/help/helpRegistry';

// ──────────────────────────────────────────────────────────────────────────
// Pro-Nutzer „gesehen"-Status für Coachmarks/Hilfe. Lokal (AsyncStorage),
// Key `help_seen_topics:<userId>` — KEINE DB-Migration, nicht global.
// Robuster Fallback bei fehlendem/beschädigtem State. Spiegelt das Muster von
// stores/homeScreenConfig.ts.
// ──────────────────────────────────────────────────────────────────────────

export const keyForUser = (userId?: string | null) => `help_seen_topics:${userId || 'anon'}`;

const VALID = new Set<HelpTopicId>(Object.keys(HELP_TOPICS) as HelpTopicId[]);

// Nur gültige, deduplizierte Topic-IDs — nie crashen.
export function sanitizeSeen(raw: unknown): HelpTopicId[] {
  const out: HelpTopicId[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) if (VALID.has(x as HelpTopicId) && !out.includes(x as HelpTopicId)) out.push(x as HelpTopicId);
  }
  return out;
}

let currentUserId: string | null = null;
let hydratedFor: string | null | undefined = undefined;
let state: HelpTopicId[] = [];
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

async function hydrate(userId: string | null) {
  currentUserId = userId;
  try {
    const raw = await AsyncStorage.getItem(keyForUser(userId));
    state = sanitizeSeen(raw ? JSON.parse(raw) : null);
  } catch { state = []; }
  hydratedFor = userId;
  emit();
}

function persist() {
  AsyncStorage.setItem(keyForUser(currentUserId), JSON.stringify(state)).catch(() => { /* best-effort */ });
}

// Topic als gesehen markieren (idempotent).
export function markHelpSeen(id: HelpTopicId) {
  if (!VALID.has(id) || state.includes(id)) return;
  state = [...state, id];
  emit();
  persist();
}

// Alle Hinweise zurücksetzen (nur Help-State, keine anderen Einstellungen).
export function resetHelpSeen() {
  state = [];
  emit();
  persist();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getSnapshot = () => state;

// Hook: hydriert pro Nutzer und liefert die reaktive „gesehen"-Liste.
export function useHelpSeen(userId: string | null | undefined): HelpTopicId[] {
  const seen = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const uid = userId ?? null;
    if (hydratedFor !== uid) void hydrate(uid);
  }, [userId]);
  return seen;
}

// Wie useHelpSeen, liefert zusätzlich `hydrated`: erst true, wenn der Storage
// für diesen Nutzer geladen wurde. Verhindert, dass Auto-Coachmarks vor dem
// Laden fälschlich erscheinen (Snapshot startet leer).
export function useHelpSeenState(userId: string | null | undefined): { seen: HelpTopicId[]; hydrated: boolean } {
  const seen = useHelpSeen(userId);
  const hydrated = hydratedFor === (userId ?? null);
  return { seen, hydrated };
}

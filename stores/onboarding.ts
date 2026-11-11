import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ──────────────────────────────────────────────────────────────────────────
// Einführung beim ersten Start — Status pro Nutzer. Lokal (AsyncStorage),
// Key `onboarding_state:<userId>` — KEINE DB-Migration. Spiegelt das Muster von
// stores/helpSeen.ts. Der Status steuert nur, OB die Einführung gezeigt wird;
// er berührt keine Kundendaten.
// ──────────────────────────────────────────────────────────────────────────

export interface OnboardingState {
  done: boolean;          // Einführung abgeschlossen/übersprungen oder nicht nötig
  pushDeclined: boolean;  // „Nicht jetzt" → keine automatische System-Abfrage mehr
}

export const EMPTY_ONBOARDING_STATE: OnboardingState = { done: false, pushDeclined: false };

export const onboardingKeyForUser = (userId?: string | null) => `onboarding_state:${userId || 'anon'}`;

// Robuster Fallback bei fehlendem/beschädigtem State — nie crashen.
export function sanitizeOnboardingState(raw: unknown): OnboardingState {
  if (!raw || typeof raw !== 'object') return EMPTY_ONBOARDING_STATE;
  const r = raw as Record<string, unknown>;
  return { done: r.done === true, pushDeclined: r.pushDeclined === true };
}

export type OnboardingGate = 'pending' | 'show' | 'skip';
export type DogCountProbe = 'unknown' | 'error' | number;

// Reine Entscheidung, ob die Einführung gezeigt wird. Grundsatz: Bestehende
// Kundinnen sehen sie nie.
//   • bereits erledigt                         → skip
//   • Hilfe „home" auf diesem Gerät gesehen    → skip (bestehende Installation, ohne Netz)
//   • Hunde vorhanden                          → skip
//   • Hunde nicht ladbar (offline/Fehler)      → skip (nie den Start blockieren)
//   • sicher kein Hund                         → show
export function resolveOnboardingGate(input: {
  hydrated: boolean;
  done: boolean;
  helpHydrated: boolean;
  homeHelpSeen: boolean;
  dogs: DogCountProbe;
}): OnboardingGate {
  if (!input.hydrated) return 'pending';
  if (input.done) return 'skip';
  if (!input.helpHydrated) return 'pending';
  if (input.homeHelpSeen) return 'skip';
  if (input.dogs === 'unknown') return 'pending';
  if (input.dogs === 'error') return 'skip';
  return input.dogs > 0 ? 'skip' : 'show';
}

let currentUserId: string | null = null;
let hydratedFor: string | null | undefined = undefined;
let state: OnboardingState = EMPTY_ONBOARDING_STATE;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

async function hydrate(userId: string | null) {
  currentUserId = userId;
  let next = EMPTY_ONBOARDING_STATE;
  try {
    const raw = await AsyncStorage.getItem(onboardingKeyForUser(userId));
    next = sanitizeOnboardingState(raw ? JSON.parse(raw) : null);
  } catch { next = EMPTY_ONBOARDING_STATE; }
  // Zwischenzeitlicher Nutzerwechsel: veraltetes Ergebnis verwerfen.
  if (currentUserId !== userId) return;
  state = next;
  hydratedFor = userId;
  emit();
}

function persist() {
  AsyncStorage.setItem(onboardingKeyForUser(currentUserId), JSON.stringify(state)).catch(() => { /* best-effort */ });
}

// Einführung als erledigt markieren (idempotent). `pushDeclined` wird nur
// gesetzt, nie stillschweigend zurückgenommen.
export function completeOnboarding(opts?: { pushDeclined?: boolean }) {
  const pushDeclined = state.pushDeclined || opts?.pushDeclined === true;
  if (state.done && state.pushDeclined === pushDeclined) return;
  state = { done: true, pushDeclined };
  emit();
  persist();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getSnapshot = () => state;

// Hook: hydriert pro Nutzer. `hydrated` ist erst true, wenn der Storage für
// genau diesen Nutzer geladen wurde.
export function useOnboardingState(userId: string | null | undefined): OnboardingState & { hydrated: boolean } {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const uid = userId ?? null;
    if (hydratedFor !== uid) void hydrate(uid);
  }, [userId]);
  return { ...snap, hydrated: hydratedFor === (userId ?? null) };
}

// Nur für Tests: Modulzustand zurücksetzen.
export function __resetOnboardingForTests() {
  currentUserId = null;
  hydratedFor = undefined;
  state = EMPTY_ONBOARDING_STATE;
}

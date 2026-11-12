import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ──────────────────────────────────────────────────────────────────────────
// Aktiver Hund — eine app-weite Auswahl statt je Bildschirm eine eigene.
// Lokal pro Nutzer (AsyncStorage, Key `active_dog:<userId>`), KEINE
// DB-Migration. Gespeichert wird nur die Hunde-ID; der Hund selbst wird immer
// frisch aus der geladenen Hundeliste aufgelöst. Die Auswahl steuert nur,
// welcher Hund in Übersichten vorausgewählt ist — sie schreibt nie Kundendaten.
// ──────────────────────────────────────────────────────────────────────────

export const activeDogKeyForUser = (userId?: string | null) => `active_dog:${userId || 'anon'}`;

// Gespeicherte ID nur verwenden, wenn der Hund noch existiert; sonst der erste
// Hund der Liste (bisheriges Verhalten der Bildschirme), sonst null.
export function resolveActiveDogId(storedId: string | null, dogs: readonly { id: string }[]): string | null {
  if (storedId && dogs.some(d => d.id === storedId)) return storedId;
  return dogs[0]?.id ?? null;
}

let currentUserId: string | null = null;
let hydratedFor: string | null | undefined = undefined;
let storedId: string | null = null;
// Auswahl, die getroffen wurde, bevor der Speicher geladen war. Sie gewinnt
// gegen den gespeicherten Wert, damit ein früher Tipp nicht verloren geht.
let pendingChoice: string | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

async function hydrate(userId: string | null) {
  currentUserId = userId;
  let next: string | null = null;
  try {
    const raw = await AsyncStorage.getItem(activeDogKeyForUser(userId));
    next = typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch { next = null; }
  // Zwischenzeitlicher Nutzerwechsel: veraltetes Ergebnis verwerfen.
  if (currentUserId !== userId) return;
  const chosenEarly = pendingChoice;
  storedId = chosenEarly ?? next;
  pendingChoice = null;
  if (chosenEarly && chosenEarly !== next) persist();
  hydratedFor = userId;
  emit();
}

// Aktiven Hund setzen (idempotent). Gilt sofort in allen Bildschirmen.
export function setActiveDogId(dogId: string) {
  if (!dogId || storedId === dogId) return;
  if (hydratedFor !== currentUserId) pendingChoice = dogId;
  storedId = dogId;
  emit();
  // Vor dem Laden ist der Nutzer evtl. noch unbekannt: dann speichert hydrate().
  if (hydratedFor === currentUserId) persist();
}

function persist() {
  if (!storedId) return;
  AsyncStorage.setItem(activeDogKeyForUser(currentUserId), storedId).catch(() => { /* best-effort */ });
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getSnapshot = () => storedId;

// Hook: hydriert pro Nutzer und liefert die gespeicherte Hunde-ID (oder null).
export function useStoredActiveDogId(userId: string | null | undefined): string | null {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const uid = userId ?? null;
    if (hydratedFor !== uid) void hydrate(uid);
  }, [userId]);
  return hydratedFor === (userId ?? null) || pendingChoice !== null ? snap : null;
}

// Nur für Tests: Modulzustand zurücksetzen.
export function __resetActiveDogForTests() {
  currentUserId = null;
  hydratedFor = undefined;
  storedId = null;
  pendingChoice = null;
}

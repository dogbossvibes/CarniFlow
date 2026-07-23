import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type ActiveFaehrte, type ActiveFaehrtenMap,
  upsertEntry, removeEntry, sanitizeMap, reconcileWithDogs, sortActive,
} from '@/features/tracking/store/activeFaehrtenModel';

// Persistenz-Schlüssel der Registry. Getrennt vom Aufnahme-Puffer
// (anyvo_track_pending_v1), da diese Registry ALLE offenen Fährten (mehrere Hunde
// gleichzeitig) hält, während der Puffer die eine bildschirm-aktive Aufnahme sichert.
const KEY = 'anyvo_active_faehrten_v1';

interface ActiveFaehrtenState {
  hydrated: boolean;
  byDog:    ActiveFaehrtenMap;
  hydrate:  () => Promise<void>;
  upsert:   (dogId: string, patch: Partial<ActiveFaehrte>) => void;
  remove:   (dogId: string) => void;
  reconcile:(existingDogIds: string[]) => void;
  get:      (dogId: string) => ActiveFaehrte | null;
  list:     () => ActiveFaehrte[];
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleWrite(getMap: () => ActiveFaehrtenMap) {
  if (writeTimer) return;
  writeTimer = setTimeout(async () => {
    writeTimer = null;
    try { await AsyncStorage.setItem(KEY, JSON.stringify(getMap())); } catch { /* best-effort */ }
  }, 1000);
}
// Kritische Übergänge (Status-Wechsel) sofort schreiben, damit ein App-Kill
// unmittelbar danach die offene Fährte nicht verliert.
async function writeNow(map: ActiveFaehrtenMap) {
  if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
  try { await AsyncStorage.setItem(KEY, JSON.stringify(map)); } catch { /* best-effort */ }
}

export const useActiveFaehrten = create<ActiveFaehrtenState>((set, get) => ({
  hydrated: false,
  byDog:    {},

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const map = raw ? sanitizeMap(JSON.parse(raw)) : {};
      set({ byDog: map, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  upsert: (dogId, patch) => {
    const next = upsertEntry(get().byDog, dogId, patch);
    set({ byDog: next });
    void writeNow(next);   // Status-relevante Änderung → sofort sichern
  },

  remove: (dogId) => {
    const next = removeEntry(get().byDog, dogId);
    set({ byDog: next });
    void writeNow(next);
  },

  reconcile: (existingDogIds) => {
    const next = reconcileWithDogs(get().byDog, existingDogIds);
    if (next !== get().byDog) { set({ byDog: next }); scheduleWrite(() => get().byDog); }
  },

  get: (dogId) => get().byDog[dogId] ?? null,
  list: () => sortActive(Object.values(get().byDog)),
}));

// Ableitungshelfer für Selektoren (stabil, ohne Objektneubau in Komponenten).
export function selectActiveList(s: ActiveFaehrtenState): ActiveFaehrte[] {
  return sortActive(Object.values(s.byDog));
}
export function selectActiveCount(s: ActiveFaehrtenState): number {
  return Object.keys(s.byDog).length;
}

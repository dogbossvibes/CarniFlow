// ──────────────────────────────────────────────────────────────────────────
// Hundeabstand je Hund (T-216): Die App merkt sich pro Hund den zuletzt
// gewählten Abstand Hundeführer:in ↔ Hund (1/5/10 m), damit er nicht vor jeder
// Absuche neu gewählt werden muss.
//
// Reine Geräte-Einstellung (AsyncStorage), kein Datenbankfeld, kein Sync.
// Unbekannte oder ungültige Werte werden beim Lesen ignoriert und NIE
// überschrieben; die Absuche fällt dann auf den Standard (5 m) zurück.
// ──────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isHandlerDistance, HANDLER_DISTANCES_M, type SearchHandlerDistanceM } from '@/features/tracking/utils/searchGeometry';

const KEY_PREFIX = 'track_dog_lead_m:';
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

const keyFor = (dogId: string) => `${KEY_PREFIX}${dogId}`;

export function createDogLeadSetting(storage: Storage) {
  return {
    /** Gemerkter Abstand dieses Hundes; null, wenn keiner gespeichert, lesbar oder gültig ist. */
    async load(dogId: string | null | undefined): Promise<SearchHandlerDistanceM | null> {
      if (!dogId) return null;
      try {
        const raw = await storage.getItem(keyFor(dogId));
        const value = raw == null ? null : Number(raw);
        return isHandlerDistance(value) ? value : null;
      } catch { return null; }
    },
    /** Merkt den Abstand für diesen Hund. Ein Speicherfehler darf die Absuche nie stören. */
    async save(dogId: string | null | undefined, value: SearchHandlerDistanceM): Promise<void> {
      if (!dogId || !isHandlerDistance(value)) return;
      try { await storage.setItem(keyFor(dogId), String(value)); } catch { /* nur Komfort-Einstellung */ }
    },
  };
}

export const dogLeadSetting = createDogLeadSetting(AsyncStorage);

/** Nächster Abstand beim Antippen während der Absuche: 1 → 5 → 10 → 1. */
export function nextHandlerDistance(current: SearchHandlerDistanceM): SearchHandlerDistanceM {
  const index = HANDLER_DISTANCES_M.indexOf(current);
  return HANDLER_DISTANCES_M[(index + 1) % HANDLER_DISTANCES_M.length];
}

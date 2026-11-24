// Laden und Speichern der Fährten-Einstellungen je Hund.
//
// Quelle der Wahrheit ist `dogs.track_settings` (Konto, alle Geräte). Solange die
// Spalte noch nicht existiert (Migration nicht ausgeführt) oder das Gerät offline
// ist, gilt die Gerätekopie; eine dort gemerkte, noch nicht hochgeladene Änderung
// («pending») wird beim nächsten erfolgreichen Laden nachgetragen.
// Ein Fehler beim Laden oder Speichern darf Legen, Liegezeit und Absuche nie stören.
import { mergeDogTrackSettings, normalizeDogTrackSettings, type DogTrackSettings, type DogTrackSettingsPatch } from './model';

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export interface DogRow { id: string; owner_id: string; track_settings?: unknown }
export interface DogTrackSettingsDeps {
  storage: Storage;
  fetchDog(dogId: string): Promise<DogRow | null>;
  /** Wirft bei Fehler. */
  writeDog(dogId: string, trackSettings: Record<string, unknown>): Promise<void>;
}
/**
 * `pendingKeys`: Felder, die lokal geändert und noch nicht ins Konto übertragen wurden.
 * Fehlt die Liste (Gerätekopie aus der ersten Version), gilt die ganze Kopie als offen.
 */
interface CacheEntry { raw: Record<string, unknown> | null; pending: boolean; pendingKeys?: string[] }

export const dogTrackSettingsCacheKey = (userId: string, dogId: string) => `anyvo.dogTrackSettings.v1::${userId}::${dogId}`;
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;

export function createDogTrackSettingsStore(deps: DogTrackSettingsDeps) {
  async function readCache(userId: string, dogId: string): Promise<CacheEntry | null> {
    try {
      const raw = await deps.storage.getItem(dogTrackSettingsCacheKey(userId, dogId));
      if (!raw) return null;
      const parsed = record(JSON.parse(raw));
      if (!parsed) return null;
      const keys = Array.isArray(parsed.pendingKeys) && parsed.pendingKeys.every(k => typeof k === 'string') ? parsed.pendingKeys as string[] : undefined;
      return { raw: record(parsed.raw), pending: parsed.pending === true, ...(keys ? { pendingKeys: keys } : {}) };
    } catch { return null; }
  }
  async function writeCache(userId: string, dogId: string, entry: CacheEntry): Promise<void> {
    try { await deps.storage.setItem(dogTrackSettingsCacheKey(userId, dogId), JSON.stringify(entry)); } catch { /* nur Komfort */ }
  }
  async function ownDog(userId: string, dogId: string): Promise<DogRow | null> {
    try {
      const dog = await deps.fetchDog(dogId);
      return dog && dog.id === dogId && dog.owner_id === userId ? dog : null;
    } catch { return null; }
  }
  const columnExists = (dog: DogRow) => Object.prototype.hasOwnProperty.call(dog, 'track_settings');
  /** Nur die lokal geänderten Felder auf den Kontostand legen; neuere Kontowerte anderer Felder bleiben. */
  function withPendingChanges(server: unknown, cache: CacheEntry): Record<string, unknown> {
    const base = { ...(record(server) ?? {}) };
    const local = cache.raw ?? {};
    if (!cache.pendingKeys) return { ...base, ...local };   // Altformat: ganze Kopie (wie bisher, kein Verlust)
    for (const key of cache.pendingKeys) {
      if (Object.prototype.hasOwnProperty.call(local, key)) base[key] = local[key];
      else delete base[key];
    }
    return { ...base, version: 1 };
  }

  return {
    /** Nur die Gerätekopie (schnell, offline). */
    async loadCached(userId: string | null | undefined, dogId: string | null | undefined): Promise<DogTrackSettings> {
      if (!userId || !dogId) return {};
      return normalizeDogTrackSettings((await readCache(userId, dogId))?.raw);
    },

    /** Konto zuerst; trägt eine offene Gerätekopie nach. Offline → Gerätekopie. */
    async load(userId: string | null | undefined, dogId: string | null | undefined): Promise<{ settings: DogTrackSettings; synced: boolean }> {
      if (!userId || !dogId) return { settings: {}, synced: false };
      const cache = await readCache(userId, dogId);
      const dog = await ownDog(userId, dogId);
      if (!dog || !columnExists(dog)) return { settings: normalizeDogTrackSettings(cache?.raw), synced: false };
      const server = record(dog.track_settings);
      if (cache?.pending && cache.raw) {
        // Offene lokale Änderung: auf den Kontostand legen (unbekannte Kontofelder bleiben).
        const next = withPendingChanges(server, cache);
        try {
          await deps.writeDog(dogId, next);
          await writeCache(userId, dogId, { raw: next, pending: false });
          return { settings: normalizeDogTrackSettings(next), synced: true };
        } catch { return { settings: normalizeDogTrackSettings(cache.raw), synced: false }; }
      }
      await writeCache(userId, dogId, { raw: server, pending: false });
      return { settings: normalizeDogTrackSettings(server), synced: true };
    },

    /** Speichert eine Änderung. Gerätekopie sofort, Konto wenn möglich; `synced` sagt, ob das Konto sie hat. */
    async save(userId: string, dogId: string, patch: DogTrackSettingsPatch): Promise<{ settings: DogTrackSettings; synced: boolean }> {
      const cache = await readCache(userId, dogId);
      const local = mergeDogTrackSettings(cache?.raw, patch);
      const changed = Object.keys(patch);
      const pendingKeys = cache?.pending && !cache.pendingKeys ? undefined   // Altformat bleibt «ganze Kopie offen»
        : [...new Set([...(cache?.pending ? cache.pendingKeys ?? [] : []), ...changed])];
      await writeCache(userId, dogId, { raw: local, pending: true, ...(pendingKeys ? { pendingKeys } : {}) });
      const dog = await ownDog(userId, dogId);
      if (!dog || !columnExists(dog)) return { settings: normalizeDogTrackSettings(local), synced: false };
      // Auf den aktuellen Kontostand legen, nicht auf eine ältere Gerätekopie.
      const base = cache?.pending && cache.raw ? withPendingChanges(dog.track_settings, cache) : dog.track_settings;
      const next = mergeDogTrackSettings(base, patch);
      try {
        await deps.writeDog(dogId, next);
        await writeCache(userId, dogId, { raw: next, pending: false });
        return { settings: normalizeDogTrackSettings(next), synced: true };
      } catch {
        return { settings: normalizeDogTrackSettings(local), synced: false };
      }
    },
  };
}

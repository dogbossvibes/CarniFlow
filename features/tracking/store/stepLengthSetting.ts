import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'track_step_length_m';
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
type Snapshot = { stepLengthM: number | undefined; loaded: boolean; loadError: boolean };

/** Same device-local key and scalar format. Never rewrites legacy values on read. */
export function createStepLengthSetting(storage: Storage) {
  let snapshot: Snapshot = { stepLengthM: undefined, loaded: false, loadError: false };
  let loading: Promise<void> | null = null;
  let writing: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const load = (): Promise<void> => {
    if (snapshot.loaded) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      try {
        const raw = await storage.getItem(STORAGE_KEY);
        const value = raw == null ? NaN : Number(raw);
        publish({ stepLengthM: Number.isFinite(value) && value > 0 ? value : undefined, loaded: true, loadError: false });
      } catch (error) {
        publish({ ...snapshot, loadError: true });
        throw error;
      } finally { loading = null; }
    })();
    return loading;
  };
  const save = (value: number | null): Promise<void> => {
    // Only an explicit null is a reset. Invalid measurement must never erase a preference.
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      return Promise.reject(new Error('INVALID_STEP_LENGTH'));
    }
    const result = writing.then(async () => {
      await load();
      if (value === null) await storage.removeItem(STORAGE_KEY);
      else await storage.setItem(STORAGE_KEY, String(value));
      publish({ stepLengthM: value ?? undefined, loaded: true, loadError: false });
    });
    writing = result.catch(() => { /* A failed write must not block a later explicit retry. */ });
    return result;
  };
  return {
    load, save,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export const stepLengthSetting = createStepLengthSetting(AsyncStorage);

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'app_lock_enabled';

// App-weit GETEILTER Zustand (Module-Store), damit ein Umschalten (z. B. im Profil)
// sofort in allen Consumern greift — insbesondere im AppLockGate. Sonst hätte jede
// Hook-Instanz ihren eigenen Stand und ein Deaktivieren würde erst nach Neustart wirken.
let shared = { enabled: false, loaded: false };
const listeners = new Set<() => void>();
const notify = () => { for (const l of listeners) l(); };

let loadStarted = false;
async function ensureLoaded() {
  if (loadStarted) return;
  loadStarted = true;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    shared = { enabled: stored === 'true', loaded: true };
  } catch {
    shared = { ...shared, loaded: true };
  }
  notify();
}

// Persistierte Präferenz: App beim Öffnen per Biometrie (Face ID / Touch ID /
// Fingerabdruck) bzw. Geräte-Code entsperren. Default: aus.
export function useAppLockSetting() {
  const [, force] = useState(0);

  useEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    void ensureLoaded();
    return () => { listeners.delete(l); };
  }, []);

  const setAppLock = useCallback(async (value: boolean) => {
    shared = { ...shared, enabled: value };
    notify();   // sofort app-weit anwenden
    try { await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); } catch { /* egal */ }
  }, []);

  return { enabled: shared.enabled, loaded: shared.loaded, setAppLock };
}

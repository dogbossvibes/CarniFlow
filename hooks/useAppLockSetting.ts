import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'app_lock_enabled';

// Persistierte Präferenz: App beim Öffnen per Biometrie (Face ID / Touch ID /
// Fingerabdruck) bzw. Geräte-Code entsperren. Default: aus.
export function useAppLockSetting() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (active && stored != null) setEnabled(stored === 'true');
      } catch { /* Default bleibt aus */ }
      finally { if (active) setLoaded(true); }
    })();
    return () => { active = false; };
  }, []);

  const setAppLock = useCallback(async (value: boolean) => {
    setEnabled(value);
    try { await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); } catch { /* egal */ }
  }, []);

  return { enabled, setAppLock, loaded };
}

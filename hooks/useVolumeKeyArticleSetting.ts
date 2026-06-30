import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'track_volume_key_article';

// Persistierte Nutzer-Präferenz (Android): während der Fährtenaufnahme einen
// Gegenstand per Lautstärke-Taste setzen. Default AUS, weil es die Volume-Tasten
// umwidmet. Merkt sich über Sessions hinweg.
export function useVolumeKeyArticleSetting() {
  const [enabled, setEnabledState] = useState(false);
  const [loaded, setLoaded]        = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (active && stored != null) setEnabledState(stored === 'true');
      } catch { /* Default bleibt aus */ }
      finally { if (active) setLoaded(true); }
    })();
    return () => { active = false; };
  }, []);

  const setEnabled = useCallback(async (value: boolean) => {
    setEnabledState(value);
    try { await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); } catch { /* egal */ }
  }, []);

  return { enabled, setEnabled, loaded };
}

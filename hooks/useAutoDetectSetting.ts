import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'track_auto_detect';

// Persistierte Nutzer-Präferenz für die Fährten-Aufnahme: Winkel, Spitzwinkel und
// Abriss automatisch aus dem Laufmuster erkennen (true) ODER alles manuell setzen
// (false). Gegenstände sind davon ausgenommen — die werden immer manuell gesetzt.
// Default: an. Die Präferenz merkt sich über Sessions hinweg.
export function useAutoDetectSetting() {
  const [autoDetect, setAuto] = useState(true);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (active && stored != null) setAuto(stored === 'true');
      } catch { /* Default bleibt an */ }
      finally { if (active) setLoaded(true); }
    })();
    return () => { active = false; };
  }, []);

  const setAutoDetect = useCallback(async (value: boolean) => {
    setAuto(value);
    try { await AsyncStorage.setItem(STORAGE_KEY, value ? 'true' : 'false'); } catch { /* egal */ }
  }, []);

  return { autoDetect, setAutoDetect, loaded };
}

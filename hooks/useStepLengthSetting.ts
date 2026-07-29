import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeStepLength } from '@/features/tracking/utils/steps';

const STORAGE_KEY = 'track_step_length_m';

// Persönliche Schrittlänge (Meter/Schritt) — technische Vorbereitung für eine
// spätere Kalibrierung (z. B. „50 Schritte gehen → GPS-Distanz messen"). KEIN
// Wizard hier; nur Lesen/Setzen des Wertes. `undefined` ⇒ Default (0,75 m) über
// die zentrale Utility (`metersToSteps(distance, stepLengthM)`).
//
// Persistenz: gerätelokal via AsyncStorage (wie die übrigen Tracking-Settings),
// KEINE DB-Tabelle/Migration. Kann später zusätzlich ins Profil gespiegelt werden.
export function useStepLengthSetting() {
  const [stepLengthM, setValue] = useState<number | undefined>(undefined);
  const [loaded, setLoaded]     = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const num = stored != null ? Number(stored) : NaN;
        if (active && Number.isFinite(num) && num > 0) setValue(num);
      } catch { /* Default (undefined → 0,75) bleibt */ }
      finally { if (active) setLoaded(true); }
    })();
    return () => { active = false; };
  }, []);

  // Setzen (validiert). `null`/ungültig → Wert löschen (zurück auf Default).
  const setStepLengthM = useCallback(async (value: number | null) => {
    if (value == null || !Number.isFinite(value) || value <= 0) {
      setValue(undefined);
      try { await AsyncStorage.removeItem(STORAGE_KEY); } catch { /* egal */ }
      return;
    }
    const v = normalizeStepLength(value);
    setValue(v);
    try { await AsyncStorage.setItem(STORAGE_KEY, String(v)); } catch { /* egal */ }
  }, []);

  return { stepLengthM, setStepLengthM, loaded };
}

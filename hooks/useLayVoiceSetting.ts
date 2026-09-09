import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'track_lay_voice';

// Persistierte Nutzer-Präferenz: Sprachbestätigung BEIM LEGEN (Winkel,
// Spitzwinkel, Gegenstand, Dübel, Absatz) an/aus.
//
// Default: AUS — eine Fährte mit vielen Gegenständen wäre sonst sehr
// gesprächig. Marker, Haptik und Toast laufen unabhängig von dieser
// Einstellung IMMER (das Gate sitzt ausschliesslich vor dem Speak-Aufruf).
//
// Gilt ausdrücklich NUR für das Legen. Die Sprachführung der ABSUCHE
// (useTrackVoiceGuidance, eigener voiceOn-Schalter in run.tsx) ist davon
// vollständig unabhängig und wird hiervon nicht berührt.
//
// Bewusst dasselbe Muster wie useAutoDetectSetting/useVolumeKeyArticleSetting
// (AsyncStorage-Schlüssel + loaded-Flag) — keine neue Settings-Architektur.
export function useLayVoiceSetting() {
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

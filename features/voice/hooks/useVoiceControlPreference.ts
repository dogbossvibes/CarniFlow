import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FieldVoiceMode } from '@/features/voice/services/fieldVoiceCommands';

// Merkt pro Gerät, ob die Sprachsteuerung beim Legen/Suchen an war (Spec 03, Punkt 1).
// Standard: aus. Gespeichert wird nur «an/aus», nie erkannter Text.
const key = (mode: FieldVoiceMode) => `anyvo.voiceControl.${mode}.v1`;

export function useVoiceControlPreference(mode: FieldVoiceMode) {
  const [wanted, setWanted] = useState<boolean | null>(null);   // null = noch nicht geladen
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(key(mode)).then(v => { if (alive) setWanted(v === '1'); }).catch(() => { if (alive) setWanted(false); });
    return () => { alive = false; };
  }, [mode]);
  const save = useCallback((on: boolean) => {
    setWanted(on);
    void AsyncStorage.setItem(key(mode), on ? '1' : '0').catch(() => undefined);
  }, [mode]);
  return { wanted, save };
}

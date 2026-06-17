import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { SpeechModule, useSpeechRecognitionEvent, SPEECH_RECOGNITION_AVAILABLE } from '@/features/voice/services/speechRecognition';
import { useVoiceStore } from '@/features/voice/store/voiceStore';
import { parseVoiceCommand, type VoiceCommand } from '@/features/voice/services/voiceCommandParser';

// Live-Sprachsteuerung (expo-speech-recognition) für den Fährtenmodus. Erkennt
// kurze Befehle, parst sie und führt onCommand aus. Continuous: startet nach
// jedem Erkennungs-Ende neu, solange aktiviert.
export function useVoiceCommands(onCommand: (cmd: VoiceCommand) => void) {
  const { voiceCommandEnabled, isListening, lastRecognizedCommand } = useVoiceStore();
  const store = useVoiceStore;
  const onCmdRef = useRef(onCommand);
  useEffect(() => { onCmdRef.current = onCommand; }, [onCommand]);

  const begin = useCallback(() => {
    if (!SpeechModule) return;
    try {
      SpeechModule.start({ lang: 'de-DE', interimResults: false, continuous: true });
      store.getState().setListening(true);
    } catch (e) { console.warn('[useVoiceCommands] start', e); }
  }, [store]);

  useSpeechRecognitionEvent('result', (e: any) => {
    const t = e?.results?.[e.results.length - 1]?.transcript ?? e?.results?.[0]?.transcript;
    if (!t) return;
    const cmd = parseVoiceCommand(String(t));
    if (cmd) { store.getState().setLastRecognizedCommand(cmd); onCmdRef.current(cmd); }
  });
  useSpeechRecognitionEvent('end', () => {
    if (store.getState().voiceCommandEnabled) begin();
    else store.getState().setListening(false);
  });
  useSpeechRecognitionEvent('error', () => { store.getState().setListening(false); });

  const enable = useCallback(async () => {
    if (!SPEECH_RECOGNITION_AVAILABLE || !SpeechModule) {
      Alert.alert('Sprachsteuerung', 'Spracherkennung ist in dieser App-Version nicht verfügbar (neuer Build nötig).');
      return;
    }
    try {
      const perm = await SpeechModule.requestPermissionsAsync();
      if (!perm.granted) { Alert.alert('Spracherkennung', 'Bitte erlaube Mikrofon & Spracherkennung in den Einstellungen.'); return; }
      store.getState().setVoiceCommandEnabled(true);
      begin();
    } catch (e) { console.warn('[useVoiceCommands] enable', e); }
  }, [begin, store]);

  const disable = useCallback(() => {
    store.getState().setVoiceCommandEnabled(false);
    try { SpeechModule?.stop(); } catch { /* egal */ }
    store.getState().setListening(false);
  }, [store]);

  // Beim Verlassen sauber stoppen.
  useEffect(() => () => { try { SpeechModule?.stop(); } catch { /* egal */ } }, []);

  return { enabled: voiceCommandEnabled, isListening, lastCommand: lastRecognizedCommand, available: SPEECH_RECOGNITION_AVAILABLE, enable, disable };
}

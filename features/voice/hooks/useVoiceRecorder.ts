import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useAudioRecorder, RecordingPresets } from 'expo-audio';
import { useVoiceStore } from '@/features/voice/store/voiceStore';
import {
  requestMicrophonePermission, enableRecordingMode, disableRecordingMode, deleteLocalRecording,
} from '@/features/voice/services/voiceRecordingService';

// Aufnahme-Steuerung (expo-audio). Schreibt State in den voiceStore; die UI liest dort.
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const { isRecording, isPaused, durationSeconds } = useVoiceStore();
  const store = useVoiceStore;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tick = () => { timerRef.current = setInterval(() => store.getState().setDuration(store.getState().durationSeconds + 1), 1000); };
  const clear = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  useEffect(() => () => clear(), []);

  const start = async (): Promise<boolean> => {
    const ok = await requestMicrophonePermission();
    if (!ok) { Alert.alert('Mikrofon nötig', 'Bitte erlaube den Mikrofonzugriff, um Sprachmemos aufzunehmen.'); return false; }
    try {
      await enableRecordingMode();
      await recorder.prepareToRecordAsync();
      recorder.record();
      store.getState().startRecording();
      clear(); tick();
      return true;
    } catch (e) {
      console.warn('[useVoiceRecorder] start', e);
      Alert.alert('Aufnahme', 'Die Aufnahme konnte nicht gestartet werden. Bitte erneut versuchen.');
      return false;
    }
  };

  const pause = () => { try { recorder.pause(); } catch { /* egal */ } clear(); store.getState().pauseRecording(); };
  const resume = () => { try { recorder.record(); } catch { /* egal */ } tick(); store.getState().resumeRecording(); };

  // Stoppt und gibt lokale URI + Dauer zurück (Upload macht der Aufrufer).
  const stop = async (): Promise<{ uri: string | null; duration: number }> => {
    clear();
    const duration = store.getState().durationSeconds;
    try { await recorder.stop(); } catch { /* egal */ }
    await disableRecordingMode();
    const uri = recorder.uri ?? null;
    store.getState().stopRecording(uri, duration);
    return { uri, duration };
  };

  const cancel = async () => {
    clear();
    try { await recorder.stop(); } catch { /* egal */ }
    await disableRecordingMode();
    await deleteLocalRecording(recorder.uri ?? null);
    store.getState().resetRecording();
  };

  return { isRecording, isPaused, seconds: durationSeconds, start, pause, resume, stop, cancel };
}

import { AudioModule, setAudioModeAsync } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

// expo-audio ist hook-basiert → die eigentliche Aufnahme-Steuerung (start/pause/
// resume/stop) lebt im Hook useVoiceRecorder über useAudioRecorder. Dieser Service
// kapselt die nicht-hook-Teile: Permission, Audio-Session, lokale Datei, Format.

export async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

export async function enableRecordingMode() {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
}

export async function disableRecordingMode() {
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
}

export async function deleteLocalRecording(uri: string | null) {
  if (!uri) return;
  try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* egal */ }
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

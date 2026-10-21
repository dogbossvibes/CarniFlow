import { setAudioModeAsync, type AudioMode } from 'expo-audio';

// Existing recording/media callers have priority. Do not restore a guessed
// previous mode or deactivate the shared session when a decorative clip ends.
let otherAudioClaimed = false;
let preparing: Promise<void> | null = null;
let stopGreeting: (() => void) | null = null;
export async function setAppAudioModeAsync(mode: Partial<AudioMode>): Promise<void> {
  otherAudioClaimed = true;
  try { stopGreeting?.(); } catch { /* Decorative cleanup must not block a recording. */ }
  if (preparing) await preparing.catch(() => {});
  await setAudioModeAsync(mode);
}
export async function prepareGreetingAudio(stop: () => void, current: () => boolean): Promise<boolean> {
  if (otherAudioClaimed || preparing || stopGreeting || !current()) return false;
  stopGreeting = stop;
  const pending = setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false,
    shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
  preparing = pending;
  try { await pending; return !otherAudioClaimed && current(); }
  finally { if (preparing === pending) preparing = null; }
}
export function finishGreetingAudio(stop: () => void): void {
  if (stopGreeting === stop) stopGreeting = null;
}

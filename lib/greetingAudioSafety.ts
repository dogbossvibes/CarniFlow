import { setAudioModeAsync, type AudioMode } from 'expo-audio';

// Existing recording/media callers have priority. Do not restore a guessed
// previous mode or deactivate the shared session when a decorative clip ends.
let otherAudioClaimed = false;
let preparing: Promise<void> | null = null;
let stopGreeting: (() => void | Promise<void>) | null = null;
let stoppingGreeting: Promise<void> | null = null;
function rememberStop(stopped: Promise<void>): void {
  const guarded = Promise.resolve(stopped).catch(() => {});
  // Cleanup from an old account/session may arrive late. Never let it replace
  // a newer pending native stop acknowledgement with an already settled one.
  stoppingGreeting = stoppingGreeting
    ? Promise.all([stoppingGreeting, guarded]).then(() => {})
    : guarded;
}
export async function setAppAudioModeAsync(mode: Partial<AudioMode>): Promise<void> {
  otherAudioClaimed = true;
  try {
    const stopped = stopGreeting?.();
    if (stopped) rememberStop(stopped);
  } catch { /* Decorative cleanup must not block a recording. */ }
  if (stoppingGreeting) await stoppingGreeting;
  if (preparing) await preparing.catch(() => {});
  await setAudioModeAsync(mode);
}
export async function prepareGreetingAudio(stop: () => void | Promise<void>, current: () => boolean, configureMode = true): Promise<boolean> {
  if (stoppingGreeting) await stoppingGreeting;
  if (otherAudioClaimed || preparing || stopGreeting || !current()) return false;
  stopGreeting = stop;
  if (!configureMode) return !otherAudioClaimed && current();
  const pending = setAudioModeAsync({ playsInSilentMode: false, allowsRecording: false,
    shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' });
  preparing = pending;
  try { await pending; return !otherAudioClaimed && current(); }
  finally { if (preparing === pending) preparing = null; }
}
export function finishGreetingAudio(stop: () => void | Promise<void>, stopping?: Promise<void>): void {
  if (stopping) rememberStop(stopping);
  if (stopGreeting === stop) stopGreeting = null;
}

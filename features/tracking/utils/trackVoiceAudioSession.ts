// Audio-Sitzung für die Fährten-Sprachansage (T-204).
// Ohne eigene Einstellung nutzt iOS die Standard-Kategorie: Der Stummschalter schaltet die
// Ansage stumm, und beim Sperren des Bildschirms verstummt sie. Für die Dauer einer Fährte
// (Legen/Absuche mit eingeschalteter Ansage) gilt deshalb:
//   • hörbar trotz Stummschalter (playsInSilentMode),
//   • hörbar bei gesperrtem Bildschirm (shouldPlayInBackground; der dafür nötige
//     Hintergrund-Audio-Eintrag kommt vom expo-audio-Plugin, Standard seit SDK 58),
//   • Musik/Podcast anderer Apps läuft weiter (mixWithOthers).
// expo-speech spricht über die Audio-Sitzung der App (usesApplicationAudioSession).
// Nur iOS: Android-Sprachausgabe läuft über den Medienkanal und braucht das nicht.
import { Platform } from 'react-native';
import { useEffect } from 'react';
import type { AudioMode } from 'expo-audio';
import { setAppAudioModeAsync } from '@/lib/greetingAudioSafety';

export const TRACK_VOICE_AUDIO_MODE: Partial<AudioMode> = Object.freeze({
  playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: true, interruptionMode: 'mixWithOthers',
});
// Beim Verlassen: derselbe Zustand, den die übrigen Aufrufer (Chat, Sprachnotiz) hinterlassen —
// kein geratener «vorheriger» Modus (siehe greetingAudioSafety).
export const TRACK_VOICE_AUDIO_IDLE_MODE: Partial<AudioMode> = Object.freeze({
  playsInSilentMode: true, allowsRecording: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers',
});

let holders = 0;
let chain: Promise<void> = Promise.resolve();
const apply = (mode: Partial<AudioMode>) => {
  // Reihenfolge wahren; ein Fehler der Audio-Sitzung darf die Fährte nie stören.
  chain = chain.then(() => setAppAudioModeAsync(mode)).catch(() => {});
  return chain;
};

/** Zählt Nutzer der Ansage-Sitzung; liefert die Freigabe-Funktion (mehrfacher Aufruf unschädlich). */
export function acquireTrackVoiceAudio(): () => void {
  if (Platform.OS !== 'ios') return () => {};
  holders += 1;
  if (holders === 1) void apply(TRACK_VOICE_AUDIO_MODE);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders === 0) void apply(TRACK_VOICE_AUDIO_IDLE_MODE);
  };
}

/** Für Tests: wartet, bis alle angeforderten Umschaltungen durch sind. */
export const trackVoiceAudioSettled = () => chain;

/** Hält die Ansage-Sitzung, solange `active` gilt (Bildschirm offen und Ansage eingeschaltet). */
export function useTrackVoiceAudioSession(active: boolean): void {
  useEffect(() => (active ? acquireTrackVoiceAudio() : undefined), [active]);
}

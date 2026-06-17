// Defensiver Wrapper um expo-speech-recognition. Das Paket lädt beim Import das
// native Modul → fehlt es (Expo Go / veralteter Build), würde ein statischer
// Import crashen. Daher dynamisch laden (wie lib/trackRecorder mit TaskManager).

// deno-lint-ignore no-explicit-any
let SR: any = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { SR = require('expo-speech-recognition'); } catch { SR = null; }

export const SPEECH_RECOGNITION_AVAILABLE: boolean = !!(SR && SR.ExpoSpeechRecognitionModule);
export const SpeechModule: any = SR?.ExpoSpeechRecognitionModule ?? null;

// Echter Hook, wenn verfügbar; sonst No-op (ruft keine internen Hooks auf →
// stabile Hook-Reihenfolge pro Umgebung, kein Crash).
export const useSpeechRecognitionEvent: (event: string, cb: (e: any) => void) => void =
  SR?.useSpeechRecognitionEvent ?? (() => {});

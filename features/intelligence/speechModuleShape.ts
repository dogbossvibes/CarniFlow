// Inspect an already loaded module only. Do not import a native module, prompt
// for permission, start recognition or infer locale-specific local processing.
export const SPEECH_METHODS = Object.freeze([
  'start', 'stop', 'abort', 'addListener', 'getStateAsync',
  'getPermissionsAsync', 'requestPermissionsAsync',
  'getMicrophonePermissionsAsync', 'getSpeechRecognizerPermissionsAsync',
  'isRecognitionAvailable', 'supportsOnDeviceRecognition', 'getSupportedLocales',
] as const);
export type SpeechMethod = typeof SPEECH_METHODS[number];
export interface SpeechModuleShape {
  apiShapeAvailable: boolean;
  missingMethods: SpeechMethod[];
  deviceVerified: false;
  localOnlyVerified: false;
}
export function inspectSpeechModuleShape(module: unknown): SpeechModuleShape {
  const object = module !== null && typeof module === 'object' && !Array.isArray(module);
  const missingMethods = SPEECH_METHODS.filter(method => {
    if (!object) return true;
    try { return typeof (module as Record<string, unknown>)[method] !== 'function'; }
    catch { return true; }
  });
  return { apiShapeAvailable: missingMethods.length === 0, missingMethods, deviceVerified: false, localOnlyVerified: false };
}

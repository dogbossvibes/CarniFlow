/* eslint-disable @typescript-eslint/no-require-imports */
// Fährten-Simulator (T-192/T-205) — reiner Testcode.
// Jest-Mocks, mit denen der ECHTE useSearchRecorder samt Sprach- und Ende-Führung
// ohne Gerät läuft: Positionsquelle und Bewegungssensor kommen aus dem Simulator.
// Store, Zwischenspeicher (AsyncStorage-Testersatz) und Suchpunkt-Puffer sind die ECHTEN
// Module; nur das SQLite-Schreiben und die Sprachausgabe sind nachgebildet (searchBridge).
// Diese Datei muss in der Testdatei als ERSTES importiert werden.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));
jest.mock('@/features/tracking/utils/trackingEngineMode', () => ({
  ...jest.requireActual('@/features/tracking/utils/trackingEngineMode'),
  getTrackingEngineMode: () => 'current',
}));
jest.mock('@/features/tracking/utils/backgroundLayDiagnostics', () => ({ recordBackgroundLayEvent: jest.fn(async () => {}) }));
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: { lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number }) => ({
    coords: { latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: null, altitudeAccuracy: null, heading: s.course ?? null, speed: s.speed ?? null },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async (cb: (s: unknown) => void) => {
    require('./searchBridge').searchBridge.feedFix = cb;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: null } };
  }),
}));
// SQLite-Ersatz: ein geschriebener Stapel übersteht einen App-Abbruch, der Puffer davor nicht.
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  ...jest.requireActual('@/features/tracking/repositories/localTrackRepository'),
  createLocalSearchPointsBatch: jest.fn(async (sessionId: string, points: Record<string, unknown>[]) => {
    const rows = require('./searchBridge').searchBridge.sqlite as unknown[];
    for (const p of points) rows.push({ ...p, sessionId });
  }),
}));
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: {
    isModuleAvailable: () => require('./searchBridge').searchBridge.motionAvailable,
    isAvailable: () => require('./searchBridge').searchBridge.motionAvailable,
    getStatus: jest.fn(async () => {
      const on = require('./searchBridge').searchBridge.motionAvailable;
      return { deviceMotionAvailable: on, stepCountingAvailable: on, activityAvailable: on, pedometerAuthorized: on, running: on };
    }),
    start: jest.fn(async () => require('./searchBridge').searchBridge.motionAvailable),
    stop: jest.fn(async () => {}),
    onSample: (cb: (s: unknown) => void) => { require('./searchBridge').searchBridge.feedMotion = cb; return { remove: () => { require('./searchBridge').searchBridge.feedMotion = null; } }; },
    onError: () => ({ remove: () => {} }),
  },
}));
// Sprachausgabe mit Sprechdauer (Rückrufe über die simulierte Uhr).
jest.mock('expo-speech', () => ({
  speak: (text: string, opts?: unknown) => require('./searchBridge').searchBridge.speech.speak(text, opts),
  stop: () => require('./searchBridge').searchBridge.speech.stop(),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}), notificationAsync: jest.fn(async () => {}), selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
// Echte Warteschlange; der Simulator hängt nur den onceKey an den Text, um jede gesprochene
// Ansage ihrem Winkel/Gegenstand zuzuordnen.
jest.mock('@/features/tracking/utils/voiceEvents', () => {
  const actual = jest.requireActual('@/features/tracking/utils/voiceEvents');
  const { VOICE_TAG } = require('./searchBridge');
  return { ...actual, requestVoice: (r: { text: string; onceKey: string }) => actual.requestVoice({ ...r, text: `${r.text}${VOICE_TAG}${r.onceKey}` }) };
});

export {};

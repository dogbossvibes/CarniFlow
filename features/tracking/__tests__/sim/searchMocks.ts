/* eslint-disable @typescript-eslint/no-require-imports */
// Fährten-Simulator (T-192) — reiner Testcode.
// Jest-Mocks, mit denen der ECHTE useSearchRecorder ohne Gerät läuft: Positionsquelle
// und Bewegungssensor kommen aus dem Simulator, Speicher und Store sind stumm.
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
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(), noteSearchRunProgress: jest.fn(),
    noteSearchObjectFound: jest.fn(), noteSearchAutoDwell: jest.fn(), noteSearchOffTrackState: jest.fn(),
    searchRunState: { offTrackState: 'on_track' },
  }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
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

export {};

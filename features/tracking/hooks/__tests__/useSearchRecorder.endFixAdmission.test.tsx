// Hook-End-to-End: der reale V6.1-F1-02-Fehler lag in useSearchRecorder — Stillstands-Fixes
// (Fusion: 'stationary') speisten `endHandlerFix` nicht, stableFixCount blieb bei 1.
// Dieser Test treibt echte Fixes durch useSearchRecorder UND useTrackEndGuidance (wie run.tsx):
// Anforderung (2 Fixes, ≥ 800 ms) und Radius (1,5 m) bleiben unverändert.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';
import { useTrackEndGuidance } from '@/features/tracking/hooks/useTrackEndGuidance';
import type { TrackEndState } from '@/features/tracking/utils/guidanceEngine';
import type { MotionSample } from '@/modules/anyvo-motion';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));
jest.mock('@/i18n/config', () => ({ __esModule: true, default: { t: () => '', language: 'de-CH' } }));
jest.mock('@/features/tracking/utils/haptics', () => ({ hapticSuccess: jest.fn() }));
jest.mock('@/features/tracking/utils/voiceEvents', () => ({ requestVoice: jest.fn() }));
jest.mock('@/features/tracking/hooks/useTrackVoiceGuidance', () => ({ speechLanguage: () => 'de-DE' }));

let feedSample: ((s: { lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number }) => void) | null = null;
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({
    coords: { latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: null, altitudeAccuracy: null,
      heading: s.course ?? null, speed: s.speed ?? null },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async (cb: any) => {
    feedSample = cb;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: null } };
  }),
}));
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: jest.fn(), noteSearchObjectFound: jest.fn(), noteSearchOffTrackState: jest.fn(),
    searchRunState: { offTrackState: 'on_track' },
  }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));
let motionSampleCb: ((s: MotionSample) => void) | null = null;
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: {
    isModuleAvailable: () => true, isAvailable: () => true,
    getStatus: jest.fn(async () => ({ deviceMotionAvailable: true, stepCountingAvailable: true, activityAvailable: true, pedometerAuthorized: true, running: true })),
    start: jest.fn(async () => true), stop: jest.fn(async () => {}),
    onSample: (cb: any) => { motionSampleCb = cb; return { remove: () => { motionSampleCb = null; } }; },
    onError: () => ({ remove: () => {} }),
  },
}));

const M = 111320;
const toLL = (x: number, y: number): LatLng => ({ latitude: y / M, longitude: x / M });
const laid: LatLng[] = Array.from({ length: 31 }, (_, i) => toLL(0, i * 2));   // 60 m nach Norden
const END = toLL(0, 60);
const NO_OBJECTS: readonly [] = [];

let latestRec!: SearchRecorder;
let latestEnd: TrackEndState = 'unseen';
function Harness() {
  const rec = useSearchRecorder({ laidPoints: laid, laidObjects: NO_OBJECTS as any, level: 'training', handlerDistanceM: 5 });
  latestRec = rec;
  latestEnd = useTrackEndGuidance({
    recording: true, dogProgressM: 59, handlerProgressM: 57, lastSegmentReached: true, activeObjectWait: false,
    trackLengthM: 60, estimatedDogPosition: toLL(0, 59), endPoint: END, openMandatoryObjects: 0, voiceOn: false,
    endHandlerFix: rec.endHandlerFix, handlerPosition: null,
  });
  return null;
}

let renderer: ReactTestRenderer | null = null;
let clock = 0;
function motion(o: Partial<MotionSample>) {
  act(() => { motionSampleCb!({ timestamp: Date.now(), accelerationMagnitude: 0.01, rotationMagnitude: 0.01, headingDelta: 0,
    stepDelta: 0, cadence: null, movementState: 'stationary', motionConfidence: 0.9, activityConfidence: 'high', ...o }); });
}
const WALKING: Partial<MotionSample> = { accelerationMagnitude: 0.4, rotationMagnitude: 0.3, stepDelta: 2, movementState: 'walking' };
function fix(y: number, accuracy: number, tMs = (clock += 1000), x = 0) {
  act(() => { feedSample!({ lat: y / M, lng: x / M, accuracy, speed: 0, course: null, t: tMs }); });
}

// Der Handler läuft zum Ende (Walking-Motion), verlangsamt und steht ~2,6 m davor: die
// geglättete Position (EMA 0,4) hat sich dort eingeschwungen, ausserhalb des 1,5-m-Radius.
async function arriveNearEnd() {
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { await Promise.resolve(); });
  act(() => { latestRec.start(); });
  clock = Date.now();
  motion(WALKING);
  fix(0.3, 5); fix(0.3, 5); fix(0.3, 5);                 // Startlock
  for (let y = 2.3; y <= 56.3; y += 2) fix(y, 3);        // Laufen, Ansatz (Abstand 7,7 → 3,7 m)
  for (let k = 0; k < 10; k++) fix(57.4, 3);              // verlangsamt, eingeschwungen
  expect(latestEnd).not.toBe('reached');
}
const reached = () => ['reached', 'completed'].includes(latestEnd);

describe('useSearchRecorder + useTrackEndGuidance — Ende-Bestätigung mit Stillstands-Fixes', () => {
  beforeEach(() => { feedSample = null; motionSampleCb = null; renderer = null; latestEnd = 'unseen'; });
  afterEach(() => { act(() => { renderer?.unmount(); }); });

  it('A1 (reale F1-02-Form): erster Fix im Radius (Walking), zweiter unabhängiger Fix stationary → Ende bestätigt', async () => {
    await arriveNearEnd();
    fix(60.3, 3);                                         // Walking-Fix: Position rückt in den Radius (count 1)
    expect(reached()).toBe(false);
    motion({});                                           // Handler steht
    fix(60.31, 3);                                        // stationary, neuer Zeitstempel
    expect(latestRec.endHandlerFix?.tMs).toBe(clock);     // der Stillstands-Fix speist endHandlerFix
    expect(reached()).toBe(true);
  });

  it('A2: beide Fixes im Radius sind stationary → stableFixCount 2, Ende bestätigt; ein Fix reicht nicht', async () => {
    await arriveNearEnd();
    motion({});
    fix(59.3, 3); expect(reached()).toBe(false);          // Position noch ausserhalb des Radius
    fix(59.3, 3); expect(reached()).toBe(false);          // erster Fix im Radius
    fix(59.3, 3); expect(reached()).toBe(true);           // zweiter unabhängiger Fix im Radius
  });

  it('B: ein gps_outlier speist endHandlerFix nicht (gleiche Geometrie, nur die Accuracy unterscheidet)', async () => {
    await arriveNearEnd();
    motion({});
    const before = latestRec.endHandlerFix?.tMs;
    fix(65.1, 20);                                        // Sprung > 7,5 m, Accuracy 20 m, Motion: Stillstand → gps_outlier
    expect(latestRec.endHandlerFix?.tMs).toBe(before);
    expect(reached()).toBe(false);
    fix(65.1, 3);                                         // Kontrolle: gleicher Sprung, gute Accuracy → zählt als Fix
    expect(latestRec.endHandlerFix?.tMs).toBe(clock);
  });

  it('C: derselbe Fix doppelt (gleicher Zeitstempel) zählt nicht doppelt', async () => {
    await arriveNearEnd();
    const t = (clock += 1000);
    fix(60.3, 3, t);                                      // erster Fix im Radius (count 1)
    fix(60.3, 3, t);                                      // identischer Fix noch einmal
    expect(reached()).toBe(false);
    fix(60.3, 3);                                         // neuer Zeitstempel → zweiter Fix
    expect(reached()).toBe(true);
  });

  it('D: stationary bei identischer Position, aber neuem Zeitstempel → zählt als neuer stabiler Fix', async () => {
    await arriveNearEnd();
    fix(60.3, 3);
    motion({});
    fix(60.3, 3);
    expect(reached()).toBe(true);
  });

  it('E: ein veralteter Fix (stale) zählt nicht, auch nicht als stationary; ein frischer schon', async () => {
    await arriveNearEnd();
    fix(60.3, 3);
    motion({});
    fix(60.31, 3, Date.now() - 20000);
    expect(reached()).toBe(false);
    fix(60.32, 3);
    expect(reached()).toBe(true);
  });
});

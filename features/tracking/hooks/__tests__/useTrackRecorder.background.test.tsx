// Phase 2 auf Hook-Ebene: useTrackRecorder registriert die Lay-Session in der
// Runtime, bindet den Hintergrund-Task und hängt sich bei Resume an DENSELBEN
// Session-State an. Echter Hook, echter Task-Executor, echte Runtime/Registry.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import * as TaskManager from 'expo-task-manager';
import { useTrackRecorder } from '../useTrackRecorder';
import { useTrackingStore } from '../../store/trackingStore';
import { useActiveFaehrten } from '../../store/activeFaehrten';
import { getLaySessionStatus, getBackgroundLayBinding, __resetLaySessionRuntimeForTests } from '../../engine/laySessionRuntime';
import { createLocalTrackPointsBatch } from '@/features/tracking/repositories/localTrackRepository';
import { finalizeLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockUuid = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 }, ActivityType: { Fitness: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: jest.fn(async () => {}), stopLocationUpdatesAsync: jest.fn(async () => {}),
  hasStartedLocationUpdatesAsync: jest.fn(async () => true),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchHeadingAsync: jest.fn(() => new Promise(() => {})),
}));
let feedFix: ((sample: any) => void) | null = null;
jest.mock('../../utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({ coords: { latitude: s.lat, longitude: s.lng, accuracy: s.accuracy, altitude: null, speed: s.speed, heading: null }, timestamp: s.t }),
  startPositionSource: jest.fn(async (callback: (sample: any) => void) => {
    feedFix = callback;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo' } };
  }),
}));
jest.mock('../../store/trackingStore', () => {
  const state = {
    isPaused: false, distanceMeters: 0, durationSeconds: 0, trackPoints: [] as any[], markers: [] as any[], segments: [] as any[],
    startLockActive: false, gpsAccuracy: 5,
    startRecording: jest.fn(), setStartLockActive: jest.fn((a: boolean) => { state.startLockActive = a; }),
    setStartAnchor: jest.fn(), setStartDriftRejectedCount: jest.fn(), setCurrentPosition: jest.fn(),
    addTrackPoint: jest.fn((p: any) => { state.trackPoints.push(p); }), setDistanceMeters: jest.fn((m: number) => { state.distanceMeters = m; }),
    setDuration: jest.fn(), setHeading: jest.fn(), stopRecording: jest.fn(), setLayFinishedAt: jest.fn(), setSaveState: jest.fn(),
    addMarker: jest.fn((m: any) => { state.markers.push(m); }),
  };
  return { useTrackingStore: { getState: () => state } };
});
jest.mock('../../utils/qaModeBootstrap', () => ({ hydrateQaModes: jest.fn(async () => {}) }));
jest.mock('../../utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => false }));
jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/locationSourceMode', () => ({ getLocationSourceMode: () => 'expo' }));
jest.mock('../../utils/trackingWarmupState', () => ({
  markWarmupStarted: jest.fn(), markReportedSource: jest.fn(), markWarmupStopped: jest.fn(), markMotionStarted: jest.fn(), markMotionSample: jest.fn(),
}));
jest.mock('../../native/motionClient', () => ({ motionClient: { start: jest.fn(async () => {}), stop: jest.fn(), onSample: jest.fn(() => ({ remove: jest.fn() })) } }));
jest.mock('../../native/precisionLocationClient', () => ({ precisionLocationClient: { requestTemporaryFullAccuracy: jest.fn(async () => {}) } }));
jest.mock('../../native/faehrteLiveActivity', () => ({ startFaehrteActivity: jest.fn(), updateFaehrteActivity: jest.fn(), stopFaehrteActivity: jest.fn() }));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  createLocalTrainingSession: jest.fn(async () => {}), finalizeLocalTrainingSession: jest.fn(async () => {}),
}));
jest.mock('@/features/tracking/services/trackService', () => ({ saveTrackMarker: jest.fn(async () => {}) }));
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({ enqueueSyncOperation: jest.fn(async () => {}) }));
jest.mock('@/features/sync/services/syncEngine', () => ({ syncNow: jest.fn(async () => {}) }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  createLocalTrackPointsBatch: jest.fn(async () => {}), createLocalTrackMarker: jest.fn(async () => 'mk_1'),
}));

type Recorder = ReturnType<typeof useTrackRecorder>;
let renderer: ReactTestRenderer | null = null;
let current: Recorder;
let clockMs = 1_000_000;
const lat = (m: number) => m / 111_320;
const task = (body: unknown): Promise<void> => (TaskManager.defineTask as jest.Mock).mock.calls[0][1](body);
const bgLoc = (afterMs: number, northM: number, accuracy = 5) => ({ coords: { latitude: lat(northM), longitude: 0, accuracy, altitude: null, speed: 1, heading: null }, timestamp: 1_000_000 + afterMs });
function Harness() { current = useTrackRecorder({ autoDetect: false }); return null; }
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function feed(afterMs: number, accuracy: number, northM: number) {
  clockMs = 1_000_000 + afterMs;
  act(() => { feedFix?.({ lat: lat(northM), lng: 0, accuracy, speed: 1, t: clockMs }); });
}
async function startWithBackground() {
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { await current.startWarmup(); });
  feed(0, 5, 0);
  await act(async () => {
    await current.beginRecording({ localId: 'lay-1', ownerId: 'owner', dogId: 'dog-1', onSessionStarted: () => {
      useActiveFaehrten.getState().upsert('dog-1', { status: 'laying', sessionId: 'lay-1', startedAt: clockMs });   // wie legen.tsx
    } });
    await settle();
  });
}
const state = () => useTrackingStore.getState() as any;

beforeAll(() => { require('../../native/backgroundLocationTask'); });
beforeEach(() => {
  clockMs = 1_000_000; feedFix = null;
  __resetLaySessionRuntimeForTests();
  useActiveFaehrten.setState({ byDog: {} });
  jest.spyOn(Date, 'now').mockImplementation(() => clockMs);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const s = state(); s.trackPoints.length = 0; s.markers.length = 0; s.distanceMeters = 0; s.startLockActive = false;
  (createLocalTrackPointsBatch as jest.Mock).mockReset().mockResolvedValue(undefined);
  (finalizeLocalTrainingSession as jest.Mock).mockClear();
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

it('bindet den Hintergrund-Task an genau diese Lay-Session und verarbeitet Task-Fixes im Hook-Processor', async () => {
  await startWithBackground();
  expect(getLaySessionStatus('lay-1')).toBe('active');
  expect(getBackgroundLayBinding()).toEqual({ sessionId: 'lay-1', dogId: 'dog-1' });
  // Start-Lock im Vordergrund lösen …
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  expect(state().startLockActive).toBe(false);
  const before = state().trackPoints.length;
  // … dann Display aus: Fixes kommen nur noch über den Task.
  clockMs = 1_000_000 + 3500;
  await act(async () => { await task({ data: { locations: [bgLoc(3500, 15), bgLoc(4500, 18)] }, error: null }); });
  expect(state().trackPoints.length).toBe(before + 2);
  // Akzeptierte Hintergrund-Punkte wurden vor Rückgabe des Tasks dauerhaft geschrieben.
  const written = (createLocalTrackPointsBatch as jest.Mock).mock.calls.flatMap(c => c[1]);
  expect(written.length).toBeGreaterThanOrEqual(before + 2);
});

it('Resume: nach Hintergrund-Fixes läuft der Vordergrund auf DEMSELBEN Session-State weiter (kein Reset)', async () => {
  await startWithBackground();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  clockMs = 1_000_000 + 3500;
  await act(async () => { await task({ data: { locations: [bgLoc(3500, 15), bgLoc(4500, 18)] }, error: null }); });
  const pointsAfterBg = state().trackPoints.length;
  const distAfterBg = state().distanceMeters;
  // App wieder im Vordergrund — derselbe Hook, dieselbe Session.
  feed(5500, 5, 21); feed(6500, 5, 24);
  expect(state().startLockActive).toBe(false);                 // kein erneuter Start-Lock
  expect(state().trackPoints.length).toBe(pointsAfterBg + 2);  // Linie wird fortgesetzt
  expect(state().distanceMeters).toBeGreaterThan(distAfterBg); // Distanz akkumuliert weiter
  expect(state().trackPoints[0].lat).toBeCloseTo(0, 5);        // derselbe Anker
});

it('derselbe Fix aus Vordergrund und Hintergrund wird genau einmal verarbeitet', async () => {
  await startWithBackground();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  const before = state().trackPoints.length;
  feed(3500, 5, 15);                                   // Vordergrund
  await act(async () => { await task({ data: { locations: [bgLoc(3500, 15)] }, error: null }); });   // gleicher Fix im Hintergrund
  expect(state().trackPoints.length).toBe(before + 1);
});

it('finish wartet auf einen laufenden Hintergrund-Write und finalisiert danach; spätere Fixes werden verworfen', async () => {
  await startWithBackground();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  let resolveWrite!: () => void;
  (createLocalTrackPointsBatch as jest.Mock).mockImplementationOnce(() => new Promise<void>(r => { resolveWrite = r; }));
  clockMs = 1_000_000 + 3500;
  let taskDone = false;
  let taskPromise!: Promise<void>;
  act(() => { taskPromise = task({ data: { locations: [bgLoc(3500, 15)] }, error: null }).then(() => { taskDone = true; }); });
  await act(async () => { await settle(); });
  expect(taskDone).toBe(false);
  await act(async () => { current.finish(); await settle(); });
  expect(getLaySessionStatus('lay-1')).toBe('finalizing');
  expect(finalizeLocalTrainingSession).not.toHaveBeenCalled();   // Finalize wartet auf den laufenden Write
  const points = state().trackPoints.length;
  await act(async () => { await task({ data: { locations: [bgLoc(4500, 18)] }, error: null }); });
  expect(state().trackPoints.length).toBe(points);                // nach Finalize-Beginn kein neuer Punkt
  await act(async () => { resolveWrite(); await taskPromise; await settle(); await settle(); });
  expect(taskDone).toBe(true);
  expect(finalizeLocalTrainingSession).toHaveBeenCalledTimes(1);
  expect(getLaySessionStatus('lay-1')).toBe('finalized');
});

it('Unmount stoppt die Session (bestehendes Lifecycle-Verhalten): danach kein fachlicher Write mehr', async () => {
  await startWithBackground();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  act(() => { renderer?.unmount(); }); renderer = null;
  expect(getLaySessionStatus('lay-1')).toBe('stopped');
  expect(getBackgroundLayBinding()).toBeNull();
  const points = state().trackPoints.length;
  await act(async () => { await task({ data: { locations: [bgLoc(3500, 15)] }, error: null }); });
  expect(state().trackPoints.length).toBe(points);
});

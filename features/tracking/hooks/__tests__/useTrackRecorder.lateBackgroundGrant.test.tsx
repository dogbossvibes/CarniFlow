// T-191: Wird die „Immer"-Standortfreigabe erst NACH dem Aufnahmestart erteilt (iOS zeigt den
// Systemdialog verzögert, die erste Anfrage kehrt mit `denied` zurück), muss der Hintergrund-Task
// beim Zurückkehren in den Vordergrund genau einmal nachgestartet werden. Echter Hook, echte Runtime.
import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import * as Location from 'expo-location';
import { startPositionSource } from '../../utils/positionSource';
import { useTrackRecorder } from '../useTrackRecorder';
import { useTrackingStore } from '../../store/trackingStore';
import { useActiveFaehrten } from '../../store/activeFaehrten';
import { getBackgroundLayBinding, __resetLaySessionRuntimeForTests } from '../../engine/laySessionRuntime';
import { createLocalTrackPointsBatch } from '@/features/tracking/repositories/localTrackRepository';
import { createLocalTrainingSession, finalizeLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
jest.mock('@/lib/diagnosticsAccessState', () => ({
  diagnosticsAccessToken: () => 'authorized-fixture',
  getDiagnosticsAccessSnapshot: () => ({ userId: 'user-1', generation: 1, allowed: true }),
  hasDiagnosticsAccess: () => true,
  subscribeDiagnosticsAccess: () => () => {},
  assertDiagnosticsAccess: () => {},
}));

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
    annotateAngleGeometry: jest.fn((entries: unknown) => { state.markers = jest.requireActual('../../utils/specialAngleGeometry').attachSpecialGeometry(state.markers, entries); }),
  };
  return { useTrackingStore: { getState: () => state } };
});
jest.mock('../../utils/qaModeBootstrap', () => ({ hydrateQaModes: jest.fn(async () => {}) }));
let mockQaOn = false;
jest.mock('../../utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => mockQaOn, subscribeQaDiagnostics: () => () => {} }));
jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/locationSourceMode', () => ({ getLocationSourceMode: () => 'expo' }));
jest.mock('../../utils/trackingWarmupState', () => ({
  ...jest.requireActual('../../utils/trackingWarmupState'),
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
let appStateListener: ((next: AppStateStatus) => void) | null = null;
const lat = (m: number) => m / 111_320;
const setCurrent = (recorder: Recorder) => { current = recorder; };
function Harness({ onRecorder }: { onRecorder: (recorder: Recorder) => void }) {
  onRecorder(useTrackRecorder({ autoDetect: false }));
  return null;
}
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function feed(afterMs: number, accuracy: number, northM: number) {
  clockMs = 1_000_000 + afterMs;
  act(() => { feedFix?.({ lat: lat(northM), lng: 0, accuracy, speed: 1, t: clockMs }); });
}
async function startRecording() {
  await act(async () => { renderer = TestRenderer.create(<Harness onRecorder={setCurrent} />); });
  await act(async () => { await current.startWarmup(); });
  feed(0, 5, 0);
  await act(async () => {
    await current.beginRecording({ localId: 'lay-1', ownerId: 'owner', dogId: 'dog-1', onSessionStarted: () => {
      useActiveFaehrten.getState().upsert('dog-1', { status: 'laying', sessionId: 'lay-1', startedAt: clockMs });
    } });
    await settle();
  });
}
/** iOS-Systemdialog: App wird kurz `inactive`, danach wieder `active`. */
async function returnFromSystemDialog() {
  await act(async () => { appStateListener?.('inactive'); appStateListener?.('active'); await settle(); await settle(); });
}
const fallbackWatch = async () => (startPositionSource as jest.Mock).mock.results.at(-1)!.value as Promise<{ stop: jest.Mock }>;
const state = () => useTrackingStore.getState() as any;
const getBg = Location.getBackgroundPermissionsAsync as jest.Mock;
const requestBg = Location.requestBackgroundPermissionsAsync as jest.Mock;
const startUpdates = Location.startLocationUpdatesAsync as jest.Mock;
/** Erste Aufnahme nach Installation: `undetermined`, die Anfrage kehrt sofort mit `denied` zurück. */
function permissionUndeterminedThenDenied() {
  getBg.mockReset().mockResolvedValue({ status: 'undetermined', canAskAgain: true });
  requestBg.mockReset().mockResolvedValue({ status: 'denied', canAskAgain: true });
}

beforeAll(() => { require('../../native/backgroundLocationTask'); });
beforeEach(() => {
  mockQaOn = false;
  clockMs = 1_000_000; feedFix = null; appStateListener = null;
  __resetLaySessionRuntimeForTests();
  useActiveFaehrten.setState({ byDog: {} });
  jest.spyOn(Date, 'now').mockImplementation(() => clockMs);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appStateListener = listener as (next: AppStateStatus) => void;
    return { remove: jest.fn() } as any;
  });
  const s = state(); s.trackPoints.length = 0; s.markers.length = 0; s.distanceMeters = 0; s.startLockActive = false;
  (createLocalTrackPointsBatch as jest.Mock).mockReset().mockResolvedValue(undefined);
  (finalizeLocalTrainingSession as jest.Mock).mockReset().mockResolvedValue(undefined);
  (createLocalTrainingSession as jest.Mock).mockClear();
  startUpdates.mockReset().mockResolvedValue(undefined);
  (Location.stopLocationUpdatesAsync as jest.Mock).mockClear();
  (Location.watchHeadingAsync as jest.Mock).mockReset().mockImplementation(() => new Promise(() => {}));
  permissionUndeterminedThenDenied();
});
afterEach(async () => { await act(async () => { renderer?.unmount(); await settle(); }); renderer = null; jest.restoreAllMocks(); });

it('späte „Immer"-Freigabe startet den Hintergrund-Task genau einmal und löst erst danach den Vordergrund-Watch ab', async () => {
  await startRecording();
  const fallback = await fallbackWatch();
  expect(startUpdates).not.toHaveBeenCalled();
  expect(getBackgroundLayBinding()).toBeNull();
  expect(fallback.stop).not.toHaveBeenCalled();

  // Nutzerin bestätigt „Immer" im Systemdialog; der native Start braucht noch einen Moment.
  getBg.mockResolvedValue({ status: 'granted', canAskAgain: true });
  let releaseStart!: () => void;
  startUpdates.mockImplementationOnce(() => new Promise<void>(resolve => { releaseStart = resolve; }));
  await returnFromSystemDialog();
  expect(startUpdates).toHaveBeenCalledTimes(1);
  expect(getBackgroundLayBinding()).toEqual({ sessionId: 'lay-1', dogId: 'dog-1' });
  // Keine Lücke: bis der Task wirklich läuft, bleibt der Vordergrund-Strom aktiv und liefert weiter.
  expect(fallback.stop).not.toHaveBeenCalled();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  expect(state().trackPoints.length).toBeGreaterThan(0);
  // Erneutes Aktivwerden während des laufenden Starts: kein zweiter Start.
  await returnFromSystemDialog();
  expect(startUpdates).toHaveBeenCalledTimes(1);

  await act(async () => { releaseStart(); await settle(); await settle(); });
  expect(fallback.stop).toHaveBeenCalledTimes(1);

  // Weitere Vordergrund-Wechsel: weder zweiter Start noch erneute Berechtigungsabfrage.
  await returnFromSystemDialog();
  await returnFromSystemDialog();
  expect(startUpdates).toHaveBeenCalledTimes(1);
  expect(requestBg).toHaveBeenCalledTimes(1);
});

it('ohne Freigabe bleibt der Vordergrund-Fallback aktiv und es wird nicht erneut gefragt', async () => {
  await startRecording();
  const fallback = await fallbackWatch();
  getBg.mockResolvedValue({ status: 'denied', canAskAgain: true });
  await returnFromSystemDialog();
  await returnFromSystemDialog();
  await returnFromSystemDialog();
  expect(startUpdates).not.toHaveBeenCalled();
  expect(getBackgroundLayBinding()).toBeNull();
  expect(fallback.stop).not.toHaveBeenCalled();
  expect(requestBg).toHaveBeenCalledTimes(1);
  // Der Vordergrund-Strom nimmt weiter auf.
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  expect(state().trackPoints.length).toBeGreaterThan(0);
});

it('Stop vor der Freigabe: eine danach erteilte Freigabe startet nichts', async () => {
  await startRecording();
  act(() => { current.stopAll(); });
  getBg.mockResolvedValue({ status: 'granted', canAskAgain: true });
  await returnFromSystemDialog();
  expect(startUpdates).not.toHaveBeenCalled();
  expect(getBackgroundLayBinding()).toBeNull();
});

it('Stop während die späte Freigabe noch gelesen wird: kein Start nach Stop', async () => {
  await startRecording();
  let releasePermission!: (permission: { status: string; canAskAgain: boolean }) => void;
  getBg.mockImplementationOnce(() => new Promise(resolve => { releasePermission = resolve; }));
  await returnFromSystemDialog();
  act(() => { current.stopAll(); });
  await act(async () => { releasePermission({ status: 'granted', canAskAgain: true }); await settle(); await settle(); });
  expect(startUpdates).not.toHaveBeenCalled();
  expect(getBackgroundLayBinding()).toBeNull();
});

it('Stop während des späten nativen Starts räumt serialisiert auf und lässt den Task nicht laufen', async () => {
  await startRecording();
  const operations: string[] = [];
  let releaseStart!: () => void;
  startUpdates.mockImplementationOnce(() => { operations.push('start'); return new Promise<void>(resolve => { releaseStart = resolve; }); });
  (Location.stopLocationUpdatesAsync as jest.Mock).mockImplementation(async () => { operations.push('stop'); });
  getBg.mockResolvedValue({ status: 'granted', canAskAgain: true });
  await returnFromSystemDialog();
  act(() => { current.stopAll(); });
  expect(operations).toEqual(['start']);
  await act(async () => { releaseStart(); await settle(); await settle(); });
  expect(operations).toEqual(['start', 'stop']);
  expect(getBackgroundLayBinding()).toBeNull();
});

it('Freigabe-Antwort und Vordergrund-Rückkehr gleichzeitig: trotzdem nur ein Start', async () => {
  // Variante, in der die Anfrage selbst erst mit dem Dialog-Entscheid zurückkehrt.
  let releaseRequest!: (permission: { status: string }) => void;
  requestBg.mockReset().mockImplementationOnce(() => new Promise(resolve => { releaseRequest = resolve; }));
  await startRecording();
  expect(startUpdates).not.toHaveBeenCalled();
  getBg.mockResolvedValue({ status: 'granted', canAskAgain: true });
  await returnFromSystemDialog();
  await act(async () => { releaseRequest({ status: 'granted' }); await settle(); await settle(); });
  expect(startUpdates).toHaveBeenCalledTimes(1);
  expect(getBackgroundLayBinding()).toEqual({ sessionId: 'lay-1', dogId: 'dog-1' });
});

it('bereits erteilte Freigabe: Start wie bisher direkt beim Aufnahmestart, kein zweiter beim Aktivwerden', async () => {
  getBg.mockReset().mockResolvedValue({ status: 'granted', canAskAgain: true });
  requestBg.mockReset().mockResolvedValue({ status: 'granted' });
  await startRecording();
  expect(startUpdates).toHaveBeenCalledTimes(1);
  await returnFromSystemDialog();
  expect(startUpdates).toHaveBeenCalledTimes(1);
});

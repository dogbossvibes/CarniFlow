import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useTrackRecorder } from '../useTrackRecorder';
import { useTrackingStore } from '../../store/trackingStore';
import { requestVoice, resetVoiceEvents } from '../../utils/voiceEvents';
import { saveQaSessionCapture } from '../../utils/qaSessionCapture';
import { createLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackMarker } from '@/features/tracking/repositories/localTrackRepository';
import * as Speech from 'expo-speech';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getBackgroundPermissionsAsync: jest.fn(() => new Promise(() => {})),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchHeadingAsync: jest.fn(() => new Promise(() => {})),
}));
let feedFix: ((sample: any) => void) | null = null;
let mockQaEnabled = false;
jest.mock('../../utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({ coords: {
    latitude: s.lat, longitude: s.lng, accuracy: s.accuracy,
    altitude: null, speed: s.speed, heading: null,
  }, timestamp: s.t }),
  startPositionSource: jest.fn(async (callback: (sample: any) => void) => {
    feedFix = callback;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo' } };
  }),
}));
jest.mock('../../store/trackingStore', () => {
  const state = {
    isPaused: false, distanceMeters: 0, durationSeconds: 0, trackPoints: [] as any[],
    markers: [] as any[], segments: [] as any[], startLockActive: false, gpsAccuracy: 5,
    startRecording: jest.fn(), setStartLockActive: jest.fn((active: boolean) => { state.startLockActive = active; }),
    setStartAnchor: jest.fn(), setStartDriftRejectedCount: jest.fn(),
    setCurrentPosition: jest.fn(), addTrackPoint: jest.fn((p: any) => { state.trackPoints.push(p); }),
    setDistanceMeters: jest.fn((m: number) => { state.distanceMeters = m; }),
    setDuration: jest.fn(), setHeading: jest.fn(),
    stopRecording: jest.fn(), setLayFinishedAt: jest.fn(), setSaveState: jest.fn(),
    addMarker: jest.fn((m: any) => { state.markers.push(m); }),
  };
  return { useTrackingStore: { getState: () => state } };
});
jest.mock('../../utils/qaModeBootstrap', () => ({ hydrateQaModes: jest.fn(async () => {}) }));
jest.mock('../../utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => mockQaEnabled }));
jest.mock('../../utils/qaSessionCapture', () => ({
  ...jest.requireActual('../../utils/qaSessionCapture'),
  saveQaSessionCapture: jest.fn(async () => {}),
}));
jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/locationSourceMode', () => ({ getLocationSourceMode: () => 'expo' }));
jest.mock('../../utils/trackingWarmupState', () => ({
  markWarmupStarted: jest.fn(), markReportedSource: jest.fn(), markWarmupStopped: jest.fn(),
  markMotionStarted: jest.fn(), markMotionSample: jest.fn(),
}));
jest.mock('../../native/motionClient', () => ({ motionClient: {
  start: jest.fn(async () => {}), stop: jest.fn(), onSample: jest.fn(() => ({ remove: jest.fn() })),
} }));
jest.mock('../../native/precisionLocationClient', () => ({ precisionLocationClient: { requestTemporaryFullAccuracy: jest.fn(async () => {}) } }));
jest.mock('../../native/backgroundLocationTask', () => ({
  setTrackFixHandler: jest.fn(), startBackgroundUpdates: jest.fn(), stopBackgroundUpdates: jest.fn(),
}));
jest.mock('../../native/faehrteLiveActivity', () => ({
  startFaehrteActivity: jest.fn(), updateFaehrteActivity: jest.fn(), stopFaehrteActivity: jest.fn(),
}));
jest.mock('@/features/training/repositories/localTrainingRepository', () => ({
  createLocalTrainingSession: jest.fn(async () => {}), finalizeLocalTrainingSession: jest.fn(async () => {}),
}));
jest.mock('@/features/tracking/services/trackService', () => ({ saveTrackMarker: jest.fn(async () => {}) }));
jest.mock('@/features/sync/repositories/syncQueueRepository', () => ({ enqueueSyncOperation: jest.fn(async () => {}) }));
jest.mock('@/features/sync/services/syncEngine', () => ({ syncNow: jest.fn(async () => {}) }));
jest.mock('@/features/tracking/repositories/localTrackRepository', () => ({
  createLocalTrackPointsBatch: jest.fn(async () => {}), createLocalTrackMarker: jest.fn(async () => {}),
}));

type Recorder = ReturnType<typeof useTrackRecorder>;
let renderer: ReactTestRenderer | null = null;
let current: Recorder;
let clockMs = 1_000_000;
const metersToLatitude = (m: number) => m / 111_320;
function Harness() { current = useTrackRecorder({ autoDetect: false }); return null; }
async function start(onSessionStarted?: () => void) {
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { expect((await current.startWarmup()).error).toBeNull(); });
  feed(0, 5, 0);
  current.noteUserTapStart();
  await act(async () => {
    expect((await current.beginRecording({ localId: 'local', ownerId: 'owner', onSessionStarted })).error).toBeNull();
  });
}
function feed(afterTapMs: number, accuracy: number, northM: number, speed = 0) {
  clockMs = 1_000_000 + afterTapMs;
  act(() => { feedFix?.({ lat: metersToLatitude(northM), lng: 0, accuracy, speed, t: clockMs }); });
}
beforeEach(() => {
  clockMs = 1_000_000;
  feedFix = null;
  mockQaEnabled = false;
  (saveQaSessionCapture as jest.Mock).mockClear();
  (createLocalTrainingSession as jest.Mock).mockReset().mockResolvedValue(undefined);
  (createLocalTrackMarker as jest.Mock).mockClear();
  (Speech.speak as jest.Mock).mockClear();
  jest.spyOn(Date, 'now').mockImplementation(() => clockMs);
  const state = useTrackingStore.getState();
  state.trackPoints.length = 0;
  state.markers.length = 0;
  state.distanceMeters = 0;
  state.startLockActive = false;
  resetVoiceEvents(clockMs);
});
afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.restoreAllMocks();
});

it('good fixes and confirmed movement start geometry at 600 ms without a minimum timer', async () => {
  mockQaEnabled = true;
  const visible = jest.fn();
  await start(visible);
  expect(visible).toHaveBeenCalledTimes(1);
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  const state = useTrackingStore.getState();
  expect(state.trackPoints).toHaveLength(0);
  feed(500, 5, 10);
  expect(state.trackPoints).toHaveLength(0);
  feed(600, 5, 12);
  expect(state.startLockActive).toBe(false);
  expect(state.trackPoints.length).toBeGreaterThan(0);
  expect(clockMs - 1_000_000).toBe(600);
  await act(async () => { current.finish(); await Promise.resolve(); });
  const capture = (saveQaSessionCapture as jest.Mock).mock.calls[0][0];
  expect(capture.startupDiagnostics).toMatchObject({
    recordingSessionStartedTSec: 0, geometryStartedTSec: 0.6,
    startupUiDelayMs: 0, geometryLockDelayMs: 600,
    movementConfirmedTSec: 0.6, fallbackUsed: false,
  });
});

it('at one fix per second, the fourth anchor fix and second movement fix release at 6 seconds', async () => {
  await start();
  for (const ms of [1000, 2000, 3000, 4000]) feed(ms, 5, 0);
  feed(5000, 5, 10);
  expect(useTrackingStore.getState().trackPoints).toHaveLength(0);
  feed(6000, 5, 12);
  expect(useTrackingStore.getState().startLockActive).toBe(false);
  expect(clockMs - 1_000_000).toBe(6000);
});

it('bad fixes stay out of geometry; a later usable fix has no extra 12-second delay', async () => {
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 35, 0);
  const state = useTrackingStore.getState();
  expect(state.trackPoints).toHaveLength(0);
  expect(state.startLockActive).toBe(true);
  for (const ms of [2100, 2200, 2300, 2400]) feed(ms, 5, 0);
  feed(2500, 5, 10);
  feed(2600, 5, 12);
  expect(state.startLockActive).toBe(false);
  expect(state.trackPoints.length).toBeGreaterThan(0);
  expect(state.trackPoints[0].lat).toBeCloseTo(0, 5);
  expect(clockMs - 1_000_000).toBe(2600);
});

it('a queued voice event does not await native TTS before arming the recorder', async () => {
  expect(requestVoice({ eventType: 'status', text: 'Bereit', language: 'de-CH',
    priority: 1, onceKey: 'startup-test', phase: 'lay' })).toBe(true);
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(500, 5, 10);
  feed(600, 5, 12);
  expect(useTrackingStore.getState().startLockActive).toBe(false);
  expect(clockMs - 1_000_000).toBe(600);
});

it('keeps an inaccurate early fix in QA while geometry and distance remain empty', async () => {
  mockQaEnabled = true;
  await start();
  feed(100, 35, 0);
  expect(useTrackingStore.getState().trackPoints).toHaveLength(0);
  expect(useTrackingStore.getState().distanceMeters).toBe(0);
  await act(async () => { current.finish(); await Promise.resolve(); });
  expect(saveQaSessionCapture).toHaveBeenCalled();
  const capture = (saveQaSessionCapture as jest.Mock).mock.calls[0][0];
  expect(capture.rawFixes.some((fix: { accuracy: number }) => fix.accuracy === 35)).toBe(true);
  expect(capture.linePoints).toHaveLength(0);
  expect(capture.detectorPoints).toHaveLength(0);
  expect(capture.startupDiagnostics.blockingReason).toBe('waiting_for_stable_anchor');
});

it('shows the session and starts its timer before SQLite resolves; geometry fallback remains separate', async () => {
  mockQaEnabled = true;
  let resolveLocal!: () => void;
  (createLocalTrainingSession as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { resolveLocal = resolve; }));
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { await current.startWarmup(); });
  feed(0, 5, 0);
  current.noteUserTapStart();
  const visible = jest.fn(() => {
    requestVoice({ eventType: 'status', text: 'Aufzeichnung gestartet.', language: 'de-CH',
      priority: 3, onceKey: 'lay-recording-start', phase: 'lay' });
  });
  const timer = jest.spyOn(global, 'setInterval');
  let pending!: Promise<{ error: string | null }>;
  act(() => { pending = current.beginRecording({ localId: 'local', ownerId: 'owner', onSessionStarted: visible }); });
  expect(visible).toHaveBeenCalledTimes(1);
  expect(timer).toHaveBeenCalled();
  expect(useTrackingStore.getState().startLockActive).toBe(true);
  expect(useTrackingStore.getState().trackPoints).toHaveLength(0);
  for (const ms of [100, 200, 300, 400, 11900]) feed(ms, 5, 0);
  expect(useTrackingStore.getState().startLockActive).toBe(true);
  expect(visible).toHaveBeenCalledTimes(1);
  feed(12000, 5, 0);
  expect(useTrackingStore.getState().startLockActive).toBe(false);
  expect(useTrackingStore.getState().trackPoints).toHaveLength(1);
  expect(Speech.speak).toHaveBeenCalledTimes(1);
  await act(async () => { resolveLocal(); await pending; });
  await act(async () => { current.finish(); await Promise.resolve(); });
  const capture = (saveQaSessionCapture as jest.Mock).mock.calls[0][0];
  expect(capture.startupDiagnostics).toMatchObject({
    recordingSessionStartedTSec: 0, geometryStartedTSec: 12,
    startupUiDelayMs: 0, geometryLockDelayMs: 12000, fallbackUsed: true,
    movementConfirmedTSec: null,
  });
  expect(capture.distances.storeDistanceM).toBe(0);
});

it('keeps a marker write behind the pending local session while the UI is active', async () => {
  let resolveLocal!: () => void;
  (createLocalTrainingSession as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { resolveLocal = resolve; }));
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { await current.startWarmup(); });
  feed(0, 5, 0);
  const visible = jest.fn();
  let pending!: Promise<{ error: string | null }>;
  act(() => { pending = current.beginRecording({ localId: 'local', ownerId: 'owner', onSessionStarted: visible }); });
  expect(visible).toHaveBeenCalledTimes(1);
  const marker = current.addMarker('gegenstand');
  expect(useTrackingStore.getState().markers).toHaveLength(1);
  expect(createLocalTrackMarker).not.toHaveBeenCalled();
  await act(async () => { resolveLocal(); await pending; await marker; });
  expect(createLocalTrackMarker).toHaveBeenCalledTimes(1);
});

it('does not start a session with poor warmup accuracy, then starts when it becomes usable', async () => {
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { await current.startWarmup(); });
  const visible = jest.fn();
  feed(100, 35, 0);
  await act(async () => {
    expect((await current.beginRecording({ localId: 'local', ownerId: 'owner', onSessionStarted: visible })).error)
      .toBe('gps_not_ready');
  });
  expect(visible).not.toHaveBeenCalled();
  expect(useTrackingStore.getState().startLockActive).toBe(false);
  expect(useTrackingStore.getState().trackPoints).toHaveLength(0);
  feed(200, 5, 0);
  await act(async () => {
    expect((await current.beginRecording({ localId: 'local', ownerId: 'owner', onSessionStarted: visible })).error)
      .toBeNull();
  });
  expect(visible).toHaveBeenCalledTimes(1);
});

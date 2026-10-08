
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useTrackRecorder } from '../useTrackRecorder';
import { useTrackingStore } from '../../store/trackingStore';
import { resetVoiceEvents } from '../../utils/voiceEvents';
import { saveQaSessionCapture } from '../../utils/qaSessionCapture';
import { createLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackMarker, createLocalTrackPointsBatch } from '@/features/tracking/repositories/localTrackRepository';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot, revokeDiagnosticsAccess, DIAGNOSTICS_ACCESS_TTL_MS } from '@/lib/diagnosticsAccessState';
import { loadQaPreferences, setQaPreference, getQaPreferences } from '../../utils/qaPreferences';
import { startPositionSource } from '../../utils/positionSource';
import { evaluateStopFlush } from '../../utils/stopFlushCorner';
import * as Location from 'expo-location';
import { loadQaRecordingEvidence } from '../../utils/qaRecordingEvidenceStore';
let mockTaskCallback: (body: any) => void;
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn((_name: string, callback: any) => { mockTaskCallback = callback; }) }));
jest.mock('../../utils/stopFlushCorner', () => ({ ...jest.requireActual('../../utils/stopFlushCorner'), evaluateStopFlush: jest.fn(jest.requireActual('../../utils/stopFlushCorner').evaluateStopFlush) }));

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  ActivityType: { Fitness: 3 },
  getBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: jest.fn(async () => {}),
  hasStartedLocationUpdatesAsync: jest.fn(async () => true),
  stopLocationUpdatesAsync: jest.fn(async () => {}),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchHeadingAsync: jest.fn(() => new Promise(() => {})),
}));
let feedFix: ((sample: any) => void) | null = null;
const mockSourceStop = jest.fn();
jest.mock('../../utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({ coords: {
    latitude: s.lat, longitude: s.lng, accuracy: s.accuracy,
    altitude: null, speed: s.speed, heading: null,
  }, timestamp: s.t }),
  startPositionSource: jest.fn(async (callback: (sample: any) => void) => {
    feedFix = callback;
    return { stop: mockSourceStop, info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo' } };
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
jest.mock('../../utils/qaSessionCapture', () => ({
  ...jest.requireActual('../../utils/qaSessionCapture'),
  saveQaSessionCapture: jest.fn(async () => {}),
}));
jest.mock('../../utils/trackingWarmupState', () => ({
  ...jest.requireActual('../../utils/trackingWarmupState'),
  markWarmupStarted: jest.fn(), markReportedSource: jest.fn(), markWarmupStopped: jest.fn(),
  markMotionStarted: jest.fn(), markMotionSample: jest.fn(),
}));
jest.mock('../../native/motionClient', () => ({ motionClient: {
  start: jest.fn(async () => {}), stop: jest.fn(), onSample: jest.fn(() => ({ remove: jest.fn() })),
} }));
jest.mock('../../native/precisionLocationClient', () => ({ precisionLocationClient: { requestTemporaryFullAccuracy: jest.fn(async () => {}) } }));
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
function Harness() { current = useTrackRecorder({ autoDetect: true }); return null; }
async function start(onSessionStarted?: () => void) {
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { expect((await current.startWarmup()).error).toBeNull(); });
  feed(0, 5, 0);
  current.noteUserTapStart();
  await act(async () => {
    expect((await current.beginRecording({ localId: 'local', ownerId: 'owner', onSessionStarted })).error).toBeNull();
  });
}
function feed(afterTapMs: number, accuracy: number, northM: number, speed = 0, ageMs = 0) {
  clockMs = 1_000_000 + afterTapMs;
  act(() => { feedFix?.({ lat: metersToLatitude(northM), lng: 0, accuracy, speed, t: clockMs - ageMs }); });
}
async function resetRun() {
  clockMs = 1_000_000;
  feedFix = null;
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.clearAllMocks();
  setDiagnosticsSession(null);
  setDiagnosticsSession('owner');
  resolveDiagnosticsAccess('owner', getDiagnosticsAccessSnapshot().generation, true);
  await loadQaPreferences();
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
}
beforeEach(resetRun);
function cleanupRun() {
  act(() => { renderer?.unmount(); });
  renderer = null;
  setDiagnosticsSession(null);
  jest.useRealTimers();
  jest.restoreAllMocks();
}
afterEach(cleanupRun);


function backgroundFeed(ms: number, northM: number, accuracy = 5) {
  clockMs = 1_000_000 + ms;
  act(() => mockTaskCallback({ data: { locations: [{ coords: {
    latitude: metersToLatitude(northM), longitude: 0, accuracy, altitude: null, speed: 0, heading: null,
  }, timestamp: clockMs }] }, error: null }));
}
async function backgroundRun(qa: boolean, revoke?: () => void) {
  setQaPreference('diagnostics', qa);
  await start();
  expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith('anyvo-faehrte-bg', expect.objectContaining({ deferredUpdatesInterval: 30000 }));
  expect(mockSourceStop).toHaveBeenCalledTimes(1);
  for (const ms of [100, 200, 300, 400]) backgroundFeed(ms, 0);
  backgroundFeed(1500, 10);
  backgroundFeed(2500, 12);
  const before = useTrackingStore.getState().trackPoints.length;
  revoke?.();
  backgroundFeed(3500, 15);
  backgroundFeed(4500, 18);
  backgroundFeed(5500, 25, 70); // poor accuracy: no line point
  backgroundFeed(6500, 24);
  backgroundFeed(7500, 300); // implausible jump
  backgroundFeed(8500, 27);
  expect(useTrackingStore.getState().trackPoints.length).toBeGreaterThan(before);
  expect(Location.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
  expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
  expect(startPositionSource).toHaveBeenCalledTimes(1);
  expect(mockSourceStop).toHaveBeenCalledTimes(1);
  const state = useTrackingStore.getState();
  const result = { points: [...state.trackPoints], markers: [...state.markers], distance: state.distanceMeters };
  await act(async () => { await current.finish(); });
  expect(createLocalTrackPointsBatch).toHaveBeenCalled();
  return result;
}
it('keeps the existing Android callback and persistence output with QA disabled', async () => {
  await backgroundRun(false);
  expect(saveQaSessionCapture).not.toHaveBeenCalled();
  expect(evaluateStopFlush).not.toHaveBeenCalled();
});
it('adds QA observations without changing the same background points, distance or markers', async () => {
  const plainOutput = await backgroundRun(false);
  cleanupRun(); await resetRun();
  expect(await backgroundRun(true)).toEqual(plainOutput);
  expect(saveQaSessionCapture).toHaveBeenCalledTimes(1);
  expect(evaluateStopFlush).toHaveBeenCalledTimes(1);
});
it.each(['revocation', 'logout', 'account-change', 'lease-expiry'] as const)('closes QA on %s while the existing background stream keeps processing', async reason => {
  const plainOutput = await backgroundRun(false);
  cleanupRun(); await resetRun();
  const result = await backgroundRun(true, () => {
    if (reason === 'revocation') revokeDiagnosticsAccess();
    if (reason === 'logout') setDiagnosticsSession(null);
    if (reason === 'account-change') setDiagnosticsSession('another-owner');
    if (reason === 'lease-expiry') {
      // An expired lease with suspended timers must be caught on the next callback.
      const snap = getDiagnosticsAccessSnapshot();
      jest.spyOn(Date, 'now').mockReturnValue(snap.expiresAt + DIAGNOSTICS_ACCESS_TTL_MS);
    }
    expect(getQaPreferences().diagnostics).toBe(false);
  });
  expect(result).toEqual(plainOutput);
  expect(saveQaSessionCapture).not.toHaveBeenCalled();
  // Existing QA-selected finish semantics remain fixed until the session stops.
  expect(evaluateStopFlush).toHaveBeenCalledTimes(1);
  await expect(loadQaRecordingEvidence('local')).rejects.toThrow();
});
it('retains a selected legacy engine across background handoff and revocation until stop', async () => {
  setQaPreference('engine', 'build40');
  setQaPreference('source', 'legacy');
  setQaPreference('diagnostics', true);
  await start();
  revokeDiagnosticsAccess();
  expect(getQaPreferences()).toMatchObject({ engine: 'build40', source: 'legacy', diagnostics: false });
  await act(async () => { await current.finish(); });
  expect(getQaPreferences()).toMatchObject({ engine: 'current', source: 'precision', diagnostics: false });
});

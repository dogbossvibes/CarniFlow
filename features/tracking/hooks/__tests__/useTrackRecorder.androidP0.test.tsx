
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useTrackRecorder } from '../useTrackRecorder';
import { useTrackingStore } from '../../store/trackingStore';
import { resetVoiceEvents } from '../../utils/voiceEvents';
import { saveQaSessionCapture } from '../../utils/qaSessionCapture';
import { createLocalTrainingSession, finalizeLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackMarker, createLocalTrackPointsBatch } from '@/features/tracking/repositories/localTrackRepository';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { setDiagnosticsSession, resolveDiagnosticsAccess, getDiagnosticsAccessSnapshot,  } from '@/lib/diagnosticsAccessState';
import { loadQaPreferences } from '../../utils/qaPreferences';
import * as Location from 'expo-location';
import { setTrackFixHandler } from '../../native/backgroundLocationTask';
let mockTaskCallback: (body: any) => Promise<void>;
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
    annotateAngleGeometry: jest.fn((entries: unknown) => { state.markers = jest.requireActual('../../utils/specialAngleGeometry').attachSpecialGeometry(state.markers, entries); }),
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
async function start(onSessionStarted?: () => void, localId = 'local') {
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
  await act(async () => { expect((await current.startWarmup()).error).toBeNull(); });
  feed(0, 5, 0);
  current.noteUserTapStart();
  await act(async () => {
    expect((await current.beginRecording({ localId, ownerId: 'owner', dogId: 'dog-1', onSessionStarted })).error).toBeNull();
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
  (createLocalTrackPointsBatch as jest.Mock).mockReset().mockResolvedValue(undefined);
  (Location.getBackgroundPermissionsAsync as jest.Mock).mockReset().mockResolvedValue({ status: 'granted', canAskAgain: true });
  (Location.startLocationUpdatesAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
  setDiagnosticsSession(null);
  setDiagnosticsSession('owner');
  resolveDiagnosticsAccess('owner', getDiagnosticsAccessSnapshot().generation, true);
  await loadQaPreferences();
  (saveQaSessionCapture as jest.Mock).mockClear();
  (createLocalTrainingSession as jest.Mock).mockReset().mockResolvedValue(undefined);
  (finalizeLocalTrainingSession as jest.Mock).mockReset().mockResolvedValue(undefined);
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
afterEach(async () => { cleanupRun(); for (let i = 0; i < 30; i++) await Promise.resolve(); });


async function backgroundFeed(ms: number, northM: number, accuracy = 5) {
  clockMs = 1_000_000 + ms;
  await act(async () => { await mockTaskCallback({ data: { locations: [{ coords: {
    latitude: metersToLatitude(northM), longitude: 0, accuracy, altitude: null, speed: 0, heading: null,
  }, timestamp: clockMs }] }, error: null }); });
}

it('keeps the foreground source when background permission is denied', async () => {
  (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
  await start();
  expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
  expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  expect(mockSourceStop).not.toHaveBeenCalled();
  expect(useTrackingStore.getState().startRecording).toHaveBeenCalledTimes(1);
});

it('does not assign an unowned background batch to another recorder after process recreation', async () => {
  setTrackFixHandler(null);
  await mockTaskCallback({ data: { locations: [{ coords: { latitude: 0, longitude: 0, accuracy: 5 }, timestamp: clockMs }] }, error: null });
  expect(useTrackingStore.getState().trackPoints).toEqual([]);
  expect(createLocalTrackPointsBatch).not.toHaveBeenCalled();
});

it('persists a short background batch before the task resolves', async () => {
  await start();
  for (const ms of [100, 200, 300, 400]) await backgroundFeed(ms, 0);
  await backgroundFeed(1500, 10); await backgroundFeed(2500, 12); await backgroundFeed(3500, 15);
  const points = useTrackingStore.getState().trackPoints;
  expect(points.length).toBeGreaterThan(0);
  expect(points.length).toBeLessThan(25);
  const rows = (createLocalTrackPointsBatch as jest.Mock).mock.calls.flatMap(call => call[1]);
  expect(rows).toHaveLength(points.length);
});

it('reports a failed final foreground point write as an error, retaining retry data', async () => {
  (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12); feed(3500, 5, 15);
  expect(useTrackingStore.getState().trackPoints.length).toBeGreaterThan(0);
  (createLocalTrackPointsBatch as jest.Mock).mockRejectedValueOnce(new Error('SQLite write failed'));
  await act(async () => { current.finish(); for (let i = 0; i < 30; i++) await Promise.resolve(); });
  expect(createLocalTrackPointsBatch).toHaveBeenCalledTimes(1);
  expect(useTrackingStore.getState().setSaveState).toHaveBeenLastCalledWith('error');
});

it('flushes the short foreground tail on unmount', async () => {
  (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  expect(createLocalTrackPointsBatch).not.toHaveBeenCalled();
  await act(async () => { renderer?.unmount(); renderer = null; for (let i = 0; i < 30; i++) await Promise.resolve(); });
  expect(createLocalTrackPointsBatch).toHaveBeenCalledTimes(1);
});

async function restart() {
  act(() => current.stopAll());
  await act(async () => { await current.startWarmup(); });
  feed(100, 5, 0);
  await act(async () => { await current.beginRecording({ localId: 'new', ownerId: 'owner' }); });
}
it('ignores old permission results after a newer foreground-only session starts', async () => {
  let release!: (permission: unknown) => void;
  (Location.getBackgroundPermissionsAsync as jest.Mock)
    .mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
    .mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
  await start(); await restart();
  mockSourceStop.mockClear();
  await act(async () => { release({ status: 'granted' }); for (let i = 0; i < 30; i++) await Promise.resolve(); });
  expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
  expect(mockSourceStop).not.toHaveBeenCalled();
});
it('cleans up a delayed old native start without removing the new foreground fallback', async () => {
  let release!: () => void;
  (Location.startLocationUpdatesAsync as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  (Location.getBackgroundPermissionsAsync as jest.Mock)
    .mockResolvedValueOnce({ status: 'granted', canAskAgain: true })
    .mockResolvedValueOnce({ status: 'denied', canAskAgain: false });
  await start(); await restart();
  mockSourceStop.mockClear();
  await act(async () => { release(); for (let i = 0; i < 30; i++) await Promise.resolve(); });
  expect(mockSourceStop).not.toHaveBeenCalled();
  expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledTimes(1);
});


const settle = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
it.each(['success', 'error'])('a late %s finalization cannot change a new hook recording for the same dog', async outcome => {
  let complete!: () => void, fail!: (error: Error) => void;
  (finalizeLocalTrainingSession as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; }));
  await start();
  await act(async () => { current.finish(); await settle(); });
  expect(finalizeLocalTrainingSession).toHaveBeenCalledWith('local', expect.anything());
  await act(async () => { renderer?.unmount(); renderer = null; await settle(); });
  await start(undefined, 'new');
  (useTrackingStore.getState().setSaveState as jest.Mock).mockClear();
  await act(async () => { if (outcome === 'success') complete(); else fail(new Error('old write failed')); await settle(); });
  expect(useTrackingStore.getState().setSaveState).not.toHaveBeenCalled();
});
it('waits for its own finalization before reusing the hook and its session refs', async () => {
  let complete!: () => void;
  (finalizeLocalTrainingSession as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
  await start();
  await act(async () => { current.finish(); await settle(); });
  await act(async () => { await current.startWarmup(); });
  feed(100, 5, 0);
  let begin!: Promise<{ error: string | null }>;
  let began = false;
  act(() => { begin = current.beginRecording({ localId: 'new', ownerId: 'owner', dogId: 'dog-1' }).then(value => { began = true; return value; }); });
  await act(async () => { await settle(); });
  expect(began).toBe(false);
  expect((createLocalTrainingSession as jest.Mock).mock.calls.every(([row]) => row.local_id === 'local')).toBe(true);
  await act(async () => { complete(); expect((await begin).error).toBeNull(); await settle(); });
  expect(createLocalTrainingSession).toHaveBeenLastCalledWith(expect.objectContaining({ local_id: 'new' }));
});

it.each(['bw','ow','gw','abriss'] as const)('finish preserves %s direction and existing objects through the real recorder', async angleKind => {
 await start();
 const state=useTrackingStore.getState();state.currentPosition={lat:47,lng:8};
 await act(async()=>{await current.addMarker('gegenstand',{material:'holz'});clockMs++;await current.addMarker('winkel',{angleKind,geometryDirection:'links',geometrySharpness:angleKind==='abriss'?'unresolved':'sharp',geometrySource:'manual'});});
 const markerIds=state.markers.map(m=>m.id);
 await act(async()=>{current.finish();for(let i=0;i<30;i++)await Promise.resolve();});
 expect(useTrackingStore.getState().markers.map(m=>m.id)).toEqual(markerIds);
 expect(useTrackingStore.getState().markers[1]).toMatchObject({angleKind,geometryDirection:'links',geometrySource:'manual'});
 expect(finalizeLocalTrainingSession).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({articlesTotal:1,cornersTotal:angleKind==='abriss'?0:1,manualAngleGeometry:[expect.objectContaining({manualMarkerType:angleKind,geometryDirection:'links'})]}));
 expect(createLocalTrackMarker).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({sourceMarkerId:markerIds[1],geometryDirection:'links',geometrySource:'manual'}));
});

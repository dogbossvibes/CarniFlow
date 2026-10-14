
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useTrackRecorder } from '../useTrackRecorder';
import { useTrackingStore } from '../../store/trackingStore';
import { requestVoice, resetVoiceEvents } from '../../utils/voiceEvents';
import { saveQaSessionCapture } from '../../utils/qaSessionCapture';
import { createLocalTrainingSession, finalizeLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { createLocalTrackMarker, createLocalTrackPointsBatch } from '@/features/tracking/repositories/localTrackRepository';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
jest.mock('@/lib/diagnosticsAccessState', () => ({
  diagnosticsAccessToken: () => mockAccessToken,
  getDiagnosticsAccessSnapshot: () => ({ userId: 'user-1', generation: 1, allowed: true }),
  hasDiagnosticsAccess: () => true,
  subscribeDiagnosticsAccess: () => () => {},
  assertDiagnosticsAccess: () => {},
}));

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}),
}));
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  getBackgroundPermissionsAsync: jest.fn(() => new Promise(() => {})),
  getLastKnownPositionAsync: jest.fn(async () => null),
  watchHeadingAsync: jest.fn(() => new Promise(() => {})),
}));
let feedFix: ((sample: any) => void) | null = null;
let mockQaEnabled = false;
let mockAccessToken: string | null = 'authorized-fixture';
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
    restoreLayRecording: jest.fn((p: any) => { state.trackPoints = [...p.trackPoints]; state.markers = [...p.markers]; state.distanceMeters = p.distanceMeters; state.startLockActive = false; }),
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
jest.mock('../../utils/qaModeBootstrap', () => ({ hydrateQaModes: jest.fn(async () => {}) }));
jest.mock('../../utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => mockQaEnabled, subscribeQaDiagnostics: () => () => {} }));
jest.mock('../../utils/qaSessionCapture', () => ({
  ...jest.requireActual('../../utils/qaSessionCapture'),
  saveQaSessionCapture: jest.fn(async () => {}),
}));
jest.mock('../../utils/trackingEngineMode', () => ({ getTrackingEngineMode: () => 'current' }));
jest.mock('../../utils/locationSourceMode', () => ({ getLocationSourceMode: () => 'expo' }));
jest.mock('../../utils/trackingWarmupState', () => ({
  ...jest.requireActual('../../utils/trackingWarmupState'),
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
function feed(afterTapMs: number, accuracy: number, northM: number, speed = 0, ageMs = 0) {
  clockMs = 1_000_000 + afterTapMs;
  act(() => { feedFix?.({ lat: metersToLatitude(northM), lng: 0, accuracy, speed, t: clockMs - ageMs }); });
}
beforeEach(() => {
  clockMs = 1_000_000;
  feedFix = null;
  mockQaEnabled = false;
  mockAccessToken = 'authorized-fixture';
  (saveQaSessionCapture as jest.Mock).mockClear();
  (createLocalTrainingSession as jest.Mock).mockReset().mockResolvedValue(undefined);
  (createLocalTrackMarker as jest.Mock).mockClear();
  (createLocalTrackPointsBatch as jest.Mock).mockReset().mockResolvedValue(undefined);
  (AsyncStorage.setItem as jest.Mock).mockClear();
  (Speech.speak as jest.Mock).mockClear();
  jest.spyOn(Date, 'now').mockImplementation(() => clockMs);
  const state = useTrackingStore.getState();
  state.trackPoints.length = 0;
  state.markers.length = 0;
  state.distanceMeters = 0;
  state.startLockActive = false;
  resetVoiceEvents(clockMs);
});
function diagnosticEvents(): { name: string; count: number; reason?: string }[] {
  return (AsyncStorage.setItem as jest.Mock).mock.calls
    .filter(([key]) => typeof key === 'string' && key.includes('::event::'))
    .map(([, value]) => JSON.parse(value));
}

it('counts accepted fixes, existing rejects and successful point flush without changing geometry', async () => {
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  feed(3000, 70, 13);
  await act(async () => { current.finish(); await Promise.resolve(); });
  const events = diagnosticEvents();
  expect(events.some(e => e.name === 'onFixAccepted')).toBe(true);
  expect(events.some(e => e.name === 'onFixRejected' && e.reason === 'accuracy')).toBe(true);
  expect(events.some(e => e.name === 'persistAttempt' && e.count > 0)).toBe(true);
  expect(events.some(e => e.name === 'persistSuccess' && e.count > 0)).toBe(true);
  expect(events.some(e => e.name === 'flushSuccess')).toBe(true);
});

it('counts a failed existing flush and AppState background/foreground resume without restarting the recorder', async () => {
  let appState: ((state: 'inactive' | 'background' | 'active') => void) | null = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, cb: typeof appState) => {
    appState = cb;
    return { remove: jest.fn() };
  }) as never);
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  (createLocalTrackPointsBatch as jest.Mock).mockRejectedValueOnce(new Error('disk failure'));
  await act(async () => { appState?.('inactive'); appState?.('background'); appState?.('active'); current.finish(); await Promise.resolve(); });
  const events = diagnosticEvents();
  expect(events.some(e => e.name === 'inactive')).toBe(true);
  expect(events.some(e => e.name === 'background')).toBe(true);
  expect(events.some(e => e.name === 'foreground')).toBe(true);
  expect(events.some(e => e.name === 'resume')).toBe(true);
  expect(events.some(e => e.name === 'flushFailure')).toBe(true);
  expect(events.some(e => e.name === 'persistFailure')).toBe(true);
});
afterEach(() => {
  act(() => { renderer?.unmount(); });
  renderer = null;
  jest.restoreAllMocks();
});

it('good fixes and plausible movement start geometry at 2.5 seconds without a minimum timer', async () => {
  mockQaEnabled = true;
  const visible = jest.fn();
  await start(visible);
  expect(visible).toHaveBeenCalledTimes(1);
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  const state = useTrackingStore.getState();
  expect(state.trackPoints).toHaveLength(0);
  feed(1500, 5, 10);
  expect(state.trackPoints).toHaveLength(0);
  feed(2500, 5, 12);
  expect(state.startLockActive).toBe(false);
  expect(state.trackPoints.length).toBeGreaterThan(0);
  expect(clockMs - 1_000_000).toBe(2500);
  await act(async () => { current.finish(); await Promise.resolve(); });
  const capture = (saveQaSessionCapture as jest.Mock).mock.calls[0][0];
  expect(capture.startupDiagnostics).toMatchObject({
    recordingSessionStartedTSec: 0, geometryStartedTSec: 2.5,
    startupUiDelayMs: 0, geometryLockDelayMs: 2500,
    movementConfirmedTSec: 2.5, movementConfirmationSource: 'gps_displacement', fallbackUsed: false,
  });
  expect(capture.startupMovementDiagnostics).toMatchObject({
    confirmationTSec: 2.5, confirmationSource: 'gps_displacement', fallbackUsed: false, truncated: false,
  });
  expect(capture.startupMovementDiagnostics.samples.at(-1)).toMatchObject({
    tSec: 2.5, acceptedFix: true, candidateSource: 'gps_displacement', confirmed: true,
  });
  expect(JSON.stringify(capture.startupMovementDiagnostics)).not.toMatch(/"(?:lat|lng|latitude|longitude|timestamp)"/);
});

it('bounds pre-geometry movement QA while retaining the final confirmation summary', async () => {
  mockQaEnabled = true;
  await start();
  for (let i = 1; i <= 120; i++) feed(i * 50, 5, 0);
  expect(useTrackingStore.getState().startLockActive).toBe(true);
  feed(12000, 5, 0);
  await act(async () => { current.finish(); await Promise.resolve(); });
  const movement = (saveQaSessionCapture as jest.Mock).mock.calls[0][0].startupMovementDiagnostics;
  expect(movement.samples).toHaveLength(100);
  expect(movement.samples[0].tSec).toBe(0.05);
  expect(movement.truncated).toBe(true);
  expect(movement).toMatchObject({ confirmationTSec: 12, confirmationSource: 'fallback', fallbackUsed: true });
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
  feed(3400, 5, 10);
  feed(4400, 5, 12);
  expect(state.startLockActive).toBe(false);
  expect(state.trackPoints.length).toBeGreaterThan(0);
  expect(state.trackPoints[0].lat).toBeCloseTo(0, 5);
  expect(clockMs - 1_000_000).toBe(4400);
});

it('a queued voice event does not await native TTS before arming the recorder', async () => {
  expect(requestVoice({ eventType: 'status', text: 'Bereit', language: 'de-CH',
    priority: 1, onceKey: 'startup-test', phase: 'lay' })).toBe(true);
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10);
  feed(2500, 5, 12);
  expect(useTrackingStore.getState().startLockActive).toBe(false);
  expect(clockMs - 1_000_000).toBe(2500);
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

it('does not use stale cached fixes or repeated timestamps as movement/anchor samples', async () => {
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0, 0, 10_000);
  expect(useTrackingStore.getState().startLockActive).toBe(true);
  for (const ms of [1000, 2000, 3000, 4000]) feed(ms, 5, 0);
  feed(5000, 5, 0); // distinct source time, no displacement
  feed(6000, 5, 0, 0, 1000); // repeats the prior source timestamp
  expect(useTrackingStore.getState().startLockActive).toBe(true);
  expect(useTrackingStore.getState().trackPoints).toHaveLength(0);
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

it('resumes the same laid geometry and canonical distance with a fresh section after process restart', async () => {
  await act(async () => { renderer = TestRenderer.create(<Harness />); await Promise.resolve(); });
  await act(async () => { await current.startWarmup(); });
  feed(0, 5, 100);
  const points = [0, 10].map(n => ({ lat: metersToLatitude(n), lng: 0, t: 900000 + n * 1000, accuracy: 5 }));
  const pending = { sessionId: 'local', dogId: 'dog', status: 'laying' as const, trackPoints: points, markers: [], runPoints: [],
    distanceMeters: 9, durationSeconds: 12, layFinishedAt: null, startAnchor: points[0], savedAt: 920000 };
  await act(async () => { expect((await current.beginRecording({ localId: 'local', ownerId: 'owner', dogId: 'dog',
    resume: { pending, startedAt: new Date(900000).toISOString() } })).error).toBeNull(); });
  expect(useTrackingStore.getState().trackPoints).toHaveLength(2);
  feed(1000, 5, 100, 1);
  expect(useTrackingStore.getState().trackPoints[2].breakBefore).toBe(true);
  expect(useTrackingStore.getState().distanceMeters).toBe(9);
  feed(2000, 5, 104, 1); feed(3000, 5, 108, 1);
  expect(useTrackingStore.getState().distanceMeters).toBeGreaterThan(9);
  expect(useTrackingStore.getState().distanceMeters).toBeLessThan(18);
  expect(createLocalTrainingSession).toHaveBeenCalledWith(expect.objectContaining({ local_id: 'local', started_at: new Date(900000).toISOString() }));
});

it('never finalizes a laid track as saved when its point flush fails', async () => {
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  (finalizeLocalTrainingSession as jest.Mock).mockClear();
  (createLocalTrackPointsBatch as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
  await act(async () => { current.finish(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
  expect(finalizeLocalTrainingSession).not.toHaveBeenCalled();
  expect(useTrackingStore.getState().setSaveState).toHaveBeenCalledWith('error');
});


it('keeps both private QA detector sections and marks the unobserved boundary after pause', async () => {
  mockQaEnabled = true;
  await start();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  for (let i = 0; i < 8; i++) feed(3500 + i * 1000, 5, 14 + i * 2);
  const state = useTrackingStore.getState();
  Object.assign(state, { pauseRecording: () => { state.isPaused = true; }, resumeRecording: () => { state.isPaused = false; } });
  act(() => { current.pause(); });
  act(() => { current.resume(); });
  for (let i = 0; i < 8; i++) feed(20_000 + i * 1000, 5, 60 + i * 2);
  act(() => { current.pause(); });
  await act(async () => { current.finish(); await Promise.resolve(); });
  const capture = (saveQaSessionCapture as jest.Mock).mock.calls[0][0];
  const boundary = capture.detectorPoints.findIndex((point: { breakBefore?: boolean }) => point.breakBefore);
  expect(boundary).toBeGreaterThan(0);
  expect(capture.detectorPoints[boundary].cumDistM).toBe(capture.detectorPoints[boundary - 1].cumDistM);
  expect(capture.linePoints.some((point: { breakBefore?: boolean }) => point.breakBefore)).toBe(true);
  expect(capture.distances.detectorPathM).toBeGreaterThan(0);
  expect(capture.distances.detectorPathM).toBeCloseTo(capture.detectorPoints[capture.detectorPoints.length - 1].cumDistM, 2);
  expect(capture.reconstructionScope).toBe('current_detector_section');
});


it('drops a deferred capture and marker metadata after authority is revoked and regranted', async () => {
  mockQaEnabled = true;
  await start();
  feed(1000, 5, 8, 1);
  let releaseMarker!: (id: string) => void;
  (createLocalTrackMarker as jest.Mock).mockImplementationOnce(() => new Promise<string>(resolve => { releaseMarker = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = current.addMarker('gegenstand'); });
  act(() => current.finish());
  mockAccessToken = null;
  mockAccessToken = 'regranted-generation';
  await act(async () => { releaseMarker('late-marker'); await pending; await Promise.resolve(); });
  expect(saveQaSessionCapture).not.toHaveBeenCalled();
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

import React from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import type { LocationObject } from 'expo-location';
import { useSearchRecorder, type SearchRecorder, type SearchResult } from '../useSearchRecorder';
import { useStartPointApproach, type StartApproach, type ApproachFixEvent } from '../useStartPointApproach';
import { setLocationSourceMode, type LocationSourceMode } from '@/features/tracking/utils/locationSourceMode';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { enqueueSearchPoint } from '@/features/tracking/store/searchPersist';
import { computeTrackAnalyticsV2 } from '@/features/tracking/engine/trackSegmentAnalysis';
import { buildRunResultPayload } from '@/features/tracking/utils/localTrackRun';
import { runSupplementFromPayload } from '@/features/tracking/utils/localTrackDetail';
import { trackAnalysisAvailability } from '@/features/tracking/utils/trackAnalysisState';
import { extractTrackReplayData } from '@/features/tracking/utils/trackReplayData';
import { freshSearchRunState } from '@/features/tracking/store/searchRunState';

jest.unmock('react-native/Libraries/AppState/AppState');
jest.mock('react-native/Libraries/AppState/NativeAppState', () => ({
  __esModule: true,
  default: {
    getConstants: () => ({ initialAppState: 'active' }),
    getCurrentAppState: (cb: (state: { app_state: string }) => void) => cb({ app_state: 'active' }),
    addListener: jest.fn(), removeListeners: jest.fn(),
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/trackRecorder', () => ({ isExternalMode: () => false }));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: { start: jest.fn(async () => false), stop: jest.fn(async () => {}), onSample: () => ({ remove: () => {} }) },
}));

// Real positionSource + positionStream, native boundary modelled as ONE global
// manager. Any subscriber's stop kills delivery to ALL remaining listeners.
// This reproduces the production ownership bug; independent fake handles would hide it.
type NativeFix = LocationObject['coords'] & { timestamp: number; provider: string };
const mockNativeListeners = new Set<(fix: NativeFix) => void>();
let mockNativeRunning = false;
const mockNativeStart = jest.fn(async () => { mockNativeRunning = true; });
const mockNativeStop = jest.fn(async () => { mockNativeRunning = false; });
const mockFullAccuracy = jest.fn(async () => {});
jest.mock('@/features/tracking/native/precisionLocationClient', () => ({
  precisionLocationClient: {
    isNativeAvailable: () => true,
    isRawGnssSupported: () => ({ supported: false }),
    start: () => mockNativeStart(), stop: () => mockNativeStop(),
    requestTemporaryFullAccuracy: () => mockFullAccuracy(),
    onLocation: (cb: (fix: NativeFix) => void) => {
      mockNativeListeners.add(cb);
      return { remove: () => mockNativeListeners.delete(cb) };
    },
  },
}));

const mockExpoListeners = new Set<(fix: LocationObject) => void>();
const mockExpoRemove = jest.fn();
const mockExpoWatch = jest.fn(async (_opts: unknown, cb: (fix: LocationObject) => void) => {
  mockExpoListeners.add(cb);
  return { remove: () => { mockExpoRemove(); mockExpoListeners.delete(cb); } };
});
jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  watchPositionAsync: (opts: unknown, cb: (fix: LocationObject) => void) => mockExpoWatch(opts, cb),
}));

const START = { lat: 0, lng: 0 };
const LINE = Array.from({ length: 51 }, (_, i) => ({ latitude: i * 2 / 111320, longitude: 0 }));
const OBJECTS: [] = [];
let recorder: SearchRecorder;
let approach: StartApproach;
let renderer: ReactTestRenderer | null;
let clockMs: number;
let approachEvents: ApproachFixEvent[] = [];

function Approach({ active, fix }: { active: boolean; fix: SearchRecorder['liveFix'] }) {
  approach = useStartPointApproach({ active, start: START, liveFix: fix,
    onDiagnostic: event => { approachEvents.push(event); } });
  return null;
}

// Same hook composition as run.tsx. The Approach child can also unmount on its
// own, proving its cleanup cannot stop a recorder that is still mounted.
function Harness({ arming, showApproach = true }: { arming: boolean; showApproach?: boolean }) {
  recorder = useSearchRecorder({ laidPoints: LINE, laidObjects: OBJECTS, level: 'training', sessionId: 'session-search' });
  return showApproach ? <Approach active={arming} fix={recorder.liveFix} /> : null;
}

async function mount(arming = true) {
  await act(async () => { renderer = TestRenderer.create(<Harness arming={arming} />); });
}

// The repository's minimal TestRenderer declaration omits the runtime update API.
function rerender(element: React.ReactElement) {
  (renderer as ReactTestRenderer & { update: (node: React.ReactElement) => void }).update(element);
}

function feed(yM: number, accuracy = 4, ageMs = 0) {
  clockMs += 1000;
  jest.setSystemTime(clockMs);
  const fix: LocationObject = {
    coords: { latitude: yM / 111320, longitude: 0, accuracy, altitude: null, altitudeAccuracy: null, heading: 0, speed: 2 },
    timestamp: clockMs - ageMs,
  };
  act(() => {
    if (mockNativeRunning) mockNativeListeners.forEach(cb => cb({ ...fix.coords, timestamp: fix.timestamp, provider: 'gps' }));
    mockExpoListeners.forEach(cb => cb(fix));
  });
}

function startSearch() {
  act(() => {
    rerender(<Harness arming={false} />);
    recorder.start();
    useTrackingStore.getState().startSearchSession('run-search', Date.now());
  });
}

function expectSourceAlive(mode: LocationSourceMode) {
  expect(mockNativeStop).not.toHaveBeenCalled();
  expect(mockExpoRemove).not.toHaveBeenCalled();
  expect(mockNativeStart).toHaveBeenCalledTimes(mode === 'precision' ? 1 : 0);
  expect(mockExpoWatch).toHaveBeenCalledTimes(mode === 'legacy' ? 1 : 0);
  expect(mode === 'precision' ? mockNativeRunning : mockExpoListeners.size === 1).toBe(true);
}

beforeEach(() => {
  jest.useFakeTimers();
  clockMs = 1700000000000;
  jest.setSystemTime(clockMs);
  jest.clearAllMocks();
  mockNativeListeners.clear(); mockExpoListeners.clear(); mockNativeRunning = false;
  renderer = null;
  approachEvents = [];
  useTrackingStore.getState().reset();
  useTrackingStore.getState().startRecording('session-search', 'dog-search');
});
afterEach(() => {
  act(() => { renderer?.unmount(); });
  useTrackingStore.getState().reset();
  jest.useRealTimers();
});

describe.each<LocationSourceMode>(['precision', 'legacy'])('single Search location owner — %s', mode => {
  beforeEach(() => { setLocationSourceMode(mode); });

  it('reports near, stable reached, and departure transitions without absolute coordinates', async () => {
    await mount();
    feed(8.49); feed(2); feed(2); feed(5); feed(5);
    expect(approachEvents[0]).toMatchObject({ zone: 'outside', transition: null });
    expect(approachEvents.some(e => e.zone === 'near' && e.transition === 'entered_near')).toBe(true);
    expect(approachEvents.some(e => e.transition === 'entered_reached')).toBe(true);
    expect(approachEvents.some(e => e.transition === 'departed_reached')).toBe(true);
    expect(approachEvents.every(e => e.tMs >= 1e12)).toBe(true); // callback origin is normalized by run.tsx
    expect(JSON.stringify(approachEvents)).not.toMatch(/"(?:lat|lng|latitude|longitude)"/);
  });

  it('arming=false keeps the source alive; subsequent fixes reach memory, run payload, analysis and replay', async () => {
    await mount();
    feed(0); feed(0); feed(0);
    expect(approach.armed).toBe(true);
    expect(recorder.points).toHaveLength(0); // approach does not record search geometry
    expectSourceAlive(mode);

    startSearch();
    expect(approach.armed).toBe(false);
    expectSourceAlive(mode);
    for (let i = 0; i < 5; i++) feed(0); // normal start acquisition, no forceLocked override
    expect(recorder.searchStartState).toBe('START_LOCKED');
    for (let y = 2; y <= 30; y += 2) feed(y);
    expect(recorder.points.length).toBeGreaterThan(2);
    expect(recorder.distanceM).toBeGreaterThan(20);
    expect(useTrackingStore.getState().searchTrackPoints).toHaveLength(recorder.points.length);
    expect(enqueueSearchPoint).toHaveBeenCalledTimes(recorder.points.length);

    let result!: SearchResult;
    act(() => { result = recorder.stop(); });
    expect(result.analyticsSamples.length).toBeGreaterThan(1);
    expect(result.analyticsSamples.some(p => p.atM > 0)).toBe(true);
    const analytics = computeTrackAnalyticsV2({
      samples: result.analyticsSamples, corners: [], objects: [], breaks: [],
      trackLengthM: recorder.trackLengthM, durationS: result.durationS,
    });
    const run = buildRunResultPayload({
      runId: 'run-search', sessionId: 'session-search', startedAtMs: clockMs - result.durationS * 1000,
      endedAtMs: clockMs, result, analytics, pointsTimeSec: result.pointsTimeSec,
    });
    const detail = runSupplementFromPayload(JSON.stringify({ run }));
    expect(detail!.runs[0].run_points).toHaveLength(result.points.length);
    expect(trackAnalysisAvailability(detail).state).toBe('available');
    expect(trackAnalysisAvailability(detail).showNoSearchTrackWarning).toBe(false);
    const replay = extractTrackReplayData(detail);
    expect(replay).not.toBeNull();
    expect(replay!.geometry.points).toEqual(result.points);
    expect(replay!.geometry.pointsTimeSec).toEqual(result.pointsTimeSec);
    expectSourceAlive(mode);
  });

  it('unmounting only Approach cannot stop the recorder source', async () => {
    await mount();
    feed(0);
    act(() => { rerender(<Harness arming={false} showApproach={false} />); });
    expectSourceAlive(mode);
    feed(3);
    expect(recorder.liveFix!.lat).toBe(3 / 111320);
    act(() => { renderer!.unmount(); }); renderer = null;
    expect(mode === 'precision' ? mockNativeStop : mockExpoRemove).toHaveBeenCalledTimes(1);
  });

  it('keeps raw coordinates, unrounded accuracy, freshness and consecutive-fix arming', async () => {
    await mount();
    feed(2, 4.4);
    expect(approach.position).toEqual({ lat: 2 / 111320, lng: 0 });
    expect(approach.accuracy).toBe(4.4);
    expect(approach.radiusM).toBeCloseTo(6.6);
    expect(approach.fixesRemaining).toBe(1);
    act(() => { rerender(<Harness arming />); });
    expect(approach.fixesRemaining).toBe(1); // no duplicate counting on render
    feed(3, 4.4);
    expect(approach.position!.lat).toBe(3 / 111320);
    expect(approach.position!.lat).not.toBe(recorder.position!.latitude); // not EMA
    feed(3, 4.4);
    expect(approach.armed).toBe(true);
    feed(3, 4.4, 6000);
    expect(approach.armed).toBe(false);
    feed(3, 13); // accuracy cap unchanged
    expect(approach.fixesRemaining).toBe(2);
    feed(100); // implausible jump / outside radius
    expect(approach.armed).toBe(false);
    expectSourceAlive(mode);
  });

  it('background/foreground events do not release the source; foreground fixes resume the same run', async () => {
    await mount(false);
    act(() => { recorder.start(undefined, { forceLocked: true }); });
    feed(0); feed(4); feed(8);
    const before = recorder.points.slice();
    act(() => { DeviceEventEmitter.emit('appStateDidChange', { app_state: 'background' }); });
    expect(AppState.currentState).toBe('background');
    expectSourceAlive(mode);
    clockMs += 60000; jest.setSystemTime(clockMs);
    act(() => { DeviceEventEmitter.emit('appStateDidChange', { app_state: 'active' }); });
    expect(AppState.currentState).toBe('active');
    feed(10); feed(14);
    expect(recorder.points.slice(0, before.length)).toEqual(before);
    expect(recorder.points.length).toBeGreaterThan(before.length);
    expectSourceAlive(mode);
  });

  it('pause/resume and a foreground delivery gap preserve points and the source', async () => {
    await mount(false);
    act(() => { recorder.start(undefined, { forceLocked: true }); });
    feed(0); feed(4); feed(8);
    const beforePause = recorder.points.length;
    act(() => { recorder.setPaused(true); });
    feed(10); feed(12);
    expect(recorder.points).toHaveLength(beforePause);
    expectSourceAlive(mode);
    // No callbacks while the OS suspends foreground delivery. No background
    // permission/behaviour is added; resuming delivery must continue the same run.
    clockMs += 60000; jest.setSystemTime(clockMs);
    act(() => { recorder.setPaused(false); });
    feed(14); feed(18);
    expect(recorder.points.length).toBeGreaterThan(beforePause);
    expectSourceAlive(mode);
  });

  it('Recovery seeds existing points and appends fixes with Approach inactive', async () => {
    await mount(false);
    const points = [{ latitude: 0, longitude: 0 }, { latitude: 10 / 111320, longitude: 0 }];
    act(() => {
      useTrackingStore.getState().setSearchPoints(points.map(p => ({ lat: p.latitude, lng: p.longitude, t: clockMs, accuracy: 4 })));
      recorder.start({ points, startedAtMs: clockMs - 10000, runState: { ...freshSearchRunState(), maxCursorM: 10 } });
    });
    expect(recorder.points).toEqual(points);
    feed(12); feed(16); feed(20);
    expect(recorder.points.slice(0, 2)).toEqual(points);
    expect(recorder.points.length).toBeGreaterThan(2);
    expect(recorder.progressM).toBeGreaterThan(10);
    expect(approach.armed).toBe(false);
    expectSourceAlive(mode);
  });
});

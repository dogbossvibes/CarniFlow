
// Production lay hook and task with real archive SQL; native GPS and line storage use the existing background harness.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { useTrackRecorder } from '../useTrackRecorder';
import { useTrackingStore } from '../../store/trackingStore';
import { useActiveFaehrten } from '../../store/activeFaehrten';
import { __resetLaySessionRuntimeForTests } from '../../engine/laySessionRuntime';
import { createLocalTrackPointsBatch } from '@/features/tracking/repositories/localTrackRepository';
import { createLocalTrainingSession, finalizeLocalTrainingSession } from '@/features/training/repositories/localTrainingRepository';
import { DatabaseSync } from 'node:sqlite';
import { RAW_CAPTURE_DB_SCHEMA } from '@/features/tracking/storage/gpsCaptureDb';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { readGpsCapture } from '../../storage/gpsCapture';
import { setGpsCaptureAccount } from '../../storage/gpsCaptureScope';
let mockDb: DatabaseSync;
let mockMainDb: DatabaseSync;
let mockRawGate: Promise<void> | null = null;
let mockArchiveFinished: (() => void) | undefined;
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({
  getFirstAsync: async (sql: string, ...args: (string | number)[]) => mockMainDb.prepare(sql).get(...args) ?? null,
}) }));
jest.mock('@/features/tracking/storage/gpsCaptureDb', () => ({
  ...jest.requireActual('@/features/tracking/storage/gpsCaptureDb'),
  getGpsCaptureDb: async () => ({
  withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => {
    if (mockRawGate) await mockRawGate;
    const tx = {
      getFirstAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).get(...args) ?? null,
      getAllAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).all(...args),
      runAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).run(...args),
    };
    mockDb.exec('BEGIN IMMEDIATE');
    try {
      await work(tx); mockDb.exec('COMMIT');
      if (mockDb.prepare("select state from raw_capture_sessions where state='complete'").get()) mockArchiveFinished?.();
    } catch (error) { mockDb.exec('ROLLBACK'); throw error; }
  },
}) }));
jest.mock('@/lib/diagnosticsAccessState', () => ({
  diagnosticsAccessToken: () => 'authorized-fixture',
  getDiagnosticsAccessSnapshot: () => ({ userId: 'user-1', generation: 1, allowed: true }),
  hasDiagnosticsAccess: () => true,
  subscribeDiagnosticsAccess: () => () => {},
  assertDiagnosticsAccess: () => {},
}));

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest native storage adapter.
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
  createLocalTrainingSession: jest.fn(async (input: {local_id: string; user_id: string}) => {
    mockMainDb.prepare('insert or ignore into local_training_sessions(local_id,user_id) values(?,?)').run(input.local_id, input.user_id);
  }), finalizeLocalTrainingSession: jest.fn(async () => {}),
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
  act(() => { feedFix?.({ lat: lat(northM), lng: 0, accuracy, speed: 1, t: clockMs, source: 'expo' }); });
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

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Register the actual native task after Jest mocks.
beforeAll(() => { require('../../native/backgroundLocationTask'); });
beforeEach(() => {
  mockRawGate = null; mockArchiveFinished = undefined;
  mockDb = new DatabaseSync(':memory:'); mockDb.exec('PRAGMA foreign_keys=ON');
  mockDb.exec(RAW_CAPTURE_DB_SCHEMA);
  mockMainDb = new DatabaseSync(':memory:');
  for (const migration of MIGRATIONS) mockMainDb.exec(migration.sql);
  setGpsCaptureAccount('owner', true);
  mockQaOn = false;
  clockMs = 1_000_000; feedFix = null;
  __resetLaySessionRuntimeForTests();
  useActiveFaehrten.setState({ byDog: {} });
  jest.spyOn(Date, 'now').mockImplementation(() => clockMs);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  const s = state(); s.trackPoints.length = 0; s.markers.length = 0; s.distanceMeters = 0; s.startLockActive = false;
  (createLocalTrackPointsBatch as jest.Mock).mockReset().mockResolvedValue(undefined);
  (finalizeLocalTrainingSession as jest.Mock).mockReset().mockResolvedValue(undefined);
  (createLocalTrainingSession as jest.Mock).mockClear();
  (Location.startLocationUpdatesAsync as jest.Mock).mockReset().mockResolvedValue(undefined);
  (Location.stopLocationUpdatesAsync as jest.Mock).mockClear();
  (Location.getBackgroundPermissionsAsync as jest.Mock).mockReset().mockResolvedValue({ status: 'granted', canAskAgain: true });
  (Location.watchHeadingAsync as jest.Mock).mockReset().mockImplementation(() => new Promise(() => {}));
});
afterEach(async () => { await act(async () => { renderer?.unmount(); await settle(); }); renderer = null; setGpsCaptureAccount(null); mockDb.close(); mockMainDb.close(); jest.restoreAllMocks(); });

it('archives FG/BG original arrivals with QA off and keeps rejected timestamps out of live geometry', async () => {
  await startWithBackground();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  clockMs = 1_003_500;
  await act(async () => { await task({ data: { locations: [bgLoc(3500, 15)] }, error: null }); });
  const baseline = JSON.parse(JSON.stringify({ points: state().trackPoints, distance: state().distanceMeters, markers: state().markers }));
  const positions = state().setCurrentPosition.mock.calls.length;
  const rejected = [bgLoc(1500, 99), bgLoc(3500, 88), bgLoc(3_603_500, 77)];
  await act(async () => { await task({ data: { locations: rejected }, error: null }); });
  for (const loc of rejected) act(() => feedFix!({ lat: loc.coords.latitude, lng: 0, accuracy: 5, speed: 1, t: loc.timestamp, source: 'native' }));
  expect({ points: state().trackPoints, distance: state().distanceMeters, markers: state().markers }).toEqual(baseline);
  expect(state().setCurrentPosition).toHaveBeenCalledTimes(positions);
  feed(4500, 5, 18);
  expect(state().trackPoints.length).toBe(baseline.points.length + 1);
  expect(state().distanceMeters).toBeGreaterThan(baseline.distance);
  let finalized!: () => void;
  const archived = new Promise<void>(resolve => { mockArchiveFinished = resolve; });
  const finished = new Promise<void>(resolve => { finalized = resolve; });
  (finalizeLocalTrainingSession as jest.Mock).mockImplementationOnce(async () => { finalized(); });
  await act(async () => { current.finish(); await finished; await archived; });
  const rows = await readGpsCapture('lay-1', 'lay');
  expect(rows).toHaveLength(14);
  expect(rows.slice(6).map(row => ({ measured: row.measuredAtMs, received: row.receivedAtMs,
    latitude: row.latitude, timing: row.timing, delivery: row.delivery, source: row.source }))).toEqual([
    { measured: 1_003_500, received: 1_003_500, latitude: lat(15), timing: 'live', delivery: 'background', source: 'expo' },
    ...['background', 'foreground'].flatMap(delivery => rejected.map((loc, index) => ({
      measured: loc.timestamp, received: 1_003_500, latitude: loc.coords.latitude,
      timing: ['late', 'duplicate', 'future'][index], delivery, source: delivery === 'background' ? 'expo' : 'precision',
    }))),
    { measured: 1_004_500, received: 1_004_500, latitude: lat(18), timing: 'live', delivery: 'foreground', source: 'expo' },
  ]);
  expect(await readGpsCapture('lay-1', 'search')).toEqual([]);
  expect(mockDb.prepare("select state from raw_capture_sessions where owner_id='owner'").get()?.state).toBe('complete');
});

it('finalizes the original line while the separate raw archive transaction is blocked', async () => {
  await startWithBackground();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  clockMs = 1_003_500;
  await act(async () => { await task({ data: { locations: [bgLoc(3500, 15)] }, error: null }); });
  let release!: () => void;
  mockRawGate = new Promise<void>(resolve => { release = resolve; });
  const archived = new Promise<void>(resolve => { mockArchiveFinished = resolve; });
  const before = state().trackPoints.length;
  feed(4500, 5, 18);
  expect(state().trackPoints.length).toBe(before + 1);
  try {
    await act(async () => { current.finish(); await settle(); await settle(); });
    expect(finalizeLocalTrainingSession).toHaveBeenCalledTimes(1);
    const persisted = (createLocalTrackPointsBatch as jest.Mock).mock.calls.flatMap(call => call[1]);
    expect(persisted).toHaveLength(state().trackPoints.length);
    expect(mockDb.prepare("select state from raw_capture_sessions where owner_id='owner'").get()?.state).toBe('open');
  } finally {
    mockRawGate = null; release();
    await act(async () => { await archived; });
  }
  expect((await readGpsCapture('lay-1', 'lay')).at(-1)?.measuredAtMs).toBe(1_004_500);
});

it('classifies arrivals against their own watermark while live processing waits for a line write', async () => {
  await startWithBackground();
  for (const ms of [100, 200, 300, 400]) feed(ms, 5, 0);
  feed(1500, 5, 10); feed(2500, 5, 12);
  let release!: () => void;
  (createLocalTrackPointsBatch as jest.Mock).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  clockMs = 1_005_500;
  let first!: Promise<void>, queued!: Promise<void>;
  act(() => { first = task({ data: { locations: [bgLoc(3500, 15)] }, error: null }); });
  await act(async () => { await settle(); });
  act(() => { queued = task({ data: { locations: [bgLoc(5500, 21), bgLoc(4500, 99)] }, error: null }); });
  await act(async () => { release(); await first; await queued; });
  const archived = new Promise<void>(resolve => { mockArchiveFinished = resolve; });
  await act(async () => { current.finish(); await archived; });
  expect((await readGpsCapture('lay-1', 'lay')).slice(-3).map(row => ({ t: row.measuredAtMs, timing: row.timing })))
    .toEqual([{ t: 1_003_500, timing: 'live' }, { t: 1_005_500, timing: 'live' }, { t: 1_004_500, timing: 'late' }]);
  expect(state().trackPoints.some((point: { lat: number }) => point.lat === lat(99))).toBe(false);
});

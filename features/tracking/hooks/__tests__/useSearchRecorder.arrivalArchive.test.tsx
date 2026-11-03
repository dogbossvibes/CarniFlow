import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { DatabaseSync } from 'node:sqlite';
import { RAW_CAPTURE_DB_SCHEMA } from '@/features/tracking/storage/gpsCaptureDb';
import { MIGRATIONS } from '@/lib/localDb/migrations';
import { setGpsCaptureAccount } from '@/features/tracking/storage/gpsCaptureScope';
import { readGpsCapture } from '@/features/tracking/storage/gpsCapture';
import { useSearchRecorder, type SearchRecorder } from '../useSearchRecorder';

let mockDb: DatabaseSync;
let mockFeed: ((p: any) => void) | undefined;
let mockNow = 1_790_000_000_000;
const mockProgress = jest.fn();
const mockPoints = jest.fn();
jest.mock('@/lib/localDb/client', () => ({ getLocalDb: async () => ({ getFirstAsync: async () => ({local_id:'s',deleted_at:null}) }) }));
jest.mock('@/features/tracking/storage/gpsCaptureDb', () => ({
 ...jest.requireActual('@/features/tracking/storage/gpsCaptureDb'), getGpsCaptureDb: async () => ({
  withExclusiveTransactionAsync: async (work: (tx: unknown) => Promise<void>) => {
    const tx = {
      getFirstAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).get(...args) ?? null,
      getAllAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).all(...args),
      runAsync: async (sql: string, ...args: (string | number)[]) => mockDb.prepare(sql).run(...args),
    };
    mockDb.exec('BEGIN IMMEDIATE');
    try { await work(tx); mockDb.exec('COMMIT'); } catch (error) { mockDb.exec('ROLLBACK'); throw error; }
  },
}) }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({ requestForegroundPermissionsAsync: async () => ({ status: 'granted' }), Accuracy: { BestForNavigation: 6 } }));
jest.mock('@/features/tracking/utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => false, subscribeQaDiagnostics: () => () => {} }));
jest.mock('@/features/tracking/utils/supportDiagnostics', () => ({ isSupportCaptureEnabled: () => false }));
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({ coords: { latitude: s.lat, longitude: s.lng, accuracy: 4, altitude: null, heading: null, speed: 1 }, timestamp: s.t }),
  startPositionSource: async (cb: any) => { mockFeed = cb; return { stop: jest.fn(), info: { source: 'expo' } }; },
}));
jest.mock('@/features/tracking/store/trackingStore', () => ({ useTrackingStore: { getState: () => ({
  addSearchPoint: mockPoints, resetSearchPoints: jest.fn(), noteSearchRunProgress: mockProgress,
  noteSearchObjectFound: jest.fn(), noteSearchOffTrackState: jest.fn(), searchRunState: { offTrackState: 'on_track' },
}) } }));
jest.mock('@/features/tracking/store/searchPersist', () => ({ enqueueSearchPoint: jest.fn(), flushSearchPoints: async () => true, resetSearchBuffer: jest.fn() }));
const points = Array.from({ length: 51 }, (_, i) => ({ latitude: i * 2 / 111320, longitude: 0 }));
let recorder: SearchRecorder;
let renderer: ReactTestRenderer;
function Harness() { recorder = useSearchRecorder({ laidPoints: points, laidObjects: [], level: 'training', sessionId: 's' }); return null; }
const feed = (t: number, y = 0) => act(() => mockFeed!({ lat: y / 111320, lng: 0, source: 'expo', provider: null, t }));
beforeEach(async () => {
  mockNow = 1_790_000_000_000; mockProgress.mockClear(); mockPoints.mockClear();
  jest.spyOn(Date, 'now').mockImplementation(() => mockNow);
  mockDb = new DatabaseSync(':memory:'); mockDb.exec('PRAGMA foreign_keys=ON');
  for (const migration of MIGRATIONS) mockDb.exec(migration.sql);
  mockDb.exec(RAW_CAPTURE_DB_SCHEMA);
  mockDb.prepare("insert into local_training_sessions(local_id,user_id) values('s','owner')").run();
  setGpsCaptureAccount('owner', true);
  await act(async () => { renderer = TestRenderer.create(<Harness />); });
});
afterEach(async () => {
  recorder.stop(); await recorder.flushRawCapture();
  act(() => renderer.unmount());
  setGpsCaptureAccount(null); mockDb.close(); jest.restoreAllMocks();
});
it('stores all original arrivals with QA disabled while only chronological fixes drive live effects', async () => {
  const started = mockNow;
  act(() => recorder.start(undefined, { forceLocked: true }));
  feed(mockNow, 0); mockNow += 1000; feed(mockNow, 2);
  const before = { live: recorder.liveFix, distance: recorder.distanceM, points: mockPoints.mock.calls.length, progress: mockProgress.mock.calls.length };
  feed(mockNow - 1000, 99); feed(mockNow, 88); feed(mockNow + 3600000, 77);
  expect(recorder.liveFix).toEqual(before.live); expect(recorder.distanceM).toBe(before.distance);
  expect(mockPoints).toHaveBeenCalledTimes(before.points); expect(mockProgress).toHaveBeenCalledTimes(before.progress);
  mockNow += 1000; feed(mockNow, 4);
  expect(recorder.liveFix?.t).toBe(mockNow);
  act(() => { recorder.stop(); });
  const status = await recorder.flushRawCapture();
  expect(status).toMatchObject({ state: 'complete', observed: 6, stored: 6, pending: 0, failed: 0 });
  const raw = await readGpsCapture('s', 'search', String(started));
  expect(raw.map(p => p.timing)).toEqual(['live', 'live', 'late', 'duplicate', 'future', 'live']);
  expect(raw[2]).toMatchObject({ measuredAtMs: started, receivedAtMs: started + 1000 });
  expect(await readGpsCapture('s', 'lay')).toEqual([]);
});
it('archives pre-resume cached measurements without reapplying effects, including before archive hydration', async () => {
  const started = mockNow - 30000;
  act(() => recorder.start({ points: points.slice(0, 2), startedAtMs: started, pointsTimeSec: [0, 1] }));
  feed(mockNow - 5000, 88);
  expect(recorder.liveFix).toBeNull(); expect(mockPoints).not.toHaveBeenCalled(); expect(mockProgress).not.toHaveBeenCalled();
  mockNow += 1000; feed(mockNow, 4);
  expect(recorder.liveFix?.t).toBe(mockNow);
  act(() => { recorder.stop(); }); await recorder.flushRawCapture();
  const raw = await readGpsCapture('s', 'search', String(started));
  expect(raw.map(p => p.timing)).toEqual(['late', 'live']);
});
it('ignores a callback from an unmounted subscription', async () => {
  act(() => recorder.start(undefined, { forceLocked: true }));
  const stale = mockFeed!;
  const flushing = recorder.flushRawCapture();
  act(() => renderer.unmount());
  act(() => stale({ lat: 1, lng: 1, t: mockNow, source: 'expo' }));
  expect(mockPoints).not.toHaveBeenCalled(); expect(mockProgress).not.toHaveBeenCalled();
  expect((await flushing)?.observed).toBe(0);
});

it('archives cached pause-time fixes after explicit resume without reapplying guidance', async () => {
  const started = mockNow;
  act(() => recorder.start(undefined, { forceLocked: true }));
  feed(mockNow); mockNow += 1000; feed(mockNow, 2);
  act(() => recorder.setPaused(true));
  mockNow += 5000;
  act(() => recorder.setPaused(false));
  const live = recorder.liveFix;
  const count = mockProgress.mock.calls.length;
  feed(mockNow - 1000, 50); // newer than previous live fix, but measured while paused
  expect(recorder.liveFix).toBe(live);
  expect(mockProgress).toHaveBeenCalledTimes(count);
  mockNow += 1000; feed(mockNow, 4);
  expect(recorder.liveFix?.t).toBe(mockNow);
  act(() => { recorder.stop(); }); await recorder.flushRawCapture();
  expect((await readGpsCapture('s', 'search', String(started))).map(p => p.timing)).toEqual(['live', 'live', 'late', 'live']);
});

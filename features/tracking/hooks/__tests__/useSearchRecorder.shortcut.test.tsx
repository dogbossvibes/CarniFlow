// T-222: Taste «Abgekürzt» — der Hundeführer meldet eine Abkürzung des Hundes selbst.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';
import { freshSearchRunState } from '@/features/tracking/store/searchRunState';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));

let feedSample: ((s: { lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number }) => void) | null = null;
const mockStop = jest.fn();
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({
    coords: { latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: s.altitude ?? null, altitudeAccuracy: null, heading: s.course ?? null, speed: s.speed ?? null },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async (cb: any) => {
    feedSample = cb;
    return { stop: mockStop, info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: null } };
  }),
}));

const mockNoteManualBreaks = jest.fn();
const mockNoteShortcut = jest.fn();
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: jest.fn(), noteSearchObjectFound: jest.fn(), noteSearchOffTrackState: jest.fn(),
    noteSearchManualBreaks: (b: unknown) => mockNoteManualBreaks(b),
    noteSearchShortcut: (x: unknown) => mockNoteShortcut(x),
    searchRunState: { offTrackState: 'on_track' },
  }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: {
    isModuleAvailable: () => false, isAvailable: () => false,
    getStatus: jest.fn(async () => ({ deviceMotionAvailable: false, stepCountingAvailable: false, activityAvailable: false, pedometerAuthorized: false, running: false })),
    start: jest.fn(async () => false), stop: jest.fn(async () => {}),
    onSample: () => ({ remove: () => {} }), onError: () => ({ remove: () => {} }),
  },
}));

const M_PER_DEG = 111320;
const toLL = (xEastM: number, yNorthM: number): LatLng => ({ latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG });
function denseLeg(fromM: number, toM: number, x: number): LatLng[] {
  const pts: LatLng[] = [];
  const steps = Math.max(1, Math.round(Math.abs(toM - fromM) / 2));
  for (let i = 0; i <= steps; i++) pts.push(toLL(x, fromM + ((toM - fromM) * i) / steps));
  return pts;
}
const NO_OBJECTS: readonly [] = [];
const LAID = denseLeg(0, 200, 0);

function Harness({ onReady }: { onReady: (s: SearchRecorder) => void }) {
  const s = useSearchRecorder({ laidPoints: LAID, laidObjects: NO_OBJECTS as any, level: 'training', handlerDistanceM: 5 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
function mount(): { getRecorder: () => SearchRecorder } {
  let latest!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness onReady={(s) => { latest = s; }} />); });
  return { getRecorder: () => latest };
}
const T0 = 1_800_000_000_000;
let clockMs = T0;
let nowSpy: jest.SpyInstance;
function feed(xEastM: number, yNorthM: number, accuracy = 4) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  clockMs += 1000;
  act(() => { feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 1, course: null, t: clockMs }); });
}
async function started(resume?: Parameters<SearchRecorder['start']>[0]) {
  const { getRecorder } = mount();
  await act(async () => { await Promise.resolve(); });
  act(() => { getRecorder().start(resume, { forceLocked: true }); });
  return getRecorder;
}
const tap = (get: () => SearchRecorder) => act(() => { get().markShortcut(); });

describe('useSearchRecorder — Taste «Abgekürzt» (T-222)', () => {
  beforeEach(() => {
    feedSample = null; mockStop.mockClear(); mockNoteManualBreaks.mockClear(); mockNoteShortcut.mockClear(); activeRenderer = null; clockMs = T0;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clockMs);
  });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); nowSpy.mockRestore(); });

  it('jedes Antippen hält Zeit und Fortschritt fest, sofort im Recovery-State und im Suchergebnis', async () => {
    const get = await started();
    let y = 0;
    for (let i = 0; i < 10; i++) { y += 2; feed(0, y); }
    expect(get().shortcutCount).toBe(0);
    tap(get);
    expect(get().shortcutCount).toBe(1);
    expect(mockNoteShortcut).toHaveBeenCalledTimes(1);
    const first = mockNoteShortcut.mock.calls[0][0];
    expect(first.tSec).toBe(10);
    expect(first.progressM).toBeGreaterThan(5);
    for (let i = 0; i < 5; i++) { y += 2; feed(0, y); }
    tap(get);
    expect(get().shortcutCount).toBe(2);
    let result!: ReturnType<SearchRecorder['stop']>;
    act(() => { result = get().stop(); });
    expect(result.shortcuts).toHaveLength(2);
    expect(result.shortcuts[1].tSec).toBe(15);
    expect(result.shortcuts[1].progressM).toBeGreaterThan(result.shortcuts[0].progressM);
  });

  it('ändert weder Abrisse, Abweichung, Fortschritt noch Punktzahl', async () => {
    const get = await started();
    let y = 0;
    for (let i = 0; i < 10; i++) { y += 2; feed(0, y); }
    const before = { score: get().score, breaks: get().breaks.length, progress: get().progressM, dev: get().deviationM, off: get().offTrackState };
    tap(get); tap(get); tap(get);
    expect({ score: get().score, breaks: get().breaks.length, progress: get().progressM, dev: get().deviationM, off: get().offTrackState }).toEqual(before);
    expect(mockNoteManualBreaks).not.toHaveBeenCalled();
  });

  it('vor dem Start der Aufzeichnung passiert nichts', () => {
    const { getRecorder } = mount();
    act(() => { getRecorder().markShortcut(); });
    expect(getRecorder().shortcutCount).toBe(0);
    expect(mockNoteShortcut).not.toHaveBeenCalled();
  });

  it('beim Fortsetzen bleiben gemeldete Abkürzungen erhalten, ein alter Puffer ohne Feld startet bei 0', async () => {
    const rs = { ...freshSearchRunState(), shortcuts: [{ tSec: 12, progressM: 8 }] };
    const get = await started({ points: [toLL(0, 0), toLL(0, 8)], startedAtMs: T0 - 20_000, runState: rs });
    expect(get().shortcutCount).toBe(1);
    act(() => { activeRenderer?.unmount(); activeRenderer = null; });
    const legacy = await started({ points: [toLL(0, 0), toLL(0, 8)], startedAtMs: T0 - 20_000, runState: freshSearchRunState() });
    expect(legacy().shortcutCount).toBe(0);
  });
});

// T-213: Taste «Fährtenverlust» — der Hundeführer meldet den Verlust des Hundes selbst.
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
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: jest.fn(), noteSearchObjectFound: jest.fn(), noteSearchOffTrackState: jest.fn(),
    noteSearchManualBreaks: (b: unknown) => mockNoteManualBreaks(b),
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
const tap = (get: () => SearchRecorder) => act(() => { get().toggleManualLoss(); });

describe('useSearchRecorder — Taste «Fährtenverlust» (T-213)', () => {
  beforeEach(() => {
    feedSample = null; mockStop.mockClear(); mockNoteManualBreaks.mockClear(); activeRenderer = null; clockMs = T0;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clockMs);
  });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); nowSpy.mockRestore(); });

  it('1. Antippen öffnet einen Abriss am aktuellen Ort, 2. Antippen schliesst ihn mit Dauer und Strecke', async () => {
    const get = await started();
    let y = 0;
    for (let i = 0; i < 10; i++) { y += 2; feed(0, y); }
    expect(get().breaks).toHaveLength(0);
    expect(get().manualLossActive).toBe(false);
    const scoreBefore = get().score;

    tap(get);
    expect(get().manualLossActive).toBe(true);
    expect(get().breaks).toHaveLength(1);
    const open = get().breaks[0];
    expect(open).toMatchObject({ manual: true, startedAtSec: 10, t: 10 });
    expect(open.recoveredAtSec).toBeUndefined();
    expect(open.at.latitude * M_PER_DEG).toBeGreaterThan(10);   // am Hundeführer, nicht am Start
    expect(get().score).toBe(scoreBefore - 4);                   // gleiche Wertung wie ein automatischer Abriss
    expect(mockNoteManualBreaks).toHaveBeenCalledTimes(1);       // sofort im Recovery-State

    for (let i = 0; i < 12; i++) { y += 1; feed(0, y); }
    tap(get);
    expect(get().manualLossActive).toBe(false);
    expect(get().breaks).toHaveLength(1);
    expect(get().breaks[0]).toMatchObject({ manual: true, startedAtSec: 10, recoveredAtSec: 22, durationSec: 12 });
    expect(get().breaks[0].recoveredAfterM).toBeGreaterThan(0);
    expect(mockNoteManualBreaks).toHaveBeenCalledTimes(2);
    let result!: ReturnType<SearchRecorder['stop']>;
    act(() => { result = get().stop(); });
    expect(result.breaks).toHaveLength(1);   // geht ins Suchergebnis ein
  });

  it('die automatische Entwarnung beendet einen manuellen Fährtenverlust nicht, und es entsteht kein zweiter Abriss', async () => {
    const get = await started();
    let y = 0;
    for (let i = 0; i < 8; i++) { y += 2; feed(0, y); }
    tap(get);
    // Hundeführer wird weit seitlich gezogen (automatisch: off_track) und kommt zurück (automatisch: recovered).
    for (let i = 0; i < 8; i++) { y += 1; feed(15, y); }
    expect(get().offTrackState).toBe('off_track');
    expect(get().breaks).toHaveLength(1);
    for (let i = 0; i < 8; i++) { y += 1; feed(0, y); }
    expect(get().offTrackState).toBe('on_track');
    expect(get().breaks).toHaveLength(1);
    expect(get().breaks[0].recoveredAtSec).toBeUndefined();
    expect(get().manualLossActive).toBe(true);
    tap(get);
    expect(get().breaks[0].recoveredAtSec).toBe(24);
  });

  it('ein gerade offener automatischer Abriss wird durch die Taste übernommen statt verdoppelt', async () => {
    const get = await started();
    let y = 0;
    for (let i = 0; i < 8; i++) { y += 2; feed(0, y); }
    for (let i = 0; i < 8; i++) { y += 1; feed(15, y); }
    expect(get().breaks).toHaveLength(1);
    expect(get().breaks[0].manual).toBeUndefined();
    tap(get);
    expect(get().breaks).toHaveLength(1);
    expect(get().breaks[0].manual).toBe(true);
    for (let i = 0; i < 8; i++) { y += 1; feed(0, y); }
    expect(get().breaks[0].recoveredAtSec).toBeUndefined();   // jetzt entscheidet die Taste
    tap(get);
    expect(get().breaks[0].recoveredAtSec).toBeGreaterThan(0);
  });

  it('ohne Taste bleibt die automatische Erkennung unverändert (öffnet und schliesst selbst)', async () => {
    const get = await started();
    let y = 0;
    for (let i = 0; i < 8; i++) { y += 2; feed(0, y); }
    for (let i = 0; i < 8; i++) { y += 1; feed(15, y); }
    for (let i = 0; i < 8; i++) { y += 1; feed(0, y); }
    expect(get().breaks).toHaveLength(1);
    expect(get().breaks[0].manual).toBeUndefined();
    expect(get().breaks[0].recoveredAtSec).toBeGreaterThan(0);
    expect(get().manualLossActive).toBe(false);
  });

  it('vor dem Start und ohne Position passiert nichts', async () => {
    const { getRecorder } = mount();
    await act(async () => { await Promise.resolve(); });
    tap(getRecorder);
    expect(getRecorder().breaks).toHaveLength(0);
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    tap(getRecorder);   // läuft, aber noch kein Fix
    expect(getRecorder().breaks).toHaveLength(0);
    expect(getRecorder().manualLossActive).toBe(false);
  });

  it('Fortsetzen nach App-Abbruch: ein offener manueller Fährtenverlust bleibt offen und lässt sich schliessen', async () => {
    const runState = { ...freshSearchRunState(), maxCursorM: 20,
      breaks: [{ at: toLL(0, 20), t: 10, startedAtSec: 10, manual: true }] };
    const get = await started({ points: [toLL(0, 0), toLL(0, 20)], startedAtMs: T0 - 30_000, runState });
    expect(get().manualLossActive).toBe(true);
    let y = 20;
    for (let i = 0; i < 5; i++) { y += 2; feed(0, y); }
    tap(get);
    expect(get().manualLossActive).toBe(false);
    expect(get().breaks).toHaveLength(1);
    expect(get().breaks[0]).toMatchObject({ manual: true, startedAtSec: 10, recoveredAtSec: 35, durationSec: 25 });
  });
});

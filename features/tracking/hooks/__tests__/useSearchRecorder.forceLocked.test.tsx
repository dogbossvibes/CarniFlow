// Root-Cause-Fix (Golden-Reference-Audit, Punkt 2 — "kein stiller LIVE-Zustand
// ohne gültige Aufnahme"): ein ausdrücklicher manueller Override ("Trotzdem
// starten", run.tsx handleManualStart mode='manual-override') darf nicht
// LIVE+Timer starten, während SearchStartAcquisition intern nie START_LOCKED
// erreicht (Cursor/Fortschritt bleiben dann für immer auf dem Vor-Lock-Wert
// eingefroren, obwohl recording=true und der Timer läuft). start(undefined,
// {forceLocked:true}) schliesst diese Lücke: der Override gibt die Aufnahme
// wirklich frei, statt zusätzlich eine interne Akquisition zu verlangen.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));

let feedSample: ((s: {
  lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number;
}) => void) | null = null;
const mockStop = jest.fn();
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({
    coords: {
      latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: s.altitude ?? null,
      altitudeAccuracy: null, heading: s.course ?? null, speed: s.speed ?? null,
    },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async (cb: any) => {
    feedSample = cb;
    return { stop: mockStop, info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: null } };
  }),
}));

jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({ addSearchPoint: jest.fn(), resetSearchPoints: jest.fn() }) },
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
function toLL(xEastM: number, yNorthM: number): LatLng {
  return { latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG };
}
function denseLeg(fromM: number, toM: number, x: number): LatLng[] {
  const pts: LatLng[] = [];
  const steps = Math.max(1, Math.round(Math.abs(toM - fromM) / 2));
  for (let i = 0; i <= steps; i++) pts.push(toLL(x, fromM + ((toM - fromM) * i) / steps));
  return pts;
}
const NO_OBJECTS: readonly [] = [];

function Harness({ onReady, laidPoints }: { onReady: (s: SearchRecorder) => void; laidPoints: LatLng[] }) {
  const s = useSearchRecorder({ laidPoints, laidObjects: NO_OBJECTS as any, level: 'training', handlerDistanceM: 5 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
function mount(laidPoints: LatLng[]): { getRecorder: () => SearchRecorder } {
  let latest!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness laidPoints={laidPoints} onReady={(s) => { latest = s; }} />); });
  return { getRecorder: () => latest };
}
let simClockMs = 0;
function feed(accuracy: number, xEastM: number, yNorthM: number) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  simClockMs += 1000;
  act(() => { feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 0, course: null, t: simClockMs }); });
}

describe('useSearchRecorder — forceLocked (manueller Override darf keinen stillen LIVE/0-m-Zustand erzeugen)', () => {
  beforeEach(() => { feedSample = null; mockStop.mockClear(); simClockMs = 0; activeRenderer = null; });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); });

  it('OHNE forceLocked: weit weg vom Fährtenanfang gestartet → Cursor/Fortschritt bleiben eingefroren (SearchStartAcquisition lockt nie)', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });   // wie 'manual-at-start' — normale Akquisition

    // Handler weit ausserhalb des Startfensters (startWindowM=12) und/oder mit
    // schlechter Übereinstimmung — Akquisition lockt nie.
    for (let i = 0; i < 5; i++) feed(20, 50, 30);
    expect(getRecorder().searchStartState).not.toBe('START_LOCKED');
    expect(getRecorder().progressM).toBe(0);   // Fortschritt eingefroren trotz recording=true
  });

  it('MIT forceLocked (Trotzdem starten): sofort START_LOCKED, Cursor/Fortschritt/Distanz laufen normal an', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });

    expect(getRecorder().searchStartState).toBe('START_LOCKED');   // sofort, kein stiller Zwischenzustand
    expect(getRecorder().recording).toBe(true);

    // Auch aus derselben "weit weg"-Position: die Aufnahme läuft jetzt
    // WIRKLICH — kein Einfrieren bei recording=true + 0 Punkten.
    let y = 0;
    for (let i = 0; i < 6; i++) { y += 2; feed(5, 0, y); }
    expect(getRecorder().points.length).toBeGreaterThan(1);
    expect(getRecorder().distanceM).toBeGreaterThan(0);
  });
});

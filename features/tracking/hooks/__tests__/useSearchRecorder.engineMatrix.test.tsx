// Golden-Reference-A/B-Matrix (Punkt 3/8 des Audits): BUILD40 vs. CURRENT
// (trackingEngineMode) über den ECHTEN useSearchRecorder-Hook, jeweils mit
// einem langsamen (EXPO-artigen, ~1 Hz) und einem dichten (PRECISION-
// artigen, mehrere Fixe pro Sekunde, ungedrosselt — wie der jetzt entfernte
// native Throttle es zuliess) simulierten Fixstrom. Deckt NICHT die
// Location-Source-Auswahl selbst ab (das prüft positionSource.legacyMode.
// test.ts) — hier zählt nur: wächst points/distanceM/deviation korrekt,
// unabhängig von ENGINE und Fixdichte.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';
import { setTrackingEngineMode } from '@/features/tracking/utils/trackingEngineMode';

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
function toLL(xEastM: number, yNorthM: number): LatLng { return { latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG }; }
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
function feed(accuracy: number, xEastM: number, yNorthM: number, dtMs: number) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  simClockMs += dtMs;
  act(() => { feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 1.4, course: null, t: simClockMs }); });
}

describe.each([
  ['BUILD40', 'build40'] as const,
  ['CURRENT', 'current'] as const,
])('useSearchRecorder — ENGINE=%s, EXPO-artiger Fixstrom (~1 Hz)', (_label, engine) => {
  beforeEach(() => { feedSample = null; mockStop.mockClear(); simClockMs = 0; activeRenderer = null; setTrackingEngineMode(engine); });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); setTrackingEngineMode('current'); });

  it('Start funktioniert, Timer/Recorder starten zusammen, 20 Bewegungsfixe → points wachsen, Distanz wächst, Abweichung wird berechnet', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });
    expect(getRecorder().recording).toBe(true);

    let y = 0;
    for (let i = 0; i < 20; i++) { y += 2; feed(5, 0, y, 1000); }

    expect(getRecorder().points.length).toBeGreaterThan(5);
    expect(getRecorder().distanceM).toBeGreaterThan(10);
    expect(typeof getRecorder().deviationM).toBe('number');
    expect(getRecorder().deviationM).toBeLessThan(3);   // exakt auf der Soll-Fährte → geringe Abweichung
  });
});

describe.each([
  ['BUILD40', 'build40'] as const,
  ['CURRENT', 'current'] as const,
])('useSearchRecorder — ENGINE=%s, PRECISION-artiger Fixstrom (dicht/ungedrosselt, mehrere Fixe/Sekunde)', (_label, engine) => {
  beforeEach(() => { feedSample = null; mockStop.mockClear(); simClockMs = 0; activeRenderer = null; setTrackingEngineMode(engine); });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); setTrackingEngineMode('current'); });

  it('dichter Fixstrom (250 ms Abstand, wie AnyvoPrecisionLocation nach Throttle-Entfernung) verarbeitet sich normal, Distanz wächst', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    let y = 0;
    for (let i = 0; i < 60; i++) { y += 0.5; feed(5, 0, y, 250); }   // 60 Fixe in 15s "Echtzeit", ~0.5 m/Fix

    expect(getRecorder().points.length).toBeGreaterThan(3);
    expect(getRecorder().distanceM).toBeGreaterThan(8);
  });
});

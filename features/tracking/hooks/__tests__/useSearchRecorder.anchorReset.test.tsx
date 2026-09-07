// Root-Cause-Fix (echtes iPhone, Build 43 — "Suchdistanz bleibt 23s bei 0 m"):
// end-to-end über den echten Hook (kein Reimplementieren), analog zum
// bestehenden useSearchRecorder.fusion.test.tsx-Harness. Simuliert exakt das
// beobachtete Muster: der allererste GPS-Fix nach dem Start ist ein
// geografisch entfernter (z. B. gecachter) Fix, danach kommen echte, nahe
// Fixes — die Absuche darf NICHT dauerhaft bei 0 m einfrieren.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';

jest.mock('@react-native-async-storage/async-storage', () =>
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

describe('useSearchRecorder — Anker-Recovery nach geografisch falschem ersten Fix (Build-43-Root-Cause)', () => {
  beforeEach(() => { feedSample = null; mockStop.mockClear(); simClockMs = 0; activeRenderer = null; });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); });

  it('erster Fix 300 m entfernt (z. B. gecachte Position) friert die Absuche NICHT dauerhaft ein — Anker wird nach 3 konsistenten realen Fixes zurückgesetzt', async () => {
    const laidPoints = denseLeg(0, 60, 0);   // echte Fährte entlang x=0
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    // Bug-Reproduktion: allererster Fix ist 300 m weit weg (schlechter Anker).
    feed(8, 300, 0);
    expect(getRecorder().distanceM).toBe(0);

    // Echte Fixes am tatsächlichen Fährtenansatz — OHNE den Fix wären diese
    // alle als 'speed'-Ausreisser verworfen worden (siehe
    // staleFirstFixFreeze.test.ts), die Absuche wäre auf 0 m eingefroren
    // geblieben, obwohl `position` (Puck) längst hierher gewandert ist.
    feed(5, 0, 0);
    feed(5, 0, 0.3);
    expect(getRecorder().distanceM).toBe(0);   // noch nicht genug konsistente Evidenz für den Reset

    feed(5, 0, 0.6);   // 3. konsistenter realer Fix → Anker-Reset greift
    // Nach dem Reset normal weitergehen — Distanz muss jetzt sichtbar wachsen.
    let y = 0.6;
    const distances: number[] = [getRecorder().distanceM];
    for (let i = 0; i < 8; i++) { y += 2; feed(5, 0, y); distances.push(getRecorder().distanceM); }

    expect(getRecorder().distanceM).toBeGreaterThan(10);   // Absuche hat sich vollständig erholt
    // Monoton wachsend ab dem Reset (keine Rückwärts-/Phantomsprünge).
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it('ohne Anker-Fehler (normaler erster Fix am Ansatz) verhält sich nichts anders — keine Regression', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    feed(5, 0, 0);
    let y = 0;
    for (let i = 0; i < 6; i++) { y += 2; feed(5, 0, y); }
    expect(getRecorder().distanceM).toBeGreaterThan(8);
  });
});

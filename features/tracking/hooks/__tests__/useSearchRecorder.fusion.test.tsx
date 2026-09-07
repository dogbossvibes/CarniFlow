// Regressionstest für die Sensor-Fusion-Nachbesserung (Punkt 2): ein
// eindeutiger GPS-Outlier oder ein per Motion bestätigtes Stillstands-Jitter
// darf die tatsächlich verwendete Absuche-Linie (Distanz/Cursor/Abweichung/
// Puck) nicht künstlich verschieben. evaluateSearchFix() bleibt unverändert
// die erste Sicherheitsstufe — dieser Test treibt echte Fixes durch den
// echten Hook (kein Reimplementieren der Logik), analog zum bestehenden
// useSearchRecorder.searchStart.test.tsx-Harness.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';
import type { MotionSample } from '@/modules/anyvo-motion';

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

// Motion-Client gemockt: nur mit gezielt gefeuerten Samples lässt sich
// gps_outlier/stationary überhaupt erreichen — evaluateFusion() verlangt für
// beide Klassifikationen zwingend ein Motion-Signal (motionContradicts prüft
// `motion != null`, motionLooksStationary(null)===false). Ohne diesen Mock
// bliebe motionLatestRef immer null — exakt der reale "kein natives Modul
// gebaut"-Zustand, den der letzte Test dieser Datei bewusst ausnutzt.
let motionSampleCb: ((s: MotionSample) => void) | null = null;
jest.mock('@/features/tracking/native/motionClient', () => ({
  motionClient: {
    isModuleAvailable: () => true,
    isAvailable: () => true,
    getStatus: jest.fn(async () => ({ deviceMotionAvailable: true, stepCountingAvailable: true, activityAvailable: true, pedometerAuthorized: true, running: true })),
    start: jest.fn(async () => true),
    stop: jest.fn(async () => {}),
    onSample: (cb: any) => { motionSampleCb = cb; return { remove: () => { motionSampleCb = null; } }; },
    onError: () => ({ remove: () => {} }),
  },
}));

function feedMotion(overrides: Partial<MotionSample>) {
  if (!motionSampleCb) throw new Error('motion callback not captured yet');
  act(() => {
    motionSampleCb!({
      timestamp: Date.now(), accelerationMagnitude: 0.01, rotationMagnitude: 0.01, headingDelta: 0,
      stepDelta: 0, cadence: null, movementState: 'stationary', motionConfidence: 0.9, activityConfidence: 'high',
      ...overrides,
    });
  });
}

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
function feed(accuracy: number, xEastM: number, yNorthM: number, course: number | null = null) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  simClockMs += 1000;
  act(() => {
    feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 0, course, t: simClockMs });
  });
}

// Lockt den Start (3 stationäre Fixes am Anfang des Schenkels) und geht dann
// `steps` Schritte à ~2 m entlang des Schenkels weiter, um eine reale
// Basisdistanz aufzubauen, bevor der eigentliche Testfall beginnt.
function lockAndWalk(getRecorder: () => SearchRecorder, steps: number): number {
  feed(5, 0.1, 0.3); feed(5, 0.12, 0.3); feed(5, 0.11, 0.3);
  expect(getRecorder().searchStartState).toBe('START_LOCKED');
  let y = 0.3;
  for (let i = 0; i < steps; i++) { y += 2; feed(5, 0, y); }
  return y;
}

describe('useSearchRecorder — Sensor-Fusion-Schutzschicht (Punkt 2 der Nachbesserung)', () => {
  beforeEach(() => { feedSample = null; motionSampleCb = null; mockStop.mockClear(); simClockMs = 0; activeRenderer = null; });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); });

  it('normaler GPS-Fix (kein Motion-Widerspruch) → Linie bewegt sich normal weiter', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    lockAndWalk(getRecorder, 5);   // ~10 m
    const distAfterWalk = getRecorder().distanceM;
    expect(distAfterWalk).toBeGreaterThan(5);

    feedMotion({ movementState: 'walking', motionConfidence: 0.9 });
    // Mehrere weitere Schritte (EMA-Glättung braucht ein paar Fixes, um dem
    // Rohfix zu "folgen" — derselbe Lag wie bei lockAndWalk oben).
    let y = 10.3;
    for (let i = 0; i < 4; i++) { y += 2; feed(5, 0, y); }

    expect(getRecorder().distanceM).toBeGreaterThan(distAfterWalk);
  });

  it('gps_outlier (grosser Sprung + schlechte Genauigkeit + Motion widerspricht) → Linie bleibt am letzten guten Punkt, KEINE künstliche Distanz/Cursor-Verschiebung', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    const y = lockAndWalk(getRecorder, 9);   // ~18 m, deutlich vor dem Trackende
    const distBefore = getRecorder().distanceM;
    const progressBefore = getRecorder().progressM;
    const posBefore = getRecorder().position;

    // Motion sagt: Handler steht (fast) still — aber GPS springt ~8 m weiter
    // (>outlierJumpM=6, <=maxSpeedMps(12)*1s → passiert evaluateSearchFix, aber
    // wird von der Fusion als physikalisch/sensorisch widersprüchlich erkannt).
    feedMotion({ movementState: 'stationary', motionConfidence: 0.9, accelerationMagnitude: 0.01, rotationMagnitude: 0.01 });
    feed(20, 0, y + 8);   // Accuracy 20 m (accPoor, aber < 45 m gate1-Ceiling)

    expect(getRecorder().distanceM).toBe(distBefore);
    expect(getRecorder().progressM).toBe(progressBefore);
    expect(getRecorder().position).toEqual(posBefore);
    expect(getRecorder().gpsQuality?.band).toBe('unreliable');   // Outlier-Confidence 0.2 → unreliable
  });

  it('stationary + GPS-Jitter (kleiner Sprung, Motion bestätigt Stillstand) → keine künstliche Distanz', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    const y = lockAndWalk(getRecorder, 9);
    const distBefore = getRecorder().distanceM;
    const posBefore = getRecorder().position;

    feedMotion({ movementState: 'stationary', motionConfidence: 0.9, accelerationMagnitude: 0.01, rotationMagnitude: 0.01, stepDelta: 0 });
    feed(6, 0, y + 4);   // 4 m Jitter, <= stationaryJitterM*2.5 (7.5 m) → 'stationary', nicht 'gps_outlier'

    expect(getRecorder().distanceM).toBe(distBefore);
    expect(getRecorder().position).toEqual(posBefore);
  });

  it('nach einem Outlier: der nächste plausible Fix wird SOFORT wieder normal übernommen (keine Lag-Kaskade, kein Dauerfrieren)', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    const y = lockAndWalk(getRecorder, 9);
    const distBefore = getRecorder().distanceM;

    feedMotion({ movementState: 'stationary', motionConfidence: 0.9 });
    feed(20, 0, y + 8);   // Outlier — wird neutralisiert
    expect(getRecorder().distanceM).toBe(distBefore);

    // Handler läuft tatsächlich normal weiter — realistische Fortsetzung NAHE
    // der letzten guten Position (y), nicht beim Ausreisser (y+8).
    feedMotion({ movementState: 'walking', motionConfidence: 0.9 });
    let yWalk = y;
    for (let i = 0; i < 4; i++) { yWalk += 2; feed(5, 0, yWalk); }

    expect(getRecorder().distanceM).toBeGreaterThan(distBefore);
    // Fortschritt liegt nahe der realen Fortsetzung, nicht beim Phantom-Sprung (y+8).
    expect(getRecorder().progressM).toBeLessThan(y + 8);
  });

  it('low_confidence (schlechte Genauigkeit, aber kein Outlier) wird NICHT pauschal verworfen — Linie aktualisiert sich weiter', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    const y = lockAndWalk(getRecorder, 9);
    const distBefore = getRecorder().distanceM;

    // Deutlich schlechtere Genauigkeit (40 m, aber < 45 m gate1-Ceiling), kein
    // grosser Sprung (< outlierJumpM=6) → kann fusionseitig NIE als gps_outlier
    // klassifiziert werden (bigJump fehlt) — bestehende GPS-Logik arbeitet normal weiter.
    feed(40, 0, y + 2);

    expect(getRecorder().distanceM).toBeGreaterThan(distBefore);
    expect(getRecorder().gpsQuality?.band).not.toBe('excellent');
  });

  // Root-Cause-Regressionstest (echtes iPhone, Build 42 — "Ist-Suchspur fehlt
  // komplett"): Apples CMMotionActivityManager (AnyvoMotionManager.swift)
  // klassifiziert nach echtem Bewegungsbeginn real bekanntermassen noch
  // mehrere Sekunden als 'stationary' nach, UND `lastActivity` dort hat KEINEN
  // Staleness-Timeout — movementState kann also während einer ganzen realen
  // Gehstrecke fälschlich 'stationary' bleiben, während Beschleunigung/
  // Rotation/Schritte längst echte Bewegung zeigen. Vor dem Fix genügte
  // movementState==='stationary' in motionLooksStationary() ALLEIN (sofortiges
  // return true) → jeder Fix wäre als 'stationary' eingefroren worden, obwohl
  // die Sensorik echte Bewegung zeigt. Dieser Test bildet genau das nach.
  it('movementState bleibt (Aktivitäts-Klassifikator veraltet) auf "stationary", aber Beschleunigung/Rotation/Schritte zeigen echtes Gehen → Linie friert NIE komplett ein', async () => {
    const laidPoints = denseLeg(0, 80, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    const y = lockAndWalk(getRecorder, 5);   // ~10 m Basisdistanz
    const distAfterLock = getRecorder().distanceM;

    // movementState bewusst weiterhin 'stationary' (veraltete Apple-Klassifikation),
    // aber accel/rotation/stepDelta zeigen unzweideutig echtes Gehen.
    feedMotion({
      movementState: 'stationary', motionConfidence: 0.9,
      accelerationMagnitude: 0.3, rotationMagnitude: 0.4, stepDelta: 1,
    });

    let walked = y;
    const distances: number[] = [distAfterLock];
    for (let i = 0; i < 6; i++) {
      walked += 2;
      feed(6, 0, walked);
      distances.push(getRecorder().distanceM);
    }

    // JEDER einzelne Schritt muss die Linie weiter wachsen lassen — kein
    // einziges eingefrorenes Segment, obwohl movementState durchgehend
    // 'stationary' meldet.
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }
    expect(getRecorder().distanceM).toBeGreaterThan(distAfterLock + 8);
    expect(getRecorder().gpsQuality?.fusionMode).toBe('gps_motion');
  });

  it('20+ gute Fixes am Stück (mit gelegentlichem stale movementState dazwischen) → keine langfristige Freeze-Kaskade', async () => {
    const laidPoints = denseLeg(0, 120, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    const y0 = lockAndWalk(getRecorder, 5);
    let y = y0;
    const distances: number[] = [getRecorder().distanceM];
    for (let i = 0; i < 22; i++) {
      // Jeder 5. Fix meldet (wie auf echtem Gerät beobachtet) ein veraltetes
      // 'stationary' bei gleichzeitig echten Bewegungssignalen — darf laut Fix
      // nie eine Kaskade auslösen, die spätere Fixes ebenfalls einfriert.
      feedMotion(i % 5 === 0
        ? { movementState: 'stationary', accelerationMagnitude: 0.3, rotationMagnitude: 0.4, stepDelta: 1 }
        : { movementState: 'walking', accelerationMagnitude: 0.3, rotationMagnitude: 0.4, stepDelta: 1 });
      y += 2;
      feed(6, 0, y);
      distances.push(getRecorder().distanceM);
    }

    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThan(distances[i - 1]);
    }
    expect(getRecorder().distanceM).toBeGreaterThan(y0 + 30);
  });

  it('Motion unavailable (kein Sample je gefeuert) → GPS-only reproduziert exakt das alte Verhalten', async () => {
    const laidPoints = denseLeg(0, 60, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    // KEIN feedMotion() hier — motionLatestRef bleibt null, exakt wie ohne
    // natives Modul (Android/Expo Go/älterer Build).
    const y = lockAndWalk(getRecorder, 9);
    const distBefore = getRecorder().distanceM;

    // Selbst ein grosser, schlecht genauer Sprung kann OHNE Motion-Evidenz nie
    // als gps_outlier klassifiziert werden (motionContradicts erfordert motion
    // != null) → Linie folgt dem Rohfix normal, wie vor der Fusion-Einführung.
    feed(20, 0, y + 8);

    expect(getRecorder().distanceM).toBeGreaterThan(distBefore);
    expect(getRecorder().gpsQuality?.fusionMode).toBe('gps_only');
  });
});

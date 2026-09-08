// Root-Cause-Fix (Golden-Reference-Audit — "Puck bewegt sich, Timer läuft,
// Distanz bleibt 0 m, keine Suchlinie" bei degradierter Ansatz-Genauigkeit,
// z. B. ±16 m): kompletter Pfad-Trace onFix → evaluateSearchFix → Glättung
// → fusionBlocksGeometry → MIN_SEGMENT → pts.push → distRef → React State
// (snap) → points/position, end-to-end über den ECHTEN Hook.
//
// Unterscheidet sich vom bestehenden useSearchRecorder.anchorReset.test.tsx:
// dort steht der Handler nahe einem falschen Anker STILL (die realen Fixes
// clustern eng — die alte clusterIsConsistent-Prüfung genügte). Hier BEWEGT
// sich der Handler zügig VOM falschen Anker weg (Suchtempo, jeder einzelne
// Schritt ≤ SEARCH_MAX_SPEED_MPS=12 m/s plausibel, aber die Folgepunkte
// clustern NICHT eng — Abstand > ANCHOR_RESET_MAX_SPREAD_M=8 m zueinander).
// Genau dieser Fall wurde vom ursprünglichen (nur "stehend")-Kriterium NICHT
// abgedeckt und friert bis zum trajectoryIsConsistent-Fix dauerhaft ein.
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
  simClockMs += 1000;   // ~1 Hz, wie die reale ANYVO-Fixrate
  act(() => { feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 0, course: null, t: simClockMs }); });
}

describe('useSearchRecorder — Feldsymptom "Puck bewegt sich, Distanz bleibt 0 m" (gehender Handler, falscher Anker)', () => {
  beforeEach(() => { feedSample = null; mockStop.mockClear(); simClockMs = 0; activeRenderer = null; });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); });

  it('reproduziert exakt: position aktualisiert bei jedem Fix, distanceM/points bleiben trotzdem 0, solange nur „stehend"-Cluster geprüft würde — und erholt sich dank trajectoryIsConsistent', async () => {
    const laidPoints = denseLeg(0, 80, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    // t0: „Anker" — ein degradierter/zwischengespeicherter erster Fix bei
    // y=0 (repräsentiert die reale ±16-m-Ansatz-Situation: gute Genauigkeit
    // GEMELDET, aber geografisch nicht die aktuelle Position).
    feed(10, 0, 0);
    expect(getRecorder().distanceM).toBe(0);
    expect(getRecorder().points).toHaveLength(1);   // Anker selbst zählt als 1. Punkt

    // t1/t2: der Handler bewegt sich zügig (~9 m/s Schritte, konsistent
    // untereinander) vom Anker weg — jeder Einzelschritt ist plausibel
    // (≤ SEARCH_MAX_SPEED_MPS=12), aber die Gesamt-Distanz-zum-Anker
    // impliziert > 12 m/s → 'speed'-Reject gegen den (falschen) Anker.
    const puckAtAnchor = getRecorder().position!;
    feed(5, 0, 59);   // Puck-Position aktualisiert sich (unten geprüft), Distanz NICHT
    expect(getRecorder().distanceM).toBe(0);
    // Puck ist trotz des Rejects sichtbar Richtung Norden gewandert (EMA-
    // geglättet, SMOOTH_ALPHA=0.4 — daher nicht exakt bei y=59, aber klar
    // Richtung des neuen Rohfixes verschoben) — exakt das Feldsymptom
    // "Puck bewegt sich".
    expect(getRecorder().position!.latitude).toBeGreaterThan(puckAtAnchor.latitude);

    feed(5, 0, 68);   // 2. Reject — noch immer keine Suchlinie/Distanz
    expect(getRecorder().distanceM).toBe(0);
    expect(getRecorder().points).toHaveLength(1);   // runPoints-Äquivalent bleibt leer/nur Anker — EXAKTES Feldsymptom
    expect(getRecorder().position!.latitude).toBeGreaterThan(puckAtAnchor.latitude);   // Puck wandert weiter, trotz distanceM=0

    // t3: 3. Fix in Folge — jetzt greift die (neue) trajectoryIsConsistent-
    // Prüfung: die letzten drei Positionen (Anker ausgenommen) sind je
    // ~9 m/s auseinander (plausibler Pfad), auch wenn sie > 8 m zueinander
    // liegen (die alte „stehend"-Prüfung hätte hier weiterhin abgelehnt).
    feed(5, 0, 77);
    // Der Reset selbst setzt distRef auf 0 zurück (dieser Fix wird wie ein
    // neuer "erster" Punkt behandelt, siehe useSearchRecorder.onFix) — die
    // Erholung zeigt sich am NÄCHSTEN Fix, nicht bereits an diesem.
    expect(getRecorder().distanceM).toBe(0);
    expect(getRecorder().points).toHaveLength(1);   // neuer Anker, nicht mehr der alte
    feed(5, 0, 80);
    expect(getRecorder().distanceM).toBeGreaterThan(0);   // Anker-Reset griff → Absuche erholt sich

    // Weiterer Verlauf: Distanz wächst normal und monoton weiter — kein
    // Einzelfall, keine Rückwärts-/Phantomsprünge.
    let y = 80;
    const distances: number[] = [getRecorder().distanceM];
    for (let i = 0; i < 6; i++) { y += 3; feed(5, 0, y); distances.push(getRecorder().distanceM); }
    expect(getRecorder().distanceM).toBeGreaterThan(10);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it('Regressionsgarantie: „Puck bewegt sich + Timer läuft + distanceM bleibt dauerhaft 0" ist nach hinreichend vielen konsistenten Fixen unmöglich', async () => {
    const laidPoints = denseLeg(0, 100, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    feed(10, 0, 0);   // falscher Anker
    let y = 0;
    // 15 weitere, konsistent zügige Fixe (~9 m/s) — auch bei fortgesetzt
    // degradierter Lage darf die Absuche nicht dauerhaft bei 0 m bleiben.
    for (let i = 0; i < 15; i++) { y += 9; feed(6, 0, y); }
    expect(getRecorder().distanceM).toBeGreaterThan(0);
  });
});

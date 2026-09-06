// Regressionstest für den Production-Hotfix (527217d → dieser Fix): ein
// Handler, der exakt am echten Fährtenansatz STEHT (oder sehr langsam geht),
// muss innerhalb weniger Sekunden START_LOCKED erreichen. Vorher konnte der
// Liniendichte-Gate (MIN_SEGMENT) den Search-Start-Acquisition-Code komplett
// blockieren, sobald zwei aufeinanderfolgende Fixes < 1.5 m auseinanderlagen —
// exakt der Normalfall bei einem stillstehenden oder langsam gehenden Handler.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));

// Fixes werden über diesen eingefangenen Callback synchron eingespeist —
// derselbe Adapter (sampleToLocationObject) wie in der echten Positionsquelle
// bleibt real (reine Funktion, keine Mock-Notwendigkeit).
let feedSample: ((s: {
  lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number;
}) => void) | null = null;
const mockStop = jest.fn();
// Bewusst KEIN jest.requireActual des echten Moduls — das zieht transitiv
// positionStream/precisionLocationClient (native-nah) mit rein, was den
// Jest-Testlauf ohne Native-Mock zum Hängen brachte (Timeout + OOM). Die
// winzige, reine Adapter-Funktion wird hier 1:1 nachgebaut.
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

const M_PER_DEG = 111320;
function toLL(xEastM: number, yNorthM: number): LatLng {
  return { latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG };
}
// Dichte, realistische Trackauflösung (~2 m), wie bei der gelegten Fährte.
function denseLeg(fromM: number, toM: number, x: number): LatLng[] {
  const pts: LatLng[] = [];
  const steps = Math.max(1, Math.round(Math.abs(toM - fromM) / 2));
  for (let i = 0; i <= steps; i++) pts.push(toLL(x, fromM + ((toM - fromM) * i) / steps));
  return pts;
}

// Stabile Referenz ausserhalb der Komponente — eine neue Array-Instanz je
// Render würde useSearchRecorder's onFix-Memoisierung brechen (laidObjects ist
// Teil von dessen useCallback-Deps) und eine Render-Endlosschleife auslösen
// (in der echten App ist snapData.laidObjects store-stabil, hier muss die
// Testfixture das nachbilden).
const NO_OBJECTS: readonly [] = [];

function Harness({ onReady, laidPoints }: { onReady: (s: SearchRecorder) => void; laidPoints: LatLng[] }) {
  const s = useSearchRecorder({ laidPoints, laidObjects: NO_OBJECTS as any, level: 'training', handlerDistanceM: 5 });
  onReady(s);
  return null;
}

// WICHTIG: useSearchRecorder startet nach start() einen echten (nicht
// gefakten) 1-Sekunden-setInterval (Elapsed-Timer/GPS-Debug). Ohne explizites
// unmount() der Renderer-Instanz läuft dieser Timer nach Testende real weiter
// und produziert endlos "not wrapped in act()"-Warnungen, bis der Prozess
// irgendwann hängt/OOM geht — kein Bug in der Produktionslogik, ein reines
// Test-Cleanup-Erfordernis. Jeder mount() wird daher in afterEach unmounted.
let activeRenderer: ReactTestRenderer | null = null;
function mount(laidPoints: LatLng[]): { getRecorder: () => SearchRecorder } {
  let latest!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness laidPoints={laidPoints} onReady={(s) => { latest = s; }} />); });
  return { getRecorder: () => latest };
}

// Simulierte Fix-Uhr: reale Fixes kommen ~1x/Sekunde (watch-Intervall). Reines
// Date.now() zwischen zwei synchronen feed()-Aufrufen im Test läge nur
// Millisekunden auseinander und würde über das Speed-Gate (jumpM/dt) auch
// winzigen Jitter als unplausiblen ~100-m/s-Sprung verwerfen — ein reines
// Testartefakt, keine Produktionslogik.
let simClockMs = 0;
// xEastM = seitlicher Versatz (bisheriger zweiter Parameter, unverändert für
// alle bestehenden Aufrufe); yNorthM = Position entlang des ersten (nach
// Norden laufenden) Schenkels — Default 0.3 m entspricht "steht am Start".
function feed(accuracy: number, xEastM = 0.2, yNorthM = 0.3) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  simClockMs += 1000;
  act(() => {
    feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 0, course: null, t: simClockMs });
  });
}

describe('useSearchRecorder — Search Start Acquisition lockt einen stillstehenden Handler am echten Start', () => {
  beforeEach(() => { feedSample = null; mockStop.mockClear(); simClockMs = 0; activeRenderer = null; });
  afterEach(() => { act(() => { activeRenderer?.unmount(); }); });

  it('A) Handler exakt am savedStart, STATIONARY (Fixes < MIN_SEGMENT auseinander) → LOCK', async () => {
    // Startbein 30 m Richtung Norden — Standard-Fixture, keine Mehrdeutigkeit hier im Fokus.
    const laidPoints = denseLeg(0, 30, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });   // Location-Effect abschliessen lassen

    act(() => { getRecorder().start(); });
    expect(getRecorder().searchStartState).toBe('SEEKING_START');

    // Drei praktisch identische Fixes (Handler steht still, nur Sub-Meter-Jitter) —
    // deutlich unter MIN_SEGMENT (1.5 m).
    feed(5, 0.1);
    feed(5, 0.15);
    feed(5, 0.12);

    expect(getRecorder().searchStartState).toBe('START_LOCKED');
  });

  it('B) Handler 2-5 m vom savedStart, innerhalb gültigem Accuracy-Radius, stationär → LOCK', async () => {
    const laidPoints = denseLeg(0, 30, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    feed(6, 3);
    feed(6, 3.2);
    feed(6, 2.9);

    expect(getRecorder().searchStartState).toBe('START_LOCKED');
  });

  it('I) Handler steht 5-10 Sekunden am Start (viele stationäre Fixes) → Lock bleibt möglich, kein Dauerblock', async () => {
    const laidPoints = denseLeg(0, 30, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    // 8 Sekunden lang praktisch identische Fixes (1/s, wie der reale Watch-Intervall).
    for (let i = 0; i < 8; i++) feed(5, 0.1 + i * 0.01);

    expect(getRecorder().searchStartState).toBe('START_LOCKED');
  });

  it('F) 5 m Hundabstand: vor Lock kein Vorschub der virtuellen Hundeposition', async () => {
    const laidPoints = denseLeg(0, 30, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    feed(5, 0.1);   // erster Fix: SEEKING_START → START_CANDIDATE, noch nicht gelockt
    expect(getRecorder().searchStartState).not.toBe('START_LOCKED');
    expect(getRecorder().estimatedDogPosition).toBeNull();

    feed(5, 0.12);
    feed(5, 0.11);
    expect(getRecorder().searchStartState).toBe('START_LOCKED');
    // Erst jetzt darf eine virtuelle Hundeposition erscheinen.
    expect(getRecorder().estimatedDogPosition).not.toBeNull();
  });

  it('E) später Schenkel 2 m neben dem Start, Handler stationär am echten Start → trotzdem Start, nicht der spätere Schenkel', async () => {
    // Startbein 30 m Nord, dann ein späterer Schenkel nur 2 m daneben zurück.
    const laidPoints = [...denseLeg(0, 30, 0), ...denseLeg(30, 0, 2)];
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    feed(4, 0.1);
    feed(4, 0.15);
    feed(4, 0.12);

    expect(getRecorder().searchStartState).toBe('START_LOCKED');
    // progressM (Handler-Fortschritt) muss nahe 0 sein, nicht im Bereich des
    // späteren Schenkels (arc ab ~32).
    expect(getRecorder().progressM).toBeLessThan(5);
  });

  it('H) ein schlechter Einzel-Fix zwischen guten Fixes verhindert den Lock nicht dauerhaft', async () => {
    const laidPoints = denseLeg(0, 30, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    feed(5, 0.1);
    feed(5, 0.15);
    feed(60, 0.2);   // ein Ausreisser: Accuracy jenseits maxAccuracyM (25 m)
    expect(getRecorder().searchStartState).not.toBe('START_LOCKED');
    // Danach wieder gute Fixes → lockt trotzdem (kein Dauerblock durch den Ausreisser).
    feed(5, 0.12);
    feed(5, 0.1);
    feed(5, 0.11);
    expect(getRecorder().searchStartState).toBe('START_LOCKED');
  });

  it('J) Handler läuft unmittelbar los (reale Bewegung ≥ MIN_SEGMENT zwischen Fixes) → ebenfalls korrekter Lock', async () => {
    const laidPoints = denseLeg(0, 30, 0);
    const { getRecorder } = mount(laidPoints);
    await act(async () => { await Promise.resolve(); });
    act(() => { getRecorder().start(); });

    // Fixes klar > MIN_SEGMENT (1.5 m) auseinander entlang des ersten Schenkels —
    // der Normalfall, der schon vor diesem Hotfix funktionierte, muss es auch
    // nach der Umstellung (Acquisition vor dem Liniendichte-Gate) bleiben.
    feed(5, 0, 0);
    feed(5, 0, 3);
    feed(5, 0, 6);

    expect(getRecorder().searchStartState).toBe('START_LOCKED');
    expect(getRecorder().progressM).toBeGreaterThanOrEqual(0);
    expect(getRecorder().progressM).toBeLessThan(10);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Punkt 5 (savedStart vs. Polyline) — statisch verifiziert: der in run.tsx an
// useStartPointApproach übergebene Startpunkt (Gate 1) und der Bogenlänge-0-
// Punkt der an useSearchRecorder übergebenen laidPoints (Gate 2) stammen aus
// DERSELBEN Quelle (st.trackPoints[0]) — kein savedStart-vs-erster-Polyline-
// Punkt-Mismatch in dieser Codebase. Als Text-Test verankert, damit eine
// künftige Änderung (z. B. ein separat persistierter Anker) hier auffällt.
// ──────────────────────────────────────────────────────────────────────────
describe('Punkt 5 — savedStart und erster Polyline-Punkt teilen dieselbe Quelle', () => {
  it('laidLatLng[0] (Gate 1) und laidPoints[0] (Gate 2) leiten sich beide aus st.trackPoints ab', () => {
    const src = readFileSync('app/track/run.tsx', 'utf8');
    expect(src).toMatch(/laidLatLng:\s*st\.trackPoints\.map/);
    expect(src).toMatch(/laidPoints:\s*st\.trackPoints\.map/);
    expect(src).toMatch(/const startPoint = \(snap && snap\.laidLatLng\.length > 0 \? snap\.laidLatLng\[0\]/);
  });
});

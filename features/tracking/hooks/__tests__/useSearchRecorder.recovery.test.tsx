/**
 * Search-Recovery-State — useSearchRecorder: derselbe Run läuft nach Resume
 * weiter (Cursor/Progress, Funde, Abrisse, Abweichung, Off-Track), statt bei
 * 0 neu zu beginnen. Harness wie useSearchRecorder.searchStart.test.tsx.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng, type SearchObject } from '@/features/tracking/hooks/useSearchRecorder';
import { freshSearchRunState, type SearchRunState } from '@/features/tracking/store/searchRunState';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  Accuracy: { BestForNavigation: 6 },
}));

let feedSample: ((s: { lat: number; lng: number; accuracy: number | null; speed: number | null; course: number | null; t: number }) => void) | null = null;
jest.mock('@/features/tracking/utils/positionSource', () => ({
  sampleToLocationObject: (s: any) => ({
    coords: { latitude: s.lat, longitude: s.lng, accuracy: s.accuracy ?? null, altitude: null, altitudeAccuracy: null, heading: s.course ?? null, speed: s.speed ?? null },
    timestamp: s.t,
  }),
  startPositionSource: jest.fn(async (cb: any) => {
    feedSample = cb;
    return { stop: jest.fn(), info: { isNativeAvailable: false, rawGnssSupported: false, source: 'expo', provider: null } };
  }),
}));

// Store-Mock mit MITSCHRIFT: was der Recorder in den Run-State spiegelt.
const storeCalls = { progress: [] as { maxCursorM: number; devCount: number; breaks: unknown[] }[], found: [] as string[], offTrack: [] as string[] };
const storeState = { searchRunState: { offTrackState: 'on_track' as string } };
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: (p: any) => storeCalls.progress.push({ maxCursorM: p.maxCursorM, devCount: p.devCount, breaks: p.breaks }),
    noteSearchObjectFound: (k: string) => storeCalls.found.push(k),
    noteSearchOffTrackState: (s: string) => { storeCalls.offTrack.push(s); storeState.searchRunState.offTrackState = s; },
    searchRunState: storeState.searchRunState,
  }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));

const M_PER_DEG = 111320;
const toLL = (xE: number, yN: number): LatLng => ({ latitude: yN / M_PER_DEG, longitude: xE / M_PER_DEG });
// Gerade Fährte nach Norden, 100 m, 2-m-Raster (wie die gelegte Linie).
const LINE: LatLng[] = [];
for (let y = 0; y <= 100; y += 2) LINE.push(toLL(0, y));
// Gegenstand bei 20 m (Stoff) und Dübel bei 70 m — mit stabilen Marker-IDs.
const OBJECTS: SearchObject[] = [
  { at: toLL(0, 20), index: 0, material: 'stoff', id: 'gegenstand-20' },
  { at: toLL(0, 70), index: 1, material: 'duebel', id: 'gegenstand-70' },
];

function Harness({ onReady, objects }: { onReady: (s: SearchRecorder) => void; objects: SearchObject[] }) {
  const s = useSearchRecorder({ laidPoints: LINE, laidObjects: objects, level: 'training', handlerDistanceM: 5 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
function mount(objects: SearchObject[] = OBJECTS): { getRecorder: () => SearchRecorder } {
  let latest!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness objects={objects} onReady={(s) => { latest = s; }} />); });
  return { getRecorder: () => latest };
}
let simClockMs = 0;
function feed(yNorthM: number, xEastM = 0.2, accuracy = 4) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  simClockMs += 1000;
  act(() => { feedSample!({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG, accuracy, speed: 1, course: null, t: simClockMs }); });
}
const flushMicrotasks = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => {
  feedSample = null; simClockMs = 0;
  storeCalls.progress = []; storeCalls.found = []; storeCalls.offTrack = [];
  storeState.searchRunState.offTrackState = 'on_track';
});
afterEach(() => { act(() => { activeRenderer?.unmount(); }); activeRenderer = null; });

// Handler läuft von yFrom bis yTo in 2-m-Schritten (MIN_SEGMENT 1,5 m → jeder Fix ein Linienpunkt).
function walk(yFrom: number, yTo: number) { for (let y = yFrom; y <= yTo; y += 2) feed(y); }

describe('useSearchRecorder — Search-Recovery-State', () => {
  it('1./2. frischer Start: Fortschritt 0; nach Lauf bis 40 m meldet der Recorder maxCursor ≈ 40 m (monoton) an den Store', async () => {
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    expect(getRecorder().progressM).toBe(0);
    walk(0, 40);
    const r = getRecorder();
    // EMA-Glättung (SMOOTH_ALPHA 0,4) lässt die Position ~3 m nachlaufen — unverändertes Verhalten.
    expect(r.progressM).toBeGreaterThanOrEqual(34);
    expect(r.progressM).toBeLessThanOrEqual(40);
    const maxima = storeCalls.progress.map(p => p.maxCursorM);
    expect(maxima.length).toBeGreaterThan(10);
    for (let i = 1; i < maxima.length; i++) expect(maxima[i]).toBeGreaterThanOrEqual(maxima[i - 1]);
    expect(maxima[maxima.length - 1]).toBeCloseTo(r.progressM, 5);
    // Vorbeilaufen allein ist kein bestätigter Gegenstand-Dwell.
    expect(storeCalls.found).toEqual([]);
    expect(r.foundObjects).toBe(0);
    act(() => { getRecorder().markObject(); });
    expect(storeCalls.found).toEqual(['gegenstand-20']);
    expect(getRecorder().foundObjects).toBe(1);
  });

  it('3./4. Resume mit runState.maxCursorM=40: Cursor startet bei 40, Handler bei ~42 m arbeitet sofort weiter (nicht 0)', async () => {
    const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 40, devSumM: 8, devCount: 10 };
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(0.2, 38), toLL(0.2, 40)], startedAtMs: 1, runState }); });
    expect(getRecorder().progressM).toBe(40);
    expect(getRecorder().dogProgressM).toBe(45);   // + handlerDistance (nicht persistiert, Darstellung)
    feed(42); feed(44); feed(46);
    const r = getRecorder();
    // Cursor rückt aus dem Seed heraus vor (EMA-Nachlauf ~2–3 m), bleibt NICHT bei 0/40 hängen.
    expect(r.progressM).toBeGreaterThan(41);
    expect(r.progressM).toBeLessThanOrEqual(47);
    expect(r.onTrack).toBe(true);
    // Store-Meldungen setzen bei ≥ 40 auf, nie bei 0.
    expect(Math.min(...storeCalls.progress.map(p => p.maxCursorM))).toBeGreaterThanOrEqual(40);
    // Abweichungs-Statistik läuft run-bezogen weiter (10 Seed-Punkte + neue akzeptierte Linienpunkte).
    const lastCount = storeCalls.progress[storeCalls.progress.length - 1].devCount;
    expect(lastCount).toBeGreaterThan(10);
    expect(lastCount).toBe(10 + storeCalls.progress.length);
  });

  it('Gegenbeweis: OHNE runState (Legacy-Puffer) bleibt der Cursor nach Resume bei 0 hängen, wenn der Handler bei 60 m steht', async () => {
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(0.2, 58), toLL(0.2, 60)], startedAtMs: 1 }); });
    feed(62); feed(64); feed(66);
    expect(getRecorder().progressM).toBe(0);   // dokumentierte Legacy-Degradation (Fenster [−4, +20] um 0)
  });

  it('8./9. gefundener Gegenstand UND Dübel überleben Resume (stabile Marker-IDs); Fund-Distanz unverändert', async () => {
    const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 75, foundObjectIds: ['gegenstand-20', 'gegenstand-70'] };
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(0.2, 75)], startedAtMs: 1, runState }); });
    expect(getRecorder().foundObjects).toBe(2);
    feed(77); feed(79);
    expect(getRecorder().foundObjects).toBe(2);
    expect(storeCalls.found).toEqual([]);   // nichts „neu" gefunden
    const res = getRecorder().stop();
    expect(res.foundObjectIndices.sort()).toEqual([0, 1]);
  });

  it('Fund-ID-Fallback ohne Marker-ID: Index-Schlüssel', async () => {
    const noIds: SearchObject[] = [{ at: toLL(0, 20), index: 0, material: 'stoff' }];
    const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 30, foundObjectIds: ['idx:0'] };
    const { getRecorder } = mount(noIds);
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(0.2, 30)], startedAtMs: 1, runState }); });
    expect(getRecorder().foundObjects).toBe(1);
  });

  it('Abrisse + Abweichung werden aus dem Run-State übernommen (Score/Ergebnis run-bezogen)', async () => {
    const runState: SearchRunState = {
      ...freshSearchRunState(), maxCursorM: 50, devSumM: 20, devCount: 10,
      breaks: [{ at: { latitude: 0, longitude: 0 }, t: 30, startedAtSec: 25, recoveredAfterM: 40, recoveredAtSec: 40, durationSec: 15 }],
    };
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(0.2, 50)], startedAtMs: 1, runState }); });
    expect(getRecorder().breaks).toHaveLength(1);
    // Vor dem ersten akzeptierten Punkt: Abweichung = reiner Seed (20 m / 10 = 2,0 m).
    feed(52);   // EMA-Nachlauf < MIN_SEGMENT → noch kein neuer Linienpunkt
    expect(storeCalls.progress).toHaveLength(0);
    feed(54); feed(56); feed(58);
    const res = getRecorder().stop();
    expect(res.breaks).toHaveLength(1);
    const last = storeCalls.progress[storeCalls.progress.length - 1];
    expect(last.devCount).toBeGreaterThan(10);            // Seed-Zähler läuft weiter
    expect(res.deviationAvgM).toBeLessThan(2);            // neue Punkte (~0,2 m) drücken den Seed-Schnitt (2,0) nach unten
    expect(res.deviationAvgM).toBeGreaterThan(1);
    expect(last.breaks).toHaveLength(1);
  });

  it('12. Off-Track vor Kill: State wird geseedet — kein Reset auf on_track; on_track wird nicht als „neu" gemeldet', async () => {
    const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 40, offTrackState: 'off_track' };
    storeState.searchRunState.offTrackState = 'off_track';
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(9, 40)], startedAtMs: 1, runState }); });
    expect(getRecorder().offTrackState).toBe('off_track');
    // Handler weiterhin 9 m neben der Spur → bleibt off_track, kein Übergang gemeldet.
    feed(42, 9); feed(44, 9);
    expect(getRecorder().offTrackState).toBe('off_track');
    expect(storeCalls.offTrack).toEqual([]);
    // Zurück auf die Spur → echte Erholung (nach RECOVER_CONSECUTIVE guten Fixes) → genau eine Meldung.
    feed(46, 0.2); feed(48, 0.2); feed(50, 0.2); feed(52, 0.2);
    expect(getRecorder().offTrackState).toBe('on_track');
    expect(storeCalls.offTrack).toEqual(['on_track']);
  });

  it('14. frischer Start nach einem Resume-Run → alles auf 0/leer (kein Übernehmen)', async () => {
    const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 60, foundObjectIds: ['gegenstand-20'], offTrackState: 'warning' };
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(0.2, 60)], startedAtMs: 1, runState }); });
    expect(getRecorder().progressM).toBe(60);
    act(() => { getRecorder().stop(); });
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    const r = getRecorder();
    expect(r.progressM).toBe(0);
    expect(r.foundObjects).toBe(0);
    expect(r.breaks).toHaveLength(0);
    expect(r.offTrackState).toBe('on_track');
  });
});

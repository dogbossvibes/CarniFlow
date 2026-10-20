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
const storeCalls = { progress: [] as { maxCursorM: number; devCount: number; reliableDeviationCount?: number; reliableCursorM?: number; breaks: unknown[] }[], found: [] as string[], offTrack: [] as string[] };
const storeState = { searchRunState: { offTrackState: 'on_track' as string } };
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: (p: any) => storeCalls.progress.push({ maxCursorM: p.maxCursorM, devCount: p.devCount, reliableDeviationCount: p.reliableDeviationCount, reliableCursorM: p.reliableCursorM, breaks: p.breaks }),
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
// Gegenstand bei 20 m (Stoff) und Gummi bei 70 m — mit stabilen Marker-IDs.
const OBJECTS: SearchObject[] = [
  { at: toLL(0, 20), index: 0, material: 'stoff', id: 'gegenstand-20' },
  { at: toLL(0, 70), index: 1, material: 'gummi', id: 'gegenstand-70' },
];

function Harness({ onReady, objects, points = LINE }: { onReady: (s: SearchRecorder) => void; objects: SearchObject[]; points?: LatLng[] }) {
  const s = useSearchRecorder({ laidPoints: points, laidObjects: objects, level: 'training', handlerDistanceM: 5 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
function mount(objects: SearchObject[] = OBJECTS, points: LatLng[] = LINE): { getRecorder: () => SearchRecorder } {
  let latest!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness objects={objects} points={points} onReady={(s) => { latest = s; }} />); });
  return { getRecorder: () => latest };
}
let simClockMs = 0;
function feed(yNorthM: number, xEastM = 0.2, accuracy = 4) {
  if (!feedSample) throw new Error('positionSource callback not captured yet');
  simClockMs = simClockMs > 0 ? simClockMs + 1000 : Date.now();
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
  it('persists the exact existing score components without changing the final score', async () => {
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    walk(0, 40);
    act(() => { getRecorder().markObject(); getRecorder().confirmEnd(); });
    const beforeStop = getRecorder().score;
    let result!: ReturnType<SearchRecorder['stop']>;
    act(() => { result = getRecorder().stop(); });
    expect(result.score).toBe(beforeStop);
    const basis = result.objectScoreBasis!;
    expect(basis).toMatchObject({ version: 1, maxTrackPoints: 79, maxObjectPoints: 21, totalObjects: 2 });
    expect(result.score).toBe(Math.round(basis.trackPoints + result.foundObjects / result.totalObjects * basis.maxObjectPoints));
    expect(result.objectStatuses).toEqual(['manual_found', 'missed']);
  });

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

  it('Legacy-Puffer ohne Run-State: Referenz nach Resume wiederfinden, ohne unbekannte Strecke zu zählen', async () => {
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(0.2, 58), toLL(0.2, 60)], startedAtMs: 1 }); });
    feed(62); feed(64); feed(66);
    expect(getRecorder().progressM).toBeGreaterThan(60);
    expect(getRecorder().distanceM).toBeLessThan(10);
    expect(getRecorder().score).toBeLessThan(30);
  });

  it('8./9. gefundener Gegenstand UND Gummi überleben Resume (stabile Marker-IDs); Fund-Distanz unverändert', async () => {
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
    // Resume starts at the fresh measurement without smoothing across the gap.
    feed(52);
    expect(storeCalls.progress).toHaveLength(1);
    expect(getRecorder().points.at(-1)?.breakBefore).toBe(true);
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

  it('Accuracy-aware: 2 m bei Accuracy 2 m und 10 m bleibt on-track und bewertet die Messung gleich', async () => {
    const record = async (accuracy: number) => {
      simClockMs = 0;
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start(undefined, { forceLocked: true }); });
      for (let y = 0; y <= 30; y += 2) feed(y, 2, accuracy);
      const result = { score: getRecorder().score, onTrack: getRecorder().onTrack, state: getRecorder().offTrackState };
      act(() => { activeRenderer?.unmount(); }); activeRenderer = null; feedSample = null;
      return result;
    };
    const precise = await record(2);
    const uncertain = await record(10);
    expect(precise.onTrack).toBe(true);
    expect(uncertain.onTrack).toBe(true);
    expect(precise.state).toBe('on_track');
    expect(uncertain.state).toBe('on_track');
    expect(uncertain.score).toBe(precise.score);
  });

  it('Accuracy-aware: 7 m bei 2 m Accuracy bestätigt einen Break; bei 15 m Accuracy nicht', async () => {
    const record = async (accuracy: number) => {
      simClockMs = 0;
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start(undefined, { forceLocked: true }); });
      for (let y = 0; y <= 32; y += 2) feed(y, 7, accuracy);
      const result = { score: getRecorder().score, state: getRecorder().offTrackState, breaks: getRecorder().breaks };
      act(() => { activeRenderer?.unmount(); }); activeRenderer = null; feedSample = null;
      return result;
    };
    const precise = await record(2);
    const uncertain = await record(15);
    expect(precise.state).toBe('off_track');
    expect(precise.breaks).toHaveLength(1);
    expect(uncertain.state).toBe('on_track');
    expect(uncertain.breaks).toHaveLength(0);
    expect(uncertain.score).toBeGreaterThanOrEqual(precise.score);
  });

  it('Accuracy über MAX_RELIABLE_ACCURACY_M kann weder Off-Track bestätigen noch Score-Coverage erhöhen', async () => {
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    for (let y = 0; y <= 40; y += 2) feed(y, 12, 25);
    expect(getRecorder().offTrackState).toBe('on_track');
    expect(getRecorder().onTrack).toBe(false); // boolean compatibility: false = nicht belastbar bestätigt
    expect(getRecorder().breaks).toHaveLength(0);
    expect(storeCalls.progress.at(-1)?.reliableCursorM).toBe(0);
  });

  it('Objektpunkte bleiben bei präzisen und unzuverlässigen GPS-Fixes identisch', async () => {
    const foundObjectScore = async (accuracy: number) => {
      simClockMs = 0;
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start(undefined, { forceLocked: true }); });
      feed(0, 0.2, accuracy);
      const before = getRecorder().score;
      act(() => { getRecorder().markObject(); });
      const after = getRecorder().score;
      act(() => { activeRenderer?.unmount(); }); activeRenderer = null; feedSample = null;
      return after - before;
    };
    expect(await foundObjectScore(2)).toBe(11); // 21 Punkte / 2 Objekte, gerundet
    expect(await foundObjectScore(25)).toBe(11);
  });

  it('bestätigt einen Break genau einmal, schliesst ihn nach Recovery und erzeugt nach Resume keinen Duplikat-Break', async () => {
    const openBreak = { at: toLL(7, 20), t: 10, startedAtSec: 8 };
    const runState: SearchRunState = {
      ...freshSearchRunState(), maxCursorM: 20, offTrackState: 'off_track',
      breaks: [openBreak], reliableCursorM: 20, reliableDeviationCount: 3,
    };
    const { getRecorder } = mount();
    await flushMicrotasks();
    act(() => { getRecorder().start({ points: [toLL(7, 18), toLL(7, 20)], startedAtMs: 1, runState }); });
    for (let y = 22; y <= 30; y += 2) feed(y, 7, 2);
    expect(getRecorder().breaks).toHaveLength(1);
    for (let y = 32; y <= 70; y += 2) feed(y, 0.2, 2);
    const result = getRecorder().stop();
    expect(result.breaks).toHaveLength(1);
    expect(result.breaks[0].recoveredAtSec).toBeDefined();
  });

  // ── Edge-Cases auf Hook-Ebene (reine Tests, keine Logikänderung) ──────────
  const unmountRun = () => { act(() => { activeRenderer?.unmount(); }); activeRenderer = null; feedSample = null; };

  it('Edge A: zuverlässige Coverage wird NICHT über eine unzuverlässige GPS-Lücke hinweg verbunden', async () => {
    const run = async (gapAccuracy: number) => {
      simClockMs = 0; storeCalls.progress = [];
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start(undefined, { forceLocked: true }); });
      for (let y = 0; y <= 20; y += 2) feed(y, 0.2, 3);             // guter Fix
      for (let y = 22; y <= 40; y += 2) feed(y, 0.2, gapAccuracy);  // Lücke (25 m = unzuverlässig)
      for (let y = 42; y <= 60; y += 2) feed(y, 0.2, 3);            // wieder guter Fix
      const last = storeCalls.progress.at(-1)!;
      const out = { reliable: last.reliableCursorM!, max: last.maxCursorM, score: getRecorder().score };
      unmountRun();
      return out;
    };
    const control = await run(3);
    const gap = await run(25);
    // Ohne Lücke deckt sich die zuverlässige Coverage mit dem Fortschritt.
    expect(control.max - control.reliable).toBeLessThan(3);
    // Mit Lücke: der ~20 m lange unzuverlässige Abschnitt wird nicht überbrückt.
    expect(gap.max - gap.reliable).toBeGreaterThanOrEqual(15);
    expect(gap.reliable).toBeLessThan(control.reliable);
    // Weniger belegte Coverage → weniger Fährtenpunkte, nie mehr.
    expect(gap.score).toBeLessThan(control.score);
  });

  it('Edge A2: auch eine KURZE unzuverlässige Lücke (< 5 s, unter der Zeitlücken-Grenze) wird nicht überbrückt', async () => {
    const run = async (gapAccuracy: number) => {
      simClockMs = 0; storeCalls.progress = [];
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start(undefined, { forceLocked: true }); });
      for (let y = 0; y <= 20; y += 2) feed(y, 0.2, 3);
      for (let y = 22; y <= 26; y += 2) feed(y, 0.2, gapAccuracy);   // 3 Fixes = 3 s, ~6 m
      for (let y = 28; y <= 44; y += 2) feed(y, 0.2, 3);
      const last = storeCalls.progress.at(-1)!;
      const out = { reliable: last.reliableCursorM!, max: last.maxCursorM };
      unmountRun();
      return out;
    };
    const control = await run(3);
    const gap = await run(25);
    expect(control.max - control.reliable).toBeLessThan(3);
    // Die Lücke selbst (~6–8 m) zählt nicht als zuverlässig belegte Strecke.
    expect(gap.max - gap.reliable).toBeGreaterThanOrEqual(5);
  });

  it('Edge B: nach unzuverlässigen Fixes baut die Off-Track-State-Machine ihre Bestätigung neu auf (Warning)', async () => {
    const run = async (withGap: boolean) => {
      simClockMs = 0;
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start(undefined, { forceLocked: true }); });
      for (let y = 0; y <= 10; y += 2) feed(y, 0.2, 2);              // sauber auf der Spur
      const seq: string[] = [];
      feed(12, 9, 2); seq.push(getRecorder().offTrackState);           // 1. zuverlässiger Warn-Fix
      if (withGap) for (let y = 14; y <= 18; y += 2) feed(y, 9, 25);   // unzuverlässige Phase
      const y0 = withGap ? 20 : 14;
      for (let k = 0; k < 5; k++) { feed(y0 + 2 * k, 9, 2); seq.push(getRecorder().offTrackState); }
      const out = { seq, breaks: getRecorder().breaks.length };
      unmountRun();
      return out;
    };
    const control = await run(false);
    const gap = await run(true);
    // Ohne Lücke: zweiter zuverlässiger Warn-Fix → warning, drei Off-Fixes → off_track.
    expect(control.seq).toEqual(['on_track', 'warning', 'warning', 'off_track', 'off_track', 'off_track']);
    // Mit Lücke: die Serie vor der Lücke zählt nicht weiter — erst ZWEI frische
    // zuverlässige Fixes führen zu warning, die Off-Bestätigung startet neu.
    expect(gap.seq).toEqual(['on_track', 'on_track', 'warning', 'warning', 'off_track', 'off_track']);
    expect(control.breaks).toBe(1);
    expect(gap.breaks).toBe(1);
  });

  it('Edge B2: eine laufende Off-Bestätigung wird durch unzuverlässige Fixes unterbrochen und braucht drei frische Fixes', async () => {
    const run = async (withGap: boolean) => {
      simClockMs = 0;
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start(undefined, { forceLocked: true }); });
      for (let y = 0; y <= 10; y += 2) feed(y, 0.2, 2);
      feed(12, 9, 2); feed(14, 9, 2);                                   // warning (offStreak 1)
      feed(16, 9, 2);                                                   // offStreak 2
      expect(getRecorder().offTrackState).toBe('warning');
      if (withGap) for (let y = 18; y <= 22; y += 2) feed(y, 9, 25);    // unzuverlässig
      const y0 = withGap ? 24 : 18;
      const seq: string[] = [];
      for (let k = 0; k < 3; k++) { feed(y0 + 2 * k, 9, 2); seq.push(getRecorder().offTrackState); }
      const out = { seq, breaks: getRecorder().breaks.length };
      unmountRun();
      return out;
    };
    const control = await run(false);
    const gap = await run(true);
    expect(control.seq).toEqual(['off_track', 'off_track', 'off_track']);   // dritter Off-Fix in Serie
    expect(gap.seq).toEqual(['warning', 'warning', 'off_track']);           // Serie neu: drei frische Fixes
    expect(control.breaks).toBe(1);
    expect(gap.breaks).toBe(1);
  });

  it('Edge C: fortgesetzte Legacy-Session (scoreQualityVersion 0) behält im Recorder die alte Score-Semantik, Version 1 die neue', async () => {
    const scoreAfterResume = async (rs: Partial<SearchRunState>) => {
      simClockMs = 0;
      const runState: SearchRunState = { ...freshSearchRunState(), maxCursorM: 40, devSumM: 40, devCount: 10, ...rs };
      const { getRecorder } = mount();
      await flushMicrotasks();
      act(() => { getRecorder().start({ points: [toLL(2, 38), toLL(2, 40)], startedAtMs: 1, runState }); });
      for (let y = 42; y <= 60; y += 2) feed(y, 2, 2);   // 2 m neben der Spur, innerhalb des Warnkorridors (3 m)
      const score = getRecorder().score;
      unmountRun();
      return score;
    };
    // Version 0 (Legacy): rohe Abweichung + maxCursor zählen; die neuen reliable*-Felder sind irrelevant.
    const v0 = await scoreAfterResume({ scoreQualityVersion: 0, reliableDeviationExcessSumM: 0, reliableDeviationCount: 10, reliableCursorM: 40 });
    const v0OtherReliable = await scoreAfterResume({ scoreQualityVersion: 0, reliableDeviationExcessSumM: 500, reliableDeviationCount: 1, reliableCursorM: 0 });
    const v0MoreRawDeviation = await scoreAfterResume({ scoreQualityVersion: 0, devSumM: 90, reliableDeviationCount: 10, reliableCursorM: 40 });
    expect(v0OtherReliable).toBe(v0);
    expect(v0MoreRawDeviation).toBeLessThan(v0);
    // Version 1 (neu): nur der zuverlässige Restabstand jenseits des Korridors und die zuverlässige Coverage zählen.
    const v1 = await scoreAfterResume({ scoreQualityVersion: 1, reliableDeviationExcessSumM: 0, reliableDeviationCount: 10, reliableCursorM: 40 });
    const v1MoreRawDeviation = await scoreAfterResume({ scoreQualityVersion: 1, devSumM: 90, reliableDeviationExcessSumM: 0, reliableDeviationCount: 10, reliableCursorM: 40 });
    const v1LessReliableCoverage = await scoreAfterResume({ scoreQualityVersion: 1, reliableDeviationExcessSumM: 0, reliableDeviationCount: 10, reliableCursorM: 0 });
    expect(v1MoreRawDeviation).toBe(v1);                 // rohe Abweichung belastet die neue Wertung nicht
    expect(v1LessReliableCoverage).toBeLessThan(v1);     // Coverage kommt aus reliableCursorM
    // Gleiche Messung, unterschiedliche Semantik: Legacy bestraft die rohe 2-m-Abweichung, Version 1 nicht.
    expect(v1).toBeGreaterThan(v0);
  });
});


describe('Search continuity', () => {
  it('a short pause starts a section without adding the unknown movement', async () => {
    const { getRecorder } = mount([]);
    await flushMicrotasks();
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    walk(0, 20);
    const before = getRecorder().distanceM;
    act(() => { getRecorder().setPaused(true); });
    act(() => { getRecorder().setPaused(false); });
    feed(60);
    expect(getRecorder().points.at(-1)).toMatchObject({ breakBefore: true, latitude: 60 / M_PER_DEG });
    expect(getRecorder().distanceM).toBeCloseTo(before, 5);
    const result = getRecorder().stop();
    expect(result.analyticsSamples.at(-1)?.breakBefore).toBe(true);
    expect(result.replayPoints?.some(p => p.breakBefore)).toBe(true);
  });

  it('a fix delivery gap expires end evidence and excludes the bridge', async () => {
    const { getRecorder } = mount([]);
    await flushMicrotasks();
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    walk(0, 20);
    const before = getRecorder().distanceM, epoch = getRecorder().continuityEpoch;
    simClockMs += 10_000;
    feed(60);
    expect(getRecorder().continuityEpoch).toBeGreaterThan(epoch);
    expect(getRecorder().distanceM).toBeCloseTo(before, 5);
    expect(getRecorder().points.at(-1)?.breakBefore).toBe(true);
  });

  it('recovery retains sections, original times and measured distance', async () => {
    const { getRecorder } = mount([]);
    await flushMicrotasks();
    const startMs = Date.now() - 10_000;
    act(() => { getRecorder().start({ points: [toLL(0, 0), toLL(0, 10), { ...toLL(0, 50), breakBefore: true }, toLL(0, 60)],
      pointsTimeSec: [0, 2, 7, 9], startedAtMs: startMs, runState: freshSearchRunState() }); });
    expect(getRecorder().distanceM).toBeGreaterThan(19);
    expect(getRecorder().distanceM).toBeLessThan(21);
    feed(80);
    const result = getRecorder().stop();
    expect(result.distanceM).toBeLessThan(21);
    expect(result.pointsTimeSec?.slice(0, 4)).toEqual([0, 2, 7, 9]);
    expect(result.points.filter(p => p.breakBefore)).toHaveLength(2);
  });
});

it('keeps an object inside an unobserved gap unknown across progress and end confirmation', async () => {
  const objects = [{ at: toLL(0, 45), atM: 45, index: 0, material: 'holz', id: 'gap-object' },
    { at: toLL(0, 95), atM: 95, index: 1, material: 'holz', id: 'end-object' }];
  const { getRecorder } = mount(objects);
  await flushMicrotasks();
  act(() => { getRecorder().start(undefined, { forceLocked: true }); });
  walk(0, 20);
  act(() => { getRecorder().setPaused(true); getRecorder().setPaused(false); });
  feed(65);
  expect(getRecorder().objectStatuses[0]).toBe('unobserved');
  walk(67, 79);
  act(() => { getRecorder().confirmEnd(); });
  expect(getRecorder().objectStatuses[0]).toBe('unobserved');
  expect(getRecorder().foundObjects).toBe(0);
});


describe('known reference object count', () => {
  it('keeps a recorded reference with zero objects at zero through finish', async () => {
    const { getRecorder } = mount([]);
    await flushMicrotasks();
    expect(getRecorder().totalObjects).toBe(0);
    act(() => { getRecorder().start(undefined, { forceLocked: true }); });
    walk(0, 20);
    let result!: ReturnType<SearchRecorder['stop']>;
    act(() => { result = getRecorder().stop(); });
    expect(result.totalObjects).toBe(0);
    expect(result.foundObjects).toBe(0);
  });
  it('preserves rulebook targets for a free search without a laid reference', async () => {
    const { getRecorder } = mount([], []);
    await flushMicrotasks();
    expect(getRecorder().totalObjects).toBe(3);
  });
  it('preserves the actual nonzero count of the reference', async () => {
    const { getRecorder } = mount(OBJECTS);
    await flushMicrotasks();
    expect(getRecorder().totalObjects).toBe(2);
  });
});

it('excludes both jokers from resumed finds, penalties and object snapshots without shifting legacy keys', async () => {
  const objects: SearchObject[] = [
    { at: toLL(0, 10), index: 0, material: 'duebel' },
    { at: toLL(0, 20), index: 1, material: 'gummi' },
    { at: toLL(0, 70), index: 2, material: 'ball' },
  ];
  const { getRecorder } = mount(objects);
  await flushMicrotasks();
  const runState = { ...freshSearchRunState(), maxCursorM: 75, foundObjectIds: ['idx:0', 'idx:1', 'idx:2'] };
  act(() => { getRecorder().start({ points: [toLL(0, 75)], startedAtMs: 1, runState }); });
  expect(getRecorder().totalObjects).toBe(1);
  expect(getRecorder().foundObjects).toBe(1);
  walk(76, 100);
  act(() => getRecorder().confirmEnd());
  let result!: ReturnType<SearchRecorder['stop']>;
  act(() => { result = getRecorder().stop(); });
  expect(result.foundObjectIndices).toEqual([0]);
  expect(result.objectStatuses).toHaveLength(1);
  expect(result.objectScoreBasis?.totalObjects).toBe(1);
  expect(storeCalls.found).toEqual([]);
  expect(objects.map(o => o.material)).toEqual(['duebel', 'gummi', 'ball']);
});

it('a joker-only track has no object waiting phase or missed-object penalty', async () => {
  const { getRecorder } = mount([{ at: toLL(0, 100), index: 0, material: 'ball' }, { at: toLL(0, 20), index: 1, material: 'duebel' }]);
  await flushMicrotasks();
  act(() => getRecorder().start(undefined, { forceLocked: true }));
  walk(0, 100);
  expect(getRecorder().totalObjects).toBe(0);
  expect(getRecorder().foundObjects).toBe(0);
  act(() => getRecorder().confirmEnd());
  let result!: ReturnType<SearchRecorder['stop']>;
  act(() => { result = getRecorder().stop(); });
  expect(result.objectStatuses).toEqual([]);
  expect(result.foundObjectIndices).toEqual([]);
  expect(storeCalls.found).toEqual([]);
});

/**
 * P0 Live-Cursor (Self-Crossing) auf Recorder-Ebene: die 14 realen Handler-
 * Suchpunkte von qa-0ec8c4ca werden als GPS-Fixe (echte t) in useSearchRecorder
 * eingespeist (Start bereits gelockt). Der an den Store gemeldete Fortschritt
 * darf nicht um ~14 m auf den Rückweg springen; der mittlere Referenzabschnitt
 * (5 … 18,7 m) muss Fortschritt/Samples erhalten. Harness wie die übrigen
 * useSearchRecorder-Tests.
 */
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng } from '@/features/tracking/hooks/useSearchRecorder';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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
const progress: number[] = [];
jest.mock('@/features/tracking/store/trackingStore', () => ({
  useTrackingStore: { getState: () => ({
    addSearchPoint: jest.fn(), resetSearchPoints: jest.fn(),
    noteSearchRunProgress: (p: any) => progress.push(p.maxCursorM), noteSearchObjectFound: jest.fn(), noteSearchOffTrackState: jest.fn(),
    searchRunState: { offTrackState: 'on_track' },
  }) },
}));
jest.mock('@/features/tracking/store/searchPersist', () => ({
  enqueueSearchPoint: jest.fn(), flushSearchPoints: jest.fn(async () => true), resetSearchBuffer: jest.fn(),
}));

const M = 111320, LAT0 = 47, LNG0 = 8, M_LNG = M * Math.cos((LAT0 * Math.PI) / 180);
const ll = (x: number, y: number): LatLng => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / M_LNG });
const FIX = path.join(__dirname, '..', '..', 'utils', '__tests__', 'fixtures', 'realFieldV21');
const lay = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca.json'), 'utf8'));
const run = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca-search.json'), 'utf8'));
const LINE: LatLng[] = lay.points.map((p: { x: number; y: number }) => ll(p.x, p.y));

function Harness({ onReady }: { onReady: (s: SearchRecorder) => void }) {
  const s = useSearchRecorder({ laidPoints: LINE, laidObjects: [] as any, level: 'training', handlerDistanceM: 1 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
afterEach(() => { act(() => { activeRenderer?.unmount(); }); activeRenderer = null; });

it('qa-0ec8c4ca im Recorder: kein Rückweg-Sprung, mittlerer Abschnitt erhält Fortschritt, Samples decken 5…18,7 m ab, Ende erreicht', async () => {
  let rec!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness onReady={(s) => { rec = s; }} />); });
  await act(async () => { await Promise.resolve(); });
  const t0 = 1_700_000_000_000;
  act(() => { rec.start(undefined, { forceLocked: true }); });
  for (const p of run.runPoints as { x: number; y: number; t: number }[]) {
    const q = ll(p.x, p.y);
    act(() => { feedSample!({ lat: q.latitude, lng: q.longitude, accuracy: 4, speed: 0.6, course: null, t: t0 + p.t * 1000 }); });
  }
  let res!: ReturnType<SearchRecorder['stop']>;
  act(() => { res = rec.stop(); });
  // Fortschrittsschritte (Store-Meldungen je akzeptiertem Punkt): kein Schritt ≥ 10 m (OLD: 14,1 m).
  const jumps = progress.map((v, i) => (i ? v - progress[i - 1] : 0));
  expect(Math.max(...jumps)).toBeLessThan(10);
  expect(progress.some(v => v > 5 && v < 18.7)).toBe(true);
  expect(res.analyticsSamples.filter(s => s.atM > 5 && s.atM < 18.7).length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
  expect(rec.progressM).toBeGreaterThan(20);
});

describe('Resume direkt vor engem Rückweg (Recorder)', () => {
  // Kurze Fährte (Fenster deckt die ganze Linie): Hinweg x=0 (0→10 m), Rückweg x=1 (10→0 m).
  const line2: LatLng[] = [];
  for (let y = 0; y <= 10; y += 2) line2.push(ll(0, y));
  line2.push(ll(1, 10));
  for (let y = 8; y >= 0; y -= 2) line2.push(ll(1, y));
  function Harness2({ onReady }: { onReady: (s: SearchRecorder) => void }) {
    const s = useSearchRecorder({ laidPoints: line2, laidObjects: [] as any, level: 'training', handlerDistanceM: 5 });
    onReady(s);
    return null;
  }
  it('erster akzeptierter Fix nach Resume liegt näher am Rückweg — Cursor bleibt trotzdem auf dem Hinweg (kein ~11-m-Sprung)', async () => {
    progress.length = 0;
    let rec!: SearchRecorder;
    act(() => { activeRenderer = TestRenderer.create(<Harness2 onReady={(s) => { rec = s; }} />); });
    await act(async () => { await Promise.resolve(); });
    const t0 = 1_700_000_000_000;
    const resumed = [ll(0.6, 0), ll(0.6, 2), ll(0.6, 4)];
    act(() => { rec.start({ points: resumed, startedAtMs: t0 - 20_000, runState: { maxCursorM: 4, devSumM: 2, devCount: 3, foundObjectIds: [], voiceFiredIds: [], hapticFiredIds: [], endFired: false, segmentAnnouncements: {}, breaks: [], offTrackState: 'on_track' } as any }); });
    expect(rec.progressM).toBe(4);
    // Fixes 0,7 m Richtung Rückweg (Rückweg 0,3 m, Hinweg 0,7 m entfernt); EMA + MIN_SEGMENT → erster akzeptierter Punkt bei ~6 m.
    const feedAt = (y: number, t: number) => { const q = ll(0.7, y); act(() => { feedSample!({ lat: q.latitude, lng: q.longitude, accuracy: 4, speed: 1, course: null, t }); }); };
    feedAt(6, t0 + 1000); feedAt(8, t0 + 2000); feedAt(10, t0 + 3000);
    const cursorAfterFirstFix = progress[0];
    console.log(`Recorder-Resume-Pins: cursorBeforeResume=4 cursorAfterFirstFix=${cursorAfterFirstFix?.toFixed(2)} progress=${progress.map(v => v.toFixed(2)).join(' ')}`);
    expect(cursorAfterFirstFix).toBeGreaterThanOrEqual(4);
    expect(cursorAfterFirstFix).toBeLessThan(9);           // Hinweg (4 … 8 m), nicht Rückweg (≥ 13 m)
    for (const v of progress) expect(v).toBeLessThan(11);   // nie auf den Rückweg
    for (let i = 1; i < progress.length; i++) expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    expect(rec.progressM).toBeGreaterThan(5);
  });
});

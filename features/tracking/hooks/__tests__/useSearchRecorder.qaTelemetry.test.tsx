/**
 * QA-Search-Telemetrie auf Recorder-Ebene (nur Beobachtung).
 *
 *  1. Ein kurzer 90°-Search-Turn (1-Hz-Fixe, 1,3 m/s): das bisherige 1,5-m-Gate
 *     schneidet die Ecke ab — die Replay-Geometrie behält Vor-Anker · Scheitel ·
 *     Nach-Anker.
 *  2. Cursor / Fortschritt / Search-Distanz / Score / Analytics-Samples / Punkte
 *     sind IDENTISCH, ob die Replay-Geometrie berechnet wird oder nicht
 *     (Ausschalt-Vergleich über einen Mock von replayGeometryArrays).
 *  3. Real: die 14 Handler-Punkte von qa-0ec8c4ca liefern dieselben Metriken.
 */
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useSearchRecorder, type SearchRecorder, type LatLng, type SearchResult } from '@/features/tracking/hooks/useSearchRecorder';
import { SEARCH_QA_LIMITS } from '@/features/tracking/utils/qaSearchCapture';

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
// QA-Schalter (mock-präfixiert für jest.mock-Factory).
let mockQaOn = true;
jest.mock('@/features/tracking/utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => mockQaOn }));

const M = 111320, LAT0 = 47, LNG0 = 8, M_LNG = M * Math.cos((LAT0 * Math.PI) / 180);
const ll = (x: number, y: number): LatLng => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / M_LNG });

const LAID: LatLng[] = [];
for (let x = 0; x <= 12; x += 2) LAID.push(ll(x, 0));
for (let y = 2; y <= 12; y += 2) LAID.push(ll(12, y));
const OBJECTS = [{ at: ll(12, 6), index: 0, material: 'stoff', id: 'obj-1' }];

function Harness({ onReady, line }: { onReady: (s: SearchRecorder) => void; line: LatLng[] }) {
  const s = useSearchRecorder({ laidPoints: line, laidObjects: OBJECTS as any, level: 'training', handlerDistanceM: 1 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
afterEach(() => { act(() => { activeRenderer?.unmount(); }); activeRenderer = null; mockQaOn = true; });

function walkL(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = []; const v = 1.3;
  for (let s = 0; s <= 12; s += v) pts.push({ x: s, y: 0 });
  const x0 = pts[pts.length - 1].x;
  for (let k = 1; k <= 9; k++) pts.push({ x: x0, y: k * v });
  return pts;
}
const T0 = 1_700_000_000_000;
const fixesL = () => walkL().map((p, i) => ({ ...p, t: T0 + i * 1000 }));

async function runScenario(line: LatLng[], fixes: { x: number; y: number; t: number }[], accFor?: (i: number) => number, resume?: boolean) {
  progress.length = 0;
  jest.useFakeTimers(); jest.setSystemTime(fixes[0].t - 1000);
  let rec!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness line={line} onReady={(s) => { rec = s; }} />); });
  await act(async () => { await Promise.resolve(); });
  act(() => { if (resume) rec.start({ points: [ll(0, 0), ll(2, 0)], startedAtMs: fixes[0].t - 5000 } as any); else rec.start(undefined, { forceLocked: true }); });
  fixes.forEach((p, i) => {
    const q = ll(p.x, p.y);
    jest.setSystemTime(p.t);
    act(() => { feedSample!({ lat: q.latitude, lng: q.longitude, accuracy: accFor ? accFor(i) : 4, speed: 1.3, course: null, t: p.t }); });
  });
  let res!: SearchResult;
  act(() => { res = rec.stop(); });
  jest.useRealTimers();
  const out = { res, progress: progress.slice(), rec };
  act(() => { activeRenderer?.unmount(); }); activeRenderer = null;
  return out;
}

describe('QA-Telemetrie: Inhalt', () => {
  it('QA an: raw/filtered/display/cursor/objects/end vorhanden und plausibel', async () => {
    // Fix Nr. 4 hat eine Accuracy von 80 m → wird vom bestehenden Filter verworfen (raw ≠ filtered).
    const { res } = await runScenario(LAID, fixesL(), i => (i === 4 ? 80 : 4));
    const q = res.qa!;
    expect(q).toBeDefined();
    expect(q.raw).toHaveLength(fixesL().length);
    expect(q.raw.filter(r => !r.accepted)).toHaveLength(1);
    expect(q.raw.find(r => !r.accepted)!.reason).toBe('accuracy');
    expect(q.filtered.length).toBe(fixesL().length - 1);
    expect(q.display.length).toBe(q.filtered.length);       // beide Ströme nach demselben Filter
    expect(q.cursorSamples.length).toBeGreaterThan(2);
    expect(q.cursorSamples.length).toBeLessThanOrEqual(SEARCH_QA_LIMITS.maxCursorSamples);
    for (let i = 1; i < q.cursorSamples.length; i++) {
      expect(q.cursorSamples[i].tSec - q.cursorSamples[i - 1].tSec).toBeGreaterThanOrEqual(SEARCH_QA_LIMITS.cursorSampleEverySec - 1e-9);
      expect(q.cursorSamples[i].progressM).toBeGreaterThanOrEqual(q.cursorSamples[i - 1].progressM);
    }
    expect(q.objectApproach[0].minHandlerDistM).not.toBeNull();
    expect(q.objectApproach[0].minHandlerDistM as number).toBeLessThan(4);
    expect(q.minDistToEndM).not.toBeNull();
    expect(q.resumed).toBe(false);
    expect(q.truncated).toEqual({ raw: false, cursor: false });
  });

  it('QA aus: keine Telemetrie, kein Overhead-Feld', async () => {
    mockQaOn = false;
    const { res } = await runScenario(LAID, fixesL());
    expect(res.qa).toBeUndefined();
    expect(Object.keys(res)).not.toContain('qa');
  });

  it('Resume: Telemetrie ist als resumed markiert', async () => {
    const { res } = await runScenario(LAID, fixesL(), undefined, true);
    expect(res.qa?.resumed).toBe(true);
    expect(res.replayPoints).toBeUndefined();   // Legacy-Replay auf run_points
  });
});

describe('Caps / Truncation', () => {
  it('Roh-Strom bei maxRaw und Cursor-Samples bei maxCursorSamples gekappt; truncated-Flags gesetzt', async () => {
    const n = SEARCH_QA_LIMITS.maxRaw + 50;
    const fixes = Array.from({ length: n }, (_, i) => ({ x: 6 + Math.sin(i / 1.5) * 5, y: 0, t: T0 + i * 1000 }));
    const { res } = await runScenario(LAID, fixes);
    const q = res.qa!;
    expect(q.raw).toHaveLength(SEARCH_QA_LIMITS.maxRaw);
    expect(q.truncated.raw).toBe(true);
    expect(q.cursorSamples).toHaveLength(SEARCH_QA_LIMITS.maxCursorSamples);
    expect(q.truncated.cursor).toBe(true);
    expect(q.filtered.length).toBeLessThanOrEqual(SEARCH_QA_LIMITS.maxFiltered);
  }, 120000);
});

describe('Cursor / Score / Search-Distanz / Analytics durch QA unverändert', () => {
  const same = (a: Awaited<ReturnType<typeof runScenario>>, b: Awaited<ReturnType<typeof runScenario>>) => {
    expect(a.res.points).toEqual(b.res.points);
    expect(a.res.pointsTimeSec).toEqual(b.res.pointsTimeSec);
    expect(a.res.replayPoints).toEqual(b.res.replayPoints);
    expect(a.res.replayPointsTimeSec).toEqual(b.res.replayPointsTimeSec);
    expect(a.res.distanceM).toBe(b.res.distanceM);
    expect(a.res.score).toBe(b.res.score);
    expect(a.res.deviationAvgM).toBe(b.res.deviationAvgM);
    expect(a.res.analyticsSamples).toEqual(b.res.analyticsSamples);
    expect(a.res.breaks).toEqual(b.res.breaks);
    expect(a.res.foundObjectIndices).toEqual(b.res.foundObjectIndices);
    expect(a.progress).toEqual(b.progress);
    expect(a.rec.trackLengthM).toBe(b.rec.trackLengthM);
  };
  it('synthetischer L-Turn mit Objekt: QA an ≡ QA aus', async () => {
    mockQaOn = true;  const on = await runScenario(LAID, fixesL(), i => (i === 4 ? 80 : 4));
    mockQaOn = false; const off = await runScenario(LAID, fixesL(), i => (i === 4 ? 80 : 4));
    expect(on.res.qa).toBeDefined(); expect(off.res.qa).toBeUndefined();
    same(on, off);
  });
  it('REAL (qa-0ec8c4ca, Self-Crossing-Route): QA an ≡ QA aus', async () => {
    const FIX = path.join(__dirname, '..', '..', 'utils', '__tests__', 'fixtures', 'realFieldV21');
    const lay = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca.json'), 'utf8'));
    const run = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca-search.json'), 'utf8'));
    const line: LatLng[] = lay.points.map((p: { x: number; y: number }) => ll(p.x, p.y));
    const fixes = (run.runPoints as { x: number; y: number; t: number }[]).map(p => ({ x: p.x, y: p.y, t: T0 + p.t * 1000 }));
    mockQaOn = true;  const on = await runScenario(line, fixes);
    mockQaOn = false; const off = await runScenario(line, fixes);
    same(on, off);
    // Self-Crossing: kein Rückweg-Sprung — QA-Samples zeigen monotonen Fortschritt.
    const ps = on.res.qa!.cursorSamples.map(s => s.progressM);
    for (let i = 1; i < ps.length; i++) expect(ps[i]).toBeGreaterThanOrEqual(ps[i - 1]);
  });
  it('QA-Ref wird von Cursor/Distanz/Score-Code nie gelesen (nur Schreiben + stop)', () => {
    const src = fs.readFileSync('features/tracking/hooks/useSearchRecorder.ts', 'utf8');
    const uses = src.split('\n').filter(l => l.includes('qaTelRef') || l.includes('qaLastCursorSampleSecRef'));
    for (const l of uses) expect(l).toMatch(/useRef|qaTelRef\.current\)? *(\?|&&|\{|\.raw|\.filtered|=)|const tel = qaTelRef|qaTelRef\.current = |\.\.\.qaTelRef|qaLastCursorSampleSecRef\.current|const qaTel = qaTelRef|qaTelRef\.current\s*$|qaTelRef\.current \?|if \(qaTelRef/);
    expect(src).not.toMatch(/(maxCursorMRef|cursorMRef|distRef|devSumRef|foundRef)\.current\s*(=|\+=)[^;]*qaTelRef/);
  });
});

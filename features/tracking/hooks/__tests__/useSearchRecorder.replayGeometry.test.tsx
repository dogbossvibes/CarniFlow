/**
 * Search-Replay-Geometrie auf Recorder-Ebene.
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
// Ausschalt-Schalter: false = Replay-Geometrie wird (wie im Produkt) berechnet.
let mockReplayOff = false;
jest.mock('@/features/tracking/utils/searchReplayGeometry', () => {
  const actual = jest.requireActual('@/features/tracking/utils/searchReplayGeometry');
  return { ...actual, replayGeometryArrays: (d: unknown) => (mockReplayOff ? null : actual.replayGeometryArrays(d)) };
});

const M = 111320, LAT0 = 47, LNG0 = 8, M_LNG = M * Math.cos((LAT0 * Math.PI) / 180);
const ll = (x: number, y: number): LatLng => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / M_LNG });
const xy = (p: LatLng) => ({ x: (p.longitude - LNG0) * M_LNG, y: (p.latitude - LAT0) * M });

// Laid line: 12 m nach Osten, dann 12 m nach Norden (rechtwinkliger Knick bei (12,0)).
const LAID: LatLng[] = [];
for (let x = 0; x <= 12; x += 2) LAID.push(ll(x, 0));
for (let y = 2; y <= 12; y += 2) LAID.push(ll(12, y));

function Harness({ onReady, line }: { onReady: (s: SearchRecorder) => void; line: LatLng[] }) {
  const s = useSearchRecorder({ laidPoints: line, laidObjects: [] as any, level: 'training', handlerDistanceM: 1 });
  onReady(s);
  return null;
}
let activeRenderer: ReactTestRenderer | null = null;
afterEach(() => { act(() => { activeRenderer?.unmount(); }); activeRenderer = null; mockReplayOff = false; });

/** 1-Hz-Weg: 1,3 m/s nach Osten bis x = 12, dann nach Norden — schneller, kurzer 90°-Turn. */
function walkL(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const v = 1.3;
  for (let s = 0; s <= 12; s += v) pts.push({ x: s, y: 0 });
  const x0 = pts[pts.length - 1].x;
  for (let k = 1; k <= 9; k++) pts.push({ x: x0, y: k * v });
  return pts;
}

async function runScenario(line: LatLng[], fixes: { x: number; y: number; t: number }[]): Promise<{ res: SearchResult; progress: number[]; rec: SearchRecorder }> {
  progress.length = 0;
  jest.useFakeTimers(); jest.setSystemTime(fixes[0].t - 1000);   // deterministische Zeit: Analytics-Samples tragen Date.now()
  let rec!: SearchRecorder;
  act(() => { activeRenderer = TestRenderer.create(<Harness line={line} onReady={(s) => { rec = s; }} />); });
  await act(async () => { await Promise.resolve(); });
  act(() => { rec.start(undefined, { forceLocked: true }); });
  for (const p of fixes) {
    const q = ll(p.x, p.y);
    jest.setSystemTime(p.t);
    act(() => { feedSample!({ lat: q.latitude, lng: q.longitude, accuracy: 4, speed: 1.3, course: null, t: p.t }); });
  }
  let res!: SearchResult;
  act(() => { res = rec.stop(); });
  jest.useRealTimers();
  const out = { res, progress: progress.slice(), rec };
  act(() => { activeRenderer?.unmount(); }); activeRenderer = null;
  return out;
}

const T0 = 1_700_000_000_000;
const fixesL = () => walkL().map((p, i) => ({ ...p, t: T0 + i * 1000 }));

/** Abstand eines Punkts zu einer Polylinie (m). */
function distToPolyline(p: { x: number; y: number }, line: { x: number; y: number }[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

describe('kurzer 90°-Search-Turn', () => {
  it('Vor-Anker, Scheitel und Nach-Anker bleiben in der Replay-Geometrie erhalten', async () => {
    const { res } = await runScenario(LAID, fixesL());
    expect(res.replayPoints).toBeDefined();
    expect(res.replayPointsTimeSec).toHaveLength(res.replayPoints!.length);
    const rp = res.replayPoints!.map(xy);
    // Zeiten monoton
    for (let i = 1; i < res.replayPointsTimeSec!.length; i++) expect(res.replayPointsTimeSec![i]).toBeGreaterThanOrEqual(res.replayPointsTimeSec![i - 1]);
    // Scheitel des Turns: der Punkt der Replay-Geometrie mit der grössten Richtungsänderung liegt nahe dem Knick (x≈12).
    const apex = rp.reduce((best, p, i) => {
      if (i === 0 || i === rp.length - 1) return best;
      const a = rp[i - 1], b = rp[i + 1];
      const d1 = Math.atan2(p.x - a.x, p.y - a.y), d2 = Math.atan2(b.x - p.x, b.y - p.y);
      let diff = Math.abs(((d2 - d1) * 180) / Math.PI); if (diff > 180) diff = 360 - diff;
      return diff > best.diff ? { diff, i } : best;
    }, { diff: 0, i: -1 });
    expect(apex.i).toBeGreaterThan(0);
    expect(apex.diff).toBeGreaterThanOrEqual(45);
    const A = rp[apex.i], pre = rp[apex.i - 1], post = rp[apex.i + 1];
    expect(pre.x).toBeLessThan(A.x);                    // Vor-Anker liegt VOR dem Scheitel (auf dem Ost-Schenkel)
    expect(post.y).toBeGreaterThan(A.y);                // Nach-Anker liegt NACH dem Scheitel (auf dem Nord-Schenkel)
    expect(Math.hypot(A.x - pre.x, A.y - pre.y)).toBeLessThan(3.5);
    expect(Math.hypot(A.x - post.x, A.y - post.y)).toBeLessThan(3.5);
  });

  it('das bisherige 1,5-m-Gate schneidet die Ecke stärker ab als die Replay-Geometrie (Abstand Scheitel → Polylinie)', async () => {
    const { res } = await runScenario(LAID, fixesL());
    const legacy = res.points.map(xy), replay = res.replayPoints!.map(xy);
    // Wahre Ecke der geglätteten Dichtspur: Punkt mit maximalem Abstand von der Sehne Anfang→Ende.
    const dense = walkL(); const first = dense[0], last = dense[dense.length - 1];
    let cornerIdx = 0, worst = 0;
    dense.forEach((p, i) => { const d = Math.abs((last.x - first.x) * (first.y - p.y) - (first.x - p.x) * (last.y - first.y)) / Math.hypot(last.x - first.x, last.y - first.y); if (d > worst) { worst = d; cornerIdx = i; } });
    const corner = dense[cornerIdx];
    const legacyCut = distToPolyline(corner, legacy), replayCut = distToPolyline(corner, replay);
    console.log(`Ecke→Polylinie: legacy ${legacyCut.toFixed(2)} m · replay ${replayCut.toFixed(2)} m · Punkte legacy ${legacy.length} / replay ${replay.length}`);
    expect(replayCut).toBeLessThanOrEqual(legacyCut + 1e-9);
    expect(replayCut).toBeLessThan(1.5);
  });

  it('keine Erfindung: jeder Replay-Punkt ist ein tatsächlich aufgezeichneter (geglätteter) Fix — kein Snap, keine Projektion, kein Begradigen', async () => {
    const { res } = await runScenario(LAID, fixesL());
    // Alle Replay-Punkte liegen NICHT auf der gelegten Fährte erzwungen, sondern dort, wo der Hund war: Abstand zur Soll-Linie == Abstand der Fixe.
    const laid = LAID.map(xy);
    const dense = walkL();
    for (const p of res.replayPoints!.map(xy)) {
      const nearestFix = Math.min(...dense.map(f => Math.hypot(f.x - p.x, f.y - p.y)));
      expect(nearestFix).toBeLessThan(2.5);           // durch EMA-Glättung leicht versetzt, nie projiziert
      expect(Number.isFinite(distToPolyline(p, laid))).toBe(true);
    }
    // Und nicht mehr Punkte als Fixe.
    expect(res.replayPoints!.length).toBeLessThanOrEqual(dense.length);
  });
});

describe('Cursor / Fortschritt / Distanz / Score / Analytics bleiben IDENTISCH', () => {
  const compare = (a: { res: SearchResult; progress: number[]; rec: SearchRecorder }, b: { res: SearchResult; progress: number[]; rec: SearchRecorder }) => {
    expect(a.res.points).toEqual(b.res.points);
    expect(a.res.pointsTimeSec).toEqual(b.res.pointsTimeSec);
    expect(a.res.distanceM).toBe(b.res.distanceM);
    expect(a.res.score).toBe(b.res.score);
    expect(a.res.deviationAvgM).toBe(b.res.deviationAvgM);
    expect(a.res.analyticsSamples).toEqual(b.res.analyticsSamples);
    expect(a.res.breaks).toEqual(b.res.breaks);
    expect(a.res.foundObjectIndices).toEqual(b.res.foundObjectIndices);
    expect(a.res.foundObjects).toBe(b.res.foundObjects);
    expect(a.progress).toEqual(b.progress);
    expect(a.rec.trackLengthM).toBe(b.rec.trackLengthM);
  };

  it('synthetischer L-Turn: mit und ohne Replay-Berechnung', async () => {
    const withReplay = await runScenario(LAID, fixesL());
    mockReplayOff = true;
    const without = await runScenario(LAID, fixesL());
    expect(withReplay.res.replayPoints).toBeDefined();
    expect(without.res.replayPoints).toBeUndefined();
    expect(withReplay.res.points.length).toBeGreaterThan(2);
    compare(withReplay, without);
  });

  it('REAL (qa-0ec8c4ca, 14 Handler-Punkte): mit und ohne Replay-Berechnung', async () => {
    const FIX = path.join(__dirname, '..', '..', 'utils', '__tests__', 'fixtures', 'realFieldV21');
    const lay = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca.json'), 'utf8'));
    const run = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca-search.json'), 'utf8'));
    const line: LatLng[] = lay.points.map((p: { x: number; y: number }) => ll(p.x, p.y));
    const fixes = (run.runPoints as { x: number; y: number; t: number }[]).map(p => ({ x: p.x, y: p.y, t: T0 + p.t * 1000 }));
    const a = await runScenario(line, fixes);
    mockReplayOff = true;
    const b = await runScenario(line, fixes);
    compare(a, b);
    expect(a.progress.length).toBeGreaterThan(3);
  });

  it('die Replay-Ref wird von Cursor/Distanz/Score-Code nie gelesen (nur Push + stop)', () => {
    const src = fs.readFileSync('features/tracking/hooks/useSearchRecorder.ts', 'utf8');
    const uses = src.split('\n').filter(l => l.includes('replayDenseRef'));
    // Deklaration, Reset (anchor_reset, start), Feed (Länge + push), stop() — sonst nichts.
    for (const l of uses) expect(l).toMatch(/useRef|= \[\]|\.length|\.push\(|replayGeometryArrays\(/);
    expect(src).toContain('const replay = replayDisabledRef.current ? null : replayGeometryArrays(replayDenseRef.current);');
    // Das Feed-Statement steht VOR dem Liniendichte-Gate und NACH dem Fusion-Return.
    const feed = src.indexOf('replayDenseRef.current.push(');
    expect(feed).toBeGreaterThan(src.indexOf("emitDiag(fusion.classification === 'stationary' ? 'BLOCK_FUSION_STATIONARY'"));
    expect(feed).toBeLessThan(src.indexOf("emitDiag('SKIP_MIN_SEGMENT'"));
  });
});

describe('Resume', () => {
  it('nach Resume gibt es keine Replay-Geometrie (Vor-Resume-Punkte haben keine dichte Spur) → Legacy-Replay', async () => {
    progress.length = 0;
    let rec!: SearchRecorder;
    act(() => { activeRenderer = TestRenderer.create(<Harness line={LAID} onReady={(s) => { rec = s; }} />); });
    await act(async () => { await Promise.resolve(); });
    act(() => { rec.start({ points: [ll(0, 0), ll(2, 0), ll(4, 0)], startedAtMs: T0 - 10_000 } as any); });
    for (let i = 0; i < 6; i++) { const q = ll(5 + i * 1.3, 0); act(() => { feedSample!({ lat: q.latitude, lng: q.longitude, accuracy: 4, speed: 1.3, course: null, t: T0 + i * 1000 }); }); }
    let res!: SearchResult; act(() => { res = rec.stop(); });
    expect(res.replayPoints).toBeUndefined();
  });
});

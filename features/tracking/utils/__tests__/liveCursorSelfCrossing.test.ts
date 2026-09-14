/**
 * P0 Live Search Cursor — Self-Crossing / Parallel-Leg (qa-0ec8c4ca).
 *
 * Reale Fixtures: gelegte Linie (spitz-qa-0ec8c4ca.json) + die 14 tatsächlich
 * persistierten Handler-Suchpunkte (spitz-qa-0ec8c4ca-search.json, relativ
 * zum selben Ursprung, echte t). OLD = projectForward (nächstes Segment im
 * Fenster) — reproduziert den Production-Sprung; FIX = Kandidaten im selben
 * Fenster + Lotfuss-Kontinuität (Kosten = Lotfuss-Abstand zur Vorhersage + seitlicher
 * Abstand, beides Meter, kein Faktor). Fenster (20/4), ADVANCE_DEV_M (12), Monotonie
 * unverändert. Zusätzlich synthetische Adversarial-Fälle A–H.
 *
 * ABGRENZUNG: Die offline neu berechneten qa-Werte (mean/median/p95/max) sind
 * NUR rekonstruktive Vergleichswerte auf den 14 persistierten run_points. Die
 * damaligen fusion-blockierten AnalyticsSamples (Stillstand/Outlier) wurden
 * nicht persistiert; die exakten künftigen Production-Werte muss ein neuer
 * Feldlauf bestätigen. Bewiesen ist: der falsche Cursor-/Segmentsprung
 * existierte und wird für die reale Geometrie beseitigt.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  buildArc, projectForward, projectForwardCandidates, pickContinuousProjection, predictContinuityFoot, haversineM, pointAtDistance, type LL,
} from '@/features/tracking/utils/searchGeometry';
import { computeDeviationStats, type AnalyticsSample } from '@/features/tracking/engine/trackAnalytics';
import { computeTrackAnalyticsV2 } from '@/features/tracking/engine/trackSegmentAnalysis';
import { buildSearchEventArcs } from '@/features/tracking/utils/canonicalArc';

const LOOKAHEAD_M = 20, BACK_M = 4, ADVANCE_DEV_M = 12;   // = useSearchRecorder (unverändert)
const M = 111320, LAT0 = 47, LNG0 = 8, M_LNG = M * Math.cos((LAT0 * Math.PI) / 180);
const ll = (x: number, y: number): LL => ({ latitude: LAT0 + y / M, longitude: LNG0 + x / M_LNG });
const FIX = path.join(__dirname, 'fixtures', 'realFieldV21');

type Step = { i: number; t: number; moveM: number; atM: number; devM: number; cursorBefore: number; cursorAfter: number };
type Mode = 'old' | 'fix';

/** Simuliert exakt die Cursor-/Deviation-Logik des Recorders (nach Start-Lock) über akzeptierte Punkte. */
function simulate(line: LL[], pts: LL[], times: number[], mode: Mode, seedCursor = 0): Step[] {
  const { cum } = buildArc(line);
  let cursor = seedCursor, prevFoot: LL | null = seedCursor > 0 ? pointAtDistance(line, cum, seedCursor) : null;
  const steps: Step[] = [];
  for (let i = 0; i < pts.length; i++) {
    const sm = pts[i];
    let devM: number, atM: number, foot: LL | null;
    if (mode === 'old') {
      const proj = projectForward(sm, line, cum, cursor, LOOKAHEAD_M, BACK_M);
      devM = proj.devM; atM = proj.atM; foot = null;
    } else {
      const cands = projectForwardCandidates(sm, line, cum, cursor, LOOKAHEAD_M, BACK_M);
      const chosen = pickContinuousProjection(cands, prevFoot ? predictContinuityFoot(prevFoot, i > 0 ? pts[i - 1] : null, sm, line, cum, cursor) : null);
      if (chosen) { devM = chosen.offLineM; atM = chosen.arcM; foot = chosen.point; }
      else { const proj = projectForward(sm, line, cum, cursor, LOOKAHEAD_M, BACK_M); devM = proj.devM; atM = proj.atM; foot = pointAtDistance(line, cum, proj.atM); }
    }
    const before = cursor;
    if (devM <= ADVANCE_DEV_M && atM > cursor) cursor = atM;
    if (mode === 'fix') prevFoot = foot;
    steps.push({ i, t: times[i], moveM: i ? haversineM(pts[i - 1], sm) : 0, atM, devM, cursorBefore: before, cursorAfter: cursor });
  }
  return steps;
}
const maxJump = (s: Step[]) => Math.max(...s.map(x => x.cursorAfter - x.cursorBefore));
const samplesOf = (s: Step[]): AnalyticsSample[] => s.map(x => ({ atM: x.cursorAfter, tSec: x.t, devM: x.devM, confidence: 1, speedMps: null }));

describe('qa-0ec8c4ca — realer Lauf (Lay-Linie + 14 persistierte Suchpunkte)', () => {
  const lay = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca.json'), 'utf8'));
  const run = JSON.parse(fs.readFileSync(path.join(FIX, 'spitz-qa-0ec8c4ca-search.json'), 'utf8'));
  const line: LL[] = lay.points.map((p: { x: number; y: number }) => ll(p.x, p.y));
  const pts: LL[] = run.runPoints.map((p: { x: number; y: number }) => ll(p.x, p.y));
  const times: number[] = run.runPoints.map((p: { t: number }) => p.t);
  const { cum, total } = buildArc(line);
  const old = simulate(line, pts, times, 'old');
  const fix = simulate(line, pts, times, 'fix');
  const MID_LO = 5, MID_HI = 18.7;   // Segment 1 der Production-Analytics (5 … 18,7 m)

  it('Vertrag: Linie ≈ 23,7 m, 14 Suchpunkte mit echten t, Ursprung identisch (points[1] Kontrolle)', () => {
    expect(run.sessionId).toBe('qa-0ec8c4ca');
    expect(Math.abs(total - 23.7)).toBeLessThanOrEqual(0.05);
    expect(pts).toHaveLength(14);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    expect(run.handlerDistanceM).toBe(1);
  });

  it('OLD reproduziert den Production-Sprung: Schritt i=4 (t 17,6 s), Handler ~2 m, Cursor < 5 m → ≈ 18,7 m; mittlerer Abschnitt ohne Samples', () => {
    const s4 = old[4];
    expect(s4.cursorBefore).toBeLessThan(5);
    expect(s4.moveM).toBeGreaterThan(1.5); expect(s4.moveM).toBeLessThan(2.5);
    expect(s4.cursorAfter).toBeGreaterThanOrEqual(18.5); expect(s4.cursorAfter).toBeLessThanOrEqual(19);
    expect(maxJump(old)).toBeGreaterThan(12);
    expect(old.some(s => s.cursorAfter > MID_LO && s.cursorAfter < MID_HI)).toBe(false);   // Segment 5–18,7 übersprungen
    // Danach Schleife gegen den Rückweg gemessen: OLD-Maximum 3,45 m ≈ Production 3,5 m.
    expect(Math.max(...old.slice(4).map(s => s.devM))).toBeCloseTo(3.45, 1);
  });

  it('FIX: kein ~12-m-Sprung, mittlerer Abschnitt erhält Fortschritt, Cursor bleibt auf dem gelaufenen Schenkel', () => {
    const s4 = fix[4];
    expect(s4.cursorAfter).toBeGreaterThan(5); expect(s4.cursorAfter).toBeLessThan(8);   // Hinweg (6,5 m), nicht Rückweg (18,7 m)
    expect(fix.some(s => s.cursorAfter > MID_LO && s.cursorAfter < MID_HI)).toBe(true);
    expect(fix.filter(s => s.cursorAfter > MID_LO && s.cursorAfter < MID_HI).length).toBeGreaterThanOrEqual(5);
    expect(maxJump(fix)).toBeLessThan(maxJump(old) / 2);
    // Der größte verbleibende Schritt ist die echte Spitzkehre (8 s ohne akzeptierten Punkt, ~6 m Referenz).
    expect(maxJump(fix)).toBeLessThan(7);
    // Monoton, endet am Linienende wie OLD.
    for (let i = 1; i < fix.length; i++) expect(fix[i].cursorAfter).toBeGreaterThanOrEqual(fix[i - 1].cursorAfter);
    expect(fix[fix.length - 1].cursorAfter).toBeCloseTo(total, 1);
    expect(old[old.length - 1].cursorAfter).toBeCloseTo(total, 1);
  });

  it('Property (Audit-Metrik): FIX-Cursorschritte bleiben mit der Handlerbewegung verträglich, OLD nicht', () => {
    // cursorDelta vs. handlerDelta je Schritt — OLD hat einen Schritt mit Δcursor ≈ 7× Bewegung; FIX max ≈ 3× (Spitzkehre, Fixes ohne Punkt dazwischen).
    const ratio = (s: Step[]) => Math.max(...s.filter(x => x.moveM > 0).map(x => (x.cursorAfter - x.cursorBefore) / x.moveM));
    expect(ratio(old)).toBeGreaterThan(6);
    expect(ratio(fix)).toBeLessThan(3.5);
  });

  it('Deviation-Statistik OLD vs FIX (Samples = 14 akzeptierte Punkte, confidence 1) — Bericht, keine Zielwerte', () => {
    const so = computeDeviationStats(samplesOf(old)), sf = computeDeviationStats(samplesOf(fix));
    // Marker kanonisch (Production-Stand: traversal-aware) — identische Ecken-Eingabe für beide Läufe.
    const markers = lay.markers.map((m: { angleKind: string; x: number; y: number; atM: number; tMs: number }, i: number) => ({ id: `m${i}`, ...ll(m.x, m.y).latitude ? { lat: ll(m.x, m.y).latitude, lng: ll(m.x, m.y).longitude } : {}, distance_from_start: m.atM, t: m.tMs }));
    const arcs = buildSearchEventArcs(markers, lay.points.map((p: { x: number; y: number; tMs: number }) => ({ ...ll(p.x, p.y), t: p.tMs })));
    const corners = lay.markers.map((m: { angleKind: 'rechts' | 'spitz_rechts' }, i: number) => ({ atM: arcs[`m${i}`].arcM as number, angleKind: m.angleKind }));
    const an = (s: Step[]) => computeTrackAnalyticsV2({ samples: samplesOf(s), corners, objects: [], breaks: [], trackLengthM: total, durationS: times[times.length - 1] });
    const ao = an(old), af = an(fix);
    const segRows = (a: ReturnType<typeof computeTrackAnalyticsV2>) => a.segments.map(sg => `${sg.type}[${sg.startDistanceM}-${sg.endDistanceM}] n=${sg.startTimeSec == null ? 0 : '≥1'} mean=${sg.meanDeviationM} max=${sg.maxDeviationM}`).join(' | ');
    console.log(`OLD  mean ${so.meanM} median ${so.medianM} p95 ${so.p95M} maxReliable ${so.maxReliableM} | corners ${JSON.stringify(ao.corners.map(c => ({ atM: Math.round(c.atM * 10) / 10, overshootM: c.overshootM, reacq: c.reacquisitionSec, maxLat: c.maxLateralDeviationM })))} | ${segRows(ao)}`);
    console.log(`FIX  mean ${sf.meanM} median ${sf.medianM} p95 ${sf.p95M} maxReliable ${sf.maxReliableM} | corners ${JSON.stringify(af.corners.map(c => ({ atM: Math.round(c.atM * 10) / 10, overshootM: c.overshootM, reacq: c.reacquisitionSec, maxLat: c.maxLateralDeviationM })))} | ${segRows(af)}`);
    // Einzige gepinnte Aussage: das OLD-Maximum (Schleife vs. Rückweg) verschwindet; FIX-Max stammt vom Linienende (letzter Punkt, 2,5 m) — beides reale Geometrie.
    expect(so.maxReliableM).toBeCloseTo(3.5, 1);
    expect(sf.maxReliableM).toBeLessThan(so.maxReliableM);
    expect(cum.length).toBe(10);
  });
});

// ── Synthetische Adversarial-Fälle (reine Geometrie, gleiche Simulation) ──────
function polyline(corners: [number, number][], step = 2): LL[] {
  const pts: LL[] = [ll(corners[0][0], corners[0][1])];
  for (let c = 0; c < corners.length - 1; c++) {
    const [x0, y0] = corners[c], [x1, y1] = corners[c + 1]; const len = Math.hypot(x1 - x0, y1 - y0);
    for (let d = step; d < len - 1e-9; d += step) { const f = d / len; pts.push(ll(x0 + f * (x1 - x0), y0 + f * (y1 - y0))); }
    pts.push(ll(x1, y1));
  }
  return pts;
}
/** Handler läuft die Linie ab (Schritt ~stepM), mit seitlichem Versatz offX/offY. */
function walk(line: LL[], stepM: number, offset: (i: number) => [number, number]): { pts: LL[]; times: number[] } {
  const { cum, total } = buildArc(line);
  const pts: LL[] = [], times: number[] = [];
  for (let d = 0, i = 0; d <= total; d += stepM, i++) {
    const p = pointAtDistance(line, cum, d)!; const [ox, oy] = offset(i);
    pts.push({ latitude: p.latitude + oy / M, longitude: p.longitude + ox / M_LNG }); times.push(i);
  }
  return { pts, times };
}
const monotone = (s: Step[]) => s.every((x, i) => i === 0 || x.cursorAfter >= s[i - 1].cursorAfter);

describe('Synthetische Fälle (A–H)', () => {
  it('A. zwei parallele Schenkel 1 m auseinander (Hin/Rück): FIX folgt dem Hinweg, OLD springt', () => {
    const line = polyline([[0, 0], [0, 30], [1, 30], [1, 0]]);
    const { pts, times } = walk(line, 2, i => [0.6, 0]);     // Handler 0,6 m Richtung Rückweg versetzt → Rückweg ist auf dem Hinweg näher (0,4 < 0,6)
    const old = simulate(line, pts, times, 'old'), fix = simulate(line, pts, times, 'fix');
    expect(maxJump(old)).toBeGreaterThan(15);                 // OLD: sofort auf den Rückweg (~19 m Sprung)
    expect(maxJump(fix)).toBeLessThan(4);
    expect(monotone(fix)).toBe(true);
    expect(fix[fix.length - 1].cursorAfter).toBeGreaterThan(buildArc(line).total - 2.5);   // letzter Laufpunkt liegt ≤ 1 Schritt vor dem Ende
  });
  it('B. Selbstkreuzung (X): FIX läuft geradeaus durch die Kreuzung weiter', () => {
    const line = polyline([[0, 0], [20, 20], [20, 0], [0, 20]]);
    const { pts, times } = walk(line, 2, () => [0.3, -0.3]);
    const fix = simulate(line, pts, times, 'fix');
    expect(maxJump(fix)).toBeLessThan(5);
    expect(monotone(fix)).toBe(true);
    expect(fix[fix.length - 1].cursorAfter).toBeGreaterThan(buildArc(line).total - 2.5);
  });
  it('C. enge Spitzkehre (Hairpin, 0,6 m): FIX kommt um die Kehre herum, kein Festhängen, kein Sprung', () => {
    const line = polyline([[0, 0], [0, 30], [0.6, 30], [0.6, 0]]);
    const { pts, times } = walk(line, 2, () => [0.2, 0]);
    const fix = simulate(line, pts, times, 'fix');
    expect(fix[fix.length - 1].cursorAfter).toBeGreaterThan(buildArc(line).total - 2.5);
    expect(maxJump(fix)).toBeLessThan(4);
  });
  it('D. späterer Schenkel räumlich näher als der aktuelle: Kontinuität entscheidet, nicht der Abstand', () => {
    // Hinweg x=0 / x=5, Rückwege 0,4 m daneben (x=5,4 bzw. x=0,4) — beide späteren Schenkel liegen dem Handler näher.
    const line = polyline([[0, 0], [0, 20], [5, 20], [5, 40], [5.4, 40], [5.4, 20.6], [0.4, 20.6], [0.4, 0.6]]);
    const { pts, times } = walk(line, 2, () => [0.3, 0]);     // Handler 0,3 m zum Rückweg hin versetzt → Rückweg 0,1 m näher als der eigene Schenkel
    const old = simulate(line, pts, times, 'old'), fix = simulate(line, pts, times, 'fix');
    expect(maxJump(old)).toBeGreaterThan(5);                  // OLD springt auf den 0,4 m entfernten Rückweg, sobald das Fenster ihn erreicht
    expect(maxJump(fix)).toBeLessThan(4);
    expect(fix[fix.length - 1].cursorAfter).toBeGreaterThan(buildArc(line).total - 2.5);
  });
  it('E. echter schneller Vorwärtsfortschritt (4 m je Punkt) wird NICHT blockiert', () => {
    const line = polyline([[0, 0], [0, 40], [40, 40]]);
    const { pts, times } = walk(line, 4, () => [0.2, 0]);
    const fix = simulate(line, pts, times, 'fix');
    for (let i = 1; i < fix.length; i++) expect(fix[i].cursorAfter - fix[i - 1].cursorAfter).toBeCloseTo(4, 0);
    expect(fix[fix.length - 1].cursorAfter).toBeCloseTo(4 * (fix.length - 1), 0);   // letzter Laufpunkt bei 76 m
  });
  it('F. Handler bleibt stehen (GPS-Jitter 0,3 m) neben parallelem Schenkel: Cursor hält, kein Sprung', () => {
    const line = polyline([[0, 0], [0, 30], [1, 30], [1, 0]]);
    const { cum } = buildArc(line);
    const base = pointAtDistance(line, cum, 10)!;
    const pts: LL[] = Array.from({ length: 12 }, (_, i) => ({ latitude: base.latitude + ((i % 3) - 1) * 0.3 / M, longitude: base.longitude + ((i % 2) * 0.6) / M_LNG }));
    const fix = simulate(line, pts, pts.map((_, i) => i), 'fix', 10);
    expect(maxJump(fix)).toBeLessThan(1.5);
    expect(fix[fix.length - 1].cursorAfter).toBeLessThan(12);
  });
  it('G. GPS-Jitter nahe der Kreuzung (X): kein Sprung auf den kreuzenden Schenkel', () => {
    const line = polyline([[0, 0], [20, 20], [20, 0], [0, 20]]);   // Kreuzung bei (10,10), arc ≈ 14,1 und ≈ 62,5
    const { cum } = buildArc(line);
    const near = pointAtDistance(line, cum, 13)!;
    const jitter = [[0, 0], [0.4, -0.3], [-0.3, 0.5], [0.5, 0.2], [-0.4, -0.4], [0.2, 0.6]];
    const pts: LL[] = jitter.map(([ox, oy]) => ({ latitude: near.latitude + oy / M, longitude: near.longitude + ox / M_LNG }));
    const fix = simulate(line, pts, pts.map((_, i) => i), 'fix', 13);
    expect(fix[fix.length - 1].cursorAfter).toBeLessThan(16);
  });
  it('H. kurze Rückwärtsbewegung: Cursor bleibt (monoton), danach normaler Fortschritt', () => {
    const line = polyline([[0, 0], [0, 40]]);
    const { cum } = buildArc(line);
    const ds = [10, 12, 14, 12.5, 11, 13, 15, 17];
    const pts = ds.map(d => pointAtDistance(line, cum, d)!);
    const fix = simulate(line, pts, ds.map((_, i) => i), 'fix', 10);
    expect(monotone(fix)).toBe(true);
    expect(fix[4].cursorAfter).toBeCloseTo(14, 1);
    expect(fix[fix.length - 1].cursorAfter).toBeCloseTo(17, 1);
  });
});

describe('Alle realen Lay-Fixtures — OLD vs FIX bei einem Lauf entlang der realen Linie (keine Regression auf normalen Geometrien)', () => {
  const files = fs.readdirSync(FIX).filter(f => f.endsWith('.json') && !f.endsWith('-search.json')).sort();
  const rows: string[] = [];
  for (const f of files) {
    it(f, () => {
      const j = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
      const line: LL[] = j.points.map((p: { x: number; y: number }) => ll(p.x, p.y));
      if (line.length < 2) { rows.push(`${f.padEnd(28)} — Linie < 2 Punkte`); return; }
      // Handler 0,5 m seitlich versetzt, 2-m-Schritte (synthetischer Lauf auf der REALEN Linie; echte Suchfixe sind nur für qa-0ec8c4ca persistiert).
      const { pts, times } = walk(line, 2, i => [0.5 * (i % 2 ? 1 : -1), 0.2]);
      const old = simulate(line, pts, times, 'old'), fix = simulate(line, pts, times, 'fix');
      const so = computeDeviationStats(samplesOf(old)), sf = computeDeviationStats(samplesOf(fix));
      rows.push(`${f.padEnd(28)} Linie ${buildArc(line).total.toFixed(1).padStart(5)} m | final cursor OLD ${old[old.length - 1].cursorAfter.toFixed(2)} FIX ${fix[fix.length - 1].cursorAfter.toFixed(2)} | maxJump OLD ${maxJump(old).toFixed(2)} FIX ${maxJump(fix).toFixed(2)} | mean/max OLD ${so.meanM}/${so.maxReliableM} FIX ${sf.meanM}/${sf.maxReliableM}`);
      if (f.startsWith('spitz-')) {
        // Selbst-benachbarte Schenkel: FIX darf hier abweichen (das ist der Fix).
        expect(maxJump(fix)).toBeLessThanOrEqual(maxJump(old));
      } else {
        expect(fix[fix.length - 1].cursorAfter).toBeCloseTo(old[old.length - 1].cursorAfter, 2);
        expect(maxJump(fix)).toBeCloseTo(maxJump(old), 2);
        expect(sf).toEqual(so);
      }
    });
  }
  afterAll(() => console.log('\n══ Real-Fixtures OLD vs FIX (synthetischer Lauf auf realer Linie) ══\n' + rows.join('\n')));
});

// ── Resume-Sonderfall: erster akzeptierter Fix nach Wiederaufnahme ────────────
describe('Resume direkt vor der Selbstnachbarschaft (prevFoot aus gespeichertem Cursor rekonstruiert)', () => {
  // Kurze Fährte: Hinweg x=0 (0→10 m), Rückweg x=1 (10→0 m), 1 m Abstand, Gesamtlänge 21 m.
  // Bei Cursor 4 m deckt das Fenster [0, 24] die ganze Linie — der Rückweg ist erreichbar (wie bei qa-0ec8c4ca).
  const line = polyline([[0, 0], [0, 10], [1, 10], [1, 0]]);
  const { cum, total } = buildArc(line);
  const cursorBeforeResume = 4;
  const lastResumed = ll(0.6, 4);    // letzter wiederhergestellter Punkt
  const firstFix = ll(0.7, 6);       // Rückweg 0,3 m, Hinweg 0,7 m entfernt
  it('alte nearest-Semantik hätte auf den Rückweg gesprungen (arc ≈ 15 m, +11 m bei 2 m Bewegung)', () => {
    const proj = projectForward(firstFix, line, cum, cursorBeforeResume, LOOKAHEAD_M, BACK_M);
    expect(proj.atM).toBeCloseTo(15, 0);
    expect(proj.devM).toBeCloseTo(0.3, 1);
  });
  it('FIX: Kontinuität aus Seed-Cursor → Hinweg, kein Sprung; Pins ausgegeben', () => {
    const seededPrevFoot = pointAtDistance(line, cum, cursorBeforeResume)!;
    const seededPrevFootArc = projectForward(seededPrevFoot, line, cum, cursorBeforeResume, LOOKAHEAD_M, BACK_M).atM;
    const handlerDelta = haversineM(lastResumed, firstFix);
    const cands = projectForwardCandidates(firstFix, line, cum, cursorBeforeResume, LOOKAHEAD_M, BACK_M);
    const chosen = pickContinuousProjection(cands, predictContinuityFoot(seededPrevFoot, lastResumed, firstFix, line, cum, cursorBeforeResume))!;
    const cursorAfter = chosen.offLineM <= ADVANCE_DEV_M && chosen.arcM > cursorBeforeResume ? chosen.arcM : cursorBeforeResume;
    console.log(`Resume-Pins: cursorBeforeResume=${cursorBeforeResume} seededPrevFootArc=${seededPrevFootArc.toFixed(2)} handlerDelta=${handlerDelta.toFixed(2)} selectedCandidateArc=${chosen.arcM.toFixed(2)} cursorAfterFirstFix=${cursorAfter.toFixed(2)} (Kandidaten: ${cands.map(c => c.arcM.toFixed(1) + '/dev' + c.offLineM.toFixed(2)).join(' ')})`);
    expect(seededPrevFootArc).toBeCloseTo(4, 1);
    expect(handlerDelta).toBeCloseTo(2.0, 1);
    expect(cands.map(c => Math.round(c.arcM)).sort((a, b) => a - b)).toEqual([6, 15]);   // beide Schenkel im Fenster
    expect(chosen.arcM).toBeCloseTo(6, 1);                  // geometrisch eindeutig: Hinweg bei 6 m
    expect(cursorAfter).toBeCloseTo(6, 1);
    expect(cursorAfter - cursorBeforeResume).toBeLessThan(3);
    expect(cursorAfter).toBeGreaterThanOrEqual(cursorBeforeResume);   // monoton, kein Rücksprung
    expect(total).toBeCloseTo(21, 0);
  });
  it('Resume ohne Vorgängerpunkt (Verschiebung unbekannt → 0): ebenfalls kein Sprung', () => {
    const seededPrevFoot = pointAtDistance(line, cum, cursorBeforeResume)!;
    const cands = projectForwardCandidates(firstFix, line, cum, cursorBeforeResume, LOOKAHEAD_M, BACK_M);
    expect(pickContinuousProjection(cands, predictContinuityFoot(seededPrevFoot, null, firstFix, line, cum, cursorBeforeResume))!.arcM).toBeCloseTo(6, 1);
  });
  it('anchor_reset mitten im Lauf (Cursor bleibt, Linie/prevFoot verworfen): erster Fix danach bleibt per Cursor-Lotfuss auf dem Hinweg', () => {
    // Recorder-Regel: prevFootRef=null, kein Vorgängerpunkt, Cursor 4 > 0 → prevFoot = Linienpunkt am Cursor, Verschiebung 0.
    const prevFoot = pointAtDistance(line, cum, cursorBeforeResume)!;
    const cands = projectForwardCandidates(firstFix, line, cum, cursorBeforeResume, LOOKAHEAD_M, BACK_M);
    expect(pickContinuousProjection(cands, predictContinuityFoot(prevFoot, null, firstFix, line, cum, cursorBeforeResume))!.arcM).toBeCloseTo(6, 1);
    expect(pickContinuousProjection(cands, null)!.arcM).toBeCloseTo(15, 0);   // Gegenprobe: ohne Lotfuss = alte Schwäche
  });
});

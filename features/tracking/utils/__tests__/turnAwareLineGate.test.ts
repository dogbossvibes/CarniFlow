// Turn-aware Linien-Gate: Kontrakt + Wirkung an realen Rohfixen.
//
// Die Simulation bildet die Recorder-Kette nach (siehe useTrackRecorder.onFix):
//   Detektor-Puffer  EMA 0,7 / Gate 0,5 m
//   Linie            EMA 0,4 (Kurvenzone 0,7) / Gate 2,0 m (Kurvenzone 0,8 m)
// und lässt die Fusion live mitlaufen (nach jedem Linienpunkt), damit
// `lastCornerAtM` wie im Feld entsteht.
import * as fs from 'fs';
import * as path from 'path';
import {
  LINE_GATE, lineGateStepM, lineEmaAlpha, inTurnZone, recentHeadingChangeDeg, type GatePoint,
} from '@/features/tracking/utils/turnAwareLineGate';
import { DETECTOR_INPUT, type ShortLegPoint } from '@/features/tracking/utils/shortLegCornerDetection';
import { fuseTurns } from '@/features/tracking/utils/turnFusion';

const M = 111320;
const FIX = path.join(__dirname, 'fixtures', 'realFieldV21');

function gp(xy: [number, number][]): GatePoint[] {
  let cum = 0;
  return xy.map(([x, y], i) => {
    if (i > 0) cum += Math.hypot(x - xy[i - 1][0], y - xy[i - 1][1]);
    return { lat: y / M, lng: x / M, cumDist: cum };
  });
}
const walk = (from: [number, number], dir: [number, number], n: number, step: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [from[0] + dir[0] * step * i, from[1] + dir[1] * step * i]);

describe('Kontrakt', () => {
  it('konstant: das Regel-Gate und die Regel-Glättung sind unverändert', () => {
    expect(LINE_GATE.stepM).toBe(2.0);
    expect(LINE_GATE.emaAlpha).toBe(0.4);
    expect(lineEmaAlpha(false)).toBe(0.4);
    expect(lineEmaAlpha(true)).toBeGreaterThan(0.4);
    expect(LINE_GATE.denseStepM).toBeLessThan(LINE_GATE.stepM);
  });

  it('gerade Strecke: nie eine Kurvenzone, Gate bleibt 2,0 m', () => {
    const pts = gp(walk([0, 0], [1, 0], 40, 0.5));
    for (let n = 1; n <= pts.length; n++) {
      expect(inTurnZone(pts.slice(0, n))).toBe(false);
      expect(lineGateStepM(pts.slice(0, n))).toBe(LINE_GATE.stepM);
    }
  });

  it('zu kurzer Puffer: keine Aussage (null), keine Kurvenzone', () => {
    expect(recentHeadingChangeDeg(gp(walk([0, 0], [1, 0], 4, 0.5)))).toBeNull();
    expect(inTurnZone([])).toBe(false);
  });

  it('90°-Ecke: die Kurvenzone öffnet, sobald ~1 m hinter dem Scheitel gelaufen wurde, und das Gate wird dicht', () => {
    const corner = gp([...walk([0, 0], [1, 0], 13, 0.5), ...walk([6, 0.5], [0, 1], 12, 0.5)]);   // Scheitel bei 6 m
    let opened = -1;
    for (let n = 1; n <= corner.length; n++) {
      if (inTurnZone(corner.slice(0, n))) { opened = corner[n - 1].cumDist - 6; break; }
    }
    expect(opened).toBeGreaterThan(0);        // erst NACH dem Scheitel
    expect(opened).toBeLessThanOrEqual(2.0);  // aber noch innerhalb der Kurve
    expect(lineGateStepM(corner.slice(0, 16))).toBe(LINE_GATE.denseStepM);
  });

  it('nach einer bestätigten Ecke bleibt die Zone `holdM` Meter offen, danach nicht mehr', () => {
    const pts = gp(walk([0, 0], [1, 0], 40, 0.5));
    const lastEnd = pts[pts.length - 1].cumDist;
    expect(inTurnZone(pts, lastEnd - LINE_GATE.holdM + 0.1)).toBe(true);
    expect(inTurnZone(pts, lastEnd - LINE_GATE.holdM - 0.5)).toBe(false);
    expect(inTurnZone(pts, -Infinity)).toBe(false);
    expect(inTurnZone(pts, null)).toBe(false);
  });

  it('der Recorder benutzt das Gate nur für CURRENT — BUILD40 bleibt beim festen Gate', () => {
    const src = fs.readFileSync('features/tracking/hooks/useTrackRecorder.ts', 'utf8');
    expect(src).toContain("getTrackingEngineMode() === 'build40' ? MIN_STEP_M : lineGateStepM(detectPointsRef.current, lastCornerAtRef.current)");
    expect(src).toContain("getTrackingEngineMode() === 'build40' ? EMA_ALPHA : lineEmaAlpha(lineTurnZoneRef.current)");
    // Die Diagnose zählt den Gate-Ausschluss, bevor derselbe unveränderte Return greift.
    expect(src).toMatch(/if \(last && step < gateM\) \{\s+void recordBackgroundLayEvent\([^\n]+\);\s+return;\s+\}/);
    expect(src).toContain('MIN_STEP_M     = 2.0');
    // Der Detektor-Puffer (0,5-m-Gate) und sein EMA sind unberührt.
    expect(DETECTOR_INPUT.minStepM).toBe(0.5);
    expect(DETECTOR_INPUT.emaAlpha).toBe(0.7);
  });
});

// ── Wirkung an realen Rohfixen ────────────────────────────────────────────
type Raw = { x: number; y: number; accuracy: number; tMs: number };

function simulate(raw: readonly Raw[], adaptive: boolean) {
  const det: ShortLegPoint[] = [];
  let dEma: [number, number] | null = null;
  const line: { x: number; y: number; cum: number }[] = [];
  let ema: [number, number] | null = null;
  let lastCorner = -Infinity, zone = false;
  for (const r of raw) {
    const a = adaptive ? lineEmaAlpha(zone) : LINE_GATE.emaAlpha;
    ema = ema ? [ema[0] + a * (r.x - ema[0]), ema[1] + a * (r.y - ema[1])] : [r.x, r.y];
    const da = DETECTOR_INPUT.emaAlpha;
    dEma = dEma ? [dEma[0] + da * (r.x - dEma[0]), dEma[1] + da * (r.y - dEma[1])] : [r.x, r.y];
    const dl = det[det.length - 1];
    const dStep = dl ? Math.hypot(dEma[0] / M - dl.lng, dEma[1] / M - dl.lat) * M : 0;
    if (!dl || dStep >= DETECTOR_INPUT.minStepM) {
      det.push({ lat: dEma[1] / M, lng: dEma[0] / M, cumDist: (dl?.cumDist ?? 0) + dStep, accuracy: r.accuracy, t: r.tMs });
    }
    zone = adaptive && inTurnZone(det, lastCorner);
    const last = line[line.length - 1];
    const step = last ? Math.hypot(ema[0] - last.x, ema[1] - last.y) : 0;
    const gate = adaptive ? lineGateStepM(det, lastCorner) : LINE_GATE.stepM;
    if (last && step < gate) continue;
    line.push({ x: ema[0], y: ema[1], cum: (last?.cum ?? 0) + step });
    for (const c of fuseTurns(det).corners) if (c.atM > lastCorner) lastCorner = c.atM;
  }
  return { det, line };
}
function segDist(p: [number, number], a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a.x) * dx + (p[1] - a.y) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a.x + t * dx), p[1] - (a.y + t * dy));
}
const distToLine = (p: [number, number], line: { x: number; y: number }[]) => {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) best = Math.min(best, segDist(p, line[i - 1], line[i]));
  return best;
};

describe('Wirkung an den 11 realen QA-Läufen (rawFixes → Detektor-Puffer → Linie)', () => {
  const files = fs.readdirSync(FIX).filter(f => f.endsWith('.json') && !f.includes('search'));
  const sessions = files.map(f => ({ f, j: JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')) }))
    .filter(s => s.j.rawFixes?.length);

  it('es gibt reale Rohfixe für alle 11 Läufe', () => { expect(sessions.length).toBe(11); });

  const rows: string[] = [];
  const stats = sessions.map(({ f, j }) => {
    const base = simulate(j.rawFixes, false);
    const adap = simulate(j.rawFixes, true);
    const corners = fuseTurns(base.det).corners.map(c => [base.det[c.apexIndex].lng * M, base.det[c.apexIndex].lat * M] as [number, number]);
    const e0 = corners.map(p => distToLine(p, base.line)), e1 = corners.map(p => distToLine(p, adap.line));
    rows.push(`${f.padEnd(28)} Ecken=${corners.length} Punkte ${base.line.length}→${adap.line.length}  ` +
      `Länge ${base.line[base.line.length - 1].cum.toFixed(1)}→${adap.line[adap.line.length - 1].cum.toFixed(1)} m  ` +
      `Ecke→Linie ${e0.map(v => v.toFixed(2)).join('/') || '—'} → ${e1.map(v => v.toFixed(2)).join('/') || '—'} m`);
    return { f, base, adap, e0, e1, corners: corners.length };
  });

  it('der mittlere Abstand Ecken-Scheitel → aufgezeichnete Linie sinkt deutlich', () => {
    const all0 = stats.flatMap(s => s.e0), all1 = stats.flatMap(s => s.e1);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    console.log('\n[LINIEN-GATE · reale Läufe]\n' + rows.join('\n') + `\nmittlerer Abstand: ${mean(all0).toFixed(2)} → ${mean(all1).toFixed(2)} m (n=${all0.length})\n`);
    expect(all0.length).toBeGreaterThanOrEqual(10);
    expect(mean(all1)).toBeLessThan(mean(all0) * 0.85);
  });

  it('die Linie wird nie dünner, und Läufe ohne Ecke bekommen höchstens 3 Zusatzpunkte', () => {
    for (const s of stats) {
      expect(s.adap.line.length).toBeGreaterThanOrEqual(s.base.line.length);
      if (s.corners === 0) expect(s.adap.line.length - s.base.line.length).toBeLessThanOrEqual(3);
    }
  });

  it('die Weglänge wächst nur moderat (≤ 30 % je Lauf) — Distanz-Inflation ist die bekannte Gegenleistung', () => {
    for (const s of stats) {
      const l0 = s.base.line[s.base.line.length - 1].cum, l1 = s.adap.line[s.adap.line.length - 1].cum;
      expect(l1 / l0).toBeLessThanOrEqual(1.3);
    }
  });

  it('der Detektor-Puffer ist vom Linien-Gate unberührt (dieselben Punkte)', () => {
    for (const s of stats) {
      expect(s.adap.det.length).toBe(s.base.det.length);
      expect(s.adap.det.map(p => p.cumDist)).toEqual(s.base.det.map(p => p.cumDist));
    }
  });
});

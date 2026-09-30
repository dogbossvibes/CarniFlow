// Kanonische Distanz ist von der Persistenzdichte der Geometrie entkoppelt.
import * as fs from 'fs';
import * as path from 'path';
import { createCanonicalDistance, CANONICAL_GATE_M } from '@/features/tracking/utils/canonicalDistance';
import { lineGateStepM, lineEmaAlpha, inTurnZone } from '@/features/tracking/utils/turnAwareLineGate';
import { DETECTOR_INPUT, type ShortLegPoint } from '@/features/tracking/utils/shortLegCornerDetection';
import { fuseTurns } from '@/features/tracking/utils/turnFusion';

const M = 111320;
const FIX = path.join(__dirname, 'fixtures', 'realFieldV21');
type Raw = { x: number; y: number; accuracy: number; tMs: number };
type P = { lat: number; lng: number };
const dist = (a: P, b: P) => Math.hypot((b.lng - a.lng) * M, (b.lat - a.lat) * M);

/**
 * Recorder-Kette. `mode`:
 *  legacy      — alte Kette: EMA 0,4 / Gate 2,0 m, Distanz = Summe der Linien-Schritte (Stand vor der Turn-Fusion)
 *  turn-aware  — dichte Geometrie (Kurvenzone), Distanz aus dem kanonischen Akkumulator
 *  fixed:<g>   — Linien-Gate g (beliebige Persistenzdichte), Distanz aus dem kanonischen Akkumulator
 */
function run(raw: readonly Raw[], mode: 'legacy' | 'turn-aware' | `fixed:${number}`) {
  const canon = createCanonicalDistance();
  const det: ShortLegPoint[] = [];
  let dEma: [number, number] | null = null, ema: P | null = null, lineEma: P | null = null;
  const line: P[] = []; let legacyDist = 0, lastCorner = -Infinity, zone = false;
  for (const r of raw) {
    const p: P = { lat: r.y / M, lng: r.x / M };
    ema = ema ? { lat: ema.lat + 0.4 * (p.lat - ema.lat), lng: ema.lng + 0.4 * (p.lng - ema.lng) } : p;
    const a = mode === 'turn-aware' ? lineEmaAlpha(zone) : 0.4;
    lineEma = lineEma ? { lat: lineEma.lat + a * (p.lat - lineEma.lat), lng: lineEma.lng + a * (p.lng - lineEma.lng) } : p;
    const da = DETECTOR_INPUT.emaAlpha;
    dEma = dEma ? [dEma[0] + da * (r.x - dEma[0]), dEma[1] + da * (r.y - dEma[1])] : [r.x, r.y];
    const dl = det[det.length - 1];
    const dStep = dl ? Math.hypot(dEma[0] / M - dl.lng, dEma[1] / M - dl.lat) * M : 0;
    if (!dl || dStep >= DETECTOR_INPUT.minStepM) det.push({ lat: dEma[1] / M, lng: dEma[0] / M, cumDist: (dl?.cumDist ?? 0) + dStep, accuracy: r.accuracy, t: r.tMs });
    zone = mode === 'turn-aware' && inTurnZone(det, lastCorner);
    if (!line.length) canon.start(lineEma); else canon.push(ema);
    const last = line[line.length - 1];
    const step = last ? dist(last, lineEma) : 0;
    const gate = mode === 'legacy' ? CANONICAL_GATE_M : mode === 'turn-aware' ? lineGateStepM(det, lastCorner) : Number(mode.split(':')[1]);
    if (last && step < gate) continue;
    line.push(lineEma); legacyDist += step;
    for (const c of fuseTurns(det).corners) if (c.atM > lastCorner) lastCorner = c.atM;
  }
  const geometryM = line.reduce((s, q, i) => s + (i ? dist(line[i - 1], q) : 0), 0);
  return { canonical: canon.total, legacyDist, geometryM, points: line.length };
}

describe('Kontrakt', () => {
  it('Gate-Semantik: Schritte < 2 m zählen nicht, ≥ 2 m zählen', () => {
    const c = createCanonicalDistance();
    c.start({ lat: 0, lng: 0 });
    expect(c.push({ lat: 1 / M, lng: 0 })).toBe(0);
    expect(c.push({ lat: 2.5 / M, lng: 0 })).toBeCloseTo(2.5, 2);
    expect(c.push({ lat: 3.5 / M, lng: 0 })).toBeCloseTo(2.5, 2);
    c.reset(); expect(c.total).toBe(0);
  });
  it('der Recorder speist die Distanz nur aus dem Akkumulator', () => {
    const rec = fs.readFileSync('features/tracking/hooks/useTrackRecorder.ts', 'utf8');
    expect(rec).toContain('canonDistRef.current.push(ema)');
    expect(rec).toContain('setDistanceMeters(total)');
    expect(rec).toContain('s.addTrackPoint(sample, { skipDistance: true })');
    expect(rec).toContain('canonDistRef.current.start({ lat: p0.lat, lng: p0.lng })');
    // Die kanonische Kette bleibt EMA_ALPHA — nur die Geometrie-Kette ist turn-aware.
    expect(rec).toContain('(raw.lat - prevEma.lat) * EMA_ALPHA');
  });
  it('Store: skipDistance addiert nichts, setDistanceMeters setzt absolut', () => {
    const st = fs.readFileSync('features/tracking/store/trackingStore.ts', 'utf8');
    expect(st).toContain('last && !opts?.skipDistance ? calculateDistance(last, p) : 0');
    expect(st).toContain('setDistanceMeters: (m) =>');
  });
});

describe('11 reale Läufe: BEFORE (legacy) / AFTER (turn-aware Geometrie + kanonische Distanz)', () => {
  const sessions = fs.readdirSync(FIX).filter(f => f.endsWith('.json') && !f.includes('search'))
    .map(f => ({ f, j: JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')) })).filter(s => s.j.rawFixes?.length);
  const rows: string[] = [];
  const res = sessions.map(({ f, j }) => {
    const before = run(j.rawFixes, 'legacy');
    const after = run(j.rawFixes, 'turn-aware');
    rows.push(`${f.padEnd(26)} Distanz BEFORE ${before.legacyDist.toFixed(2)} m → AFTER ${after.canonical.toFixed(2)} m` +
      `   (Geometrie ${before.geometryM.toFixed(2)} → ${after.geometryM.toFixed(2)} m, Punkte ${before.points} → ${after.points})`);
    return { f, before, after, j };
  });

  it('11 Läufe mit Rohfixen', () => { expect(res.length).toBe(11); console.log('\n[DISTANZ BEFORE/AFTER]\n' + rows.join('\n') + '\n'); });

  it('die kanonische Distanz ist mit der Legacy-Distanz identisch (Δ ≤ 0,2 %; Rest = Haversine vs. planare Näherung der Testsumme)', () => {
    for (const r of res) expect(Math.abs(r.after.canonical - r.before.legacyDist) / r.before.legacyDist).toBeLessThanOrEqual(0.002);
  });

  it('die Geometrie darf länger werden — die Distanz nicht', () => {
    let geomGrew = 0;
    for (const r of res) { if (r.after.geometryM > r.before.geometryM + 0.5) geomGrew++; }
    expect(geomGrew).toBeGreaterThan(0);   // sonst prüft der Test nichts
  });

  it('Persistenzdichte-Wechsel (Gate 0,5 / 0,8 / 1,5 / 2,0 / 3,0 m) ändert die kanonische Distanz nicht', () => {
    for (const { j } of res) {
      const base = run(j.rawFixes, 'fixed:2').canonical;
      for (const g of [0.5, 0.8, 1.5, 3.0]) expect(run(j.rawFixes, `fixed:${g}`).canonical).toBeCloseTo(base, 6);
    }
  });

  it('Kontrast: als Distanzquelle würde die dichte Geometrie GPS-Wackeln addieren', () => {
    const inflated = res.filter(r => r.after.geometryM > r.before.legacyDist * 1.05).length;
    expect(inflated).toBeGreaterThan(0);
  });
});

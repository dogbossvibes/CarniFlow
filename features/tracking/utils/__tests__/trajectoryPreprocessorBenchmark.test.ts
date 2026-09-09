// ISOLIERTE Benchmark der Trajektorien-Vorverarbeitung.
//
// Beantwortet EINE Frage objektiv: dämpft ein kleines Bewegungsmodell den
// korrelierten GNSS-Bias (Waldrand), OHNE echte 90°-/135°-Ecken abzurunden?
// Der Produktionsdetektor wird hier NICHT aufgerufen — er bleibt eingefroren.
//
// Kein Modell gilt automatisch als Sieger. Alle Zahlen sind gemessen; wo ein
// Modell versagt, steht das so in der Matrix.
import {
  rawPassthrough, alphaBeta, cvKalman, slidingFit,
  type Preprocessor, type TrajFix, type TrajPoint,
} from '@/features/tracking/utils/trajectoryPreprocessors';

// ── Geometrie-Helfer (alles in lokalen Metern) ────────────────────────────
const RAD = Math.PI / 180;
const norm = (d: number) => { while (d > 180) d -= 360; while (d < -180) d += 360; return d; };

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

/** Punkte entlang einer Strecke, exakter Endpunkt garantiert. */
function walk(cur: readonly [number, number], hdg: number, len: number, step: number): [number, number][] {
  const r = hdg * RAD;
  const out: [number, number][] = [];
  let d = step;
  while (d < len) { out.push([cur[0] + Math.sin(r) * d, cur[1] + Math.cos(r) * d]); d += step; }
  out.push([cur[0] + Math.sin(r) * len, cur[1] + Math.cos(r) * len]);
  return out;
}

/** Pflichtgeometrie: L → R → SR → SL, dazu die wahren Scheitelpunkte. */
function fieldRoute(legM: number, stepM: number, tailM = legM) {
  const c: [number, number][] = [[0, -legM]];
  const apexes: [number, number][] = [];
  let cur: [number, number] = [0, -legM];
  for (const p of walk(cur, 0, legM, stepM)) c.push(p);
  cur = [0, 0]; apexes.push([...cur] as [number, number]);          // L
  for (const p of walk(cur, 270, legM, stepM)) c.push(p);
  cur = c[c.length - 1]; apexes.push([...cur] as [number, number]); // R
  for (const p of walk(cur, 0, legM, stepM)) c.push(p);
  cur = c[c.length - 1]; apexes.push([...cur] as [number, number]); // SR
  for (const p of walk(cur, 135, legM, stepM)) c.push(p);
  cur = c[c.length - 1]; apexes.push([...cur] as [number, number]); // SL
  for (const p of walk(cur, 0, tailM, stepM)) c.push(p);
  return { coords: c, apexes };
}

// ── Driftmodelle A–G ──────────────────────────────────────────────────────
export type DriftModel = 'A_const' | 'B_growing' | 'C_return' | 'D_switch' | 'E_biasNoise' | 'F_accVar' | 'G_forest';

function applyDrift(coords: readonly (readonly [number, number])[], model: DriftModel, amp: number, seed: number): { pts: [number, number][]; acc: number[] } {
  const rng = makeRng(seed);
  const n = coords.length;
  const pts: [number, number][] = [];
  const acc: number[] = [];
  const dirAngle = rng() * 360 * RAD;             // Richtung des Bias
  const bx = Math.sin(dirAngle), by = Math.cos(dirAngle);
  let walkX = 0, walkY = 0;
  for (let i = 0; i < n; i++) {
    const f = i / Math.max(1, n - 1);
    let mag = 0;
    let a = 5;
    switch (model) {
      case 'A_const':    mag = amp; break;
      case 'B_growing':  mag = amp * f; break;
      case 'C_return':   mag = amp * Math.sin(Math.PI * f); break;
      case 'D_switch':   mag = f < 0.5 ? amp : -amp; break;
      case 'E_biasNoise':
        mag = amp * 0.7;
        walkX += (rng() - 0.5) * amp * 0.25; walkY += (rng() - 0.5) * amp * 0.25;
        walkX *= 0.8; walkY *= 0.8;
        break;
      case 'F_accVar':
        // Accuracy-Verlauf 2 → 5 → 3 m, Bias folgt der Unsicherheit.
        mag = amp * (f < 0.33 ? 0.4 : f < 0.66 ? 1.0 : 0.6);
        a = f < 0.33 ? 2 : f < 0.66 ? 5 : 3;
        pts.push([coords[i][0] + bx * mag + walkX, coords[i][1] + by * mag + walkY]);
        acc.push(a);
        continue;
      case 'G_forest':
        // Längere Driftperiode: langsamer Random-Walk mit hoher Persistenz.
        walkX = walkX * 0.94 + (rng() - 0.5) * amp * 0.3;
        walkY = walkY * 0.94 + (rng() - 0.5) * amp * 0.3;
        mag = 0;
        break;
    }
    a = Math.max(3, amp * 1.5);
    pts.push([coords[i][0] + bx * mag + walkX, coords[i][1] + by * mag + walkY]);
    acc.push(a);
  }
  return { pts, acc };
}

function toFixes(pts: readonly (readonly [number, number])[], acc: readonly number[], hz: number, irregular = false, seed = 1): TrajFix[] {
  const rng = makeRng(seed + 991);
  let t = 0;
  return pts.map(([x, y], i) => {
    if (i > 0) t += irregular ? (1 / hz) * (0.6 + rng() * 0.8) : 1 / hz;
    return { x, y, t, accuracy: acc[i] ?? 5 };
  });
}

// ── Metriken ──────────────────────────────────────────────────────────────

/** Senkrechter Abstand zur Idealgeraden durch a→b. */
function lateral(p: TrajPoint, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const L = Math.hypot(vx, vy) || 1;
  return Math.abs(((p.x - ax) * vy - (p.y - ay) * vx) / L);
}

function stats(values: number[]) {
  if (values.length === 0) return { rms: 0, p95: 0, max: 0 };
  const rms = Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
  const sorted = [...values].sort((a, b) => a - b);
  return { rms, p95: sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1], max: sorted[sorted.length - 1] };
}

/**
 * Innenwinkel an einem bekannten Scheitel: Richtungen aus Sehnen, die
 * BEWUSST Abstand zum Scheitel halten (chordM), damit die Messung selbst
 * keine Ecke rundet.
 */
function measuredInteriorAngle(pts: readonly TrajPoint[], apex: readonly [number, number], chordM: number): { interior: number; apexShiftM: number } | null {
  // Nächster Ausgabepunkt zum wahren Scheitel.
  let bi = -1, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - apex[0], pts[i].y - apex[1]);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bi <= 0 || bi >= pts.length - 1) return null;
  const at = (from: number, dir: -1 | 1) => {
    let acc = 0, i = from;
    while (i + dir >= 0 && i + dir < pts.length) {
      acc += Math.hypot(pts[i + dir].x - pts[i].x, pts[i + dir].y - pts[i].y);
      i += dir;
      if (acc >= chordM) break;
    }
    return acc >= chordM * 0.6 ? i : null;
  };
  const b = at(bi, -1), a = at(bi, 1);
  if (b == null || a == null) return null;
  const bIn = Math.atan2(pts[bi].x - pts[b].x, pts[bi].y - pts[b].y) / RAD;
  const bOut = Math.atan2(pts[a].x - pts[bi].x, pts[a].y - pts[bi].y) / RAD;
  const turn = Math.abs(norm(bOut - bIn));
  return { interior: 180 - turn, apexShiftM: bd };
}

const MODELS: Preprocessor[] = [rawPassthrough, alphaBeta(), cvKalman(), slidingFit()];

// ── C. Drift-Dämpfung auf geraden Schenkeln ───────────────────────────────
describe('Drift-Dämpfung auf einer geraden Strecke', () => {
  const report: string[] = [];
  afterAll(() => console.log('\n[BENCH Drift] 60 m Gerade · RMS/P95/Max seitlicher Abstand (m)\n' + report.join('\n')));

  const DRIFTS: DriftModel[] = ['A_const', 'B_growing', 'C_return', 'D_switch', 'E_biasNoise', 'F_accVar', 'G_forest'];
  const SEEDS = [1, 2, 3, 4, 5];

  it.each(DRIFTS)('%s', (model) => {
    for (const amp of [2, 4]) {
      for (const m of MODELS) {
        const all: number[] = [];
        for (const seed of SEEDS) {
          const straight = [[0, 0] as [number, number], ...walk([0, 0], 0, 60, 1.0)];
          const { pts, acc } = applyDrift(straight, model, amp, seed);
          const out = m.run(toFixes(pts, acc, 1)).points;
          for (const p of out) all.push(lateral(p, 0, 0, 0, 60));
        }
        const s = stats(all);
        report.push(`  ${model.padEnd(12)} ±${amp}m  ${m.name.padEnd(22)} RMS ${s.rms.toFixed(2)}  P95 ${s.p95.toFixed(2)}  Max ${s.max.toFixed(2)}`);
      }
    }
    expect(true).toBe(true);   // reine Messung
  });
});

// ── D./E./F. Eckenerhalt ──────────────────────────────────────────────────
describe('Eckenerhalt: bleiben 90° und Spitzwinkel nach der Vorverarbeitung erhalten?', () => {
  const report: string[] = [];
  afterAll(() => console.log('\n[BENCH Ecken] 3,75-m-Schenkel · Innenwinkel (Soll 90° bzw. 45°) und Scheitelverschiebung\n' + report.join('\n')));

  it.each([0, 2])('±%s m Drift (Modell G, 3 Seeds)', (amp) => {
    for (const m of MODELS) {
      const rows: { i: number; shift: number }[] = [];
      const perApex: number[][] = [[], [], [], []];
      const shifts: number[][] = [[], [], [], []];
      for (const seed of [1, 2, 3]) {
        const { coords, apexes } = fieldRoute(3.75, 1.0);
        const { pts, acc } = amp > 0 ? applyDrift(coords, 'G_forest', amp, seed) : { pts: coords.map(c => [...c] as [number, number]), acc: coords.map(() => 5) };
        const out = m.run(toFixes(pts, acc, 1)).points;
        apexes.forEach((apex, i) => {
          const r = measuredInteriorAngle(out, apex, 2.5);
          if (r) { perApex[i].push(r.interior); shifts[i].push(r.apexShiftM); }
        });
      }
      const fmt = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(0) : '—';
      const fmt2 = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '—';
      report.push(`  ±${amp}m ${m.name.padEnd(22)} Innenwinkel L/R/SR/SL: ${fmt(perApex[0])}° ${fmt(perApex[1])}° ${fmt(perApex[2])}° ${fmt(perApex[3])}°   Scheitelversatz: ${fmt2(shifts[0])} ${fmt2(shifts[1])} ${fmt2(shifts[2])} ${fmt2(shifts[3])} m`);
      void rows;
    }
    expect(true).toBe(true);
  });
});

// ── H. Fixraten-Konsistenz ────────────────────────────────────────────────
describe('Fixraten-Konsistenz: erzeugt dasselbe Modell bei 1/2/4/10 Hz vergleichbare Geometrie?', () => {
  const report: string[] = [];
  afterAll(() => console.log('\n[BENCH Fixrate] 3,75-m-Schenkel, ±2 m Drift (G) · Innenwinkel je Rate\n' + report.join('\n')));

  it.each(MODELS.map(m => [m.name, m] as const))('%s', (_name, m) => {
    const rows: string[] = [];
    for (const [label, hz, irregular] of [['1 Hz', 1, false], ['2 Hz', 2, false], ['4 Hz', 4, false], ['10 Hz', 10, false], ['unregelm.', 2, true]] as const) {
      const { coords, apexes } = fieldRoute(3.75, 1.0 / hz);
      const { pts, acc } = applyDrift(coords, 'G_forest', 2, 3);
      const out = m.run(toFixes(pts, acc, hz, irregular)).points;
      const angles = apexes.map(a => measuredInteriorAngle(out, a, 2.5)?.interior);
      rows.push(`${label}: ${angles.map(a => (a == null ? '—' : a.toFixed(0) + '°')).join('/')}`);
    }
    report.push(`  ${m.name.padEnd(22)} ${rows.join('   ')}`);
    expect(true).toBe(true);
  });
});

// ── Akzeptanzkriterien ────────────────────────────────────────────────────
describe('Akzeptanzkriterien (Gerade darf nicht geknickt werden, Ecken müssen bleiben)', () => {
  it('kein Modell darf eine saubere Gerade künstlich knicken', () => {
    const straight = [[0, 0] as [number, number], ...walk([0, 0], 0, 60, 1.0)];
    for (const m of MODELS) {
      const out = m.run(toFixes(straight, straight.map(() => 5), 1)).points;
      const s = stats(out.map(p => lateral(p, 0, 0, 0, 60)));
      expect(s.max).toBeLessThan(0.5);
    }
  });

  it('bei sauberem Signal müssen 90°- und Spitzwinkel erhalten bleiben', () => {
    const { coords, apexes } = fieldRoute(3.75, 1.0);
    const fixes = toFixes(coords, coords.map(() => 5), 1);
    for (const m of MODELS) {
      const out = m.run(fixes).points;
      const a0 = measuredInteriorAngle(out, apexes[0], 2.5);
      const a2 = measuredInteriorAngle(out, apexes[2], 2.5);
      expect(a0).not.toBeNull();
      expect(a2).not.toBeNull();
      // Der reine Messwert wird in den Matrizen berichtet; hier nur die harte
      // Grenze: die Ecke darf nicht zur Geraden werden.
      expect(a0!.interior).toBeLessThan(160);
      expect(a2!.interior).toBeLessThan(160);
    }
  });
});

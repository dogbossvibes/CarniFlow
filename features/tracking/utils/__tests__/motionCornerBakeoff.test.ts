// Bakeoff Phase 2: GPS-Detector allein  vs.  GPS-Detector + Motion-Evidenz.
//
// WICHTIG — der CURRENT-Detector wird NICHT verändert und NICHT umgangen:
// `detectShortLegCorners` läuft unverändert. Die Motion-Kopplung passiert
// ausserhalb, auf den vom Detector gelieferten Diagnosen:
//   1. Detector bewertet jeden Scheitelkandidaten und liefert `confidence`
//      + `classification` + `rejectReason`.
//   2. Motion verschiebt NUR diese `confidence` (applyMotionToConfidence,
//      max ±0,12).
//   3. Dieselbe Akzeptanzschwelle (ACCEPT_SCORE) und dieselbe
//      Nicht-Maximum-Unterdrückung (CORNER_GAP_M) werden danach erneut
//      angewendet.
// Damit ist strukturell ausgeschlossen, dass Motion einen Kandidaten erzeugt,
// den die Geometrie nicht hervorgebracht hat: ohne `classification` gibt es
// keinen Kandidaten, und Motion setzt keine.

import {
  detectShortLegCorners, DETECTOR_INPUT, ACCEPT_SCORE, CORNER_GAP_M,
  type ShortLegPoint, type ShortLegDiagnostics,
} from '@/features/tracking/utils/shortLegCornerDetection';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import {
  computeTurnEvidence, applyMotionToConfidence, TURN_EVIDENCE_DEFAULTS,
  type MotionWindowSample,
} from '@/features/tracking/utils/motionTurnEvidence';
import { simulate, pulse, ZERO, WALK, HAND, T0, type Program } from './helpers/motionScenarioSim';

const M_PER_DEG = 111320;
const RAD = Math.PI / 180;
const DETECT_GATE_M = DETECTOR_INPUT.minStepM;
const SPEED_MPS = 1.3;         // Gehtempo des Fährtenlegers
const TURN_DUR_S = 1.2;        // Dauer einer 90°-Körperdrehung im Gehen

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// ── GPS-Route (identisch zum Detector-Test, zusätzlich mit echter Zeitachse) ─
interface RawPt { x: number; y: number; trueDist: number }

function walk(cursor: readonly [number, number], headingDeg: number, len: number, stepM: number, dist0: number): RawPt[] {
  const r = headingDeg * RAD;
  const out: RawPt[] = [];
  let d = stepM;
  while (d < len) { out.push({ x: cursor[0] + Math.sin(r) * d, y: cursor[1] + Math.cos(r) * d, trueDist: dist0 + d }); d += stepM; }
  out.push({ x: cursor[0] + Math.sin(r) * len, y: cursor[1] + Math.cos(r) * len, trueDist: dist0 + len });
  return out;
}

/** Feldschema L → R → SR → SL. Liefert zusätzlich die wahren Eckzeitpunkte. */
function fieldRoute(legM: number, stepM: number): { pts: RawPt[]; cornerTimesMs: number[]; turnsDeg: number[] } {
  const pts: RawPt[] = [{ x: 0, y: -legM, trueDist: 0 }];
  let dist = 0;
  let cur: [number, number] = [0, -legM];
  for (const p of walk(cur, 0, legM, stepM, dist)) pts.push(p);
  dist += legM;
  const headings = [270, 0, 135, 0];
  for (const hdg of headings) {
    cur = [pts[pts.length - 1].x, pts[pts.length - 1].y];
    for (const p of walk(cur, hdg, legM, stepM, dist)) pts.push(p);
    dist += legM;
  }
  // Ecken liegen bei den wahren Weglängen legM, 2·legM, 3·legM, 4·legM.
  const cornerTimesMs = [1, 2, 3, 4].map(k => T0 + (k * legM / SPEED_MPS) * 1000);
  // Richtungsänderungen in derselben Reihenfolge (Vorzeichen nur intern).
  return { pts, cornerTimesMs, turnsDeg: [-90, +90, +135, -135] };
}

function applyCorrelatedDrift(pts: readonly RawPt[], amplitudeM: number, seed: number): RawPt[] {
  if (amplitudeM <= 0) return pts.map(p => ({ ...p }));
  const rng = makeRng(seed);
  let dx = (rng() - 0.5) * amplitudeM, dy = (rng() - 0.5) * amplitudeM;
  return pts.map(p => {
    dx = dx * 0.85 + (rng() - 0.5) * amplitudeM * 0.5;
    dy = dy * 0.85 + (rng() - 0.5) * amplitudeM * 0.5;
    return { x: p.x + dx, y: p.y + dy, trueDist: p.trueDist };
  });
}

/** Detektor-Puffer wie im Recorder — Zeitstempel aus dem WAHREN Weg/Tempo. */
function detectorPoints(raw: readonly RawPt[], accuracy = 5): ShortLegPoint[] {
  const a = DETECTOR_INPUT.emaAlpha;
  let ema: [number, number] | null = null, last: [number, number] | null = null, cum = 0;
  const out: ShortLegPoint[] = [];
  for (const p of raw) {
    ema = ema ? [ema[0] + a * (p.x - ema[0]), ema[1] + a * (p.y - ema[1])] : [p.x, p.y];
    const t = T0 + (p.trueDist / SPEED_MPS) * 1000;
    if (!last) { last = ema; out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: 0, accuracy, t }); continue; }
    const s = Math.hypot(ema[0] - last[0], ema[1] - last[1]);
    if (s < DETECT_GATE_M) continue;
    cum += s; last = ema;
    out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: cum, accuracy, t });
  }
  return out;
}

// ── Motion passend zur Route ──────────────────────────────────────────────
function routeMotion(legM: number, seed: number, extra?: Partial<Program>): MotionWindowSample[] {
  const { cornerTimesMs, turnsDeg } = fieldRoute(legM, 1.0);
  const cornerS = cornerTimesMs.map(t => (t - T0) / 1000);
  const prog: Program = {
    yawRateDps: (t) => cornerS.reduce(
      (acc, cs, i) => acc + pulse(t, cs - TURN_DUR_S / 2, cs + TURN_DUR_S / 2, turnsDeg[i]), 0,
    ) + (extra?.yawRateDps?.(t) ?? 0),
    offAxisRadS: extra?.offAxisRadS ?? ZERO,
    stepRate: extra?.stepRate ?? WALK,
  };
  const durationS = cornerS[cornerS.length - 1] + legM / SPEED_MPS + 3;
  return simulate(durationS, prog, HAND, seed);
}

/** Motion für eine reine Gerade — nur Gangrauschen, keine Drehung. */
function straightMotion(durationS: number, seed: number, extra?: Partial<Program>): MotionWindowSample[] {
  return simulate(durationS, {
    yawRateDps: extra?.yawRateDps ?? ZERO,
    offAxisRadS: extra?.offAxisRadS ?? ZERO,
    stepRate: extra?.stepRate ?? WALK,
  }, HAND, seed);
}

// ── Akzeptanz mit Motion, AUSSERHALB des Detectors ────────────────────────
function acceptWithMotion(
  diagnostics: readonly ShortLegDiagnostics[],
  points: readonly ShortLegPoint[],
  motion: readonly MotionWindowSample[],
): { kinds: AngleKind[]; boosted: number; damped: number } {
  const cumAt = new Map<number, number>();
  points.forEach(p => { if (p.t != null) cumAt.set(p.t, p.cumDist); });

  let boosted = 0, damped = 0;
  const scored: { kind: AngleKind; atM: number; conf: number }[] = [];
  for (const d of diagnostics) {
    // Ohne Klassifikation gibt es keinen Kandidaten — Motion ändert daran nichts.
    if (!d.classification || d.t == null) continue;
    const ev = computeTurnEvidence(motion, d.t, TURN_EVIDENCE_DEFAULTS);
    const conf = applyMotionToConfidence(d.confidence, ev);
    if (conf > d.confidence) boosted++;
    if (conf < d.confidence) damped++;
    if (conf >= ACCEPT_SCORE) scored.push({ kind: d.classification, atM: cumAt.get(d.t) ?? 0, conf });
  }
  // Dieselbe NMS wie im Detector.
  scored.sort((a, b) => b.conf - a.conf || a.atM - b.atM);
  const taken: number[] = [];
  const kept: { kind: AngleKind; atM: number }[] = [];
  for (const c of scored) {
    if (taken.some(m => Math.abs(m - c.atM) < CORNER_GAP_M)) continue;
    taken.push(c.atM); kept.push(c);
  }
  kept.sort((a, b) => a.atM - b.atM);
  return { kinds: kept.map(k => k.kind), boosted, damped };
}

const EXPECTED: AngleKind[] = ['links', 'rechts', 'spitz_rechts', 'spitz_links'];
function scoreSequence(found: readonly AngleKind[]): number {
  let i = 0;
  for (const k of found) if (i < EXPECTED.length && k === EXPECTED[i]) i++;
  return i;
}

interface RunResult { gpsKinds: AngleKind[]; motKinds: AngleKind[]; gpsScore: number; motScore: number; boosted: number; damped: number }

function runBoth(legM: number, opts: { stepM?: number; drift?: number; seed?: number } = {}): RunResult {
  const stepM = opts.stepM ?? 1.0;
  const { pts } = fieldRoute(legM, stepM);
  const noisy = applyCorrelatedDrift(pts, opts.drift ?? 0, opts.seed ?? 1);
  const dp = detectorPoints(noisy);
  const { corners, diagnostics } = detectShortLegCorners(dp);
  const motion = routeMotion(legM, opts.seed ?? 1);
  const withMotion = acceptWithMotion(diagnostics, dp, motion);
  const gpsKinds = corners.map(c => c.kind);
  return {
    gpsKinds, motKinds: withMotion.kinds,
    gpsScore: scoreSequence(gpsKinds), motScore: scoreSequence(withMotion.kinds),
    boosted: withMotion.boosted, damped: withMotion.damped,
  };
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// ── 11. Driftmatrix ───────────────────────────────────────────────────────
describe('Driftmatrix: GPS allein vs. GPS + Motion (3,75 m Schenkel)', () => {
  const rows: string[] = [];
  afterAll(() => {
    console.log('\n[BAKEOFF Drift] 3,75 m · 10 Seeds\n' +
      'Drift |    GPS: 4/4  Ø-Winkel  fehlend  zusätzl. |  +Motion: 4/4  Ø-Winkel  fehlend  zusätzl. | boost/damp\n' +
      rows.join('\n') + '\n');
  });

  it.each([0, 1, 2, 3, 4, 5, 6])('±%s m', (drift) => {
    let gFull = 0, mFull = 0, gSum = 0, mSum = 0, gMiss = 0, mMiss = 0, gExtra = 0, mExtra = 0, boost = 0, damp = 0;
    for (const seed of SEEDS) {
      const r = runBoth(3.75, { drift, seed });
      if (r.gpsScore === 4) gFull++;
      if (r.motScore === 4) mFull++;
      gSum += r.gpsScore; mSum += r.motScore;
      gMiss += 4 - r.gpsScore; mMiss += 4 - r.motScore;
      gExtra += Math.max(0, r.gpsKinds.length - r.gpsScore);
      mExtra += Math.max(0, r.motKinds.length - r.motScore);
      boost += r.boosted; damp += r.damped;
    }
    const n = SEEDS.length;
    rows.push(
      `±${drift} m |      ${String(gFull).padStart(2)}/10     ${(gSum / n).toFixed(2)}      ${String(gMiss).padStart(2)}       ${String(gExtra).padStart(2)}     ` +
      `|        ${String(mFull).padStart(2)}/10     ${(mSum / n).toFixed(2)}      ${String(mMiss).padStart(2)}       ${String(mExtra).padStart(2)}     ` +
      `|   ${boost}/${damp}`,
    );
    // Messung, kein blindes Gate — die Zahlen stehen oben.
    expect(mFull).toBeGreaterThanOrEqual(0);
  });

  it('Motion verschlechtert die driftfreie Referenz nicht', () => {
    const r = runBoth(3.75, { drift: 0, seed: 1 });
    expect(r.motScore).toBeGreaterThanOrEqual(r.gpsScore);
  });
});

// ── 12. False-Positive-Batterie ───────────────────────────────────────────
describe('False-Positive-Batterie: Motion darf keine Ecke erfinden', () => {
  function straight(lengthM: number, drift: number, seed: number, motion: MotionWindowSample[]) {
    const raw: RawPt[] = [];
    for (let d = 0; d <= lengthM; d += 1.0) raw.push({ x: 0, y: d, trueDist: d });
    const dp = detectorPoints(applyCorrelatedDrift(raw, drift, seed));
    const { corners, diagnostics } = detectShortLegCorners(dp);
    const withMotion = acceptWithMotion(diagnostics, dp, motion);
    return { gps: corners.length, mot: withMotion.kinds.length };
  }

  const rows: string[] = [];
  afterAll(() => {
    console.log('\n[BAKEOFF False Positives] 60 m Gerade · 10 Seeds · erfundene Winkel gesamt\n' +
      'Fall                              | GPS | +Motion\n' + rows.join('\n') + '\n');
  });

  const DUR = 60 / SPEED_MPS + 3;
  const CASES: [string, number, (seed: number) => MotionWindowSample[]][] = [
    ['Gerade, keine Drift', 0, (s) => straightMotion(DUR, s)],
    ['Gerade, ±2 m Drift', 2, (s) => straightMotion(DUR, s)],
    ['Gerade, ±5 m Drift', 5, (s) => straightMotion(DUR, s)],
    ['Gerade ±5 m + Handy ansehen', 5, (s) => straightMotion(DUR, s, {
      yawRateDps: (t) => pulse(t, 20, 20.6, +18) + pulse(t, 22, 22.6, -12),
      offAxisRadS: (t) => (t >= 20 && t < 20.6) || (t >= 22 && t < 22.6) ? 2.4 : 0,
    })],
    ['Gerade ±5 m + bücken (Gegenstand)', 5, (s) => straightMotion(DUR, s, {
      stepRate: (t) => (t >= 20 && t < 23 ? 0 : 1.8),
      yawRateDps: (t) => pulse(t, 20.5, 21.2, +15) + pulse(t, 21.8, 22.5, -10),
      offAxisRadS: (t) => (t >= 20.4 && t < 22.6 ? 1.8 : 0),
    })],
    ['Gerade ±5 m + Stop-and-go', 5, (s) => straightMotion(DUR, s, {
      stepRate: (t) => (t >= 20 && t < 22 ? 0 : 1.8),
    })],
    ['Gerade ±5 m + Körperdrehung im Stand', 5, (s) => straightMotion(DUR, s, {
      stepRate: (t) => (t >= 20 && t < 23 ? 0 : 1.8),
      yawRateDps: (t) => pulse(t, 20.7, 22.2, +120),
    })],
    ['Gerade ±5 m + Handy um 90° drehen', 5, (s) => straightMotion(DUR, s, {
      yawRateDps: (t) => pulse(t, 20.5, 21.1, +90),
    })],
  ];

  it.each(CASES)('%s', (label, drift, motionFor) => {
    let gps = 0, mot = 0;
    for (const seed of SEEDS) {
      const r = straight(60, drift, seed, motionFor(seed));
      gps += r.gps; mot += r.mot;
    }
    rows.push(`${label.padEnd(34)}|  ${String(gps).padStart(2)} |   ${String(mot).padStart(2)}`);
    // Harte Zusage: Motion darf die GPS-Fehlalarme NIE erhöhen.
    expect(mot).toBeLessThanOrEqual(gps);
  });
});

// ── 13. Fixraten (10-Hz-Problem getrennt halten) ──────────────────────────
describe('Fixraten: verändert Motion die 10-Hz-Matrix?', () => {
  const rows: string[] = [];
  afterAll(() => {
    console.log('\n[BAKEOFF Fixrate] 3,75 m Schenkel, keine Drift\n' +
      'Rate           | GPS | +Motion\n' + rows.join('\n') + '\n');
  });

  it.each([
    ['1 Hz', 1.0], ['2 Hz', 0.5], ['4 Hz', 0.25], ['10 Hz', 0.1],
  ])('%s', (label, stepM) => {
    const r = runBoth(3.75, { stepM });
    rows.push(`${String(label).padEnd(15)}| ${r.gpsScore}/4 |   ${r.motScore}/4`);
    expect(r.motScore).toBeGreaterThanOrEqual(r.gpsScore);
  });

  it('10 Hz bleibt ein eigenständiges Geometrieproblem — Motion löst es nicht', () => {
    const { pts } = fieldRoute(3.75, 0.1);
    const dp = detectorPoints(pts);
    const { diagnostics } = detectShortLegCorners(dp);
    const reasons = new Map<string, number>();
    for (const d of diagnostics) {
      const k = d.rejectReason ?? 'accepted';
      reasons.set(k, (reasons.get(k) ?? 0) + 1);
    }
    const classified = diagnostics.filter(d => d.classification != null).length;
    console.log('\n[10 Hz] Ablehnungsgründe: ' +
      [...reasons.entries()].map(([k, v]) => `${k}=${v}`).join(' · ') +
      `  → klassifizierte Kandidaten (überhaupt für Motion erreichbar): ${classified}\n`);

    const r = runBoth(3.75, { stepM: 0.1 });
    // GEMESSEN: Motion hebt 0/4 auf 1/4 — genau die EINE Ecke, die es bis zur
    // Confidence-Stufe geschafft hatte. Die übrigen scheitern vorher an
    // no_window_*/turn_below_noise, wo die Kopplung konstruktionsbedingt nicht
    // greift. 1/4 ist weiterhin ein Ausfall: das 10-Hz-Problem bleibt offen und
    // wird eigenständig gelöst.
    expect(r.gpsScore).toBe(0);
    expect(r.motScore).toBe(1);
    expect(r.motScore).toBeLessThan(4);
    expect(classified).toBeGreaterThan(0);
  });
});

// ── Struktur-Zusage ───────────────────────────────────────────────────────
describe('Struktur: Motion erzeugt niemals einen Kandidaten', () => {
  it('ohne klassifizierten GPS-Kandidaten bleibt die Ausgabe leer — auch bei maximaler Rotation', () => {
    const raw: RawPt[] = [];
    for (let d = 0; d <= 40; d += 1.0) raw.push({ x: 0, y: d, trueDist: d });
    const dp = detectorPoints(raw);
    const { diagnostics } = detectShortLegCorners(dp);
    // Dauerrotation über die gesamte Strecke — maximal mögliche Turn-Evidenz.
    const spin = straightMotion(40 / SPEED_MPS + 3, 1, { yawRateDps: () => 80 });
    expect(acceptWithMotion(diagnostics, dp, spin).kinds).toEqual([]);
  });
});

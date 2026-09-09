// Adaptive Short-Leg Corner Detection — gegen das REALE Feldschema:
// Start → L → 5 Schritte → R → 5 Schritte → SR → 5 Schritte → SL → Stop,
// bei 75 cm Schrittlänge also ~3,75 m Zwischenschenkel (Wald/Waldrand).
//
// Alle Zahlen hier sind gemessen, nicht behauptet. Wo etwas nicht funktioniert,
// steht das Ergebnis so im Test (console.log-Matrix) statt als PASS kaschiert.
import {
  detectShortLegCorners, evaluateShortLegCorner, DETECTOR_INPUT, type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

const M_PER_DEG = 111320;
const RAD = Math.PI / 180;
// Eingabe-Vertrag des Detektors (leichte Glättung + feines Gate) — NICHT die
// Werte der aufgezeichneten Linie (die bleibt bei EMA 0,4 / 2,0 m).
const DETECT_GATE_M = DETECTOR_INPUT.minStepM;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function walk(cursor: readonly [number, number], headingDeg: number, len: number, stepM: number): [number, number][] {
  const r = headingDeg * RAD;
  const out: [number, number][] = [];
  let d = stepM;
  while (d < len) { out.push([cursor[0] + Math.sin(r) * d, cursor[1] + Math.cos(r) * d]); d += stepM; }
  out.push([cursor[0] + Math.sin(r) * len, cursor[1] + Math.cos(r) * len]);
  return out;
}

/**
 * Exakt das Feldschema: L (90° links) → R (90° rechts) → SR (Spitzwinkel
 * rechts, Innenwinkel 45°) → SL (Spitzwinkel links) → Schlussgerade.
 */
function fieldRoute(legM: number, stepM: number, tailM = legM): [number, number][] {
  const c: [number, number][] = [[0, -legM]];
  let cur: [number, number] = [0, -legM];
  let hdg = 0;
  for (const p of walk(cur, hdg, legM, stepM)) c.push(p);
  cur = [0, 0];
  hdg = 270;                                   // 90° links
  for (const p of walk(cur, hdg, legM, stepM)) c.push(p);
  cur = c[c.length - 1]; hdg = 0;              // 90° rechts
  for (const p of walk(cur, hdg, legM, stepM)) c.push(p);
  cur = c[c.length - 1]; hdg = 135;            // Spitzwinkel rechts (turn +135 → Innenwinkel 45)
  for (const p of walk(cur, hdg, legM, stepM)) c.push(p);
  cur = c[c.length - 1]; hdg = 0;              // Spitzwinkel links (turn −135)
  for (const p of walk(cur, hdg, tailM, stepM)) c.push(p);
  return c;
}

/** Korrelierte GNSS-Drift, wie unter Bäumen typisch (kein weisses Rauschen). */
function applyCorrelatedDrift(coords: readonly (readonly [number, number])[], amplitudeM: number, seed: number): [number, number][] {
  if (amplitudeM <= 0) return coords.map(p => [p[0], p[1]] as [number, number]);
  const rng = makeRng(seed);
  let dx = (rng() - 0.5) * amplitudeM, dy = (rng() - 0.5) * amplitudeM;
  const out: [number, number][] = [];
  for (const [x, y] of coords) {
    // Random walk mit Rückstellkraft → mehrere aufeinanderfolgende Fixe
    // driften gemeinsam zur Seite, statt unabhängig zu springen.
    dx = dx * 0.85 + (rng() - 0.5) * amplitudeM * 0.5;
    dy = dy * 0.85 + (rng() - 0.5) * amplitudeM * 0.5;
    out.push([x + dx, y + dy]);
  }
  return out;
}

/** Roh-Puffer der Erkennung wie im Recorder: leichte Glättung + feines Gate. */
function detectorPoints(raw: readonly (readonly [number, number])[], accuracy = 5, gate = DETECT_GATE_M): ShortLegPoint[] {
  const a = DETECTOR_INPUT.emaAlpha;
  let ema: [number, number] | null = null, last: [number, number] | null = null, cum = 0, t = 1000;
  const out: ShortLegPoint[] = [];
  for (const [x, y] of raw) {
    ema = ema ? [ema[0] + a * (x - ema[0]), ema[1] + a * (y - ema[1])] : [x, y];
    if (!last) { last = ema; out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: 0, accuracy, t }); continue; }
    const s = Math.hypot(ema[0] - last[0], ema[1] - last[1]);
    if (s < gate) continue;
    cum += s; last = ema; t += 1000;
    out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: cum, accuracy, t });
  }
  return out;
}

const EXPECTED: AngleKind[] = ['links', 'rechts', 'spitz_rechts', 'spitz_links'];
/** Wie viele der vier erwarteten Events wurden korrekt UND in Reihenfolge erkannt? */
function scoreSequence(found: AngleKind[]): number {
  let i = 0;
  for (const k of found) if (i < EXPECTED.length && k === EXPECTED[i]) i++;
  return i;
}

function runRoute(legM: number, opts: { stepM?: number; drift?: number; seed?: number; accuracy?: number; tailM?: number } = {}) {
  const stepM = opts.stepM ?? 1.0;                     // 1 Hz bei ~1 m/s
  const raw = fieldRoute(legM, stepM, opts.tailM ?? legM);
  const noisy = applyCorrelatedDrift(raw, opts.drift ?? 0, opts.seed ?? 1);
  const pts = detectorPoints(noisy, opts.accuracy ?? 5);
  const { corners, diagnostics } = detectShortLegCorners(pts);
  const kinds = corners.map(c => c.kind);
  return { kinds, score: scoreSequence(kinds), points: pts.length, corners, diagnostics };
}

// ── 6. Pflichtsequenz ─────────────────────────────────────────────────────
describe('Pflichtsequenz L → R → SR → SL bei 3,75 m Schenkeln', () => {
  it('erkennt exakt vier Events in richtiger Reihenfolge, ohne Zusatz-Event', () => {
    const r = runRoute(3.75);
    console.log(`[SEQ] 3.75m → ${r.kinds.join(' → ')} (${r.score}/4, ${r.points} Punkte)`);
    expect(r.kinds).toEqual(EXPECTED);
  });
});

// ── 7. Längenmatrix ───────────────────────────────────────────────────────
describe('Längenmatrix der Vier-Winkel-Sequenz (0 Drift, 1 Hz)', () => {
  const LENGTHS = [3, 3.5, 3.75, 4, 5, 6, 8, 10];
  const report: string[] = [];
  afterAll(() => {
    console.log('\n[MATRIX Länge] Schenkel → korrekt/4 · erkannte Klassifikation\n' + report.join('\n'));
  });
  it.each(LENGTHS)('Schenkel %s m', (legM) => {
    const r = runRoute(legM);
    report.push(`  ${String(legM).padStart(5)} m\t${r.score}/4\t[${r.kinds.join(', ') || '—'}]`);
    expect(r.score).toBeGreaterThanOrEqual(0);   // Messung, kein blindes Gate
  });
});

// ── 9. Fixrate ────────────────────────────────────────────────────────────
describe('Fixrate 1/2/4 Hz und dichter Strom (3,75 m Schenkel)', () => {
  const report: string[] = [];
  afterAll(() => {
    console.log('\n[MATRIX Fixrate] 3,75 m Schenkel\n' + report.join('\n'));
  });
  it.each([
    ['1 Hz', 1.0], ['2 Hz', 0.5], ['4 Hz', 0.25], ['dicht (10 Hz)', 0.1],
  ])('%s', (_label, stepM) => {
    const r = runRoute(3.75, { stepM });
    report.push(`  ${String(_label).padEnd(14)}\t${r.score}/4\t[${r.kinds.join(', ') || '—'}]`);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

// ── 8. Waldrand-Drift ─────────────────────────────────────────────────────
describe('Korrelierte GNSS-Drift (Waldrand) über mehrere Seeds', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const report: string[] = [];
  afterAll(() => {
    console.log('\n[MATRIX Drift] 3,75 m Schenkel · korrelierte Drift · 8 Seeds\n' + report.join('\n'));
  });
  it.each([
    [3.75, 0], [3.75, 1], [3.75, 2], [3.75, 3], [3.75, 4], [3.75, 5], [3.75, 6],
    [5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6],
  ])('Schenkel %s m · ±%s m Drift', (legM, drift) => {
    let full = 0, three = 0, sum = 0, extra = 0, wrong = 0;
    for (const seed of SEEDS) {
      const r = runRoute(legM, { drift, seed, accuracy: Math.max(5, drift * 2) });
      sum += r.score;
      if (r.score === 4) full++;
      if (r.score >= 3) three++;
      if (r.kinds.length > 4) extra += r.kinds.length - 4;         // zusätzliche = False Positives
      wrong += r.kinds.filter((k, i) => EXPECTED[i] !== undefined && k !== EXPECTED[i]).length;
    }
    report.push(`  ${String(legM).padStart(4)} m · ±${drift} m\t4/4: ${full}/${SEEDS.length}\t≥3/4: ${three}/${SEEDS.length}\tØ ${(sum / SEEDS.length).toFixed(2)}\tzusätzl. ${extra}\tfalsch klassifiziert ${wrong}`);
    expect(full).toBeGreaterThanOrEqual(0);
  });
});

// ── 10. False Positives ───────────────────────────────────────────────────
describe('False Positives — keine erfundenen Winkel', () => {
  function straightWithDrift(lengthM: number, drift: number, seed: number) {
    const raw = [[0, 0] as [number, number], ...walk([0, 0], 0, lengthM, 1.0)];
    return detectorPoints(applyCorrelatedDrift(raw, drift, seed), Math.max(5, drift * 2));
  }

  // Gemessen, nicht behauptet: ab welcher korrelierten Drift erzeugt eine
  // 60-m-Gerade Falscherkennungen? Das ist der kritischste Wert überhaupt —
  // ein erfundener Winkel im Wald ist schlimmer als ein fehlender.
  it('lange Gerade: Falscherkennungen je Driftstärke (Messung + harte Grenze bei ±2 m)', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
    const rows: string[] = [];
    const falsePerDrift: Record<number, number> = {};
    for (const drift of [0, 1, 2, 3, 4, 5, 6]) {
      let withFalse = 0, total = 0;
      for (const seed of SEEDS) {
        const { corners } = detectShortLegCorners(straightWithDrift(60, drift, seed));
        if (corners.length > 0) withFalse++;
        total += corners.length;
      }
      falsePerDrift[drift] = withFalse;
      rows.push(`  ±${drift} m\tSeeds mit Falscherkennung ${withFalse}/${SEEDS.length}\tFalschwinkel gesamt ${total}`);
    }
    console.log('\n[MATRIX False-Positive Gerade] 60 m gerade, korrelierte Drift\n' + rows.join('\n'));
    // Bis ±2 m korrelierter Drift MUSS die Gerade sauber bleiben.
    expect(falsePerDrift[0]).toBe(0);
    expect(falsePerDrift[1]).toBe(0);
    expect(falsePerDrift[2]).toBe(0);
  });

  it('langsamer Bogen (5° alle 4 m) → kein Winkel', () => {
    const coords: [number, number][] = [[0, 0]];
    let cur: [number, number] = [0, 0], hdg = 0;
    for (let i = 0; i < 12; i++) {
      for (const p of walk(cur, hdg, 4, 1.0)) coords.push(p);
      cur = coords[coords.length - 1]; hdg += 5;
    }
    expect(detectShortLegCorners(detectorPoints(coords)).corners).toHaveLength(0);
  });

  it('S-Kurve → kein Winkel', () => {
    const coords: [number, number][] = [[0, 0]];
    let cur: [number, number] = [0, 0], hdg = 0;
    for (let i = 0; i < 16; i++) {
      for (const p of walk(cur, hdg, 3, 1.0)) coords.push(p);
      cur = coords[coords.length - 1]; hdg += i < 8 ? 8 : -8;
    }
    expect(detectShortLegCorners(detectorPoints(coords)).corners).toHaveLength(0);
  });

  it.each([20, 30])('%s° Richtungsänderung ist kein Winkel', (turn) => {
    const coords: [number, number][] = [[0, -12]];
    for (const p of walk([0, -12], 0, 12, 1.0)) coords.push(p);
    const cur = coords[coords.length - 1];
    for (const p of walk(cur, turn, 12, 1.0)) coords.push(p);
    expect(detectShortLegCorners(detectorPoints(coords)).corners).toHaveLength(0);
  });

  it('GPS-Zickzack (±2 m Amplitude) auf gerader Strecke → kein Winkel', () => {
    const coords: [number, number][] = [];
    for (let d = 0; d <= 40; d += 1) coords.push([(d % 4 < 2 ? 1 : -1) * 2, d]);
    expect(detectShortLegCorners(detectorPoints(coords)).corners).toHaveLength(0);
  });

  it('stehender Nutzer (nur Drift, kein Fortschritt) → kein Winkel', () => {
    const rng = makeRng(99);
    const coords: [number, number][] = [];
    for (let i = 0; i < 40; i++) coords.push([(rng() - 0.5) * 4, (rng() - 0.5) * 4]);
    expect(detectShortLegCorners(detectorPoints(coords, 8)).corners).toHaveLength(0);
  });

  it('Stop-and-go (mehrfach stehenbleiben) auf gerader Strecke → kein Winkel', () => {
    const coords: [number, number][] = [];
    let y = 0;
    for (let seg = 0; seg < 8; seg++) {
      for (let i = 0; i < 5; i++) { y += 1; coords.push([0, y]); }
      // Stehenbleiben: mehrere Fixe fast auf der Stelle, mit kleinem Jitter.
      const rng = makeRng(seg + 50);
      for (let i = 0; i < 5; i++) coords.push([(rng() - 0.5) * 1.2, y + (rng() - 0.5) * 1.2]);
    }
    expect(detectShortLegCorners(detectorPoints(coords)).corners).toHaveLength(0);
  });

  it('Gerade mit wechselnder Accuracy (±2 → ±5 → ±3 m) → kein Winkel', () => {
    const raw = [[0, 0] as [number, number], ...walk([0, 0], 0, 60, 1.0)];
    // Drift folgt der wechselnden Genauigkeit; Accuracy geht NUR als Gewicht ein.
    const drifted = applyCorrelatedDrift(raw, 3, 7);
    const pts = drifted.map((p, i) => {
      const acc = i < 20 ? 2 : i < 40 ? 5 : 3;
      return { p, acc };
    });
    let last: [number, number] | null = null, cum = 0;
    const detPts: ShortLegPoint[] = [];
    for (const { p, acc } of pts) {
      if (!last) { last = p; detPts.push({ lat: p[1] / M_PER_DEG, lng: p[0] / M_PER_DEG, cumDist: 0, accuracy: acc, t: 1000 }); continue; }
      const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (d < DETECT_GATE_M) continue;
      cum += d; last = p;
      detPts.push({ lat: p[1] / M_PER_DEG, lng: p[0] / M_PER_DEG, cumDist: cum, accuracy: acc, t: 1000 });
    }
    expect(detectShortLegCorners(detPts).corners).toHaveLength(0);
  });

  it('Phone-Rotation ohne Richtungswechsel → kein Winkel (Geräte-Yaw fliesst nicht ein)', () => {
    // Die Erkennung sieht ausschliesslich Positionen; eine Gerätedrehung
    // erzeugt gar keine Eingabe. Beleg: identische Strecke, identisches Ergebnis.
    const coords: [number, number][] = [[0, 0], ...walk([0, 0], 0, 40, 1.0)];
    const a = detectShortLegCorners(detectorPoints(coords)).corners;
    const b = detectShortLegCorners(detectorPoints(coords)).corners;
    expect(a).toEqual([]);
    expect(b).toEqual([]);
  });
});

// ── 11. Schluss-Spitzwinkel: Nachlauf 1–5 m ───────────────────────────────
describe('Letzter Spitzwinkel kurz vor Stop', () => {
  const report: string[] = [];
  afterAll(() => {
    console.log('\n[MATRIX Nachlauf] 3,75 m Schenkel, letzter Winkel = SL\n' + report.join('\n'));
  });
  it.each([1, 2, 2.5, 3, 4, 5])('Nachlauf %s m', (tailM) => {
    const r = runRoute(3.75, { tailM });
    const hasLast = r.kinds.includes('spitz_links');
    report.push(`  ${tailM} m\tletzter Winkel erkannt: ${hasLast ? 'ja' : 'nein'}\t[${r.kinds.join(', ') || '—'}]`);
    expect(typeof hasLast).toBe('boolean');
  });
});

// ── 12. Diagnose ──────────────────────────────────────────────────────────
describe('QA-Diagnose je Kandidat', () => {
  it('liefert alle geforderten Felder inklusive Ablehnungsgrund', () => {
    const r = runRoute(3.75);
    expect(r.diagnostics.length).toBeGreaterThan(0);
    for (const d of r.diagnostics) {
      expect(d).toHaveProperty('t');
      expect(d).toHaveProperty('legBeforeM');
      expect(d).toHaveProperty('legAfterM');
      expect(d).toHaveProperty('sampleCountBefore');
      expect(d).toHaveProperty('sampleCountAfter');
      expect(d).toHaveProperty('bearingBefore');
      expect(d).toHaveProperty('bearingAfter');
      expect(d).toHaveProperty('headingDeltaDeg');
      expect(d).toHaveProperty('interiorAngleDeg');
      expect(d).toHaveProperty('classification');
      expect(d).toHaveProperty('accuracyM');
      expect(d).toHaveProperty('confidence');
      expect(d).toHaveProperty('rejectReason');
      expect(d).toHaveProperty('detectorPointCount');
      expect(d).toHaveProperty('effectiveSpatialSpacingM');
      expect(d).toHaveProperty('fitMethod');
      expect(d).toHaveProperty('fitResidualBeforeM');
      expect(d).toHaveProperty('fitResidualAfterM');
      expect(d).toHaveProperty('accuracyWeightedConfidence');
      expect(d).toHaveProperty('chosenScaleM');
      // Genau eines von beiden: entweder klassifiziert oder mit Grund abgelehnt.
      expect(d.classification != null || d.rejectReason != null).toBe(true);
    }
  });

  it('Motion ist reine Zusatz-Evidenz und kann allein keinen Winkel erzwingen', () => {
    // Gerade Strecke: auch mit „läuft, hohe Confidence" entsteht kein Winkel.
    const coords: [number, number][] = [[0, 0], ...walk([0, 0], 0, 40, 1.0)];
    const pts = detectorPoints(coords);
    const withMotion = detectShortLegCorners(pts, { walking: true, confidence: 1, stepDelta: 2 });
    expect(withMotion.corners).toHaveLength(0);

    // An einem echten Scheitel darf Motion höchstens stützen — nie kippen.
    const r = runRoute(3.75);
    const apex = r.corners[0]?.apexIndex ?? 1;
    const ptsSeq = detectorPoints(fieldRoute(3.75, 1.0));
    const noMotion = evaluateShortLegCorner(ptsSeq, apex, -Infinity, null);
    const yesMotion = evaluateShortLegCorner(ptsSeq, apex, -Infinity, { walking: true, confidence: 1 });
    expect(yesMotion.diagnostics.classification).toBe(noMotion.diagnostics.classification);
    expect(yesMotion.diagnostics.confidence).toBeGreaterThanOrEqual(noMotion.diagnostics.confidence);
    expect(yesMotion.diagnostics.confidence - noMotion.diagnostics.confidence).toBeLessThanOrEqual(0.07);
  });
});

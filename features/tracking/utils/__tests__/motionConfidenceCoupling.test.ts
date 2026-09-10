// INTEGRIERTE Motion-Confidence-Kopplung (±0,12) im CURRENT-Detector.
//
// Übernommen wird ausschliesslich die in der Research-Runde vermessene
// Kopplung (applyMotionToConfidence). Sie greift NUR an der Confidence-Stufe
// — an einem Punkt, den ein Kandidat erst erreicht, wenn Fensterbildung,
// Turn, Signal-Rausch, Konzentration und Klassifikation bereits bestanden
// sind. Fensterbildung, no_window_*, NMS und Short-Leg-Geometrie sind
// unverändert.

import {
  detectShortLegCorners, evaluateShortLegCorner, ACCEPT_SCORE,
  type ShortLegPoint, type TurnEvidenceLookup,
} from '@/features/tracking/utils/shortLegCornerDetection';
import { computeTurnEvidence, COUPLING_DEFAULTS, type TurnEvidence } from '@/features/tracking/utils/motionTurnEvidence';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import {
  FIELD_TAIL_M, FIELD_EXPECTED, SEEDS,
  fieldRouteCoords, straightCoords, withDrift, fieldFixes, detectorBuffer,
  scoreSequence, makeRng,
} from './helpers/goldenRoute';
import { routeMotion, straightMotion, SPEED_MPS } from './helpers/goldenMotion';
import { pulse } from './helpers/motionScenarioSim';

const RAD = Math.PI / 180;

function lookupFor(motion: Parameters<typeof computeTurnEvidence>[0]): TurnEvidenceLookup {
  return (t) => (t == null ? null : computeTurnEvidence(motion, t));
}

function goldenPoints(seed: number, drift: number, tailM = FIELD_TAIL_M, spacing = 1.0): ShortLegPoint[] {
  return detectorBuffer(fieldFixes(withDrift(fieldRouteCoords(spacing, tailM), drift, seed), seed));
}

function meanCorrect(drift: number, withMotion: boolean, tailM = FIELD_TAIL_M): number {
  let sum = 0;
  for (const seed of SEEDS) {
    const pts = goldenPoints(seed, drift, tailM);
    const look = withMotion ? lookupFor(routeMotion(seed, tailM)) : undefined;
    const { corners } = detectShortLegCorners(pts, null, look);
    sum += scoreSequence(corners.map(c => c.kind as AngleKind));
  }
  return sum / SEEDS.length;
}

// ── 1. Harte Grenzen der Kopplung ────────────────────────────────────────
describe('Kopplung: harte Grenzen', () => {
  it('ohne Evidenz-Lookup verhält sich der Detector exakt wie vorher', () => {
    for (const seed of [1, 4, 7]) {
      const pts = goldenPoints(seed, 2);
      const a = detectShortLegCorners(pts);
      const b = detectShortLegCorners(pts, null, undefined);
      expect(b.corners).toEqual(a.corners);
      expect(b.diagnostics.map(d => d.confidence)).toEqual(a.diagnostics.map(d => d.confidence));
      // Ohne Motion bleibt die Verschiebung ungesetzt.
      expect(b.diagnostics.every(d => d.motionAdjustment == null || d.motionAdjustment === 0)).toBe(true);
    }
  });

  it('die Verschiebung überschreitet nie ±0,12', () => {
    let seen = 0;
    for (const seed of SEEDS) {
      for (const drift of [0, 2, 4]) {
        const pts = goldenPoints(seed, drift);
        const { diagnostics } = detectShortLegCorners(pts, null, lookupFor(routeMotion(seed, FIELD_TAIL_M)));
        for (const d of diagnostics) {
          if (d.motionAdjustment == null) continue;
          seen++;
          expect(Math.abs(d.motionAdjustment)).toBeLessThanOrEqual(COUPLING_DEFAULTS.maxBoost + 1e-9);
          expect(Math.abs(d.motionAdjustment)).toBeLessThanOrEqual(0.12 + 1e-9);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('starke GPS-Geometrie wird durch Motion nie gesenkt', () => {
    for (const seed of SEEDS) {
      const pts = goldenPoints(seed, 0);
      const { diagnostics } = detectShortLegCorners(pts, null, lookupFor(routeMotion(seed, FIELD_TAIL_M)));
      for (const d of diagnostics) {
        if (d.confidenceBeforeMotion == null || d.motionAdjustment == null) continue;
        if (d.confidenceBeforeMotion >= COUPLING_DEFAULTS.strongGpsConfidence) {
          expect(d.motionAdjustment).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('die Kopplung sitzt NUR an der Confidence-Stufe — vorher abgelehnte Gründe bleiben unberührt', () => {
    for (const seed of SEEDS) {
      const pts = goldenPoints(seed, 2);
      const look = lookupFor(routeMotion(seed, FIELD_TAIL_M));
      const withM = detectShortLegCorners(pts, null, look);
      const without = detectShortLegCorners(pts);
      withM.diagnostics.forEach((d, i) => {
        const ref = without.diagnostics[i];
        // Jeder Ablehnungsgrund AUSSER low_evidence entsteht vor der
        // Confidence-Stufe und muss identisch bleiben.
        if (ref.rejectReason && ref.rejectReason !== 'low_evidence') {
          expect(d.rejectReason).toBe(ref.rejectReason);
          expect(d.confidenceBeforeMotion).toBeNull();
          expect(d.motionAdjustment).toBeNull();
        }
        // Geometrie ist in beiden Fällen bitgleich.
        expect(d.interiorAngleDeg).toBe(ref.interiorAngleDeg);
        expect(d.headingDeltaDeg).toBe(ref.headingDeltaDeg);
        expect(d.classification).toBe(ref.classification);
      });
    }
  });
});

// ── 2. no_window_* bleibt unrettbar ──────────────────────────────────────
describe('no_window_before/after kann durch Motion NIEMALS akzeptiert werden', () => {
  /** Maximale, perfekt monotone Turn-Evidenz — mehr geht nicht. */
  const maxEvidence: TurnEvidence = {
    available: true, evidence: 1, netYawDeg: 135, grossYawDeg: 135, monotonicity: 1,
    concentration: 1, peakYawRateDps: 200, rotationDurationS: 1.2, yawShare: 0.9,
    totalRotationDeg: 150, peakRotationRateRadS: 3, steps: 4, stepRate: 1.8, cadence: 108,
    gaitAccelFraction: 1, gaitAccelThreshold: 0.1, locomotionSource: 'steps+gait_accel',
    movementState: 'walking', sampleCount: 8, windowStartMs: 0, windowEndMs: 0,
    windowDurationS: 2, gates: { netYaw: 1, monotonicity: 1, locomotion: 1, yawShare: 1 },
  };

  it('über die gesamte Golden-Route: kein einziger no_window_*-Kandidat wird akzeptiert', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      for (const drift of [0, 1, 2, 3, 4, 5]) {
        const pts = goldenPoints(seed, drift);
        const { diagnostics } = detectShortLegCorners(pts, null, () => maxEvidence);
        for (const d of diagnostics) {
          if (d.rejectReason !== 'no_window_before' && d.rejectReason !== 'no_window_after') continue;
          checked++;
          // Weder Klassifikation noch Confidence noch Motion-Felder entstehen.
          expect(d.classification).toBeNull();
          expect(d.confidence).toBe(0);
          expect(d.confidenceBeforeMotion).toBeNull();
          expect(d.motionAdjustment).toBeNull();
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('auch der Einzelaufruf akzeptiert einen no_window_*-Kandidaten nicht', () => {
    const pts = goldenPoints(1, 0);
    let found = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const ref = evaluateShortLegCorner(pts, i, -Infinity);
      if (ref.diagnostics.rejectReason !== 'no_window_before' && ref.diagnostics.rejectReason !== 'no_window_after') continue;
      found++;
      const withMotion = evaluateShortLegCorner(pts, i, -Infinity, null, () => maxEvidence);
      expect(withMotion.accepted).toBe(false);
      expect(withMotion.diagnostics.rejectReason).toBe(ref.diagnostics.rejectReason);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('der Research-Prototyp bleibt vollständig unverdrahtet', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('fs');
    for (const f of [
      'features/tracking/hooks/useTrackRecorder.ts',
      'features/tracking/utils/shortLegCornerDetection.ts',
      'features/tracking/utils/stopFlushCorner.ts',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toContain('motionSupportedCornerRetry');
      expect(src).not.toContain('tryMotionSupportedLocalCorner');
    }
  });
});

// ── 3. Motion erzeugt nichts und bestimmt nichts ─────────────────────────
describe('Motion erzeugt keine Kandidaten und bestimmt keine Klasse', () => {
  it('auf einer Geraden entsteht auch bei Dauerrotation kein Winkel', () => {
    for (const seed of SEEDS) {
      const pts = detectorBuffer(fieldFixes(straightCoords(40, 1.0), seed));
      const spin = straightMotion(40 / SPEED_MPS + 4, seed, { yawRateDps: () => 80 });
      expect(detectShortLegCorners(pts, null, lookupFor(spin)).corners).toEqual([]);
    }
  });

  it('akzeptierte Winkel haben mit und ohne Motion dieselbe Klasse', () => {
    for (const seed of SEEDS) {
      const pts = goldenPoints(seed, 1);
      const a = detectShortLegCorners(pts);
      const b = detectShortLegCorners(pts, null, lookupFor(routeMotion(seed, FIELD_TAIL_M)));
      for (const c of a.corners) {
        const same = b.corners.find(x => Math.abs(x.atM - c.atM) < 0.01);
        if (same) expect(same.kind).toBe(c.kind);
      }
    }
  });
});

// ── 4. Driftmatrix — Referenzwerte aus der Research-Runde ────────────────
describe('Golden-Field-Driftmatrix: vorher / nachher', () => {
  it('reproduziert den vermessenen Gewinn und wird nirgends schlechter', () => {
    const rows = ['Drift | CURRENT | + Motion ±0,12 | Δ'];
    const before: number[] = [], after: number[] = [];
    for (const drift of [0, 1, 2, 3, 4, 5]) {
      const a = meanCorrect(drift, false);
      const b = meanCorrect(drift, true);
      before.push(a); after.push(b);
      rows.push(`±${drift} m |  ${a.toFixed(2)}/4  |     ${b.toFixed(2)}/4     | ${(b - a >= 0 ? '+' : '') + (b - a).toFixed(2)}`);
    }
    console.log('\n[KOPPLUNG · Golden-Field-Driftmatrix] 3,75 m Schenkel, 1,25 m Nachlauf, 10 Seeds\n' + rows.join('\n') + '\n');
    // TRIPWIRE — die IM DETECTOR gemessenen Werte.
    //
    // KORREKTUR gegenüber der Research-Runde: dort wurde die Akzeptanz
    // ausserhalb des Detectors nachgebaut und dabei die auf drei
    // Nachkommastellen GERUNDETE `diag.confidence` mit ACCEPT_SCORE
    // verglichen. Der Detector selbst vergleicht den ungerundeten Wert. Bei
    // ±2 m gibt es genau einen Kandidaten (Seed 7, `links@3,4 m`) mit
    // Confidence ≈ 0,6195: gerundet 0,62 → aussen akzeptiert, ungerundet
    // → im Detector abgelehnt. Der Referenzwert für CURRENT bei ±2 m ist
    // deshalb 1,10 und nicht 1,20. Der Motion-Gewinn ist davon unberührt.
    expect(before.map(v => Number(v.toFixed(2)))).toEqual([3.00, 2.70, 1.10, 0.50, 0.30, 0.20]);
    expect(after.map(v => Number(v.toFixed(2)))).toEqual([3.00, 2.90, 2.00, 0.90, 0.50, 0.50]);
    // Und in keiner Stufe schlechter.
    after.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(before[i]));
  });
});

// ── 5. False Positives ───────────────────────────────────────────────────
describe('False Positives: Motion erhöht sie nicht', () => {
  function bend(lengthM: number, turnDeg: number, spacing = 1.0): [number, number][] {
    const out: [number, number][] = [[0, 0]];
    let x = 0, y = 0;
    for (let d = spacing; d <= lengthM + 1e-9; d += spacing) {
      const hdg = d <= lengthM / 2 ? 0 : turnDeg;
      x += Math.sin(hdg * RAD) * spacing; y += Math.cos(hdg * RAD) * spacing;
      out.push([x, y]);
    }
    return out;
  }
  function arc(lengthM: number, totalTurnDeg: number, spacing = 1.0): [number, number][] {
    const out: [number, number][] = [[0, 0]];
    let x = 0, y = 0, hdg = 0;
    const steps = Math.round(lengthM / spacing);
    for (let i = 0; i < steps; i++) {
      hdg += totalTurnDeg / steps;
      x += Math.sin(hdg * RAD) * spacing; y += Math.cos(hdg * RAD) * spacing;
      out.push([x, y]);
    }
    return out;
  }
  function sCurve(lengthM: number, spacing = 1.0): [number, number][] {
    const out: [number, number][] = [[0, 0]];
    let x = 0, y = 0, hdg = 0;
    const steps = Math.round(lengthM / spacing);
    for (let i = 0; i < steps; i++) {
      hdg += (i < steps / 2 ? 1 : -1) * (60 / (steps / 2));
      x += Math.sin(hdg * RAD) * spacing; y += Math.cos(hdg * RAD) * spacing;
      out.push([x, y]);
    }
    return out;
  }
  function jitter(lengthM: number, seed: number): [number, number][] {
    const rng = makeRng(seed);
    const out = straightCoords(lengthM, 1.0).map(p => [p[0], p[1]] as [number, number]);
    for (let i = 20; i < Math.min(out.length, 26); i++) out[i] = [out[i][0] + (rng() - 0.5) * 3, out[i][1] + (rng() - 0.5) * 1.5];
    return out;
  }
  function standing(lengthM: number, seed: number): [number, number][] {
    const rng = makeRng(seed);
    const out = straightCoords(lengthM, 1.0).map(p => [p[0], p[1]] as [number, number]);
    const [lx, ly] = out[out.length - 1];
    let dx = 0, dy = 0;
    for (let i = 0; i < 8; i++) {
      dx = dx * 0.85 + (rng() - 0.5) * 2; dy = dy * 0.85 + (rng() - 0.5) * 2;
      out.push([lx + dx, ly + dy]);
    }
    return out;
  }

  const DUR = 60 / SPEED_MPS + 4;
  const BEND = 20 / SPEED_MPS + 4;
  type Case = [string, (seed: number) => { pts: ShortLegPoint[]; motion: Parameters<typeof computeTurnEvidence>[0] }];
  const CASES: Case[] = [
    ['60 m gerade', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s) })],
    ['gerade + ±2 m Drift', (s) => ({ pts: detectorBuffer(fieldFixes(withDrift(straightCoords(60, 1.0), 2, s), s)), motion: straightMotion(DUR, s) })],
    ['gerade + ±5 m Drift', (s) => ({ pts: detectorBuffer(fieldFixes(withDrift(straightCoords(60, 1.0), 5, s), s)), motion: straightMotion(DUR, s) })],
    ['sanfter Bogen 30°', (s) => ({ pts: detectorBuffer(fieldFixes(arc(20, 30), s)), motion: straightMotion(BEND, s, { yawRateDps: (t) => pulse(t, 2, 14, 30) }) })],
    ['S-Kurve', (s) => ({ pts: detectorBuffer(fieldFixes(sCurve(20), s)), motion: straightMotion(BEND, s, { yawRateDps: (t) => pulse(t, 2, 8, 60) + pulse(t, 8, 14, -60) }) })],
    ['20°-Knick', (s) => ({ pts: detectorBuffer(fieldFixes(bend(20, 20), s)), motion: straightMotion(BEND, s, { yawRateDps: (t) => pulse(t, 7.4, 8.2, 20) }) })],
    ['30°-Knick', (s) => ({ pts: detectorBuffer(fieldFixes(bend(20, 30), s)), motion: straightMotion(BEND, s, { yawRateDps: (t) => pulse(t, 7.4, 8.2, 30) }) })],
    ['Stop-and-go', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 22 ? 0 : 1.8) }) })],
    ['GPS-Wackler', (s) => ({ pts: detectorBuffer(fieldFixes(jitter(60, s), s)), motion: straightMotion(DUR, s) })],
    ['stehende Drift', (s) => ({ pts: detectorBuffer(fieldFixes(standing(60, s), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 44 ? 0 : 1.8) }) })],
    ['Gegenstand setzen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 23 ? 0 : 1.8), yawRateDps: (t) => pulse(t, 20.5, 21.2, 15) + pulse(t, 21.8, 22.5, -10), offAxisRadS: (t) => (t >= 20.4 && t < 22.6 ? 1.8 : 0) }) })],
    ['Dübel setzen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 23 ? 0 : 1.8), yawRateDps: (t) => pulse(t, 20.4, 21.2, 35) + pulse(t, 21.6, 22.4, -30), offAxisRadS: (t) => (t >= 20.3 && t < 22.5 ? 1.9 : 0) }) })],
    ['bücken', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 22.6 ? 0 : 1.8), offAxisRadS: (t) => (t >= 20.2 && t < 22.4 ? 1.8 : 0) }) })],
    ['Handy ansehen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { yawRateDps: (t) => pulse(t, 20, 20.6, 18) + pulse(t, 22, 22.6, -12), offAxisRadS: (t) => ((t >= 20 && t < 20.6) || (t >= 22 && t < 22.6) ? 2.4 : 0) }) })],
    ['im Stand drehen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 23 ? 0 : 1.8), yawRateDps: (t) => pulse(t, 20.7, 22.2, 120) }) })],
    ['HANDY 90° beim Gehen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { yawRateDps: (t) => pulse(t, 20.5, 21.1, 90) }) })],
    ['HANDY 90° + ±5 m Drift', (s) => ({ pts: detectorBuffer(fieldFixes(withDrift(straightCoords(60, 1.0), 5, s), s)), motion: straightMotion(DUR, s, { yawRateDps: (t) => pulse(t, 20.5, 21.1, 90) }) })],
  ];

  const rows: string[] = [];
  afterAll(() => {
    console.log('\n[KOPPLUNG · False Positives] 10 Seeds · erfundene Winkel gesamt\n' +
      'Fall                          | CURRENT | + Motion\n' + rows.join('\n') + '\n');
  });

  it.each(CASES)('%s', (label, build) => {
    let a = 0, b = 0;
    for (const seed of SEEDS) {
      const { pts, motion } = build(seed);
      a += detectShortLegCorners(pts).corners.length;
      b += detectShortLegCorners(pts, null, lookupFor(motion)).corners.length;
    }
    rows.push(`${label.padEnd(30)}|   ${String(a).padStart(2)}    |    ${String(b).padStart(2)}`);
    // HARTE ZUSAGE: Motion erhöht die Fehlalarme nie.
    expect(b).toBeLessThanOrEqual(a);
  });

  it('TRIPWIRE: die gemessene Verbesserung 5 → 3 auf der driftenden Geraden', () => {
    const count = (withMotion: boolean, drift: number, phone90: boolean) => {
      let n = 0;
      for (const seed of SEEDS) {
        const pts = detectorBuffer(fieldFixes(withDrift(straightCoords(60, 1.0), drift, seed), seed));
        const motion = straightMotion(DUR, seed, phone90 ? { yawRateDps: (t) => pulse(t, 20.5, 21.1, 90) } : undefined);
        n += detectShortLegCorners(pts, null, withMotion ? lookupFor(motion) : undefined).corners.length;
      }
      return n;
    };
    expect(count(false, 5, false)).toBe(5);
    expect(count(true, 5, false)).toBe(3);
    // Auch mit der nicht trennbaren Handy-90°-Drehung: keine zusätzlichen Winkel.
    expect(count(false, 5, true)).toBe(5);
    expect(count(true, 5, true)).toBe(3);
  });
});

// ── 6. QA-Sichtbarkeit ───────────────────────────────────────────────────
describe('QA-Log zeigt den Rechenweg', () => {
  it('Diagnose führt before / adjustment / after mit', () => {
    let withTrail = 0;
    for (const seed of SEEDS) {
      const pts = goldenPoints(seed, 1);
      const { diagnostics } = detectShortLegCorners(pts, null, lookupFor(routeMotion(seed, FIELD_TAIL_M)));
      for (const d of diagnostics) {
        if (d.confidenceBeforeMotion == null) continue;
        withTrail++;
        expect(d.motionAdjustment).not.toBeNull();
        // Jeder der drei Werte ist einzeln auf drei Stellen gerundet — die Summe
        // darf daher um bis zu 0,001 abweichen.
        expect(d.confidence).toBeCloseTo(d.confidenceBeforeMotion + d.motionAdjustment!, 2);
        // Entscheidung ist aus der Diagnose ablesbar.
        const accepted = d.rejectReason == null;
        expect(accepted).toBe(d.confidence >= ACCEPT_SCORE && d.classification != null);
      }
    }
    expect(withTrail).toBeGreaterThan(0);
  });

  it('der Recorder schreibt den Rechenweg ins QA-Log', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const src = require('fs').readFileSync('features/tracking/hooks/useTrackRecorder.ts', 'utf8');
    expect(src).toContain('last.confidenceBeforeMotion');
    expect(src).toContain('last.motionAdjustment');
    expect(src).toContain('rejected (');
    expect(src).toContain("'accepted'");
    // Der Lookup wird nur bei laufendem Motion-Mitschnitt übergeben.
    expect(src).toContain('const turnEvidenceAt = motionActiveRef.current');
    expect(src).toContain('detectShortLegCorners(detectPointsRef.current, null, turnEvidenceAt)');
  });

  it('FIELD_EXPECTED ist unverändert — die Golden-Route bleibt verbindlich', () => {
    expect(FIELD_EXPECTED).toEqual(['links', 'rechts', 'spitz_rechts', 'spitz_links']);
    expect(FIELD_TAIL_M).toBe(1.25);
  });
});

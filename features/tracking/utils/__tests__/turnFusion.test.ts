// Turn-Fusion (GPS ∪ IMU): reale QA-Läufe + Kontrakt-Tests.
//
// REALE Läufe (QA v2.1, read-only Kopien in fixtures/realFieldV21):
//   F1T  qa-1616e65f — verlorener L-Turn (Wackel-Segment am Scheitel)
//   FT2  qa-c2a47f13 — nicht auflösbarer „spitz_links" (Accuracy ≈ Schenkel)
//   Spitz-QA qa-0ec8c4ca — gelaufen R → L → SL → SR, bisher nur R + SR erkannt
//   r1-qa-03d970ff — Marker „links" bei 11,4 m
//   Lauf 3/7/8 — keine Ecke gelaufen (Negativfälle)
// Die Golden-Route-Matrix und die synthetischen Fälle sind KONTRAKT-Tests, keine
// Validierung — sie belegen das Verhalten der Gates, nicht ihre Wahrheit.
import * as fs from 'fs';
import * as path from 'path';
import {
  detectShortLegCorners, evaluateShortLegCorner, type ShortLegPoint, type TurnEvidenceLookup,
} from '@/features/tracking/utils/shortLegCornerDetection';
import {
  computeTurnEvidence, MotionEvidenceBuffer, type MotionWindowSample, type TurnEvidence,
} from '@/features/tracking/utils/motionTurnEvidence';
import {
  fuseTurns, associateLiveTurn, RESCUE_CONFIDENCE_FACTOR,
} from '@/features/tracking/utils/turnFusion';
import { capturedDetectorBuffer } from './helpers/realSessionFixture';
import { evaluateStopFlush } from '@/features/tracking/utils/stopFlushCorner';
import { FIELD_TAIL_M, SEEDS, fieldRouteCoords, withDrift, fieldFixes, detectorBuffer, scoreSequence } from './helpers/goldenRoute';
import { routeMotion } from './helpers/goldenMotion';
import { simulate, pulse, ZERO, WALK, HAND, T0 } from './helpers/motionScenarioSim';

const FIX = path.join(__dirname, 'fixtures', 'realFieldV21');

interface Loaded { buf: ShortLegPoint[]; lookup: TurnEvidenceLookup | undefined; samples: MotionWindowSample[] }
/** Detektor-Puffer + die im Feld mitgeschnittenen Motion-Samples (nur rund um Kandidaten erfasst). */
function load(file: string): Loaded {
  const j = JSON.parse(fs.readFileSync(path.join(FIX, file), 'utf8'));
  const buf = capturedDetectorBuffer(j.detectorPoints);
  const seen = new Map<number, MotionWindowSample>();
  for (const c of j.candidateMotionEvidence ?? []) {
    for (const s of c.samples) {
      const t = Math.round(c.evaluatedAtMs + s.dtMs);
      seen.set(t, { t, headingDelta: s.headingDelta, rotationMagnitude: s.rotationMagnitude,
        accelerationMagnitude: s.accelerationMagnitude, stepDelta: s.stepDelta, cadence: s.cadence, movementState: s.movementState });
    }
  }
  const samples = [...seen.values()].sort((a, b) => a.t - b.t);
  const mb = new MotionEvidenceBuffer(1e9);
  samples.forEach(s => mb.push(s));
  return { buf, samples, lookup: samples.length ? (t => (t == null ? null : mb.evidenceForTrailing(t))) : undefined };
}

// ── Reale Läufe ───────────────────────────────────────────────────────────
describe('reale Läufe — GPS-only (Normalfall ausserhalb des QA-Modus)', () => {
  it('finish-QA restores live Motion only at the same apex without rewriting GPS geometry or kind', () => {
    const { buf } = load('f1t-qa-1616e65f.json');
    const reconstructed = fuseTurns(buf).turns[0];
    const live = { ...reconstructed, kind: 'spitz_links' as const,
      headingDeltaDeg: 170, motion: { ...reconstructed.motion, available: true,
        signedNetYawDeg: -70, direction: 'links' as const, evidence: 1 } };
    const associated = associateLiveTurn(reconstructed, [live]);
    expect(associated.motion).toEqual(live.motion);
    expect(associated.kind).toBe(reconstructed.kind);
    expect(associated.headingDeltaDeg).toBe(reconstructed.headingDeltaDeg);
    expect(associateLiveTurn(reconstructed, [{ ...live, apexIndex: live.apexIndex + 20,
      t: (live.t ?? 0) + 1000 }])).toEqual(reconstructed);
  });
  it('F1T (qa-1616e65f): der verlorene L-Turn wird über den Split-Apex-Paarungspfad gefunden', () => {
    const { buf } = load('f1t-qa-1616e65f.json');
    // Regelpfad allein: nur der Rechts-Winkel (Punkt 11) — der L-Turn scheitert an no_window_*.
    expect(detectShortLegCorners(buf).corners.map(c => c.kind)).toEqual(['rechts']);

    const r = fuseTurns(buf);
    expect(r.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
    expect(r.rescued).toBe(1);
    const rescued = r.turns.find(t => t.source === 'gps_split_apex')!;
    expect(rescued.direction).toBe('links');
    expect(rescued.atM).toBeGreaterThan(19);
    expect(rescued.atM).toBeLessThan(23);
    expect(rescued.flags).toContain('split_apex_pair');
    // Accuracy 8 m bei 2,3–2,6-m-Schenkeln: Richtung belegt, Schärfe NICHT.
    expect(rescued.sharpness).toBe('unresolved');
    expect(rescued.kind).toBe('links');
    expect(rescued.geometryQualityLevel).toBe('low');
    expect(rescued.confidence).toBeGreaterThanOrEqual(0.62);
    // Die Diagnose des Scheitelpunkts wird mit der Rettung überschrieben (QA sieht die Wahrheit).
    const d = r.diagnostics.find(x => x.apexIndex === rescued.apexIndex)!;
    expect(d.rejectReason).toBeNull();
    expect(d.fusionSource).toBe('gps_split_apex');
  });

  it('FT2 (qa-c2a47f13): „spitz_links" wird zu LINKS mit nicht aufgelöster Schärfe — Richtung bleibt', () => {
    const { buf } = load('ft2-qa-c2a47f13.json');
    const r = fuseTurns(buf);
    expect(r.corners.map(c => c.kind)).toEqual(['rechts', 'links']);
    expect(r.rescued).toBe(0);
    const second = r.turns[1];
    expect(second.direction).toBe('links');
    expect(second.sharpness).toBe('unresolved');
    expect(second.flags).toContain('sharpness_demoted_low_geometry');
    expect(second.sharpnessConfidence).toBeLessThanOrEqual(0.3);
    // GPS-Winkel unverändert dokumentiert (−126,1° / innen 53,9°) — er wird nicht umgeschrieben.
    expect(second.headingDeltaDeg).toBeCloseTo(-126.1, 1);
    expect(second.interiorAngleDeg).toBeCloseTo(53.9, 1);
  });

  it('Spitz-QA (qa-0ec8c4ca): gelaufen R → L → SL → SR — alle vier in der richtigen Reihenfolge und Klasse', () => {
    const { buf } = load('spitz-qa-0ec8c4ca.json');
    expect(detectShortLegCorners(buf).corners.map(c => c.kind)).toEqual(['rechts', 'spitz_rechts']);   // vorher: 2/4
    const r = fuseTurns(buf);
    expect(r.corners.map(c => c.kind)).toEqual(['rechts', 'links', 'spitz_links', 'spitz_rechts']);
    expect(r.rescued).toBe(2);
    expect(r.turns.map(t => t.source)).toEqual(['gps', 'gps_split_apex', 'gps_split_apex', 'gps']);
  });

  it('r1 (qa-03d970ff): der aufgezeichnete Marker „links" bei 11,4 m wird unabhängig bestätigt', () => {
    const { buf } = load('r1-qa-03d970ff.json');
    const r = fuseTurns(buf);
    expect(r.corners.map(c => c.kind)).toEqual(['links']);
    expect(Math.abs(r.corners[0].atM - 11.4)).toBeLessThan(1.5);
  });

  it('Negativfälle Lauf 3/7/8 (keine Ecke gelaufen): keine einzige Ecke, auch nicht über den Rescue', () => {
    for (const f of ['lauf3-qa-1c341a07.json', 'lauf7-qa-3e78df58.json', 'lauf8-qa-ef808e24.json']) {
      const { buf, lookup } = load(f);
      for (const l of [undefined, lookup]) {
        const r = fuseTurns(buf, { turnEvidenceAt: l });
        expect(r.corners).toEqual([]);
        expect(r.rescued).toBe(0);
      }
    }
  });

  it('bestehende Treffer bleiben unverändert (Lauf 1/2/9/10)', () => {
    const expected: Record<string, string[]> = {
      'lauf1-qa-a3055da3.json': ['rechts'], 'lauf2-qa-848ea966.json': ['spitz_links'],
      'lauf9-qa-01e12e75.json': ['rechts'], 'lauf10-qa-5637ad58.json': ['rechts'],
    };
    for (const [f, kinds] of Object.entries(expected)) {
      const { buf } = load(f);
      expect(fuseTurns(buf).corners.map(c => c.kind)).toEqual(kinds);
      expect(fuseTurns(buf).rescued).toBe(0);
    }
  });
});

describe('reale Läufe — mit IMU-Evidenz (QA-Modus)', () => {
  it('Motion-Vorzeichen bestätigt die GPS-Richtung in allen mitgeschnittenen Ereignissen', () => {
    let checked = 0;
    for (const f of ['f1t-qa-1616e65f.json', 'ft2-qa-c2a47f13.json', 'lauf1-qa-a3055da3.json', 'lauf2-qa-848ea966.json',
      'lauf9-qa-01e12e75.json', 'lauf10-qa-5637ad58.json', 'spitz-qa-0ec8c4ca.json']) {
      const { buf, lookup } = load(f);
      for (const t of fuseTurns(buf, { turnEvidenceAt: lookup }).turns) {
        if (t.motion.directionAgrees == null) continue;   // Motion nennt keine Richtung (zu wenig Yaw)
        checked++;
        expect(t.motion.directionAgrees).toBe(true);
      }
    }
    expect(checked).toBeGreaterThanOrEqual(8);
  });

  it('FT2: Motion (62° Netto-Yaw) stützt die RICHTUNG, belegt aber kein „spitz"', () => {
    const { buf, lookup } = load('ft2-qa-c2a47f13.json');
    const second = fuseTurns(buf, { turnEvidenceAt: lookup }).turns[1];
    expect(second.motion.direction).toBe('links');
    expect(second.motion.directionAgrees).toBe(true);
    expect(second.motion.netYawDeg).toBeCloseTo(62.2, 1);
    expect(second.sharpness).toBe('unresolved');
    expect(second.kind).toBe('links');
    expect(second.flags).not.toContain('sharpness_promoted_by_motion');
  });

  it('F1: der Rescue-Scheitel hat keine Motion-Daten — er bleibt ein reines GPS-Indiz (kein Motion-Bonus)', () => {
    const { buf, lookup } = load('f1t-qa-1616e65f.json');
    const r = fuseTurns(buf, { turnEvidenceAt: lookup });
    const rescued = r.turns.find(t => t.source === 'gps_split_apex')!;
    expect(rescued.motion.available).toBe(false);
    expect(rescued.motionAdjustment).toBeCloseTo(0, 6);
  });
});

// ── Synthetische Kontrakt-Tests ───────────────────────────────────────────
const M = 111320;
function makePoints(xy: [number, number][], accuracy = 4.7, t0 = 0, dt = 1000): ShortLegPoint[] {
  let cum = 0;
  return xy.map(([x, y], i) => {
    if (i > 0) cum += Math.hypot(x - xy[i - 1][0], y - xy[i - 1][1]);
    return { lat: y / M, lng: x / M, cumDist: cum, accuracy, t: t0 + i * dt };
  });
}
const east = (x0: number, n: number, step: number, y = 0): [number, number][] =>
  Array.from({ length: n }, (_, i) => [x0 + i * step, y]);
const north = (x: number, y0: number, n: number, step: number): [number, number][] =>
  Array.from({ length: n }, (_, i) => [x, y0 + i * step]);

/** Ost-Schenkel, ein Wackel-Segment am Scheitel, Nord-Schenkel — die F1-Struktur. */
function splitApexPath(): [number, number][] {
  return [...east(0, 9, 0.8), [6.4, 0.0], [5.95, -0.3], ...north(5.95, -0.3 + 0.8, 7, 0.8)] as [number, number][];
}

describe('Split-Apex-Rescue — Gates', () => {
  it('Regelpfad findet die Struktur nicht, die Fusion findet genau eine Ecke (links)', () => {
    const pts = makePoints(splitApexPath());
    expect(detectShortLegCorners(pts).corners).toEqual([]);
    const r = fuseTurns(pts);
    expect(r.corners.map(c => c.kind)).toEqual(['links']);
    expect(r.turns[0].source).toBe('gps_split_apex');
  });

  it('die Rescue-Confidence trägt den Abschlag und erreicht ohne Motion nie mehr als der Regelpfad', () => {
    const r = fuseTurns(makePoints(splitApexPath()));
    const t = r.turns[0];
    expect(t.confidence).toBeLessThan(1 * RESCUE_CONFIDENCE_FACTOR + 1e-9);
    expect(t.motionAdjustment).toBeCloseTo(0, 6);
  });

  it('opt-out: splitApexRescue=false ergibt exakt den Regelpfad', () => {
    const pts = makePoints(splitApexPath());
    const off = fuseTurns(pts, { splitApexRescue: false });
    expect(off.corners).toEqual(detectShortLegCorners(pts).corners);
    expect(off.rescued).toBe(0);
  });

  it('TAIL: eine Ecke, hinter der weniger als ein Schenkelfenster folgt, wird NICHT gerettet', () => {
    // Ost 6,4 m, dann nur noch 2 Punkte (≈ 1,2 m) nach Norden — Puffer-Ende.
    const pts = makePoints([...east(0, 9, 0.8), [6.4, 0.0], [5.95, -0.3], [5.95, 0.5], [5.95, 1.1]]);
    const r = fuseTurns(pts);
    expect(r.corners).toEqual([]);
    expect(r.rescued).toBe(0);
  });

  it('TAIL: zum Puffer-Ende hin wird auch mit maximal starker Motion nichts gerettet', () => {
    const pts = makePoints([...east(0, 9, 0.8), [6.4, 0.0], [5.95, -0.3], [5.95, 0.5], [5.95, 1.1]]);
    const m = simulate(20, { yawRateDps: (s) => pulse(s, 6, 7.2, 90), offAxisRadS: ZERO, stepRate: WALK }, HAND, 3);
    const strong = (t: number | null): TurnEvidence | null => (t == null ? null : computeTurnEvidence(m, T0 + 6600));
    expect(fuseTurns(pts, { turnEvidenceAt: strong }).corners).toEqual([]);
    // Und der Regelpfad bleibt in jedem Fall gesperrt (Invariante aus motionConfidenceCoupling.test.ts).
    for (let i = 1; i < pts.length - 1; i++) {
      const c = evaluateShortLegCorner(pts, i, -Infinity, null, strong);
      if (c.diagnostics.rejectReason === 'no_window_before' || c.diagnostics.rejectReason === 'no_window_after') expect(c.accepted).toBe(false);
    }
  });

  it('gerade Strecke mit seitlichem Rauschen (±0,3 m): keine Ecke, kein Rescue', () => {
    const rng = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const xy: [number, number][] = Array.from({ length: 30 }, (_, i) => [i * 0.8, (rng() - 0.5) * 0.6]);
    const r = fuseTurns(makePoints(xy));
    expect(r.corners).toEqual([]);
  });

  it('sanfter Bogen (kein Knick) wird nicht gerettet', () => {
    const xy: [number, number][] = Array.from({ length: 24 }, (_, i) => {
      const a = (i * 4 * Math.PI) / 180;   // 4° je Schritt → 92° über 23 Schritte, 0,8 m Schritt
      return [Math.sin(a) * 10, (1 - Math.cos(a)) * 10];
    });
    expect(fuseTurns(makePoints(xy)).corners).toEqual([]);
  });

  it('IMU widerspricht der GPS-Richtung → der gepaarte Scheitel wird verworfen', () => {
    const pts = makePoints(splitApexPath());
    // GPS-Ecke ist LINKS; Motion meldet klar RECHTS (negatives Yaw) mit voller Evidenz.
    const ev = computeTurnEvidence(simulate(20, { yawRateDps: (s) => pulse(s, 7.4, 8.6, -90), offAxisRadS: ZERO, stepRate: WALK }, HAND, 5), T0 + 8000);
    expect(ev.available).toBe(true);
    expect(ev.signedNetYawDeg).toBeLessThan(0);
    const r = fuseTurns(pts, { turnEvidenceAt: () => ev });
    expect(r.corners).toEqual([]);
  });

  it('IMU bestätigt die Richtung → derselbe Scheitel wird mit Bonus gerettet', () => {
    const pts = makePoints(splitApexPath());
    const same = computeTurnEvidence(simulate(20, { yawRateDps: (s) => pulse(s, 7.4, 8.6, +90), offAxisRadS: ZERO, stepRate: WALK }, HAND, 5), T0 + 8000);
    expect(same.available).toBe(true);
    expect(same.signedNetYawDeg).toBeGreaterThan(0);
    const withMotion = fuseTurns(pts, { turnEvidenceAt: () => same });
    const gpsOnly = fuseTurns(pts);
    expect(withMotion.corners.map(c => c.kind)).toEqual(['links']);
    expect(withMotion.turns[0].confidence).toBeGreaterThan(gpsOnly.turns[0].confidence);
  });
});

describe('Richtung vs. Schärfe — Fusion', () => {
  const ft2 = () => load('ft2-qa-c2a47f13.json');
  const fakeEv = (signedYaw: number): TurnEvidence => {
    const base = computeTurnEvidence([], 0);
    return { ...base, available: true, evidence: 1, netYawDeg: Math.abs(signedYaw), signedNetYawDeg: signedYaw, grossYawDeg: Math.abs(signedYaw), monotonicity: 1 };
  };

  it('corrects a low-quality GPS direction only with sustained directional walking evidence', () => {
    const { buf } = ft2();
    const strong = { ...fakeEv(-102.68), yawShare: 0.758,
      movementState: 'walking' as const };
    const r = fuseTurns(buf, { turnEvidenceAt: t => t == null ? null : strong });
    const second = r.turns[1];
    expect(second.geometryQualityLevel).toBe('low');
    expect(second.direction).toBe('rechts');
    expect(second.directionSource).toBe('motion_override_low_geometry');
    expect(second.sharpness).toBe('unresolved');
    expect(r.corners[1].kind).toBe('rechts');
    expect(fuseTurns(buf).corners[1].kind).toBe('links');
  });

  it('Motion bestimmt die Schärfe NIE: auch maximal starke, gleichgerichtete IMU (200° links) hebt „unresolved" nicht auf', () => {
    const { buf } = ft2();
    for (const yaw of [+100, +130, +200]) {
      const r = fuseTurns(buf, { turnEvidenceAt: (t) => (t == null ? null : fakeEv(yaw)) });
      const second = r.turns[1];
      expect(second.sharpness).toBe('unresolved');
      expect(second.kind).toBe('links');
      expect(r.corners[1].kind).toBe('links');
      expect(second.flags).not.toContain('sharpness_promoted_by_motion');
      expect(second.motion.directionAgrees).toBe(true);   // Richtung darf sie bestätigen
    }
  });

  it('auflösbare Geometrie bleibt GPS-klassifiziert, unabhängig von der Motion (Spitz-QA: mit/ohne IMU, auch gegenläufig)', () => {
    const { buf } = load('spitz-qa-0ec8c4ca.json');
    const base = fuseTurns(buf);
    expect(base.corners.map(c => c.kind)).toEqual(['rechts', 'links', 'spitz_links', 'spitz_rechts']);
    const regular = base.turns.filter(t => t.source === 'gps').map(t => t.kind);
    expect(regular).toEqual(['rechts', 'spitz_rechts']);
    for (const yaw of [+20, +130, -130]) {
      const r = fuseTurns(buf, { turnEvidenceAt: (t) => (t == null ? null : fakeEv(yaw)) });
      // Motion verändert weder Existenz noch GPS-Klasse der Regelpfad-Ecken (nur Bestätigung/Widerspruch der Richtung).
      expect(r.turns.filter(t => t.source === 'gps').map(t => t.kind)).toEqual(regular);
    }
  });

  it('gleich starke, aber ENTGEGENGESETZTE IMU belegt nichts und widerspricht sichtbar — die GPS-Richtung bleibt', () => {
    const { buf } = ft2();
    const r = fuseTurns(buf, { turnEvidenceAt: (t) => (t == null ? null : fakeEv(-130)) });
    const second = r.turns[1];
    expect(second.flags).toContain('motion_direction_conflict');
    expect(second.flags).not.toContain('sharpness_promoted_by_motion');
    expect(second.direction).toBe('links');
    expect(second.kind).toBe('links');
    expect(second.motion.directionAgrees).toBe(false);
  });

  it('Motion-Richtungskonflikt unterdrückt den Confidence-Zuschlag (nie ein Abzug)', () => {
    const { buf } = ft2();
    const conflict = fuseTurns(buf, { turnEvidenceAt: (t) => (t == null ? null : fakeEv(-130)) }).turns[1];
    const gps = fuseTurns(buf).turns[1];
    expect(conflict.confidence).toBeLessThanOrEqual(gps.confidence + 1e-9);
    expect(conflict.confidence).toBeGreaterThanOrEqual(gps.confidence - 1e-9);
  });
});

describe('IMU-only-Ereignisse werden protokolliert, aber NIE persistiert', () => {
  it('Drehung im Gehen ohne GPS-Ecke: 0 Ecken, 1 unbestätigtes IMU-Ereignis', () => {
    const pts = makePoints(east(0, 30, 0.8));   // gerade
    const motion = simulate(30, { yawRateDps: (s) => pulse(s, 12, 13.2, 90), offAxisRadS: ZERO, stepRate: WALK }, HAND, 9);
    const r = fuseTurns(pts, { motionSamples: motion });
    expect(r.corners).toEqual([]);
    expect(r.imuOnly).toHaveLength(1);
    expect(r.imuOnly[0].persisted).toBe(false);
    expect(r.imuOnly[0].direction).toBe('links');
    expect(r.imuOnly[0].reason).toBe('imu_only_no_gps_corner');
  });

  it('ein IMU-Ereignis, das zu einer GPS-Ecke passt, ist kein IMU-only-Ereignis', () => {
    const { buf, samples } = load('spitz-qa-0ec8c4ca.json');
    const r = fuseTurns(buf, { motionSamples: samples });
    const cornerTimes = r.turns.map(t => t.t!);
    for (const e of r.imuOnly) expect(cornerTimes.every(ct => Math.abs(ct - e.t) > 3000)).toBe(true);
  });
});

describe('Tail-Safety bei Ende und Stop', () => {
  const straight = makePoints(east(0, 30, 0.8));
  const drift = makePoints([...east(0, 30, 0.8), [23.5, 0.3], [23.8, -0.2], [24.1, 0.1]]);

  it('gerade Strecke, Ende, Stop, starke Handyrotation: kein persistierter Winkel', () => {
    const motion = simulate(35, { yawRateDps: s => pulse(s, 27, 28.2, 110), offAxisRadS: ZERO, stepRate: WALK }, HAND, 9);
    const r = fuseTurns(straight, { motionSamples: motion });
    expect(r.corners).toEqual([]);
    expect(r.turns).toEqual([]);
    expect(r.imuOnly.every(e => e.persisted === false)).toBe(true);
    expect(evaluateStopFlush(straight, -Infinity).corner).toBeNull();
  });

  it('gerade Strecke, Ende, GPS-Drift: weder Fusion noch Stop-Flush erzeugen eine Ecke', () => {
    expect(fuseTurns(drift).corners).toEqual([]);
    expect(evaluateStopFlush(drift, -Infinity).corner).toBeNull();
  });

  it('IMU-only nach Ende bleibt QA-Ereignis, nie Marker; Stop-Flush nutzt den strengen Regelpfad', () => {
    const motion = simulate(35, { yawRateDps: s => pulse(s, 27, 28.2, 110), offAxisRadS: ZERO, stepRate: WALK }, HAND, 9);
    const r = fuseTurns(straight, { motionSamples: motion });
    expect(r.imuOnly.length).toBeGreaterThan(0);
    expect(r.imuOnly.every(e => e.persisted === false)).toBe(true);
    const flush = fs.readFileSync('features/tracking/utils/stopFlushCorner.ts', 'utf8');
    expect(flush).toContain('detectShortLegCorners(points, null, turnEvidenceAt)');
    expect(flush).not.toContain('fuseTurns(');
  });

  it('Fixe nach stopAll() durchlaufen den Recorder-Gate nicht', () => {
    const source = fs.readFileSync('features/tracking/hooks/useTrackRecorder.ts', 'utf8');
    expect(source).toContain('recordingRef.current = false;');
    expect(source).toContain('if (!recordingRef.current || s.isPaused) return;');
  });
});

// ── Golden-Route-Matrix: Fusion ist nirgends schlechter als der Detektor ──
describe('Golden-Field-Matrix (5–9 m Accuracy, 3,75-m-Schenkel): Fusion ≥ Detektor', () => {
  const look = (seed: number): TurnEvidenceLookup => {
    const m = routeMotion(seed, FIELD_TAIL_M);
    return (t) => (t == null ? null : computeTurnEvidence(m, t));
  };
  const pts = (seed: number, drift: number) =>
    detectorBuffer(fieldFixes(withDrift(fieldRouteCoords(1.0, FIELD_TAIL_M), drift, seed), seed));

  it('mit Motion: Fusion erhält alle GPS-Kandidaten bei jedem Drift', () => {
    const rows: string[] = ['Drift | Detektor+M | Fusion+M | Rescue'];
    for (const drift of [0, 1, 2, 3, 4, 5]) {
      let det = 0, fus = 0, resc = 0, detectorCorners = 0, fusedCorners = 0;
      for (const seed of SEEDS) {
        const p = pts(seed, drift), l = look(seed);
        const detected = detectShortLegCorners(p, null, l).corners;
        det += scoreSequence(detected.map(c => c.kind)); detectorCorners += detected.length;
        const f = fuseTurns(p, { turnEvidenceAt: l });
        fus += scoreSequence(f.corners.map(c => c.kind)); resc += f.rescued; fusedCorners += f.corners.length;
      }
      rows.push(`±${drift} m | ${(det / 10).toFixed(2)} | ${(fus / 10).toFixed(2)} | ${resc}`);
      // Direction can change at a weak GPS apex; the existing turn must stay.
      expect(fusedCorners).toBeGreaterThanOrEqual(detectorCorners);
    }
    console.log('\n[FUSION · Golden-Matrix]\n' + rows.join('\n') + '\n');
  });

  it('ohne Drift bleibt das Ergebnis 3/4 (der vierte Winkel hat nur 1,25 m Nachlauf — bekannt)', () => {
    for (const seed of SEEDS) expect(scoreSequence(fuseTurns(pts(seed, 0)).corners.map(c => c.kind))).toBe(3);
  });
});

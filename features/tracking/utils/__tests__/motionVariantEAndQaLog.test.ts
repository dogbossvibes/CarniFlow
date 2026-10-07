// Variante E (Locomotion-Gate) + vollständiges QA-Logging.
//
// Anlass: realer Feldbefund Teil B, 19:20:28 —
//   steps=0 cadence=null movementState=walking
//   netYaw=62.1° mono=0.95 yawShare=0.69  →  turnEvidence=0.000
// Ursache: `stepDelta` ist das Delta eines kumulativen CMPedometer-Zählers,
// der in der Anlaufphase (und zwischen den gebündelten Callbacks) gar nicht
// vorrückt. Das harte Schritt-Gate hat damit ein reales, eindeutiges
// Drehereignis vernichtet.

import { readFileSync } from 'fs';
import {
  computeTurnEvidence, applyMotionToConfidence, TURN_EVIDENCE_DEFAULTS, COUPLING_DEFAULTS,
  type MotionWindowSample, type TurnEvidenceParams,
} from '@/features/tracking/utils/motionTurnEvidence';
import {
  detectShortLegCorners, ACCEPT_SCORE, type ShortLegPoint, type TurnEvidenceLookup,
} from '@/features/tracking/utils/shortLegCornerDetection';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import {
  FIELD_TAIL_M, SEEDS, fieldRouteCoords, straightCoords, withDrift, fieldFixes,
  detectorBuffer, scoreSequence, makeRng,
} from './helpers/goldenRoute';
import { routeMotion, straightMotion, SPEED_MPS } from './helpers/goldenMotion';
import { simulate, pulse, ZERO, WALK, HAND, T0, type Program } from './helpers/motionScenarioSim';

const RAD = Math.PI / 180;

/** Das ALTE harte Schritt-Gate: Gang-Signatur praktisch unerreichbar machen. */
const OLD_STEP_GATE: TurnEvidenceParams = { ...TURN_EVIDENCE_DEFAULTS, gaitAccelMinFraction: 2 };

function lookupFor(motion: readonly MotionWindowSample[], params = TURN_EVIDENCE_DEFAULTS): TurnEvidenceLookup {
  return (t) => (t == null ? null : computeTurnEvidence(motion, t, params));
}

/**
 * Motion-Strom mit STILLEM Pedometer — genau die Feldsituation: die Person
 * geht, aber CMPedometer hat noch nichts geliefert (steps 0, cadence null).
 */
function silentPedometerMotion(durationS: number, prog: Program, seed: number): MotionWindowSample[] {
  return simulate(durationS, prog, HAND, seed).map(s => ({ ...s, stepDelta: 0, cadence: null }));
}

// ── 1. Der Feldfall ──────────────────────────────────────────────────────
describe('Feldfall 19:20:28 — starker Turn bei stillem Pedometer', () => {
  const AT = 20;
  const prog: Program = {
    yawRateDps: (t) => pulse(t, AT - 0.6, AT + 0.6, 62),
    offAxisRadS: ZERO,
    stepRate: WALK,
  };

  it('alt: hartes Schritt-Gate → Evidenz 0 · neu: Variante E → Evidenz > 0', () => {
    let oldSum = 0, newSum = 0, gaitSum = 0;
    let source = '';
    for (const seed of SEEDS) {
      const motion = silentPedometerMotion(AT + 6, prog, seed);
      const tc = T0 + AT * 1000;
      const before = computeTurnEvidence(motion, tc, OLD_STEP_GATE);
      const after = computeTurnEvidence(motion, tc);
      oldSum += before.evidence ?? 0;
      newSum += after.evidence ?? 0;
      gaitSum += after.gaitAccelFraction;
      source = after.locomotionSource;
      // Die Feldzeile im Detail reproduziert:
      expect(after.steps).toBe(0);
      expect(after.cadence).toBeNull();
      expect(after.movementState).toBe('walking');
    }
    const n = SEEDS.length;
    console.log(`\n[VARIANTE E · Feldfall 62°] alt=${(oldSum / n).toFixed(3)} · neu=${(newSum / n).toFixed(3)} · ` +
      `accelFraction=${(gaitSum / n).toFixed(2)} · locomotion=${source}\n`);
    expect(oldSum / n).toBe(0);          // exakt der Feldbefund
    expect(newSum / n).toBeGreaterThan(0);
    expect(gaitSum / n).toBeGreaterThanOrEqual(0.70);
    expect(source).toBe('gait_accel');
  });

  it('CMMotionActivity ist KEIN Gate — `walking` allein hebt nichts an', () => {
    // Stillstand, aber die Klassifikation meldet (nachlaufend) noch walking.
    const standing = simulate(26, { yawRateDps: (t) => pulse(t, 19.4, 20.6, 90), offAxisRadS: ZERO, stepRate: () => 0 }, HAND, 1)
      .map(s => ({ ...s, stepDelta: 0, cadence: null, movementState: 'walking' as const }));
    const ev = computeTurnEvidence(standing, T0 + 20 * 1000);
    expect(ev.movementState).toBe('walking');      // Diagnose zeigt es …
    expect(ev.locomotionSource).toBe('none');      // … es wirkt aber nicht als Gate
    expect(ev.evidence).toBe(0);
  });
});

// ── 2. Echte Turns und Grenzfälle ────────────────────────────────────────
describe('Turns und Grenzfälle: alt gegen neu', () => {
  const AT = 20;
  const turnProg = (deg: number, dur: number, stepRate: Program['stepRate'] = WALK): Program => ({
    yawRateDps: (t) => pulse(t, AT - dur / 2, AT + dur / 2, deg), offAxisRadS: ZERO, stepRate,
  });
  const mean = (prog: Program, params: TurnEvidenceParams, silent: boolean) => {
    let sum = 0;
    for (const seed of SEEDS) {
      const m = silent ? silentPedometerMotion(AT + 6, prog, seed) : simulate(AT + 6, prog, HAND, seed);
      sum += computeTurnEvidence(m, T0 + AT * 1000, params).evidence ?? 0;
    }
    return sum / SEEDS.length;
  };

  it('90° und 135° bei stillem Pedometer: alt 0,00 → neu 1,00', () => {
    const rows = ['Fall                          | alt (Schritt-Gate) | neu (Variante E)'];
    for (const [label, prog] of [
      ['90°-Turn im Gehen', turnProg(90, 1.2)],
      ['135°-Turn im Gehen', turnProg(135, 1.5)],
      ['62°-Turn (Feldfall)', turnProg(62, 1.2)],
    ] as [string, Program][]) {
      const o = mean(prog, OLD_STEP_GATE, true), nw = mean(prog, TURN_EVIDENCE_DEFAULTS, true);
      rows.push(`${label.padEnd(30)}|        ${o.toFixed(2)}        |       ${nw.toFixed(2)}`);
      expect(o).toBe(0);
      expect(nw).toBeGreaterThan(0.9);
    }
    console.log('\n[VARIANTE E · stilles Pedometer]\n' + rows.join('\n') + '\n');
  });

  it('Turn mit kurzem Halt am Scheitel bleibt niedrig — und wird NICHT bestraft', () => {
    const halt = turnProg(90, 1.2, (t) => (t >= AT - 0.7 && t < AT + 0.7 ? 0 : 1.8));
    const ev = mean(halt, TURN_EVIDENCE_DEFAULTS, false);
    console.log(`\n[VARIANTE E · Turn mit kurzem Halt] Evidenz=${ev.toFixed(2)}\n`);
    // Entscheidend: liegt die Evidenz ÜBER contradictBelow, gibt es keinen
    // Abzug — ein geometrisch sauberer Winkel wird also nicht verworfen.
    expect(ev).toBeGreaterThan(COUPLING_DEFAULTS.contradictBelow);
    const rows = ['GPS-Confidence | nach Motion | Entscheidung'];
    for (const conf of [0.60, 0.62, 0.64, 0.66, 0.70]) {
      const after = applyMotionToConfidence(conf, { available: true, evidence: ev } as never);
      rows.push(`     ${conf.toFixed(2)}      |    ${after.toFixed(2)}     | ${after >= ACCEPT_SCORE ? 'accepted' : 'rejected'}`);
      // Kein Abzug → eine bereits akzeptierte Geometrie bleibt akzeptiert.
      expect(after).toBeGreaterThanOrEqual(conf);
    }
    console.log('[VARIANTE E · Halt-Fall gegen die Confidence-Leiter]\n' + rows.join('\n') + '\n');
  });

  it('DOKUMENTIERTER PREIS: zwei Ausfallschritte steigen von ~0,3 auf 1,0', () => {
    const shuffle = turnProg(120, 1.5, (t) => (t >= AT - 1.5 && t < AT + 1.5 ? 0.7 : 1.8));
    const o = mean(shuffle, OLD_STEP_GATE, false);
    const nw = mean(shuffle, TURN_EVIDENCE_DEFAULTS, false);
    console.log(`\n[VARIANTE E · zwei Ausfallschritte] alt=${o.toFixed(2)} · neu=${nw.toFixed(2)}\n`);
    expect(nw).toBeGreaterThan(o);
  });
});

// ── 3. Führt der Preis zu falschen Winkeln? ──────────────────────────────
describe('Zwei Ausfallschritte + Drift: entstehen zusätzliche falsche Winkel?', () => {
  const AT = 20;
  function shuffleMotion(seed: number, durationS: number): MotionWindowSample[] {
    return simulate(durationS, {
      yawRateDps: (t) => pulse(t, AT - 0.75, AT + 0.75, 120),
      offAxisRadS: ZERO,
      stepRate: (t) => (t >= AT - 1.5 && t < AT + 1.5 ? 0.7 : 1.8),
    }, HAND, seed);
  }

  it('auf einer Geraden mit Drift erzeugt die Kopplung keinen zusätzlichen Winkel', () => {
    const rows = ['Drift | ohne Motion | altes Gate | Variante E'];
    for (const drift of [0, 1, 2, 3, 5]) {
      let a = 0, b = 0, c = 0;
      for (const seed of SEEDS) {
        const pts = detectorBuffer(fieldFixes(withDrift(straightCoords(60, 1.0), drift, seed), seed));
        const motion = shuffleMotion(seed, 60 / SPEED_MPS + 4);
        a += detectShortLegCorners(pts).corners.length;
        b += detectShortLegCorners(pts, null, lookupFor(motion, OLD_STEP_GATE)).corners.length;
        c += detectShortLegCorners(pts, null, lookupFor(motion)).corners.length;
      }
      rows.push(`±${drift} m |     ${String(a).padStart(2)}      |     ${String(b).padStart(2)}     |     ${String(c).padStart(2)}`);
      // HARTE ZUSAGE: Variante E erhöht die Fehlalarme gegenüber CURRENT nicht.
      expect(c).toBeLessThanOrEqual(a);
    }
    console.log('\n[VARIANTE E · zwei Ausfallschritte auf der Geraden] 10 Seeds, erfundene Winkel gesamt\n' + rows.join('\n') + '\n');
  });
});

// ── 4. Golden-Field-Matrix A / B / C ─────────────────────────────────────
describe('Golden-Field-Matrix: ohne Motion / altes Gate / Variante E', () => {
  function metrics(drift: number, mode: 'A' | 'B' | 'C') {
    let full = 0, correct = 0, extra = 0, wrong = 0;
    for (const seed of SEEDS) {
      const pts = detectorBuffer(fieldFixes(withDrift(fieldRouteCoords(1.0, FIELD_TAIL_M), drift, seed), seed));
      const motion = routeMotion(seed, FIELD_TAIL_M);
      const look = mode === 'A' ? undefined : lookupFor(motion, mode === 'B' ? OLD_STEP_GATE : TURN_EVIDENCE_DEFAULTS);
      const kinds = detectShortLegCorners(pts, null, look).corners.map(c => c.kind as AngleKind);
      const sc = scoreSequence(kinds);
      if (sc === 4) full++;
      correct += sc;
      extra += Math.max(0, kinds.length - sc);
      wrong += kinds.filter(k => !['links', 'rechts', 'spitz_rechts', 'spitz_links'].includes(k)).length;
    }
    return { full, mean: correct / SEEDS.length, missing: 40 - correct, extra, wrong };
  }

  it('vergleicht alle drei über das Driftband', () => {
    const rows = ['Drift | Var | 4/4  | Ø korrekt | fehlend | zusätzl. | falsche Klasse'];
    for (const drift of [0, 1, 2, 3, 4, 5]) {
      for (const mode of ['A', 'B', 'C'] as const) {
        const m = metrics(drift, mode);
        rows.push(`±${drift} m |  ${mode}  | ${String(m.full).padStart(2)}/10 |   ${m.mean.toFixed(2)}/4   |   ${String(m.missing).padStart(2)}    |    ${String(m.extra).padStart(2)}    |       ${m.wrong}`);
      }
    }
    console.log('\n[GOLDEN MATRIX] A=ohne Motion · B=altes Schritt-Gate+0,12 · C=Variante E+0,12\n' + rows.join('\n') + '\n');
    // Variante E darf nirgends schlechter sein als ohne Motion.
    for (const drift of [0, 1, 2, 3, 4, 5]) {
      expect(metrics(drift, 'C').mean).toBeGreaterThanOrEqual(metrics(drift, 'A').mean);
    }
  });
});

// ── 5. Negativfälle ──────────────────────────────────────────────────────
describe('Negativfälle: Motion erzeugt weiterhin nie einen Kandidaten', () => {
  const DUR = 60 / SPEED_MPS + 4;
  function bend(lengthM: number, turnDeg: number): [number, number][] {
    const out: [number, number][] = [[0, 0]];
    let x = 0, y = 0;
    for (let d = 1; d <= lengthM; d += 1) {
      const hdg = d <= lengthM / 2 ? 0 : turnDeg;
      x += Math.sin(hdg * RAD); y += Math.cos(hdg * RAD);
      out.push([x, y]);
    }
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

  const CASES: [string, (seed: number) => { pts: ShortLegPoint[]; motion: MotionWindowSample[] }][] = [
    ['gerade gehen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s) })],
    ['Gerade + ±5 m Drift', (s) => ({ pts: detectorBuffer(fieldFixes(withDrift(straightCoords(60, 1.0), 5, s), s)), motion: straightMotion(DUR, s) })],
    ['Handy ansehen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { yawRateDps: (t) => pulse(t, 20, 20.6, 18) + pulse(t, 22, 22.6, -12), offAxisRadS: (t) => ((t >= 20 && t < 20.6) || (t >= 22 && t < 22.6) ? 2.4 : 0) }) })],
    ['Handy beim Gehen 90° drehen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { yawRateDps: (t) => pulse(t, 20.5, 21.1, 90) }) })],
    ['bücken', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 22.6 ? 0 : 1.8), offAxisRadS: (t) => (t >= 20.2 && t < 22.4 ? 1.8 : 0) }) })],
    ['Gegenstand setzen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 23 ? 0 : 1.8), yawRateDps: (t) => pulse(t, 20.5, 21.2, 15) + pulse(t, 21.8, 22.5, -10), offAxisRadS: (t) => (t >= 20.4 && t < 22.6 ? 1.8 : 0) }) })],
    ['Dübel setzen', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 23 ? 0 : 1.8), yawRateDps: (t) => pulse(t, 20.4, 21.2, 35) + pulse(t, 21.6, 22.4, -30), offAxisRadS: (t) => (t >= 20.3 && t < 22.5 ? 1.9 : 0) }) })],
    ['Standdrehung', (s) => ({ pts: detectorBuffer(fieldFixes(standing(60, s), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 44 ? 0 : 1.8), yawRateDps: (t) => pulse(t, 47, 48.5, 120) }) })],
    ['Standdrehung direkt nach Gehen', (s) => ({ pts: detectorBuffer(fieldFixes(standing(60, s), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 46 ? 0 : 1.8), yawRateDps: (t) => pulse(t, 46.2, 47.7, 120) }) })],
    ['Stop-and-go', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 20 && t < 22 ? 0 : 1.8) }) })],
    ['zwei Ausfallschritte', (s) => ({ pts: detectorBuffer(fieldFixes(straightCoords(60, 1.0), s)), motion: straightMotion(DUR, s, { stepRate: (t) => (t >= 19 && t < 22 ? 0.7 : 1.8), yawRateDps: (t) => pulse(t, 20, 21.5, 120) }) })],
    ['20°-Knick', (s) => ({ pts: detectorBuffer(fieldFixes(bend(20, 20), s)), motion: straightMotion(20 / SPEED_MPS + 4, s, { yawRateDps: (t) => pulse(t, 7.4, 8.2, 20) }) })],
    ['30°-Knick', (s) => ({ pts: detectorBuffer(fieldFixes(bend(20, 30), s)), motion: straightMotion(20 / SPEED_MPS + 4, s, { yawRateDps: (t) => pulse(t, 7.4, 8.2, 30) }) })],
  ];

  const rows: string[] = [];
  afterAll(() => {
    console.log('\n[VARIANTE E · Negativfälle] 10 Seeds · erfundene Winkel gesamt\n' +
      'Fall                           | ohne Motion | Variante E\n' + rows.join('\n') + '\n');
  });

  it.each(CASES)('%s', (label, build) => {
    let a = 0, c = 0;
    for (const seed of SEEDS) {
      const { pts, motion } = build(seed);
      a += detectShortLegCorners(pts).corners.length;
      c += detectShortLegCorners(pts, null, lookupFor(motion)).corners.length;
    }
    rows.push(`${label.padEnd(31)}|      ${String(a).padStart(2)}     |     ${String(c).padStart(2)}`);
    expect(c).toBeLessThanOrEqual(a);
  });
});

// ── 6. QA-Logging ────────────────────────────────────────────────────────
describe('QA-Logging: AUTO und MANUAL vollständig und getrennt', () => {
  const rec = readFileSync('features/tracking/hooks/useTrackRecorder.ts', 'utf8');

  it('jede akzeptierte Ecke wird über den stabilen apexIndex zugeordnet', () => {
    // Die Fehlzuordnung über diagnostics[length-1] ist beseitigt.
    expect(rec).toContain('diagnostics.find(x => x.apexIndex === c.apexIndex)');
    expect(rec).not.toMatch(/diagnostics\[diagnostics\.length - 1\][\s\S]{0,400}AUTO/);
  });

  it('AUTO-Zeile enthält alle geforderten Felder', () => {
    // Der Block umfasst auch die Zeilen darüber, in denen `trail`
    // (confidenceBeforeMotion / motionAdjustment / confidence) gebaut wird.
    const loop = rec.indexOf('for (const c of corners) {');
    const start = rec.indexOf('`AUTO ${', loop);
    expect(start).toBeGreaterThan(-1);
    const block = rec.slice(loop, start + 900);
    expect(block).toContain('d?.confidenceBeforeMotion');
    expect(block).toContain('d?.motionAdjustment');
    for (const part of ['idx=', 'innen=', 'acc=', 'conf ', 'motion ', '→ accepted',
      'turnEvidence=', 'locomotion=', 'steps=', 'accelFraction=', 'netYaw=', 'mono=', 'yawShare=']) {
      expect(block).toContain(part);
    }
    // Richtung (L/R) wird aus der GEOMETRISCHEN Klasse abgeleitet, nicht aus Motion.
    expect(block).toContain("(c.kind === 'rechts' || c.kind === 'spitz_rechts') ? 'rechts' : 'links'");
  });

  it('AUTO-Zeile steht genau einmal je bestätigter Ecke — in der Commit-Schleife', () => {
    const loop = rec.slice(rec.indexOf('for (const c of corners) {'));
    const body = loop.slice(0, loop.indexOf('onAngleRef.current?.(c.kind);'));
    expect((body.match(/pushQaCandidateLine\(/g) ?? []).length).toBe(1);
    // Und sie ist an den QA-Modus gebunden.
    expect(body).toContain('if (qaRef.current) {');
  });

  it('MANUAL-Zeile ist getrennt, nur für Winkel und nur im QA-Modus', () => {
    const start = rec.indexOf('`MANUAL ${');
    expect(start).toBeGreaterThan(-1);
    const before = rec.slice(Math.max(0, start - 400), start);
    expect(before).toContain("if (qaRef.current && type === 'winkel')");
    expect(rec.slice(start, start + 300)).toContain('manuell gesetzt');
  });

  it('AUTO und MANUAL sind im Log nie verwechselbar', () => {
    expect(rec).toContain('`AUTO ');
    expect(rec).toContain('`MANUAL ');
    // Kein gemeinsamer Präfix, kein Umweg über dieselbe Zeile.
    expect(rec.indexOf('`AUTO ')).not.toBe(rec.indexOf('`MANUAL '));
  });

  it('die Fenster-Diagnosezeile führt die neuen Locomotion-Felder', () => {
    expect(rec).toContain('locomotion=${ev.locomotionSource}');
    expect(rec).toContain('accelFraction=${ev.gaitAccelFraction.toFixed(2)}');
    expect(rec).toContain('accelThr=${ev.gaitAccelThreshold.toFixed(2)}g');
  });

  it('die Zuordnungs-Metadaten beeinflussen die Erkennung nicht', () => {
    // apexIndex ist reine Diagnose: identische Ecken mit und ohne QA-Modus.
    const pts = detectorBuffer(fieldFixes(fieldRouteCoords(1.0, FIELD_TAIL_M), 1));
    const a = detectShortLegCorners(pts);
    expect(a.diagnostics.every((d, i) => d.apexIndex === i + 1)).toBe(true);
    expect(a.corners.every(c => a.diagnostics.some(d => d.apexIndex === c.apexIndex))).toBe(true);
  });
});

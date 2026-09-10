// Isolierter Motion-Evidenz-Benchmark.
//
// Frage: Lässt sich aus dem HEUTE VERFÜGBAREN Core-Motion-Payload eine
// Evidenz "hier fand eine reale Drehbewegung statt" gewinnen, die echte Ecken
// statistisch von typischen Gerätebewegungen trennt?
//
// ── Wie simuliert wird ───────────────────────────────────────────────────
// Nicht durch Erfinden von Fensterwerten, sondern durch Nachbau der nativen
// Aggregation (AnyvoMotionManager.swift):
//   • intern 20 Hz  (deviceMotionUpdateInterval = 1/20)
//   • Emit alle 250 ms
//   • rotationMagnitude = MITTELWERT von |rotationRate| über das Fenster
//   • headingDelta      = yaw(letztes Tick) − yaw(erstes Tick) des Fensters
//   • stepDelta         = ganzzahlige Schrittdifferenz seit dem letzten Emit
// Dadurch erben die Testdaten dieselben Verluste wie die Realität (Mittelung,
// Fensterleckage, Quantisierung der Schritte).
//
// ── Was diese Tests NICHT sind ───────────────────────────────────────────
// Kein Feldbeweis. Die Bewegungsprogramme (Drehdauern, Rotationsamplituden
// beim Handy-Heben, Gait-Yaw-Wobble) sind physikalisch plausibel gewählte
// ANNAHMEN, keine Messungen an einem echten Gerät. Jede Aussage unten gilt
// unter genau diesen Annahmen. Der QA-Diagnosemodus (MotionEvidenceBuffer +
// formatCandidateEvidenceLog) existiert genau deshalb.

import {
  computeTurnEvidence, applyMotionToConfidence, MotionEvidenceBuffer,
  formatCandidateEvidenceLog, TURN_EVIDENCE_DEFAULTS, COUPLING_DEFAULTS,
  type MotionWindowSample, type TurnEvidenceParams,
} from '@/features/tracking/utils/motionTurnEvidence';
import {
  simulate, pulse, ZERO, WALK, HAND, POCKET, NORMAL_STEP_RATE, T0,
  type Program, type Carry,
} from './helpers/motionScenarioSim';

// ── Programm-Bausteine ────────────────────────────────────────────────────
function box(t: number, from: number, to: number, v: number): number {
  return t >= from && t < to ? v : 0;
}

interface Scenario { name: string; positive: boolean; build: (seed: number) => { samples: MotionWindowSample[]; candidateT: number; speedAt?: (t: number) => number }; }

const CENTER_S = 4.0;   // Kandidat liegt in allen Einzelszenarien bei t0+4 s

function single(name: string, positive: boolean, prog: Partial<Program>, carry: Carry = HAND): Scenario {
  const full: Program = { yawRateDps: prog.yawRateDps ?? ZERO, offAxisRadS: prog.offAxisRadS ?? ZERO, stepRate: prog.stepRate ?? WALK };
  return {
    name, positive,
    build: (seed) => ({ samples: simulate(8, full, carry, seed), candidateT: T0 + CENTER_S * 1000 }),
  };
}

// Eine Drehung von `deg` Grad, zentriert um CENTER_S, mit Dauer `durS`.
function turn(deg: number, durS: number) {
  const from = CENTER_S - durS / 2;
  return (t: number) => pulse(t, from, from + durS, deg);
}

const SCENARIOS: Scenario[] = [
  // ── Positiv: echte Richtungswechsel im Gehen ──
  single('90° links (normal, 1,2 s)', true, { yawRateDps: turn(+90, 1.2) }),
  single('90° rechts (normal, 1,2 s)', true, { yawRateDps: turn(-90, 1.2) }),
  single('Spitzwinkel links (135°, 1,5 s)', true, { yawRateDps: turn(+135, 1.5) }),
  single('Spitzwinkel rechts (135°, 1,5 s)', true, { yawRateDps: turn(-135, 1.5) }),
  single('90° langsam (2,5 s)', true, { yawRateDps: turn(+90, 2.5) }),
  single('90° schnell (0,6 s)', true, { yawRateDps: turn(+90, 0.6) }),
  single('90° mit kurzem Halt am Scheitel', true, {
    yawRateDps: turn(+90, 1.2),
    stepRate: (t) => (t >= CENTER_S - 0.7 && t < CENTER_S + 0.7 ? 0 : NORMAL_STEP_RATE),
  }),
  single('90° links, Handy in der Tasche', true, { yawRateDps: turn(+90, 1.2) }, POCKET),
  single('135° rechts, Handy in der Tasche', true, { yawRateDps: turn(-135, 1.5) }, POCKET),

  // ── Negativ: keine Richtungsänderung ──
  single('geradeaus gehen', false, {}),
  single('geradeaus, Handy in der Tasche', false, {}, POCKET),
  single('geradeaus + Handy ansehen', false, {
    // Heben: pitch-dominiert (2,4 rad/s), Yaw nur beiläufig; Senken teilweise zurück.
    yawRateDps: (t) => pulse(t, CENTER_S - 0.9, CENTER_S - 0.3, +18) + pulse(t, CENTER_S + 0.6, CENTER_S + 1.2, -12),
    offAxisRadS: (t) => box(t, CENTER_S - 0.9, CENTER_S - 0.3, 2.4) + box(t, CENTER_S + 0.6, CENTER_S + 1.2, 2.0),
  }),
  single('geradeaus + Handy um 90° drehen', false, {
    yawRateDps: turn(+90, 0.6),
    offAxisRadS: (t) => box(t, CENTER_S - 0.3, CENTER_S + 0.3, 0.6),
  }),
  single('Gegenstand ablegen (bücken)', false, {
    stepRate: (t) => (t >= CENTER_S - 1.3 && t < CENTER_S + 1.3 ? 0 : NORMAL_STEP_RATE),
    yawRateDps: (t) => pulse(t, CENTER_S - 0.8, CENTER_S - 0.2, +15) + pulse(t, CENTER_S + 0.2, CENTER_S + 0.8, -10),
    offAxisRadS: (t) => box(t, CENTER_S - 0.9, CENTER_S - 0.1, 1.8) + box(t, CENTER_S + 0.1, CENTER_S + 0.9, 1.6),
  }),
  single('Dübel setzen (bücken + drehen)', false, {
    stepRate: (t) => (t >= CENTER_S - 1.5 && t < CENTER_S + 1.5 ? 0 : NORMAL_STEP_RATE),
    yawRateDps: (t) => pulse(t, CENTER_S - 1.0, CENTER_S - 0.2, +35) + pulse(t, CENTER_S + 0.3, CENTER_S + 1.1, -30),
    offAxisRadS: (t) => box(t, CENTER_S - 1.1, CENTER_S - 0.1, 1.9) + box(t, CENTER_S + 0.2, CENTER_S + 1.2, 1.7),
  }),
  single('Stop-and-go (geradeaus)', false, {
    stepRate: (t) => (t >= CENTER_S - 0.8 && t < CENTER_S + 0.8 ? 0 : NORMAL_STEP_RATE),
  }),
  single('im Stand Körper+Handy drehen', false, {
    stepRate: (t) => (t >= CENTER_S - 1.5 && t < CENTER_S + 1.5 ? 0 : NORMAL_STEP_RATE),
    yawRateDps: turn(+120, 1.5),
  }),
  single('im Stand drehen mit 2 Ausfallschritten', false, {
    stepRate: (t) => (t >= CENTER_S - 1.5 && t < CENTER_S + 1.5 ? 0.7 : NORMAL_STEP_RATE),
    yawRateDps: turn(+120, 1.5),
  }),
  single('sanfter Bogen (90° über 6 s)', false, { yawRateDps: pulseArc(90, 6) }),
  single('S-Kurve (+45°/−45° über 4 s)', false, {
    yawRateDps: (t) => pulse(t, CENTER_S - 2.0, CENTER_S, +45) + pulse(t, CENTER_S, CENTER_S + 2.0, -45),
  }),
];

function pulseArc(deg: number, durS: number) {
  const from = CENTER_S - durS / 2;
  return (t: number) => pulse(t, from, from + durS, deg);
}

// ── Auswertung ────────────────────────────────────────────────────────────
const SEEDS = [11, 23, 37, 41, 59, 71, 83, 97, 101, 113];

function meanOf(v: number[]): number { return v.reduce((a, b) => a + b, 0) / v.length; }
function pct(v: number[], p: number): number {
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function evidenceOver(sc: Scenario, params: TurnEvidenceParams): number[] {
  return SEEDS.map(seed => {
    const { samples, candidateT } = sc.build(seed);
    const ev = computeTurnEvidence(samples, candidateT, params);
    return ev.evidence ?? 0;
  });
}

const WINDOWS = [0.5, 1.0, 1.5, 2.0];

describe('Motion-Turn-Evidenz — Fenster-Sweep', () => {
  it('misst jedes Szenario über ±0,5/1,0/1,5/2,0 s', () => {
    const rows: string[] = [];
    rows.push('Szenario                                  | ±0,5s | ±1,0s | ±1,5s | ±2,0s');
    for (const sc of SCENARIOS) {
      const cells = WINDOWS.map(w => {
        const vals = evidenceOver(sc, { ...TURN_EVIDENCE_DEFAULTS, halfWindowSec: w });
        return meanOf(vals).toFixed(2);
      });
      rows.push(`${(sc.positive ? '[+] ' : '[-] ') + sc.name}`.padEnd(42) + '| ' + cells.join('  | '));
    }
    console.log('\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(SCENARIOS.length + 1);
  });

  // Zwei Klassen sind vorab als NICHT trennbar bzw. als bewusst hingenommener
  // Fehlalarm-Verzicht ausgewiesen und werden deshalb SEPARAT bilanziert —
  // nicht stillschweigend aus der Statistik entfernt:
  //  • "geradeaus + Handy um 90° drehen": eine reine Gerätedrehung um die
  //    Vertikale ist im vorhandenen Payload identisch zu einer Körperdrehung.
  //  • "90° mit kurzem Halt am Scheitel": echte Ecke, aber ohne Schritte im
  //    Fenster → niedrige Evidenz. Unschädlich, weil Motion nie ein Veto hat.
  //  • "im Stand drehen mit 2 Ausfallschritten": NEU seit dem Wechsel auf
  //    Variante E (Gang-Beschleunigungssignatur statt hartem Schritt-Gate).
  //    Zwei echte Ausfallschritte erzeugen dieselbe Beschleunigungssignatur wie
  //    Gehen — der gemessene Preis dafür, dass ein realer Turn bei stillem
  //    CMPedometer nicht mehr auf Evidenz 0 fällt (Feldbefund Teil B).
  const EXCEPTIONS = [
    'geradeaus + Handy um 90° drehen',
    '90° mit kurzem Halt am Scheitel',
    'im Stand drehen mit 2 Ausfallschritten',
  ];

  it('bestes Fenster: grösster Abstand zwischen schwächstem Positiv und stärkstem Negativ', () => {
    const summary: string[] = ['Fenster | min(Pos) | max(Neg) | Abstand | min(Pos)* | max(Neg)* | Abstand*'];
    let best = { w: 0, gap: -Infinity };
    for (const w of WINDOWS) {
      const params = { ...TURN_EVIDENCE_DEFAULTS, halfWindowSec: w };
      const val = (s: Scenario) => meanOf(evidenceOver(s, params));
      const pos = SCENARIOS.filter(s => s.positive).map(val);
      const neg = SCENARIOS.filter(s => !s.positive).map(val);
      const posX = SCENARIOS.filter(s => s.positive && !EXCEPTIONS.includes(s.name)).map(val);
      const negX = SCENARIOS.filter(s => !s.positive && !EXCEPTIONS.includes(s.name)).map(val);
      const [minPos, maxNeg] = [Math.min(...pos), Math.max(...neg)];
      const [minPosX, maxNegX] = [Math.min(...posX), Math.max(...negX)];
      summary.push(
        `±${w.toFixed(1)}s   |   ${minPos.toFixed(2)}   |  ${maxNeg.toFixed(2)}   |  ${(minPos - maxNeg).toFixed(2)}  ` +
        `|   ${minPosX.toFixed(2)}    |   ${maxNegX.toFixed(2)}    |   ${(minPosX - maxNegX).toFixed(2)}`,
      );
      if (minPosX - maxNegX > best.gap) best = { w, gap: minPosX - maxNegX };
    }
    console.log('\n' + summary.join('\n') +
      '\n* = ohne die zwei dokumentierten Ausnahmeklassen' +
      `\nbestes Fenster: ±${best.w}s (Abstand* ${best.gap.toFixed(2)})\n`);
    // GEMESSEN: den grössten Abstand liefert ±0,5 s (0,71) — dort sind aber
    // auch die schwächsten echten Ecken am schwächsten (langsame Drehung 0,71).
    // ±1,0 s hat den kleineren Abstand (0,53), dafür das HÖHERE Minimum über
    // alle echten Ecken (0,89 statt 0,71). Für ein reines Stütz-Signal zählt
    // das Minimum der Positiven mehr als der Abstand — deshalb steht ±1,0 s im
    // Default, nicht ±0,5 s. Beides wird hier als Messung festgehalten.
    expect(best.w).toBe(0.5);
    expect(best.gap).toBeGreaterThan(0.3);
    const at = (w: number) => {
      const params = { ...TURN_EVIDENCE_DEFAULTS, halfWindowSec: w };
      const posX = SCENARIOS.filter(s => s.positive && !EXCEPTIONS.includes(s.name)).map(s => meanOf(evidenceOver(s, params)));
      return Math.min(...posX);
    };
    expect(at(1.0)).toBeGreaterThan(at(0.5));
    expect(TURN_EVIDENCE_DEFAULTS.halfWindowSec).toBe(1.0);
  });
});

describe('Motion-Turn-Evidenz — Trennschärfe bei ±1,0 s', () => {
  const params = TURN_EVIDENCE_DEFAULTS;

  it('echte 90°-Ecken im Gehen liefern hohe Evidenz', () => {
    for (const name of ['90° links (normal, 1,2 s)', '90° rechts (normal, 1,2 s)', '90° schnell (0,6 s)']) {
      const sc = SCENARIOS.find(s => s.name === name)!;
      expect(meanOf(evidenceOver(sc, params))).toBeGreaterThan(0.9);
    }
  });

  it('echte Spitzwinkel im Gehen liefern hohe Evidenz', () => {
    for (const name of ['Spitzwinkel links (135°, 1,5 s)', 'Spitzwinkel rechts (135°, 1,5 s)']) {
      const sc = SCENARIOS.find(s => s.name === name)!;
      expect(meanOf(evidenceOver(sc, params))).toBeGreaterThan(0.9);
    }
  });

  it('Handy in der Tasche verschlechtert echte Ecken nicht unter die Stützschwelle', () => {
    for (const name of ['90° links, Handy in der Tasche', '135° rechts, Handy in der Tasche']) {
      const sc = SCENARIOS.find(s => s.name === name)!;
      expect(meanOf(evidenceOver(sc, params))).toBeGreaterThan(COUPLING_DEFAULTS.supportAbove);
    }
  });

  it('geradeaus gehen erzeugt keine Evidenz — in der Hand wie in der Tasche', () => {
    for (const name of ['geradeaus gehen', 'geradeaus, Handy in der Tasche']) {
      const sc = SCENARIOS.find(s => s.name === name)!;
      expect(pct(evidenceOver(sc, params), 0.9)).toBeLessThan(COUPLING_DEFAULTS.contradictBelow);
    }
  });

  it('Bücken/Gegenstand/Dübel/Stop/Standdrehung bleiben unter der Stützschwelle', () => {
    for (const name of [
      'Gegenstand ablegen (bücken)', 'Dübel setzen (bücken + drehen)',
      'Stop-and-go (geradeaus)', 'im Stand Körper+Handy drehen',
    ]) {
      const sc = SCENARIOS.find(s => s.name === name)!;
      expect(pct(evidenceOver(sc, params), 0.9)).toBeLessThan(COUPLING_DEFAULTS.supportAbove);
    }
  });

  it('DOKUMENTIERTE GRENZE: Handy im Gehen um 90° drehen ist NICHT von einer Ecke trennbar', () => {
    const sc = SCENARIOS.find(s => s.name === 'geradeaus + Handy um 90° drehen')!;
    const vals = evidenceOver(sc, params);
    // Bewusst als Tatsache festgehalten, nicht wegdefiniert: eine reine
    // Gerätedrehung um die Vertikale ist im vorhandenen Payload identisch zu
    // einer Körperdrehung. Deshalb darf Motion NIE allein einen Winkel
    // erzeugen — genau das sichert der Kopplungs-Test weiter unten ab.
    expect(meanOf(vals)).toBeGreaterThan(0.5);
  });

  it('gibt eine vollständige Kennzahlentabelle aus', () => {
    const rows = ['Szenario                                  |  ev  | netYaw | mono | conc | yawSh | steps/s'];
    for (const sc of SCENARIOS) {
      const per = SEEDS.map(seed => {
        const { samples, candidateT } = sc.build(seed);
        return computeTurnEvidence(samples, candidateT, params);
      });
      rows.push(
        ((sc.positive ? '[+] ' : '[-] ') + sc.name).padEnd(42) +
        `| ${meanOf(per.map(p => p.evidence ?? 0)).toFixed(2)} ` +
        `| ${meanOf(per.map(p => p.netYawDeg)).toFixed(1).padStart(6)} ` +
        `| ${meanOf(per.map(p => p.monotonicity)).toFixed(2)} ` +
        `| ${meanOf(per.map(p => p.concentration)).toFixed(2)} ` +
        `| ${meanOf(per.map(p => p.yawShare)).toFixed(2)}  ` +
        `| ${meanOf(per.map(p => p.stepRate)).toFixed(2)}`,
      );
    }
    console.log('\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(SCENARIOS.length + 1);
  });
});

describe('Motion-Turn-Evidenz — Schritte/Kadenz getrennt bewertet', () => {
  it('Ablation: ohne den Fortbewegungs-Gate steigen die Stand-Szenarien an', () => {
    const withGate = TURN_EVIDENCE_DEFAULTS;
    const withoutGate: TurnEvidenceParams = { ...TURN_EVIDENCE_DEFAULTS, stepRateLo: -1, stepRateHi: -0.5 };
    const rows = ['Szenario                                  | mit Steps | ohne Steps'];
    let anyImproved = false;
    for (const sc of SCENARIOS.filter(s => !s.positive)) {
      const a = meanOf(evidenceOver(sc, withGate));
      const b = meanOf(evidenceOver(sc, withoutGate));
      if (b - a > 0.2) anyImproved = true;
      rows.push(((sc.positive ? '[+] ' : '[-] ') + sc.name).padEnd(42) + `|   ${a.toFixed(2)}    |   ${b.toFixed(2)}`);
    }
    console.log('\n' + rows.join('\n') + '\n');
    // Der Schritt-Gate ist der einzige Diskriminator gegen Bewegungen im Stand.
    expect(anyImproved).toBe(true);
  });

  it('echte Ecken verlieren durch den Schritt-Gate nicht', () => {
    const sc = SCENARIOS.find(s => s.name === '90° links (normal, 1,2 s)')!;
    expect(meanOf(evidenceOver(sc, TURN_EVIDENCE_DEFAULTS))).toBeGreaterThan(0.9);
  });

  it('ein kurzer Halt am Scheitel senkt die Evidenz — bewusst kein Veto', () => {
    const sc = SCENARIOS.find(s => s.name === '90° mit kurzem Halt am Scheitel')!;
    const v = meanOf(evidenceOver(sc, TURN_EVIDENCE_DEFAULTS));
    const ref = meanOf(evidenceOver(SCENARIOS.find(s => s.name === '90° links (normal, 1,2 s)')!, TURN_EVIDENCE_DEFAULTS));
    expect(v).toBeLessThan(ref);
    // …und genau deshalb darf schwache Evidenz eine starke GPS-Geometrie nicht kippen:
    expect(applyMotionToConfidence(0.85, { available: true, evidence: v } as never)).toBe(0.85);
  });
});

// ── Kurze Schenkel: Nachbarecken im Fenster ───────────────────────────────
describe('Motion-Turn-Evidenz — kurze Schenkel (3,75 m / 5 m)', () => {
  // Reale Testroute: L → R → SR → SL. Bei 1,3 m/s liegen 3,75-m-Schenkel nur
  // 2,9 s auseinander — ein zu breites Fenster fängt die Nachbarecke mit ein,
  // und weil L und R entgegengesetzt drehen, LÖSCHT sich die Netto-Drehung aus.
  function route(legM: number, seed: number) {
    const speed = 1.3;
    const legS = legM / speed;
    const turnDur = 1.2;
    const turnsDeg = [+90, -90, -135, +135];
    const startS = 3.0;
    const times = turnsDeg.map((_, i) => startS + i * legS);
    const prog: Program = {
      yawRateDps: (t) => turnsDeg.reduce((acc, deg, i) => acc + pulse(t, times[i] - turnDur / 2, times[i] + turnDur / 2, deg), 0),
      offAxisRadS: ZERO,
      stepRate: WALK,
    };
    const samples = simulate(startS + 4 * legS + 3, prog, HAND, seed);
    return { samples, candidateTimes: times.map(t => T0 + t * 1000) };
  }

  it('misst die Evidenz je Ecke über alle Fenster', () => {
    const rows = ['Schenkel | Fenster | Ecke1 | Ecke2 | Ecke3 | Ecke4'];
    for (const legM of [3.75, 5.0]) {
      for (const w of WINDOWS) {
        const params = { ...TURN_EVIDENCE_DEFAULTS, halfWindowSec: w };
        const perCorner = [0, 1, 2, 3].map(ci => meanOf(SEEDS.map(seed => {
          const { samples, candidateTimes } = route(legM, seed);
          return computeTurnEvidence(samples, candidateTimes[ci], params).evidence ?? 0;
        })));
        rows.push(`${legM.toFixed(2)} m  | ±${w.toFixed(1)}s   | ` + perCorner.map(v => v.toFixed(2)).join('  | '));
      }
    }
    console.log('\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(1 + 2 * WINDOWS.length);
  });

  // GEMESSENE KORREKTUR einer Ausgangshypothese: bei 3,75 m und 1,3 m/s liegen
  // die Ecken 2,88 s auseinander. Eine 1,2-s-Drehung reicht damit erst ab
  // halfWindow > 2,28 s in das Nachbarfenster hinein — bei ±2,0 s ist also noch
  // KEINE Auslöschung messbar (alle vier Ecken bleiben bei 1,00). Die Grenze
  // liegt tiefer, als vermutet; hier gemessen statt behauptet.
  it('Schenkellängen-Sweep: ab wann löscht die Nachbarecke die Netto-Drehung aus?', () => {
    const rows = ['Schenkel |  Abstand | ±0,5s | ±1,0s | ±1,5s | ±2,0s'];
    const evAt = (legM: number, w: number) => meanOf([0, 1, 2, 3].flatMap(ci => SEEDS.map(seed => {
      const { samples, candidateTimes } = route(legM, seed);
      return computeTurnEvidence(samples, candidateTimes[ci], { ...TURN_EVIDENCE_DEFAULTS, halfWindowSec: w }).evidence ?? 0;
    })));
    for (const legM of [1.5, 2.0, 2.5, 3.0, 3.75, 5.0]) {
      rows.push(
        `${legM.toFixed(2)} m  |  ${(legM / 1.3).toFixed(2)} s  | ` +
        WINDOWS.map(w => evAt(legM, w).toFixed(2)).join('  | '),
      );
    }
    console.log('\n' + rows.join('\n') + '\n');
    // Bei sehr kurzen Schenkeln MUSS ein breites Fenster schlechter sein als ein
    // schmales — genau das ist der Grund, das Fenster nicht blind zu vergrössern.
    expect(evAt(1.5, 2.0)).toBeLessThan(evAt(1.5, 0.5));
    // Bei 3,75 m ist der Unterschied dagegen (gemessen) nicht mehr vorhanden.
    expect(evAt(3.75, 2.0)).toBeCloseTo(evAt(3.75, 0.5), 2);
  });
});

// ── Invarianten der Kopplung ──────────────────────────────────────────────
describe('Kopplung an die GPS-Confidence', () => {
  const strongMotion = { available: true, evidence: 0.95 } as never;
  const weakMotion = { available: true, evidence: 0.02 } as never;
  const noMotion = { available: false, evidence: null } as never;

  it('ohne Motion-Daten bleibt die Confidence exakt unverändert', () => {
    for (const c of [0.1, 0.4, 0.62, 0.9]) expect(applyMotionToConfidence(c, noMotion)).toBe(c);
  });

  it('starke GPS-Geometrie wird durch widersprüchliche Motion NICHT gesenkt', () => {
    expect(applyMotionToConfidence(0.85, weakMotion)).toBe(0.85);
    expect(applyMotionToConfidence(0.95, weakMotion)).toBe(0.95);
  });

  it('schwache GPS-Geometrie wird durch passende Motion gestützt', () => {
    expect(applyMotionToConfidence(0.55, strongMotion)).toBeGreaterThan(0.55);
  });

  it('schwache GPS-Geometrie wird durch widersprüchliche Motion gedämpft', () => {
    expect(applyMotionToConfidence(0.35, weakMotion)).toBeLessThan(0.35);
  });

  it('Motion kann NIEMALS aus fehlender Geometrie einen Winkel machen', () => {
    // Confidence 0 = kein Kandidat. Auch maximale Rotationsevidenz hebt sie nicht
    // über die Akzeptanzschwelle des Detectors (0,62).
    expect(applyMotionToConfidence(0, strongMotion)).toBeLessThan(0.62);
    expect(applyMotionToConfidence(0.2, strongMotion)).toBeLessThan(0.62);
  });

  it('der Zuschlag ist nach oben begrenzt', () => {
    expect(applyMotionToConfidence(0.99, strongMotion)).toBeLessThanOrEqual(1);
    expect(applyMotionToConfidence(0.6, strongMotion) - 0.6).toBeLessThanOrEqual(COUPLING_DEFAULTS.maxBoost + 1e-9);
  });
});

// ── Struktur-Invarianten ──────────────────────────────────────────────────
describe('Struktur: Motion liefert keine Richtung', () => {
  it('spiegelbildliche Drehungen ergeben identische Evidenz', () => {
    const l = SCENARIOS.find(s => s.name === '90° links (normal, 1,2 s)')!;
    const r = SCENARIOS.find(s => s.name === '90° rechts (normal, 1,2 s)')!;
    const el = meanOf(evidenceOver(l, TURN_EVIDENCE_DEFAULTS));
    const er = meanOf(evidenceOver(r, TURN_EVIDENCE_DEFAULTS));
    expect(Math.abs(el - er)).toBeLessThan(0.05);
  });

  it('kein Feld des Ergebnisses trägt ein Vorzeichen der Drehrichtung', () => {
    const { samples, candidateT } = SCENARIOS.find(s => s.name === '90° rechts (normal, 1,2 s)')!.build(11);
    const ev = computeTurnEvidence(samples, candidateT);
    for (const [k, v] of Object.entries(ev)) {
      if (typeof v === 'number') expect(v).toBeGreaterThanOrEqual(0);
      expect(k).not.toMatch(/left|right|links|rechts|direction|bearing/i);
    }
  });
});

// ── Fenster-Auswahl und Datenverfügbarkeit ────────────────────────────────
describe('Fensterwahl und fehlende Daten', () => {
  it('zu wenige Samples → available=false, evidence=null (nicht 0)', () => {
    const ev = computeTurnEvidence([], T0);
    expect(ev.available).toBe(false);
    expect(ev.evidence).toBeNull();
  });

  it('ein zusätzliches Wegfenster begrenzt das Zeitfenster im Stillstand', () => {
    const sc = SCENARIOS.find(s => s.name === 'im Stand Körper+Handy drehen')!;
    const { samples, candidateT } = sc.build(11);
    // Weg steht still während der Drehung → Wegfenster lässt nur diese Samples zu.
    const cumDistAt = (t: number) => {
      const rel = (t - T0) / 1000;
      const walked = Math.max(0, Math.min(rel, CENTER_S - 1.5)) + Math.max(0, rel - (CENTER_S + 1.5));
      return walked * 1.3;
    };
    const wide = computeTurnEvidence(samples, candidateT, { ...TURN_EVIDENCE_DEFAULTS, halfWindowSec: 2.0 });
    const bounded = computeTurnEvidence(samples, candidateT, { ...TURN_EVIDENCE_DEFAULTS, halfWindowSec: 2.0, halfWindowM: 0.4 }, cumDistAt);
    expect(bounded.sampleCount).toBeLessThan(wide.sampleCount);
    expect(bounded.evidence ?? 0).toBeLessThanOrEqual((wide.evidence ?? 0) + 1e-9);
  });
});

// ── QA-Diagnose ───────────────────────────────────────────────────────────
describe('QA-Diagnose (vorbereitet, nicht verdrahtet)', () => {
  it('Ringpuffer hält nur das Retention-Fenster', () => {
    const buf = new MotionEvidenceBuffer(5);
    const { samples } = SCENARIOS[0].build(11);
    samples.forEach(s => buf.push(s));
    const spanS = (samples[samples.length - 1].t - samples[0].t) / 1000;
    expect(spanS).toBeGreaterThan(5);
    expect(buf.size).toBeLessThanOrEqual(5 * 4 + 2);
  });

  it('Ringpuffer liefert dieselbe Evidenz wie die direkte Berechnung', () => {
    const buf = new MotionEvidenceBuffer(30);
    const { samples, candidateT } = SCENARIOS[0].build(23);
    samples.forEach(s => buf.push(s));
    expect(buf.evidenceFor(candidateT).evidence).toBeCloseTo(computeTurnEvidence(samples, candidateT).evidence!, 10);
  });

  it('Logzeile enthält alle geforderten QA-Felder und keine Rohdaten', () => {
    const { samples, candidateT } = SCENARIOS[0].build(37);
    const ev = computeTurnEvidence(samples, candidateT);
    const line = formatCandidateEvidenceLog({ t: candidateT, interiorAngleDeg: 92.4, confidence: 0.71, accepted: true }, ev);
    for (const field of ['t=', 'gpsAngle=', 'gpsConf=', 'netYaw=', 'mono=', 'conc=', 'peak=', 'dur=', 'steps=', 'cad=', 'state=', 'turnEvidence=']) {
      expect(line).toContain(field);
    }
    console.log('\nQA-Beispielzeile:\n' + line + '\n');
  });
});

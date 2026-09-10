// REALER GERÄTEBEFUND: warum `steps=0` bei `state=walking` vorkommt — und ob
// das heutige harte Schritt-Gate feldtauglich ist.
//
// ═══ Die reale Kandidatenzeile (Feldtest Teil B) ═══
//   19:20:28  acc=7.9m  GPS reject=no_window_after
//   netYaw=62.1° gross=65.7° mono=0.95 yawShare=0.69
//   steps=0  cadence=null  movementState=walking  turnEvidence=0.000
//
// Das iPhone sieht dort eine deutliche, monotone Drehung UND meldet
// gleichzeitig `walking` — trotzdem ist die Turn-Evidenz exakt 0, weil der
// Schritt-Gate in `computeTurnEvidence` multiplikativ wirkt.
//
// ═══ Warum das passieren MUSS (aus dem nativen Code) ═══
// AnyvoMotionManager.swift:
//   • `pedometer.startUpdates(from: Date())` liefert `data.numberOfSteps` —
//     einen KUMULATIVEN Zähler, aktualisiert NUR wenn ein CMPedometer-Callback
//     eintrifft.
//   • `stepDelta = max(0, currentStepTotal - lastEmittedStepTotal)` wird alle
//     250 ms gebildet. Zwischen zwei Pedometer-Callbacks ist `currentStepTotal`
//     eingefroren → JEDES Emit-Fenster in dieser Zeit meldet 0.
//   • `currentCadence` wird nur gesetzt, wenn ein Callback `currentCadence`
//     ungleich nil mitbringt — vorher bleibt es `null`.
// CMPedometer ist ein Coprozessor-Dienst: Callbacks kommen gebündelt und
// verzögert (Grössenordnung ~1 s und mehr), nicht mit 4 Hz. Ein ±1-s-Fenster
// kann deshalb null Pedometer-Callbacks enthalten, obwohl durchgehend gegangen
// wird.
//
// Diese Datei ist reine Forschung: sie fasst weder den Detector noch den
// Recorder noch `motionTurnEvidence.ts` an.

import { computeTurnEvidence, TURN_EVIDENCE_DEFAULTS, type MotionWindowSample } from '@/features/tracking/utils/motionTurnEvidence';
import type { MovementState, ActivityConfidenceLevel } from '@/modules/anyvo-motion';

const DEG = 180 / Math.PI;
const TICK_HZ = 20;
const TICK_S = 1 / TICK_HZ;
const EMIT_MS = 250;
const STRIDE_HZ = 0.9;
const NORMAL_STEP_RATE = 1.8;
const T0 = 1_000_000;

function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function gauss(rnd: () => number): number {
  return (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) / 0.7071;
}

/** Sample MIT den nativen Activity-Feldern (die es im Payload längst gibt). */
export interface FullMotionSample extends MotionWindowSample {
  activityConfidence: ActivityConfidenceLevel;
  activityAgeMs: number | null;
}

interface Program {
  yawRateDps: (t: number) => number;
  offAxisRadS: (t: number) => number;
  stepRate: (t: number) => number;
}
const ZERO = () => 0;
const WALK = () => NORMAL_STEP_RATE;
function pulse(t: number, from: number, to: number, amp: number): number {
  return t >= from && t < to ? amp / (to - from) : 0;
}

/**
 * Realistisches CMPedometer-Modell.
 *  - `warmupS`   : bevor überhaupt der erste Callback kommt (Apple zählt erst
 *                  nach einer kurzen Anlaufphase, um Fehlzählungen zu vermeiden)
 *  - `intervalS` : Abstand der Callbacks (gebündelt, NICHT 4 Hz)
 *  - `jitterS`   : zusätzliche Streuung
 *  - `cadenceAfterS`: ab wann `currentCadence` ungleich nil geliefert wird
 */
export interface PedometerModel {
  warmupS: number;
  intervalS: number;
  jitterS: number;
  cadenceAfterS: number;
  available: boolean;
}
export const PEDOMETER_REAL: PedometerModel = {
  warmupS: 6, intervalS: 1.6, jitterS: 0.7, cadenceAfterS: 12, available: true,
};
/**
 * Die Feldsituation aus Teil B: `cadence=null` UND `steps=0` über das ganze
 * Fenster heisst, dass CMPedometer zu diesem Zeitpunkt praktisch noch nichts
 * geliefert hatte — die Anlaufphase war noch nicht vorbei. Genau das bildet
 * dieses Modell ab.
 */
export const PEDOMETER_SILENT: PedometerModel = {
  warmupS: 45, intervalS: 2.0, jitterS: 0.5, cadenceAfterS: 60, available: true,
};
/** Das (implizite) Modell der bisherigen Simulation: perfekt, sofort, pro Tick. */
export const PEDOMETER_IDEAL: PedometerModel = {
  warmupS: 0, intervalS: 0.05, jitterS: 0, cadenceAfterS: 0, available: true,
};

interface ActivityModel {
  /** Verzögerung, mit der CMMotionActivity einen Zustandswechsel meldet. */
  latencyS: number;
  confidence: ActivityConfidenceLevel;
}
const ACTIVITY_REAL: ActivityModel = { latencyS: 3.0, confidence: 'medium' };

function simulate(
  durationS: number, prog: Program, seed: number,
  ped: PedometerModel = PEDOMETER_REAL, act: ActivityModel = ACTIVITY_REAL,
): FullMotionSample[] {
  const rnd = lcg(seed);
  const out: FullMotionSample[] = [];
  const ticks = Math.round(durationS * TICK_HZ);
  const ticksPerEmit = Math.round((EMIT_MS / 1000) * TICK_HZ);

  let yaw = 0;
  let trueSteps = 0;              // was der Läufer wirklich tut
  let reportedTotal = 0;          // was CMPedometer bisher gemeldet hat
  let lastEmittedTotal = 0;
  let nextCallbackAt = ped.warmupS;
  let cadence: number | null = null;

  // CMMotionActivity mit Nachlauf: der gemeldete Zustand hinkt der Realität hinterher.
  const stateHistory: { t: number; walking: boolean }[] = [];
  let lastActivityAt: number | null = null;
  let reportedWalking = false;

  let winFirstYaw: number | null = null;
  let winRot: number[] = [];
  let winAcc: number[] = [];

  for (let i = 0; i < ticks; i++) {
    const t = i * TICK_S;
    const sr = prog.stepRate(t);
    const moving = sr > 0.2;
    const gaitYawRate = 3.0 * 2 * Math.PI * STRIDE_HZ * Math.cos(2 * Math.PI * STRIDE_HZ * t);
    const yawRate = (moving ? gaitYawRate : 0) + prog.yawRateDps(t) + gauss(rnd) * 1.5;
    yaw += yawRate * TICK_S;

    const offAxis = (moving ? 0.35 : 0.05) + prog.offAxisRadS(t) + Math.abs(gauss(rnd)) * 0.06;
    const omega = Math.hypot(yawRate / DEG, offAxis);
    const accel = (moving ? 0.18 : 0.02) + prog.offAxisRadS(t) * 0.15 + Math.abs(gauss(rnd)) * 0.02;

    trueSteps += sr * TICK_S;
    stateHistory.push({ t, walking: moving });

    // Pedometer-Callback: erst nach Warmup, dann gebündelt.
    if (ped.available && t >= nextCallbackAt) {
      reportedTotal = Math.floor(trueSteps);
      nextCallbackAt = t + ped.intervalS + (rnd() - 0.5) * 2 * ped.jitterS;
      if (t >= ped.cadenceAfterS && moving) cadence = NORMAL_STEP_RATE * 60;
      if (!moving) cadence = null;
    }

    // CMMotionActivity: eigener, vom Pedometer UNABHÄNGIGER Kanal. Er meldet
    // ereignisgesteuert bei Zustandswechseln — mit spürbarer Latenz.
    const past = stateHistory.find(h => h.t >= t - act.latencyS);
    const nowWalking = past ? past.walking : moving;
    if (nowWalking !== reportedWalking || lastActivityAt == null) lastActivityAt = t;
    reportedWalking = nowWalking;

    if (winFirstYaw == null) winFirstYaw = yaw;
    winRot.push(omega); winAcc.push(accel);

    if ((i + 1) % ticksPerEmit === 0) {
      const stepDelta = Math.max(0, reportedTotal - lastEmittedTotal);
      lastEmittedTotal = reportedTotal;
      const state: MovementState = reportedWalking ? 'walking' : 'stationary';
      out.push({
        t: T0 + Math.round((t + TICK_S) * 1000),
        headingDelta: yaw - winFirstYaw,
        rotationMagnitude: winRot.reduce((a, b) => a + b, 0) / winRot.length,
        accelerationMagnitude: winAcc.reduce((a, b) => a + b, 0) / winAcc.length,
        stepDelta,
        cadence,
        movementState: state,
        activityConfidence: act.confidence,
        activityAgeMs: lastActivityAt == null ? null : (t - lastActivityAt) * 1000,
      });
      winFirstYaw = null; winRot = []; winAcc = [];
    }
  }
  return out;
}

// ── Locomotion-Evidence-Varianten ────────────────────────────────────────
type Variant = 'A' | 'B' | 'C' | 'D' | 'E';

const LABEL: Record<Variant, string> = {
  A: 'A hartes Schritt-Gate (heute)',
  B: 'B Schritte ODER walking/running',
  C: 'C Schritte ODER walking + Confidence + Alter',
  D: 'D Schritte + Kadenz + Activity + Accel',
  E: 'E Schritte ODER durchgehende Gang-Beschleunigung (ohne Activity)',
};

/** 0..1 — wie sicher ist es, dass sich die Person gerade fortbewegt? */
function locomotionScore(win: readonly FullMotionSample[], variant: Variant): number {
  if (!win.length) return 0;
  const durationS = Math.max(1e-3, (win[win.length - 1].t - win[0].t) / 1000 + 0.25);
  const steps = win.reduce((a, s) => a + s.stepDelta, 0);
  const stepRate = steps / durationS;
  const ramp = (v: number, lo: number, hi: number) => (v <= lo ? 0 : v >= hi ? 1 : (v - lo) / (hi - lo));

  const bySteps = ramp(stepRate, TURN_EVIDENCE_DEFAULTS.stepRateLo, TURN_EVIDENCE_DEFAULTS.stepRateHi);
  const walkingShare = win.filter(s => s.movementState === 'walking' || s.movementState === 'running').length / win.length;
  const meanAccel = win.reduce((a, s) => a + s.accelerationMagnitude, 0) / win.length;
  const cadences = win.map(s => s.cadence).filter((c): c is number => c != null);
  const cadenceOk = cadences.length > 0 && cadences[cadences.length - 1] >= 60;
  const freshestAgeMs = Math.min(...win.map(s => s.activityAgeMs ?? Infinity));
  const conf = win[win.length - 1].activityConfidence;

  switch (variant) {
    case 'A':
      return bySteps;
    case 'B':
      return Math.max(bySteps, walkingShare >= 0.6 ? 1 : 0);
    case 'C': {
      // walking zählt nur, wenn die Klassifikation frisch UND nicht 'low' ist.
      const activityUsable = walkingShare >= 0.6 && conf !== 'low' && freshestAgeMs <= 4000;
      return Math.max(bySteps, activityUsable ? 1 : 0);
    }
    case 'E': {
      // Nur SOFORT reagierende Signale: Schritte oder eine durchgehende
      // Gang-Beschleunigungssignatur im Fenster. Bewusst OHNE
      // CMMotionActivity — die hinkt einem Stopp um Sekunden hinterher und
      // meldet dann noch `walking`, obwohl die Person längst steht.
      const gaitShare = win.filter(s => s.accelerationMagnitude >= 0.10).length / win.length;
      return Math.max(bySteps, gaitShare >= 0.7 ? 1 : 0);
    }
    case 'D': {
      // Mehrere unabhängige Belege; Gehen erzeugt eine charakteristische
      // Beschleunigungssignatur, Stillstand nicht.
      const accelOk = meanAccel >= 0.08;
      const activityUsable = walkingShare >= 0.6 && conf !== 'low' && freshestAgeMs <= 4000;
      const votes = (bySteps > 0 ? 1 : 0) + (cadenceOk ? 1 : 0) + (activityUsable ? 1 : 0) + (accelOk ? 1 : 0);
      if (bySteps > 0) return 1;                 // echte Schritte schlagen alles
      return votes >= 2 ? 1 : votes === 1 ? 0.5 : 0;
    }
  }
}

/** Turn-Evidenz mit ausgetauschtem Fortbewegungs-Faktor. */
function evidenceWith(win: readonly FullMotionSample[], variant: Variant): number {
  if (win.length < 2) return 0;
  const base = computeTurnEvidence(win, win[Math.floor(win.length / 2)].t, {
    ...TURN_EVIDENCE_DEFAULTS, stepRateLo: -1, stepRateHi: -0.5,   // Fortbewegungs-Gate neutralisieren
  });
  if (!base.available || base.evidence == null) return 0;
  return base.evidence * locomotionScore(win, variant);
}

function windowAround(samples: readonly FullMotionSample[], tSec: number, halfSec = 1.0): FullMotionSample[] {
  const c = T0 + tSec * 1000;
  return samples.filter(s => s.t >= c - halfSec * 1000 && s.t <= c + halfSec * 1000);
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const AT = 20;   // Ereigniszeitpunkt in allen Szenarien

interface Scenario { name: string; positive: boolean; prog: Program }

function sc(name: string, positive: boolean, p: Partial<Program>): Scenario {
  return { name, positive, prog: { yawRateDps: p.yawRateDps ?? ZERO, offAxisRadS: p.offAxisRadS ?? ZERO, stepRate: p.stepRate ?? WALK } };
}
const turn = (deg: number, dur: number) => (t: number) => pulse(t, AT - dur / 2, AT + dur / 2, deg);

const SCENARIOS: Scenario[] = [
  // ── Positiv ──
  sc('echter 90°-Turn im Gehen', true, { yawRateDps: turn(90, 1.2) }),
  sc('echter 135°-Turn im Gehen', true, { yawRateDps: turn(135, 1.5) }),
  sc('62°-Turn wie im Feld (Teil B)', true, { yawRateDps: turn(62, 1.2) }),
  sc('90°-Turn mit kurzem Halt am Scheitel', true, {
    yawRateDps: turn(90, 1.2),
    stepRate: (t) => (t >= AT - 0.7 && t < AT + 0.7 ? 0 : NORMAL_STEP_RATE),
  }),
  // ── Negativ ──
  sc('echte Standdrehung', false, {
    stepRate: (t) => (t >= AT - 4 ? 0 : NORMAL_STEP_RATE), yawRateDps: turn(120, 1.5),
  }),
  sc('Standdrehung DIREKT nach dem Gehen', false, {
    stepRate: (t) => (t >= AT - 0.8 ? 0 : NORMAL_STEP_RATE), yawRateDps: turn(120, 1.5),
  }),
  sc('Handy im Stand drehen (Activity noch stale walking)', false, {
    stepRate: (t) => (t >= AT - 1.2 ? 0 : NORMAL_STEP_RATE), yawRateDps: turn(90, 0.6),
  }),
  sc('zwei Ausfallschritte', false, {
    stepRate: (t) => (t >= AT - 1.5 && t < AT + 1.5 ? 0.7 : NORMAL_STEP_RATE), yawRateDps: turn(120, 1.5),
  }),
  sc('Handy beim Gehen 90° drehen', false, { yawRateDps: turn(90, 0.6), offAxisRadS: (t) => (t >= AT - 0.3 && t < AT + 0.3 ? 0.6 : 0) }),
  sc('bücken', false, {
    stepRate: (t) => (t >= AT - 1.3 && t < AT + 1.3 ? 0 : NORMAL_STEP_RATE),
    offAxisRadS: (t) => (t >= AT - 0.9 && t < AT + 0.9 ? 1.8 : 0),
    yawRateDps: (t) => pulse(t, AT - 0.8, AT - 0.2, 15) + pulse(t, AT + 0.2, AT + 0.8, -10),
  }),
  sc('Gegenstand setzen', false, {
    stepRate: (t) => (t >= AT - 1.3 && t < AT + 1.3 ? 0 : NORMAL_STEP_RATE),
    offAxisRadS: (t) => (t >= AT - 0.9 && t < AT + 0.9 ? 1.8 : 0),
    yawRateDps: (t) => pulse(t, AT - 0.8, AT - 0.2, 20) + pulse(t, AT + 0.2, AT + 0.8, -15),
  }),
  sc('Dübel setzen', false, {
    stepRate: (t) => (t >= AT - 1.5 && t < AT + 1.5 ? 0 : NORMAL_STEP_RATE),
    offAxisRadS: (t) => (t >= AT - 1.1 && t < AT + 1.1 ? 1.9 : 0),
    yawRateDps: (t) => pulse(t, AT - 1.0, AT - 0.2, 35) + pulse(t, AT + 0.3, AT + 1.1, -30),
  }),
];

function meanEvidence(s: Scenario, variant: Variant, ped: PedometerModel): number {
  let sum = 0;
  for (const seed of SEEDS) {
    const samples = simulate(AT + 8, s.prog, seed, ped);
    sum += evidenceWith(windowAround(samples, AT), variant);
  }
  return sum / SEEDS.length;
}

// ── 1. Der reale Befund reproduziert ─────────────────────────────────────
describe('Reproduktion des Gerätebefunds: steps=0 bei state=walking', () => {
  it('mit realistischem Pedometer-Modell kommen Fenster mit steps=0 beim Gehen vor', () => {
    const samples = simulate(30, { yawRateDps: turn(62, 1.2), offAxisRadS: ZERO, stepRate: WALK }, 1);
    const walkingWindows = samples.filter(s => s.movementState === 'walking');
    const zeroStep = walkingWindows.filter(s => s.stepDelta === 0);
    const share = zeroStep.length / walkingWindows.length;
    console.log(`\n[LOCOMOTION] 250-ms-Emits mit movementState=walking: ${walkingWindows.length}, ` +
      `davon stepDelta=0: ${zeroStep.length} (${(share * 100).toFixed(0)} %)\n`);
    // Die überwiegende Mehrheit der Emit-Fenster meldet 0 — genau wie im Feld.
    expect(share).toBeGreaterThan(0.5);
  });

  it('ein ±1-s-Fenster beim Gehen kann komplett steps=0 enthalten', () => {
    // Mit noch nicht abgeschlossener Pedometer-Anlaufphase (Feldsituation:
    // cadence=null) enthält JEDES Fenster null Schritte.
    const samples = simulate(30, { yawRateDps: turn(62, 1.2), offAxisRadS: ZERO, stepRate: WALK }, 1, PEDOMETER_SILENT);
    let zeroWindows = 0, total = 0;
    for (let t = 8; t < 26; t += 0.5) {
      const w = windowAround(samples, t);
      if (!w.length) continue;
      total++;
      if (w.every(s => s.stepDelta === 0)) zeroWindows++;
    }
    console.log(`[LOCOMOTION] ±1-s-Fenster im Gehen ohne einen einzigen Schritt: ${zeroWindows} von ${total}\n`);
    expect(zeroWindows).toBe(total);
  });

  it('genau die Feldzeile: starker Turn + walking → Evidenz 0 unter Variante A', () => {
    const s = SCENARIOS.find(x => x.name === '62°-Turn wie im Feld (Teil B)')!;
    const silent = meanEvidence(s, 'A', PEDOMETER_SILENT);
    const lagged = meanEvidence(s, 'A', PEDOMETER_REAL);
    const ideal = meanEvidence(s, 'A', PEDOMETER_IDEAL);
    console.log(`[LOCOMOTION] 62°-Turn, Variante A — Pedometer still (Anlaufphase): ${silent.toFixed(3)} · ` +
      `träge: ${lagged.toFixed(3)} · ideal (bisherige Simulation): ${ideal.toFixed(3)}\n`);
    // DER KERN DES BEFUNDS: dasselbe Ereignis, nur ein realistischeres
    // Pedometer-Modell — und die Evidenz ist exakt 0, genau wie im Feld.
    expect(ideal).toBeGreaterThan(0.8);
    expect(silent).toBe(0);
  });
});

// ── 2. Bakeoff der Locomotion-Varianten ──────────────────────────────────
describe('Bakeoff: alternative Locomotion-Evidence', () => {
  it('vergleicht A–D über Positiv- und Negativfälle (reales Pedometer)', () => {
    const header = 'Szenario                                            |   A   |   B   |   C   |   D   |   E';
    const rows = [header];
    for (const s of SCENARIOS) {
      const cells = (['A', 'B', 'C', 'D', 'E'] as Variant[]).map(v => meanEvidence(s, v, PEDOMETER_REAL).toFixed(2));
      rows.push(`${((s.positive ? '[+] ' : '[-] ') + s.name).padEnd(52)}| ${cells.join(' | ')}`);
    }
    console.log('\n[BAKEOFF · Locomotion-Evidence] 10 Seeds, reales Pedometer-Modell\n' + rows.join('\n') + '\n');

    const summary = (['A', 'B', 'C', 'D', 'E'] as Variant[]).map(v => {
      const pos = SCENARIOS.filter(s => s.positive).map(s => meanEvidence(s, v, PEDOMETER_REAL));
      const neg = SCENARIOS.filter(s => !s.positive).map(s => meanEvidence(s, v, PEDOMETER_REAL));
      return { v, minPos: Math.min(...pos), maxNeg: Math.max(...neg), gap: Math.min(...pos) - Math.max(...neg) };
    });
    console.log('Variante | min(Positiv) | max(Negativ) | Abstand\n' +
      summary.map(x => `   ${x.v}     |     ${x.minPos.toFixed(2)}     |     ${x.maxNeg.toFixed(2)}     |  ${x.gap.toFixed(2)}`).join('\n') + '\n' +
      summary.map(x => `${x.v} = ${LABEL[x.v]}`).join('\n') + '\n');
    expect(rows.length).toBe(SCENARIOS.length + 1);
  });

  it('unter stillem Pedometer (Feldsituation) verliert A ALLE echten Turns', () => {
    const rows = ['Szenario                                            |   A   |   B   |   C   |   D   |   E'];
    for (const s2 of SCENARIOS) {
      const cells = (['A', 'B', 'C', 'D', 'E'] as Variant[]).map(v => meanEvidence(s2, v, PEDOMETER_SILENT).toFixed(2));
      rows.push(`${((s2.positive ? '[+] ' : '[-] ') + s2.name).padEnd(52)}| ${cells.join(' | ')}`);
    }
    console.log('\n[BAKEOFF · Locomotion-Evidence] STILLES Pedometer (Anlaufphase) — die Feldsituation\n' + rows.join('\n') + '\n');
    for (const name of ['echter 90°-Turn im Gehen', 'echter 135°-Turn im Gehen', '62°-Turn wie im Feld (Teil B)']) {
      const s2 = SCENARIOS.find(x => x.name === name)!;
      expect(meanEvidence(s2, 'A', PEDOMETER_SILENT)).toBe(0);
    }
  });

  it('KRITISCH: Standdrehung direkt nach dem Gehen — welche Variante hält?', () => {
    const s = SCENARIOS.find(x => x.name === 'Standdrehung DIREKT nach dem Gehen')!;
    const vals = (['A', 'B', 'C', 'D', 'E'] as Variant[]).map(v => [v, meanEvidence(s, v, PEDOMETER_REAL)] as const);
    console.log('\n[LOCOMOTION · Standdrehung direkt nach dem Gehen]\n' +
      vals.map(([v, x]) => `  ${v}: ${x.toFixed(2)}`).join('\n') + '\n');
    // GEMESSEN: A liegt bei 0,31 (die Schritte VOR dem Stopp zählen im
    // ±1-s-Fenster noch mit), B/C/D bei 1,00 — sie übernehmen die um ~3 s
    // nachlaufende CMMotionActivity-Meldung `walking`. Nur E fällt mit A
    // zusammen, weil es ausschliesslich sofort reagierende Signale nutzt.
    const a = meanEvidence(s, 'A', PEDOMETER_REAL);
    const e = meanEvidence(s, 'E', PEDOMETER_REAL);
    // B und D übernehmen die nachlaufende `walking`-Meldung und heben die
    // Evidenz auf 1,00 — genau der gefährliche Fall. C fällt hier mit A
    // zusammen, weil sein Alters-Gate die (bei stetigem Gehen ohnehin alte)
    // Klassifikation nicht durchlässt. E nutzt gar keine Activity und bleibt
    // ebenfalls auf A-Niveau.
    for (const v of ['B', 'D'] as Variant[]) {
      expect(meanEvidence(s, v, PEDOMETER_REAL)).toBeGreaterThan(a);
    }
    expect(meanEvidence(s, 'C', PEDOMETER_REAL)).toBeCloseTo(a, 2);
    expect(e).toBeCloseTo(a, 2);
    expect(e).toBeLessThan(0.4);
  });

  it('Handy beim Gehen 90° drehen bleibt in JEDER Variante ein Fehlalarm-Risiko', () => {
    const s = SCENARIOS.find(x => x.name === 'Handy beim Gehen 90° drehen')!;
    const vals = (['A', 'B', 'C', 'D', 'E'] as Variant[]).map(v => meanEvidence(s, v, PEDOMETER_REAL));
    console.log(`\n[LOCOMOTION · Handy 90° beim Gehen] A=${vals[0].toFixed(2)} B=${vals[1].toFixed(2)} ` +
      `C=${vals[2].toFixed(2)} D=${vals[3].toFixed(2)} E=${vals[4].toFixed(2)}\n`);
    // Bekannte, dokumentierte Grenze: eine reine Gerätedrehung um die
    // Vertikale ist im vorhandenen Payload nicht von einer Körperdrehung
    // trennbar. Deshalb darf Motion nie allein einen Winkel erzeugen.
    expect(Math.max(...vals)).toBeGreaterThan(0);
  });
});

// ── 3. Pedometer-Latenz als Ursache isolieren ────────────────────────────
describe('Pedometer-Latenz und -Granularität', () => {
  it('je träger die Pedometer-Callbacks, desto häufiger stirbt ein echter Turn', () => {
    const s = SCENARIOS.find(x => x.name === 'echter 90°-Turn im Gehen')!;
    const rows = ['Callback-Intervall | Warmup | Evidenz A | Evidenz C'];
    for (const [interval, warmup] of [[0.05, 0], [0.5, 0], [1.0, 0], [1.6, 6], [2.5, 6], [4.0, 10]] as [number, number][]) {
      const ped: PedometerModel = { ...PEDOMETER_REAL, intervalS: interval, warmupS: warmup };
      rows.push(`      ${interval.toFixed(2)} s      |  ${warmup} s   |   ${meanEvidence(s, 'A', ped).toFixed(2)}    |   ${meanEvidence(s, 'C', ped).toFixed(2)}`);
    }
    console.log('\n[LOCOMOTION · Pedometer-Trägheit] echter 90°-Turn im Gehen\n' + rows.join('\n') + '\n');
    expect(rows.length).toBe(7);
  });

  it('cadence bleibt in der Anlaufphase null — wie im Feld beobachtet', () => {
    const samples = simulate(10, { yawRateDps: ZERO, offAxisRadS: ZERO, stepRate: WALK }, 1);
    expect(samples.every(s => s.cadence == null)).toBe(true);
  });
});

// ── 4. Was die Felder wirklich bedeuten ──────────────────────────────────
describe('Bedeutung von steps=0', () => {
  it('steps=0 heisst NICHT „die Person steht" — nur „kein neuer Schritt gemeldet"', () => {
    const samples = simulate(30, { yawRateDps: ZERO, offAxisRadS: ZERO, stepRate: WALK }, 3);
    // Es gibt Fenster mit steps=0, in denen die Person nachweislich geht:
    // Beschleunigungssignatur und Activity zeigen Bewegung.
    const zeroButWalking = samples.filter(s =>
      s.stepDelta === 0 && s.movementState === 'walking' && s.accelerationMagnitude >= 0.08);
    expect(zeroButWalking.length).toBeGreaterThan(0);
  });

  it('im echten Stand sieht die Beschleunigungssignatur anders aus', () => {
    const standing = simulate(30, { yawRateDps: ZERO, offAxisRadS: ZERO, stepRate: () => 0 }, 3);
    const meanStanding = standing.reduce((a, s) => a + s.accelerationMagnitude, 0) / standing.length;
    const walking = simulate(30, { yawRateDps: ZERO, offAxisRadS: ZERO, stepRate: WALK }, 3);
    const meanWalking = walking.reduce((a, s) => a + s.accelerationMagnitude, 0) / walking.length;
    console.log(`\n[LOCOMOTION] Ø accelerationMagnitude — gehend ${meanWalking.toFixed(3)} g · stehend ${meanStanding.toFixed(3)} g\n`);
    expect(meanWalking).toBeGreaterThan(meanStanding * 2);
  });
});

// Motion-Turn-Evidenz — ISOLIERTER PROTOTYP.
//
// Beantwortet AUSSCHLIESSLICH eine Frage:
//   "Hat in diesem Zeitfenster eine reale, gerichtete Drehbewegung des
//    Handlers stattgefunden?"  →  turnEvidence 0..1
//
// Ausdrücklich NICHT beantwortet (und strukturell nicht beantwortbar, weil die
// Vorzeichen intern verworfen und nie zurückgegeben werden):
//   links/rechts, Winkelgrösse, Spitzwinkel, absolute/geografische Richtung,
//   Position. Das bleibt vollständig Aufgabe der GPS-Geometrie.
//
// Hintergrund: langsam korrelierter GNSS-Bias ist aus Positionsdaten allein
// nicht von echter langsamer Bewegung unterscheidbar (gemessen — Alpha-Beta,
// CV-Kalman und Sliding-Fit haben alle keinen relevanten Driftnutzen gebracht).
// Core Motion ist die einzige davon UNABHÄNGIGE Informationsquelle, die im
// Build bereits vorhanden ist.
//
// Dieses Modul ist NICHT verdrahtet: weder der CURRENT-Corner-Detector noch
// Recorder/Search/Fusion rufen es auf. Es dient der Messung.

import type { MovementState } from '@/modules/anyvo-motion';

const DEG = 180 / Math.PI;

/**
 * Ein aggregiertes Core-Motion-Fenster, exakt so wie `MotionSample` es heute
 * schon liefert (Default 250 ms / 4 Hz, intern 20 Hz). Bewusst ein eigener,
 * schmalerer Typ: dieses Modul darf nur von Feldern abhängen, die ohne
 * Native-Änderung verfügbar sind.
 */
export interface MotionWindowSample {
  /** ms (Unix) — Ende des Aggregationsfensters. */
  t: number;
  /** Vorzeichenbehaftete Yaw-Änderung im Fenster (Grad). Yaw liegt um die
   *  Vertikale (CMAttitudeReferenceFrameXArbitraryZVertical), der Nullpunkt ist
   *  arbiträr — deshalb NUR als Änderung verwendbar, nie als Richtung. */
  headingDelta: number;
  /** Mittleres |rotationRate| im Fenster über alle drei Achsen (rad/s). */
  rotationMagnitude: number;
  /** Mittleres |userAcceleration| im Fenster (g). Rein diagnostisch. */
  accelerationMagnitude: number;
  /** Schritte seit dem letzten Sample. */
  stepDelta: number;
  /** Schritte/Minute, falls verfügbar. Rein diagnostisch (kann veraltet sein). */
  cadence: number | null;
  movementState: MovementState;
}

export interface TurnEvidenceParams {
  /** Halbe Fensterbreite in Sekunden um den Kandidaten-Zeitpunkt. */
  halfWindowSec: number;
  /** Optional zusätzlich: halbe Fensterbreite als Weg (m). Wirkt als UND —
   *  ein Sample muss beide Bedingungen erfüllen. Braucht `cumDistAt`. */
  halfWindowM?: number | null;
  /** Netto-Yaw (Grad), ab dem überhaupt von einer Drehung gesprochen wird. */
  netYawLoDeg: number;
  /** Netto-Yaw (Grad), ab dem das Kriterium voll erfüllt ist. */
  netYawHiDeg: number;
  /** Monotonie = netto/brutto. Unten/oben der Rampe. */
  monoLo: number;
  monoHi: number;
  /** Fortbewegung in Schritten/s. Unten/oben der Rampe. */
  stepRateLo: number;
  stepRateHi: number;
  /** Yaw-Anteil an der Gesamtrotation. Unten/oben der Rampe. */
  yawShareLo: number;
  yawShareHi: number;
  /** Länge des Bursts (s), über den die Konzentration gemessen wird. */
  burstSec: number;
}

export const TURN_EVIDENCE_DEFAULTS: TurnEvidenceParams = {
  halfWindowSec: 1.0,
  halfWindowM: null,
  netYawLoDeg: 20,
  netYawHiDeg: 45,
  monoLo: 0.45,
  monoHi: 0.75,
  stepRateLo: 0.6,
  stepRateHi: 1.4,
  yawShareLo: 0.20,
  yawShareHi: 0.40,
  burstSec: 0.75,
};

export interface TurnEvidence {
  /** false = keine Motion-Daten im Fenster. Dann ist `evidence` null und der
   *  Kandidat MUSS wie "keine Information" behandelt werden — nie wie
   *  "widerlegt". */
  available: boolean;
  /** 0..1, oder null wenn keine Daten. */
  evidence: number | null;

  // ── Rohmasse (Diagnose/QA) ──────────────────────────────────────────────
  /** |Σ headingDelta| — Betrag der Netto-Drehung. Ohne Vorzeichen, bewusst. */
  netYawDeg: number;
  /** Σ |headingDelta| — Gesamtdrehung inkl. Hin-und-Her. */
  grossYawDeg: number;
  /** netto/brutto ∈ 0..1. Eine echte Ecke dreht monoton (→1), Gerätegewackel
   *  dreht hin und zurück (→0). */
  monotonicity: number;
  /** Grösster Betrag von |Σ headingDelta| in einem Teilfenster der Länge
   *  `burstSec`, geteilt durch netYawDeg. Wie konzentriert war die Drehung? */
  concentration: number;
  /** Spitzen-Yaw-Rate (°/s) aus den Fenster-Deltas. */
  peakYawRateDps: number;
  /** Dauer (s) der zusammenhängenden Samples oberhalb einer Rate-Schwelle. */
  rotationDurationS: number;
  /** Σ |headingDelta| geteilt durch die integrierte Gesamtrotation (3 Achsen).
   *  Eine Körperdrehung im Gehen hat einen hohen Anteil; Handy heben/bücken
   *  ist pitch/roll-dominiert und hat einen niedrigen. */
  yawShare: number;
  /** Integrierte 3-Achsen-Rotation im Fenster (Grad). */
  totalRotationDeg: number;
  /** Spitzenwert von rotationMagnitude im Fenster (rad/s). */
  peakRotationRateRadS: number;
  steps: number;
  stepRate: number;
  cadence: number | null;
  /** Häufigster movementState im Fenster. */
  movementState: MovementState | null;
  sampleCount: number;
  windowStartMs: number;
  windowEndMs: number;
  windowDurationS: number;
  /** Welches Teilkriterium wie stark erfüllt ist (0..1) — macht im QA-Log
   *  sichtbar, WARUM die Evidenz hoch/niedrig ist. */
  gates: { netYaw: number; monotonicity: number; locomotion: number; yawShare: number };
}

// Weiche Rampe: 0 unterhalb lo, 1 oberhalb hi, linear dazwischen.
function ramp(v: number, lo: number, hi: number): number {
  if (!(hi > lo)) return v >= hi ? 1 : 0;
  if (v <= lo) return 0;
  if (v >= hi) return 1;
  return (v - lo) / (hi - lo);
}

function emptyEvidence(tc: number, params: TurnEvidenceParams): TurnEvidence {
  return {
    available: false, evidence: null,
    netYawDeg: 0, grossYawDeg: 0, monotonicity: 0, concentration: 0,
    peakYawRateDps: 0, rotationDurationS: 0, yawShare: 0, totalRotationDeg: 0,
    peakRotationRateRadS: 0, steps: 0, stepRate: 0, cadence: null,
    movementState: null, sampleCount: 0,
    windowStartMs: tc - params.halfWindowSec * 1000,
    windowEndMs: tc + params.halfWindowSec * 1000,
    windowDurationS: 0,
    gates: { netYaw: 0, monotonicity: 0, locomotion: 0, yawShare: 0 },
  };
}

/**
 * Wählt die Samples eines Kandidatenfensters. Zeit ist Pflicht, Weg optional
 * zusätzlich (UND-Verknüpfung) — ein sehr langsam gelaufener Abschnitt soll
 * nicht über mehrere Meter hinweg "Drehung" einsammeln, ein Stillstand nicht
 * über das Zeitfenster hinaus verlängert werden.
 */
export function selectWindow(
  samples: readonly MotionWindowSample[],
  candidateTimeMs: number,
  params: TurnEvidenceParams,
  cumDistAt?: ((tMs: number) => number | null) | null,
): MotionWindowSample[] {
  const halfMs = params.halfWindowSec * 1000;
  const lo = candidateTimeMs - halfMs;
  const hi = candidateTimeMs + halfMs;
  let inTime = samples.filter(s => s.t >= lo && s.t <= hi);
  const halfM = params.halfWindowM;
  if (halfM != null && halfM > 0 && cumDistAt) {
    const dc = cumDistAt(candidateTimeMs);
    if (dc != null) {
      inTime = inTime.filter(s => {
        const d = cumDistAt(s.t);
        return d == null || Math.abs(d - dc) <= halfM;
      });
    }
  }
  return inTime;
}

/**
 * Berechnet die Turn-Evidenz für EINEN bereits von der GPS-Geometrie erzeugten
 * Kandidaten. Erzeugt selbst niemals einen Kandidaten.
 */
export function computeTurnEvidence(
  samples: readonly MotionWindowSample[],
  candidateTimeMs: number,
  params: TurnEvidenceParams = TURN_EVIDENCE_DEFAULTS,
  cumDistAt?: ((tMs: number) => number | null) | null,
): TurnEvidence {
  const win = selectWindow(samples, candidateTimeMs, params, cumDistAt);
  if (win.length < 2) return emptyEvidence(candidateTimeMs, params);

  // Fensterlängen: das Emit-Intervall ist der Abstand zum Vorgänger. Für das
  // erste Sample nehmen wir den Median der übrigen Abstände (statt eines
  // hartcodierten 250 ms), damit eine andere Emit-Rate nicht stillschweigend
  // die Raten verfälscht.
  const gaps: number[] = [];
  for (let i = 1; i < win.length; i++) gaps.push((win[i].t - win[i - 1].t) / 1000);
  const sortedGaps = gaps.slice().sort((a, b) => a - b);
  const medGap = sortedGaps[Math.floor(sortedGaps.length / 2)] || 0.25;
  const dt = (i: number): number => (i === 0 ? medGap : Math.max(1e-3, (win[i].t - win[i - 1].t) / 1000));

  let signedYaw = 0;
  let grossYaw = 0;
  let totalRotDeg = 0;
  let peakYawRate = 0;
  let peakRotRate = 0;
  let steps = 0;
  const stateCount = new Map<MovementState, number>();

  for (let i = 0; i < win.length; i++) {
    const s = win[i];
    const d = dt(i);
    signedYaw += s.headingDelta;
    grossYaw += Math.abs(s.headingDelta);
    totalRotDeg += s.rotationMagnitude * DEG * d;
    peakYawRate = Math.max(peakYawRate, Math.abs(s.headingDelta) / d);
    peakRotRate = Math.max(peakRotRate, s.rotationMagnitude);
    steps += s.stepDelta;
    stateCount.set(s.movementState, (stateCount.get(s.movementState) ?? 0) + 1);
  }

  // Vorzeichen wird hier verworfen und nie exportiert — Regel: Motion darf
  // links/rechts nicht entscheiden.
  const netYawDeg = Math.abs(signedYaw);
  const monotonicity = grossYaw > 0 ? netYawDeg / grossYaw : 0;
  const yawShare = totalRotDeg > 0 ? Math.min(1, grossYaw / totalRotDeg) : 0;

  // Konzentration: grösster Netto-Betrag in einem Teilfenster von burstSec.
  let burstNet = 0;
  for (let a = 0; a < win.length; a++) {
    let sum = 0;
    for (let b = a; b < win.length; b++) {
      sum += win[b].headingDelta;
      if ((win[b].t - win[a].t) / 1000 > params.burstSec) break;
      burstNet = Math.max(burstNet, Math.abs(sum));
    }
  }
  const concentration = netYawDeg > 0 ? Math.min(1, burstNet / netYawDeg) : 0;

  // Zusammenhängende Drehdauer oberhalb einer moderaten Rate (20 °/s) — trennt
  // einen kurzen Impuls von einem langgezogenen Bogen.
  const RATE_FLOOR_DPS = 20;
  let bestRun = 0;
  let run = 0;
  for (let i = 0; i < win.length; i++) {
    const d = dt(i);
    if (Math.abs(win[i].headingDelta) / d >= RATE_FLOOR_DPS) { run += d; bestRun = Math.max(bestRun, run); }
    else run = 0;
  }

  const windowDurationS = Math.max(1e-3, (win[win.length - 1].t - win[0].t) / 1000 + medGap);
  const stepRate = steps / windowDurationS;

  let movementState: MovementState | null = null;
  let bestCount = -1;
  stateCount.forEach((c, st) => { if (c > bestCount) { bestCount = c; movementState = st; } });

  const cadences = win.map(s => s.cadence).filter((c): c is number => c != null);
  const cadence = cadences.length ? cadences[cadences.length - 1] : null;

  const gates = {
    netYaw: ramp(netYawDeg, params.netYawLoDeg, params.netYawHiDeg),
    monotonicity: ramp(monotonicity, params.monoLo, params.monoHi),
    locomotion: ramp(stepRate, params.stepRateLo, params.stepRateHi),
    yawShare: ramp(yawShare, params.yawShareLo, params.yawShareHi),
  };
  // Multiplikativ: JEDES Teilkriterium muss erfüllt sein. Eine echte Ecke im
  // Gehen erfüllt alle vier; jede der typischen Gerätebewegungen fällt an
  // mindestens einem durch.
  const evidence = gates.netYaw * gates.monotonicity * gates.locomotion * gates.yawShare;

  return {
    available: true,
    evidence,
    netYawDeg, grossYawDeg: grossYaw, monotonicity, concentration,
    peakYawRateDps: peakYawRate, rotationDurationS: bestRun, yawShare,
    totalRotationDeg: totalRotDeg, peakRotationRateRadS: peakRotRate,
    steps, stepRate, cadence, movementState,
    sampleCount: win.length,
    windowStartMs: win[0].t, windowEndMs: win[win.length - 1].t, windowDurationS,
    gates,
  };
}

// ── Confidence-Kopplung (Vorschlag, NICHT verdrahtet) ──────────────────────

export interface EvidenceCouplingParams {
  /** Ab dieser GPS-Confidence gilt die Geometrie als stark — Motion darf dann
   *  nichts mehr abziehen. */
  strongGpsConfidence: number;
  /** Maximaler Zuschlag für schwache Geometrie mit passender Motion. */
  maxBoost: number;
  /** Maximaler Abzug für schwache Geometrie mit widersprüchlicher Motion. */
  maxPenalty: number;
  /** Unterhalb dieser Evidenz gilt Motion als widersprüchlich. */
  contradictBelow: number;
  /** Oberhalb dieser Evidenz gilt Motion als stützend. */
  supportAbove: number;
}

export const COUPLING_DEFAULTS: EvidenceCouplingParams = {
  strongGpsConfidence: 0.80,
  maxBoost: 0.12,
  maxPenalty: 0.12,
  contradictBelow: 0.15,
  supportAbove: 0.50,
};

/**
 * Wie Motion die GPS-Confidence verändern DÜRFTE. Bewusst hier und nicht im
 * Detector: der bleibt eingefroren.
 *
 * Invarianten (durch Tests abgesichert):
 *  - `available: false` → Confidence unverändert.
 *  - starke GPS-Geometrie → nie ein Abzug.
 *  - ohne GPS-Kandidat gibt es hier gar nichts zu bewerten (die Funktion
 *    bekommt eine bestehende Confidence herein, sie erzeugt keine).
 */
export function applyMotionToConfidence(
  gpsConfidence: number,
  ev: TurnEvidence,
  params: EvidenceCouplingParams = COUPLING_DEFAULTS,
): number {
  if (!ev.available || ev.evidence == null) return gpsConfidence;
  const e = ev.evidence;
  if (e >= params.supportAbove) {
    const w = ramp(e, params.supportAbove, 1);
    return Math.min(1, gpsConfidence + params.maxBoost * w);
  }
  if (e <= params.contradictBelow && gpsConfidence < params.strongGpsConfidence) {
    // Nur schwache Geometrie darf gedämpft werden, und nur anteilig zum
    // Abstand von der "stark"-Schwelle.
    const w = 1 - gpsConfidence / params.strongGpsConfidence;
    return Math.max(0, gpsConfidence - params.maxPenalty * w);
  }
  return gpsConfidence;
}

// ── QA-Ringpuffer (vorbereitet, NICHT verdrahtet) ──────────────────────────

/**
 * Hält die letzten `windowSec` Sekunden Motion-Samples im Speicher, damit ein
 * QA-Diagnosemodus zu jedem GPS-Kandidaten rückwirkend die Evidenz berechnen
 * kann. Bewusst nur RAM, bewusst begrenzt: Roh-Motion-Daten werden nicht
 * persistiert.
 */
export class MotionEvidenceBuffer {
  private samples: MotionWindowSample[] = [];
  constructor(private readonly retentionSec = 20) {}

  push(s: MotionWindowSample): void {
    this.samples.push(s);
    const cutoff = s.t - this.retentionSec * 1000;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
  }

  clear(): void { this.samples = []; }
  get size(): number { return this.samples.length; }

  evidenceFor(
    candidateTimeMs: number,
    params: TurnEvidenceParams = TURN_EVIDENCE_DEFAULTS,
    cumDistAt?: ((tMs: number) => number | null) | null,
  ): TurnEvidence {
    return computeTurnEvidence(this.samples, candidateTimeMs, params, cumDistAt);
  }
}

/** Eine QA-Logzeile pro Kandidat. Nur DEV/QA — nie in Produktionssessions. */
export function formatCandidateEvidenceLog(
  candidate: { t: number | null; interiorAngleDeg: number | null; confidence: number; accepted: boolean },
  ev: TurnEvidence,
): string {
  const f = (v: number | null, d = 1) => (v == null ? '—' : v.toFixed(d));
  return [
    `t=${candidate.t ?? '—'}`,
    `gpsAngle=${f(candidate.interiorAngleDeg)}°`,
    `gpsConf=${f(candidate.confidence, 2)}`,
    `acc=${candidate.accepted ? 'Y' : 'N'}`,
    `| motion=${ev.available ? 'Y' : 'N'}`,
    `netYaw=${f(ev.netYawDeg)}°`,
    `gross=${f(ev.grossYawDeg)}°`,
    `mono=${f(ev.monotonicity, 2)}`,
    `conc=${f(ev.concentration, 2)}`,
    `peak=${f(ev.peakYawRateDps)}°/s`,
    `dur=${f(ev.rotationDurationS, 2)}s`,
    `yawShare=${f(ev.yawShare, 2)}`,
    `steps=${ev.steps}`,
    `rate=${f(ev.stepRate, 2)}/s`,
    `cad=${f(ev.cadence, 0)}`,
    `state=${ev.movementState ?? '—'}`,
    `→ turnEvidence=${ev.evidence == null ? '—' : ev.evidence.toFixed(3)}`,
  ].join(' ');
}

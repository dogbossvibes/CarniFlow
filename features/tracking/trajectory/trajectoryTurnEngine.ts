/**
 * Pure trajectory turn engine.
 *
 * This module has no store, recorder, marker, voice, or persistence dependency.
 * It deliberately reports a continuous turn magnitude; the recorder owns the
 * adapter to the existing persisted angle kinds.
 */

export type LatLng = { lat: number; lng: number };

export type MotionObservation = {
  t: number;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  course?: number | null;
};

export type TrajectoryState = 'STRAIGHT' | 'TURN_ENTER' | 'TURNING' | 'NEW_DIRECTION' | 'CONFIRMED' | 'ABORTED';

export type TrajectoryTurnEvent = {
  apexIndex: number;
  apexT: number;
  apexPosition: LatLng;
  side: 'left' | 'right';
  turnMagnitudeDeg: number;
  incomingCourseDeg: number;
  outgoingCourseDeg: number;
  confidence: number;
  confirmationDistanceM?: number;
  evidence: {
    incomingStability: number;
    outgoingStability: number;
    directionPersistence: number;
    turnConcentration: number;
    gpsQuality: number;
    counterTurnPenalty: number;
    legSupport: number;
  };
  reason: string;
};

export type TrajectoryTurnAnalysis = {
  events: TrajectoryTurnEvent[];
  states: TrajectoryState[];
  candidates: number;
};

export type TrajectoryTurnOptions = {
  incomingMinM?: number;
  incomingMaxM?: number;
  outgoingMinM?: number;
  outgoingMaxM?: number;
  turnMinM?: number;
  turnMaxM?: number;
  minMagnitudeDeg?: number;
  minConfidence?: number;
  minEventSeparationM?: number;
};

const DEFAULTS: Required<TrajectoryTurnOptions> = {
  incomingMinM: 8,
  incomingMaxM: 15,
  outgoingMinM: 8,
  outgoingMaxM: 15,
  turnMinM: 2,
  turnMaxM: 6,
  minMagnitudeDeg: 20,
  minConfidence: 0.58,
  minEventSeparationM: 8,
};

type Point = { x: number; y: number; i: number; weight: number };
type Projected = Point & MotionObservation & { distanceM: number };
type DirectionFit = { courseDeg: number; stability: number; supportM: number; points: Point[] };

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function normalizeDeg(value: number): number {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return result;
}

function absTurn(a: number, b: number): number { return Math.abs(normalizeDeg(b - a)); }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function bearing(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI + 360) % 360;
}

function measurementWeight(accuracy: number | null | undefined): number {
  if (accuracy == null || !Number.isFinite(accuracy)) return 0.45;
  // A soft uncertainty weight: 3 m is useful, 9 m still contributes, never binary.
  return clamp01(1 / (1 + (Math.max(0, accuracy) / 7) ** 2));
}

function project(observations: readonly MotionObservation[]): Projected[] {
  if (!observations.length) return [];
  const origin = observations[0];
  const lat = origin.lat * Math.PI / 180;
  const raw: Projected[] = [];
  for (let i = 0; i < observations.length; i++) {
    const o = observations[i];
    const x = (o.lng - origin.lng) * 111_320 * Math.cos(lat);
    const y = (o.lat - origin.lat) * 110_540;
    raw.push({ ...o, x, y, i, distanceM: 0, weight: measurementWeight(o.accuracy) });
  }
  let total = 0;
  const result: Projected[] = [];
  for (let i = 0; i < raw.length; i++) {
    // Median smoothing removes isolated GPS wobble while preserving a concentrated turn.
    const neighborhood = raw.slice(Math.max(0, i - 2), Math.min(raw.length, i + 3));
    const x = median(neighborhood.map((p) => p.x));
    const y = median(neighborhood.map((p) => p.y));
    if (i > 0) total += Math.hypot(x - result[i - 1].x, y - result[i - 1].y);
    result.push({ ...raw[i], x, y, distanceM: total });
  }
  return result;
}

function around(points: readonly Projected[], index: number, minM: number, maxM: number, forward: boolean): Point[] {
  const anchor = points[index];
  if (!anchor) return [];
  return points.filter((p) => {
    const delta = forward ? p.distanceM - anchor.distanceM : anchor.distanceM - p.distanceM;
    return delta >= minM && delta <= maxM;
  });
}

function fitDirection(points: readonly Projected[], anchorIndex: number, minM: number, maxM: number, forward: boolean): DirectionFit | null {
  const source = around(points, anchorIndex, minM, maxM, forward);
  if (source.length < 2) return null;
  let sumW = 0, meanX = 0, meanY = 0;
  for (const p of source) { sumW += p.weight; meanX += p.x * p.weight; meanY += p.y * p.weight; }
  if (sumW <= 0) return null;
  meanX /= sumW; meanY /= sumW;
  let xx = 0, yy = 0, xy = 0;
  for (const p of source) {
    const dx = p.x - meanX, dy = p.y - meanY;
    xx += p.weight * dx * dx; yy += p.weight * dy * dy; xy += p.weight * dx * dy;
  }
  const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
  let vx = Math.cos(theta), vy = Math.sin(theta);
  const first = source[0], last = source[source.length - 1];
  if ((last.x - first.x) * vx + (last.y - first.y) * vy < 0) { vx = -vx; vy = -vy; }
  const pairCourses: { course: number; weight: number }[] = [];
  for (let i = 0; i < source.length - 1; i++) {
    for (let j = i + 1; j < source.length; j++) {
      const separation = Math.hypot(source[j].x - source[i].x, source[j].y - source[i].y);
      if (separation >= 3) pairCourses.push({
        course: bearing(source[i], source[j]),
        weight: separation * Math.min(source[i].weight, source[j].weight),
      });
    }
  }
  const pairWeight = pairCourses.reduce((sum, pair) => sum + pair.weight, 0);
  const pairX = pairCourses.reduce((sum, pair) => sum + Math.sin(pair.course * Math.PI / 180) * pair.weight, 0);
  const pairY = pairCourses.reduce((sum, pair) => sum + Math.cos(pair.course * Math.PI / 180) * pair.weight, 0);
  const courseDeg = pairWeight > 0
    ? (Math.atan2(pairX, pairY) * 180 / Math.PI + 360) % 360
    : (Math.atan2(vx, vy) * 180 / Math.PI + 360) % 360;
  const span = Math.max(1, Math.hypot(last.x - first.x, last.y - first.y));
  let residual = 0;
  let segmentDeviation = 0;
  let segmentCount = 0;
  for (const p of source) residual += p.weight * Math.abs((p.x - meanX) * vy - (p.y - meanY) * vx);
  for (const pair of pairCourses) {
    segmentDeviation += absTurn(courseDeg, pair.course) * pair.weight;
    segmentCount += pair.weight;
  }
  const lineStability = clamp01(1 - (residual / Math.max(sumW, 0.01)) / Math.max(7, span * 0.28));
  const courseStability = segmentCount ? clamp01(1 - (segmentDeviation / segmentCount) / 70) : 0.8;
  const stability = lineStability * courseStability;
  return { courseDeg, stability, supportM: Math.abs(lastDistance(source) - firstDistance(source)), points: source };
}

function firstDistance(source: readonly (Point & { distanceM?: number })[]): number {
  return source[0].distanceM ?? 0;
}

function lastDistance(source: readonly (Point & { distanceM?: number })[]): number {
  return source[source.length - 1].distanceM ?? 0;
}

function fitGpsQuality(points: readonly Projected[], before: DirectionFit, after: DirectionFit): number {
  const source = [...before.points, ...after.points];
  if (!source.length) return 0;
  return source.reduce((sum, p) => sum + p.weight, 0) / source.length;
}

function directionPersistence(points: readonly Projected[], apex: number, outgoing: DirectionFit, options: Required<TrajectoryTurnOptions>): number {
  // Compare a middle outgoing window with the later window. A stable new leg
  // stays aligned; an arc keeps changing while it crosses those windows.
  const middle = fitDirection(points, apex, Math.max(options.turnMaxM, 5), Math.max(9, options.outgoingMinM + 1), true);
  if (!middle) return clamp01(outgoing.stability * 0.7);
  const courseAgreement = clamp01(1 - absTurn(middle.courseDeg, outgoing.courseDeg) / 55);
  return clamp01(courseAgreement * 0.78 + outgoing.stability * 0.22);
}

function counterTurnPenalty(points: readonly Projected[], apex: number, incoming: DirectionFit, outgoing: DirectionFit, options: Required<TrajectoryTurnOptions>): number {
  const far = fitDirection(points, apex, options.outgoingMinM, Math.min(22, options.outgoingMaxM + 7), true);
  if (!far) return 0;
  const continuation = absTurn(outgoing.courseDeg, far.courseDeg);
  const reversal = absTurn(incoming.courseDeg, far.courseDeg);
  if (continuation < 20 || reversal > continuation) return 0;
  return clamp01((continuation - 18) / 70);
}

function turnCoherence(fit: DirectionFit): number {
  const source = [...fit.points].sort((a, b) => a.i - b.i);
  const headings: number[] = [];
  for (let i = 0; i < source.length - 1; i++) {
    if (Math.hypot(source[i + 1].x - source[i].x, source[i + 1].y - source[i].y) >= 0.35) {
      headings.push(bearing(source[i], source[i + 1]));
    }
  }
  if (headings.length < 2) return 1;
  let signed = 0, energy = 0;
  for (let i = 1; i < headings.length; i++) {
    const delta = normalizeDeg(headings[i] - headings[i - 1]);
    signed += delta;
    energy += Math.abs(delta);
  }
  return energy ? clamp01(Math.abs(signed) / energy) : 1;
}

function turnConcentration(points: readonly Projected[], apex: number, incoming: DirectionFit, outgoing: DirectionFit, options: Required<TrajectoryTurnOptions>): number {
  const anchor = points[apex];
  const source = points.filter((p) => Math.abs(p.distanceM - anchor.distanceM) <= options.incomingMaxM);
  const headings: { h: number; d: number }[] = [];
  for (let i = 0; i < source.length - 1; i++) {
    const a = source[i], b = source[i + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length >= 0.35) headings.push({ h: bearing(a, b), d: (a.distanceM + b.distanceM) / 2 });
  }
  if (headings.length < 4) return 0;
  const changes = headings.slice(1).map((item, i) => ({
    value: absTurn(headings[i].h, item.h),
    d: item.d,
  }));
  const total = changes.reduce((sum, item) => sum + item.value, 0);
  if (total < options.minMagnitudeDeg) return 0;
  let best = 0;
  for (const start of changes) {
    let sum = 0;
    for (const item of changes) {
      if (item.d >= start.d && item.d - start.d <= options.turnMaxM) sum += item.value;
    }
    best = Math.max(best, sum);
  }
  return clamp01(best / total);
}

function makeCandidate(points: readonly Projected[], apex: number, options: Required<TrajectoryTurnOptions>): TrajectoryTurnEvent | null {
  const incoming = fitDirection(points, apex, options.incomingMinM, options.incomingMaxM, false);
  const outgoing = fitDirection(points, apex, options.outgoingMinM, options.outgoingMaxM, true);
  if (!incoming || !outgoing) return null;
  const magnitude = absTurn(incoming.courseDeg, outgoing.courseDeg);
  if (magnitude < options.minMagnitudeDeg || magnitude > 150) return null;
  const concentration = turnConcentration(points, apex, incoming, outgoing, options);
  const persistence = directionPersistence(points, apex, outgoing, options);
  const counter = counterTurnPenalty(points, apex, incoming, outgoing, options);
  const gpsQuality = fitGpsQuality(points, incoming, outgoing);
  const legSupport = clamp01(Math.min(incoming.supportM, outgoing.supportM) / options.incomingMinM);
  const confidence = clamp01(
    incoming.stability * 0.22
    + outgoing.stability * 0.22
    + persistence * 0.22
    + concentration * 0.16
    + gpsQuality * 0.10
    + legSupport * 0.08
    - counter * 0.24,
  );
  const confidenceFloor = gpsQuality < 0.6 ? Math.max(options.minConfidence, 0.65) : options.minConfidence;
  const concentrationFloor = gpsQuality < 0.6 ? 0.25 : 0.65;
  const coherenceFloor = gpsQuality < 0.6 ? 0.45 : 0.8;
  if (confidence < confidenceFloor || persistence < 0.48 || concentration < concentrationFloor
    || incoming.stability < 0.6 || outgoing.stability < 0.75 || turnCoherence(incoming) < coherenceFloor) return null;
  const delta = normalizeDeg(outgoing.courseDeg - incoming.courseDeg);
  const confirmationIndex = points.findIndex((p, i) => i > apex && p.distanceM - points[apex].distanceM >= options.outgoingMinM);
  const confirmationDistanceM = confirmationIndex > apex ? points[confirmationIndex].distanceM - points[apex].distanceM : undefined;
  return {
    apexIndex: points[apex].i,
    apexT: points[apex].t,
    apexPosition: { lat: points[apex].lat, lng: points[apex].lng },
    side: delta > 0 ? 'right' : 'left',
    turnMagnitudeDeg: magnitude,
    incomingCourseDeg: incoming.courseDeg,
    outgoingCourseDeg: outgoing.courseDeg,
    confidence,
    confirmationDistanceM,
    evidence: {
      incomingStability: incoming.stability,
      outgoingStability: outgoing.stability,
      directionPersistence: persistence,
      turnConcentration: concentration,
      gpsQuality,
      counterTurnPenalty: counter,
      legSupport,
    },
    reason: counter > 0.45 ? 'counter_turn_penalty' : 'persistent_direction_change',
  };
}

function suppressNearby(events: TrajectoryTurnEvent[], points: readonly Projected[], separationM: number): TrajectoryTurnEvent[] {
  const distanceByIndex = new Map(points.map((p) => [p.i, p.distanceM]));
  const result: TrajectoryTurnEvent[] = [];
  for (const event of [...events].sort((a, b) => b.confidence - a.confidence)) {
    const d = distanceByIndex.get(event.apexIndex) ?? 0;
    if (result.every((other) => Math.abs(d - (distanceByIndex.get(other.apexIndex) ?? 0)) >= separationM)) result.push(event);
  }
  return result.sort((a, b) => a.apexIndex - b.apexIndex);
}

function stateForIndex(index: number, events: readonly TrajectoryTurnEvent[]): TrajectoryState {
  const event = events.find((candidate) => Math.abs(candidate.apexIndex - index) <= 8);
  if (!event) return 'STRAIGHT';
  const delta = index - event.apexIndex;
  if (delta < -6) return 'STRAIGHT';
  if (delta < -2) return 'TURN_ENTER';
  if (delta <= 2) return 'TURNING';
  if (delta <= 6) return 'NEW_DIRECTION';
  return 'CONFIRMED';
}

export function analyzeTrajectory(
  observations: readonly MotionObservation[],
  overrides: TrajectoryTurnOptions = {},
): TrajectoryTurnAnalysis {
  const options = { ...DEFAULTS, ...overrides };
  const points = project(observations);
  if (points.length < 8) return { events: [], states: points.map((_, i) => stateForIndex(i, [])), candidates: 0 };
  const candidates: TrajectoryTurnEvent[] = [];
  for (let i = 2; i < points.length - 2; i++) {
    if (points[i].distanceM - points[0].distanceM < options.incomingMinM) continue;
    const candidate = makeCandidate(points, i, options);
    if (candidate) candidates.push(candidate);
  }
  const events = suppressNearby(candidates, points, options.minEventSeparationM);
  return { events, states: points.map((_, i) => stateForIndex(i, events)), candidates: candidates.length };
}

export class TrajectoryTurnEngine {
  private readonly observations: MotionObservation[] = [];
  private readonly options: TrajectoryTurnOptions;
  private emitted = new Set<string>();

  public constructor(options: TrajectoryTurnOptions = {}) { this.options = options; }

  public push(observation: MotionObservation): { state: TrajectoryState; event: TrajectoryTurnEvent | null } {
    this.observations.push(observation);
    const analysis = analyzeTrajectory(this.observations, this.options);
    const latest = analysis.events.find((event) => !this.emitted.has(`${event.apexIndex}:${event.apexT}`)) ?? null;
    if (latest) this.emitted.add(`${latest.apexIndex}:${latest.apexT}`);
    return { state: latest ? 'CONFIRMED' : (analysis.states.at(-1) ?? 'STRAIGHT'), event: latest };
  }

  public finalize(): TrajectoryTurnAnalysis { return analyzeTrajectory(this.observations, this.options); }
  public reset(): void { this.observations.length = 0; this.emitted.clear(); }
}

export const detectTrajectoryTurns = analyzeTrajectory;

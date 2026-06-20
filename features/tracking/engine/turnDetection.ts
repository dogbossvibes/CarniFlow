// Sharp-Turn-Erkennung: scharfe Winkel der gelegten Fährte (werden NICHT
// weichgeglättet, sonst „verrundet" der echte Winkel). Reine Funktionen.
import { distanceM, type LatLng } from '@/lib/trackGuidance';
import { calculateHeading } from '@/features/tracking/utils/gpsFilter';
import { PRECISION } from '@/features/tracking/engine/gpsQuality';

// Vorzeichenbehaftete Richtungsänderung an `point` (−180..180°; + = rechts/CW).
export function signedTurnAt(prev: LatLng, point: LatLng, next: LatLng): number {
  const hIn = calculateHeading(prev, point);
  const hOut = calculateHeading(point, next);
  let diff = hOut - hIn;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff;
}

export function turnAngleAt(prev: LatLng, point: LatLng, next: LatLng): number {
  return Math.abs(signedTurnAt(prev, point, next));
}

export interface SharpTurn {
  index:     number;
  point:     LatLng;
  turnDeg:   number;
  direction: 'links' | 'rechts';
}

export function isSharpTurn(
  prev: LatLng, point: LatLng, next: LatLng,
  thresholdDeg = PRECISION.SHARP_TURN_DEG, minSegM = PRECISION.TURN_MIN_SEGMENT_M,
): boolean {
  if (distanceM(prev, point) < minSegM || distanceM(point, next) < minSegM) return false;
  return turnAngleAt(prev, point, next) > thresholdDeg;
}

export function findSharpTurns(
  points: LatLng[],
  thresholdDeg = PRECISION.SHARP_TURN_DEG, minSegM = PRECISION.TURN_MIN_SEGMENT_M,
): SharpTurn[] {
  const out: SharpTurn[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], p = points[i], next = points[i + 1];
    if (!isSharpTurn(prev, p, next, thresholdDeg, minSegM)) continue;
    const signed = signedTurnAt(prev, p, next);
    out.push({ index: i, point: p, turnDeg: Math.abs(signed), direction: signed > 0 ? 'rechts' : 'links' });
  }
  return out;
}

// --- Live-Erkennung beim Anhängen eines neuen Punktes ---

// Echte Fährtenwinkel brauchen klare Schenkel: > 2 m je Segment (strenger als die
// allgemeine TURN_MIN_SEGMENT_M, damit GPS-Zappeln keinen „Winkel" vortäuscht).
const SHARP_TURN_MIN_SEGMENT_M = 2;

// Punkt, wie er live anfällt: Position + optionale Qualität/Status.
export type TurnCandidatePoint = LatLng & {
  accuracy?: number | null;
  status?:   string | null;   // z. B. 'drift'
};

export interface DetectSharpTurnResult {
  isSharpTurn:  boolean;
  angleDegrees: number | null;
}

// Prüft, ob der neue Punkt mit den letzten zwei akzeptierten einen echten,
// scharfen Fährtenwinkel bildet. A = vorletzter, B = letzter (Scheitel), C = neu.
export function detectSharpTurn(
  points: ReadonlyArray<TurnCandidatePoint>,
  currentPoint: TurnCandidatePoint,
): DetectSharpTurnResult {
  // Mindestens 3 akzeptierte Punkte (A, B + aktueller C).
  if (points.length < 2) return { isSharpTurn: false, angleDegrees: null };

  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const c = currentPoint;

  // Richtungsänderung A→B vs. B→C.
  const angle = turnAngleAt(a, b, c);
  if (angle <= PRECISION.SHARP_TURN_DEG) return { isSharpTurn: false, angleDegrees: angle };

  // Nur als echter Winkel werten, wenn die Schenkel lang und B sauber sind.
  const accB = b.accuracy;
  const real =
    distanceM(a, b) > SHARP_TURN_MIN_SEGMENT_M &&
    distanceM(b, c) > SHARP_TURN_MIN_SEGMENT_M &&
    accB != null && accB <= PRECISION.PLAUSIBLE_ACCURACY_M &&   // ≤ 15 m
    b.status !== 'drift' && c.status !== 'drift';

  return { isSharpTurn: real, angleDegrees: angle };
}

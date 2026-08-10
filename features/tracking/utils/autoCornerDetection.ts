import { calculateHeading, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

export interface AutoCornerPoint extends LatLng {
  cumDist: number;
  accuracy: number | null;
}

export interface AutoCorner {
  apex: AutoCornerPoint;
  kind: Extract<AngleKind, 'links' | 'rechts' | 'spitz_links' | 'spitz_rechts'>;
  angleDeg: number;
}

const LEG_MIN_M = 4;
const CORNER_GAP_M = LEG_MIN_M;
const MAX_ANGLE_ACCURACY_M = 20;
const MAX_LEG_HEADING_DEVIATION_DEG = 12;

function normalizeDeg(degrees: number): number {
  while (degrees > 180) degrees -= 360;
  while (degrees < -180) degrees += 360;
  return degrees;
}

// A real corner has two stable, straight legs. A continuous curve changes heading
// within a leg, even when the total turn is large enough to resemble a corner.
export function hasStableCornerLegs(
  points: readonly AutoCornerPoint[],
  inboundIndex: number,
  apexIndex: number,
  outboundIndex: number,
): boolean {
  return isStableLeg(points, inboundIndex, apexIndex) && isStableLeg(points, apexIndex, outboundIndex);
}

function isStableLeg(points: readonly AutoCornerPoint[], from: number, to: number): boolean {
  // At least two observed segments are required; a single chord cannot distinguish
  // a continuous curve from a true straight leg.
  if (to - from < 2) return false;

  const legHeading = calculateHeading(points[from], points[to]);
  for (let index = from; index < to; index++) {
    const segmentHeading = calculateHeading(points[index], points[index + 1]);
    if (Math.abs(normalizeDeg(segmentHeading - legHeading)) >= MAX_LEG_HEADING_DEVIATION_DEG) return false;
  }
  return true;
}

// Pure mirror of the live recorder's decision logic for regression coverage.
export function detectAutoCorner(
  points: readonly AutoCornerPoint[],
  lastCornerDistanceM: number,
): AutoCorner | null {
  if (points.length < 3) return null;
  const latest = points[points.length - 1];
  let best: { apexIndex: number; diff: number; magnitude: number } | null = null;

  for (let apexIndex = points.length - 2; apexIndex > 0; apexIndex--) {
    const apex = points[apexIndex];
    if (latest.cumDist - apex.cumDist < LEG_MIN_M) continue;
    if (apex.cumDist - lastCornerDistanceM < CORNER_GAP_M) break;
    if (apex.accuracy == null || apex.accuracy > MAX_ANGLE_ACCURACY_M) continue;

    let inboundIndex = apexIndex;
    while (inboundIndex > 0 && apex.cumDist - points[inboundIndex].cumDist < LEG_MIN_M) inboundIndex--;
    if (apex.cumDist - points[inboundIndex].cumDist < LEG_MIN_M) continue;

    let outboundIndex = apexIndex;
    while (outboundIndex < points.length - 1 && points[outboundIndex].cumDist - apex.cumDist < LEG_MIN_M) outboundIndex++;
    if (!hasStableCornerLegs(points, inboundIndex, apexIndex, outboundIndex)) continue;

    const diff = normalizeDeg(
      calculateHeading(apex, points[outboundIndex]) - calculateHeading(points[inboundIndex], apex),
    );
    const magnitude = Math.abs(diff);
    if (!best || magnitude > best.magnitude) best = { apexIndex, diff, magnitude };
  }

  if (!best || best.magnitude < 15) return null;

  const angleDeg = 180 - best.magnitude;
  const direction = best.diff > 0 ? 'rechts' : 'links';
  // Innenwinkel-Klassen (überlappungsfrei), auf ganze Grad gerundet gegen GPS-/FP-
  // Rauschen an den Grenzen: 75–105° normal (~90° ±15°), 30–60° spitz. 60–75° und
  // >105° bleiben bewusste Totzone → kein Auto-Marker.
  const cls = Math.round(angleDeg);
  const kind = cls >= 75 && cls <= 105
    ? direction
    : cls >= 30 && cls <= 60
      ? direction === 'rechts' ? 'spitz_rechts' : 'spitz_links'
      : null;

  return kind ? { apex: points[best.apexIndex], kind, angleDeg } : null;
}

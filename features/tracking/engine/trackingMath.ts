// Zentrale Geo-Mathematik der Tracking-Engine. Bündelt Distanz/Geschwindigkeit/
// Bearing/Median an einer Stelle (reine Funktionen, testbar). Wrappt die
// vorhandenen Helfer, damit es genau EINE kanonische Quelle gibt.
import { distanceM, type LatLng } from '@/lib/trackGuidance';
import { calculateHeading } from '@/features/tracking/utils/gpsFilter';
import { medianPoint } from '@/features/tracking/engine/objectPlacement';

export type { LatLng };

// Haversine-Distanz zweier Koordinaten in Metern.
export function calculateDistanceMeters(a: LatLng, b: LatLng): number {
  return distanceM(a, b);
}

// Geschwindigkeit zwischen zwei Fixes (m/s). dtMs ≤ 0 → null (unbestimmt).
export function calculateSpeedMps(a: LatLng, b: LatLng, dtMs: number): number | null {
  if (dtMs <= 0) return null;
  return calculateDistanceMeters(a, b) / (dtMs / 1000);
}

// Bearing a→b in Grad (0..360, 0 = Nord, im Uhrzeigersinn).
export function calculateBearingDegrees(a: LatLng, b: LatLng): number {
  return calculateHeading(a, b);
}

// Komponentenweiser Median (ausreisserfest). Leere Menge → null.
export function medianCoordinate(points: LatLng[]): LatLng | null {
  return medianPoint(points);
}

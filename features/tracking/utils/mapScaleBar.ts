import { haversineM } from './searchGeometry';

export interface MapScale { meters: number; width: number; label: string }
export interface MapScalePoint { x: number; y: number }
export interface MapScaleProjection {
  coordinateForPoint(point: MapScalePoint): Promise<{ latitude: number; longitude: number }>;
}

/** Metric 1/2/5 steps; width is in RN layout points, never hardware pixels. */
export function mapScaleForDistance(meters: number, width: number): MapScale | null {
  if (!Number.isFinite(meters) || !Number.isFinite(width) || meters < 1 || width < 40) return null;
  const power = 10 ** Math.floor(Math.log10(meters));
  const unit = meters / power;
  const nice = (unit >= 5 ? 5 : unit >= 2 ? 2 : 1) * power;
  return { meters: nice, width: width * nice / meters, label: nice >= 1000 ? `${nice / 1000} km` : `${nice} m` };
}

/** Sample at the bar itself: rotation, latitude and perspective come from the native map. */
export async function measureMapScale(map: MapScaleProjection, origin: MapScalePoint, width: number): Promise<MapScale | null> {
  const valid = (p: { latitude: number; longitude: number }) => p && Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
  const [a, b] = await Promise.all([
    map.coordinateForPoint(origin), map.coordinateForPoint({ x: origin.x + width, y: origin.y }),
  ]);
  if (!valid(a) || !valid(b)) return null;
  const scale = mapScaleForDistance(haversineM(a, b), width);
  if (!scale) return null;
  // Verify the chosen width too; reject unstable/nonlinear projection instead of a false ruler.
  const end = await map.coordinateForPoint({ x: origin.x + scale.width, y: origin.y });
  if (!valid(end) || Math.abs(haversineM(a, end) / scale.meters - 1) > 0.03) return null;
  return scale;
}

/** Shared bottom stack: metrics → ruler → existing progress/segment cards. */
export function mapBottomOverlayLayout(metricsHeight: number, scaleHeight: number, showScale: boolean) {
  const scaleBottom = 14 + Math.max(0, metricsHeight) + 8;
  return { scaleBottom, contentBottom: scaleBottom + (showScale ? Math.max(0, scaleHeight) + 8 : 0) };
}

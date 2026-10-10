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

type Coordinate = { latitude: number; longitude: number };

// Promise.all would release a batch on its first rejection although sibling native
// calls can still be outstanding. The native maps API has no cancellation method.
async function readProjectionBatch(map: MapScaleProjection, points: MapScalePoint[]): Promise<Coordinate[] | null> {
  const settled = await Promise.allSettled(points.map(point => Promise.resolve().then(() => map.coordinateForPoint(point))));
  if (settled.some(item => item.status === 'rejected')) return null;
  return settled.map(item => (item as PromiseFulfilledResult<Coordinate>).value);
}

type NativeFlight = { listeners: Set<() => void> };
const nativeFlights = new WeakMap<MapScaleProjection, NativeFlight>();

/** One physically outstanding measurement per native MapView, across hook lifecycles. */
export function requestMapScaleMeasurement(
  map: MapScaleProjection, origin: MapScalePoint, width: number, isCurrent: () => boolean, onIdle: () => void,
): { promise: Promise<MapScale | null> } | { unsubscribe: () => void } {
  const existing = nativeFlights.get(map);
  if (existing) {
    existing.listeners.add(onIdle);
    return { unsubscribe: () => { existing.listeners.delete(onIdle); } };
  }
  const flight: NativeFlight = { listeners: new Set() };
  nativeFlights.set(map, flight);
  const release = () => {
    if (nativeFlights.get(map) === flight) nativeFlights.delete(map);
    const listeners = [...flight.listeners];
    flight.listeners.clear();
    listeners.forEach(listener => listener());
  };
  const promise = measureMapScale(map, origin, width, isCurrent);
  // Register release before returning the promise so a retry sees the freed map.
  void promise.then(release, release);
  return { promise };
}

/** Sample at the bar itself: rotation, latitude and perspective come from the native map. */
export async function measureMapScale(map: MapScaleProjection, origin: MapScalePoint, width: number, isCurrent: () => boolean = () => true): Promise<MapScale | null> {
  const valid = (p: { latitude: number; longitude: number }) => p && Number.isFinite(p.latitude) &&
    Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
  if (!isCurrent()) return null;
  const first = await readProjectionBatch(map, [origin, { x: origin.x + width, y: origin.y }]);
  if (!isCurrent() || !first) return null;
  const [a, b] = first;
  if (!valid(a) || !valid(b)) return null;
  const scale = mapScaleForDistance(haversineM(a, b), width);
  if (!scale) return null;
  // Verify the chosen width too; reject unstable/nonlinear projection instead of a false ruler.
  // Read a fresh origin in the same batch: camera translation between batches must not
  // be mistaken for zoom. Recheck the full probe as well to reject changing scale.
  const second = await readProjectionBatch(map, [
    origin, { x: origin.x + width, y: origin.y }, { x: origin.x + scale.width, y: origin.y },
  ]);
  if (!isCurrent() || !second) return null;
  const [currentOrigin, currentFull, end] = second;
  if (!valid(currentOrigin) || !valid(currentFull) || !valid(end) ||
    Math.abs(haversineM(currentOrigin, currentFull) / haversineM(a, b) - 1) > 0.03 ||
    Math.abs(haversineM(currentOrigin, end) / scale.meters - 1) > 0.03) return null;
  return scale;
}

/** Shared bottom stack: metrics → ruler → existing progress/segment cards. */
export function mapBottomOverlayLayout(metricsHeight: number, scaleHeight: number, showScale: boolean) {
  const scaleBottom = 14 + Math.max(0, metricsHeight) + 8;
  return { scaleBottom, contentBottom: scaleBottom + (showScale ? Math.max(0, scaleHeight) + 8 : 0) };
}

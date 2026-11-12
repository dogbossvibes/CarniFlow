/** Display projection only: recorded positions, no invented corners or gap filling. */
export interface SketchPoint { lat: number; lng: number; breakBefore?: boolean }
export type XY = [number, number];
export function validSketchPoint(p: unknown): p is SketchPoint {
  const v = p as SketchPoint | null;
  return !!v && Number.isFinite(v.lat) && Number.isFinite(v.lng)
    && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180;
}
export function projectTrackSketch(points: readonly SketchPoint[], width: number, height: number,
  angles: readonly SketchPoint[] = [], objects: readonly SketchPoint[] = []) {
  const parts: SketchPoint[][] = [];
  let part: SketchPoint[] = [];
  for (const p of points) {
    if (!validSketchPoint(p) || p.breakBefore) { if (part.length) parts.push(part); part = []; }
    if (validSketchPoint(p)) part.push(p);
  }
  if (part.length) parts.push(part);
  const valid = parts.flat();
  if (!valid.length) return null;
  // Unwrap longitudes around the first recorded position (also works across ±180°).
  const origin = valid[0].lng;
  const longitude = (p: SketchPoint) => origin + ((p.lng - origin + 540) % 360) - 180;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  const goodAngles = angles.filter(validSketchPoint), goodObjects = objects.filter(validSketchPoint);
  for (const p of [...valid, ...goodAngles, ...goodObjects]) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, longitude(p)); maxLng = Math.max(maxLng, longitude(p));
  }
  const xFactor = Math.max(0.000001, Math.cos((minLat + maxLat) * Math.PI / 360));
  const spanX = (maxLng - minLng) * xFactor, spanY = maxLat - minLat;
  const pad = Math.min(Math.max(8, Math.min(width, height) * 0.12), Math.min(width, height) / 3);
  const scale = Math.min((width - 2 * pad) / Math.max(spanX, 1e-9), (height - 2 * pad) / Math.max(spanY, 1e-9));
  const project = (p: SketchPoint): XY => [width / 2 + (longitude(p) - (minLng + maxLng) / 2) * xFactor * scale,
    height / 2 - (p.lat - (minLat + maxLat) / 2) * scale];
  return { parts: parts.map(ps => ps.map(project)), start: project(valid[0]), end: project(valid[valid.length - 1]),
    angles: goodAngles.map(project), objects: goodObjects.map(project), count: valid.length,
    hasLine: parts.some(ps => ps.some(p => p.lat !== ps[0].lat || p.lng !== ps[0].lng)) };
}

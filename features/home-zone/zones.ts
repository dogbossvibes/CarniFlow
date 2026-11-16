import type { ExportPoint, TrackUserExport } from '@/features/tracking/utils/trackUserExport';

// Heimzone (Issue #115): Schutzkreise um den Wohnbereich. Reine Geometrie ohne
// Speicher- oder Gerätezugriff. Gekürzt wird ausschliesslich die geteilte Kopie;
// gespeicherte Originaldaten werden hier nie verändert.

export const HOME_ZONE_RADII = [200, 300, 500] as const;
export const HOME_ZONE_MAX = 5;
export interface HomeZone { id: string; lat: number; lng: number; radiusM: number }
export interface HomeZoneEffect { removedPoints: number; removedMarkers: number; removedMeters: number; allRemoved: boolean }
type LatLng = { lat: number; lng: number };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const RAD = Math.PI / 180, EARTH_M = 6_371_008.8;

export function parseHomeZones(value: unknown): HomeZone[] {
  if (!Array.isArray(value)) return [];
  const out: HomeZone[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const z = raw as Record<string, unknown>;
    if (typeof z.id !== 'string' || !z.id || !finite(z.lat) || !finite(z.lng) || !finite(z.radiusM)) continue;
    if (Math.abs(z.lat) > 90 || Math.abs(z.lng) > 180 || z.radiusM < 50 || z.radiusM > 5000) continue;
    out.push({ id: z.id, lat: z.lat, lng: z.lng, radiusM: z.radiusM });
    if (out.length === HOME_ZONE_MAX) break;
  }
  return out;
}

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** marginM vergrössert die Zone, z. B. um die GPS-Ungenauigkeit einer Live-Position. */
export function insideHomeZone(point: LatLng, zones: readonly HomeZone[], marginM = 0): boolean {
  return zones.some(z => distanceM(point, z) <= z.radiusM + Math.max(0, marginM));
}

/** Verbindungslinie zweier Aussenpunkte, die durch eine Zone führt (lokale Ebene, reicht für Zonen bis 5 km). */
export function chordCrossesZone(a: LatLng, b: LatLng, zones: readonly HomeZone[]): boolean {
  return zones.some(z => {
    const mLat = EARTH_M * RAD, mLng = mLat * Math.cos(z.lat * RAD);
    const ax = (a.lng - z.lng) * mLng, ay = (a.lat - z.lat) * mLat, bx = (b.lng - z.lng) * mLng, by = (b.lat - z.lat) * mLat;
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    return Math.hypot(ax + t * dx, ay + t * dy) <= z.radiusM;
  });
}

function clipParts(parts: ExportPoint[][], zones: readonly HomeZone[], effect: HomeZoneEffect): ExportPoint[][] {
  const out: ExportPoint[][] = [];
  for (const part of parts) {
    let current: ExportPoint[] = [], previous: ExportPoint | null = null;
    const flush = () => { if (current.length) out.push(current); current = []; };
    for (const point of part) {
      const inside = insideHomeZone(point, zones);
      if (previous && (inside || insideHomeZone(previous, zones) || chordCrossesZone(previous, point, zones))) {
        effect.removedMeters += distanceM(previous, point);
        flush();
      }
      if (inside) effect.removedPoints++; else current.push(point);
      previous = point;
    }
    flush();
  }
  return out;
}

/** Geteilte Kopie ohne Koordinaten innerhalb der Zonen. Die Eingabe bleibt unverändert. */
export function applyHomeZones(data: TrackUserExport, zones: readonly HomeZone[]): { data: TrackUserExport; effect: HomeZoneEffect } {
  const effect: HomeZoneEffect = { removedPoints: 0, removedMarkers: 0, removedMeters: 0, allRemoved: false };
  if (!zones.length) return { data, effect };
  const had = data.reference.length + data.search.length + data.markers.length > 0;
  const reference = clipParts(data.reference, zones, effect);
  const search = clipParts(data.search, zones, effect);
  const markers = data.markers.filter(m => !insideHomeZone(m, zones));
  effect.removedMarkers = data.markers.length - markers.length;
  if (!effect.removedPoints && !effect.removedMarkers && !effect.removedMeters) return { data, effect };
  effect.removedMeters = Math.round(effect.removedMeters);
  effect.allRemoved = had && reference.length + search.length + markers.length === 0;
  return { data: { ...data, reference, search, markers, homeZoneApplied: true }, effect };
}

/** Findet Koordinaten in beliebigen Paketformaten (lat/lng oder latitude/longitude). */
export function touchesHomeZoneDeep(value: unknown, zones: readonly HomeZone[]): boolean {
  if (!zones.length) return false;
  const stack: unknown[] = [value];
  let budget = 500_000;
  while (stack.length) {
    const next = stack.pop();
    if (!next || typeof next !== 'object') continue;
    if (--budget < 0) return true; // Nicht vollständig prüfbar: lieber warnen.
    if (Array.isArray(next)) { for (const item of next) stack.push(item); continue; }
    const r = next as Record<string, unknown>;
    const lat = finite(r.lat) ? r.lat : r.latitude, lng = finite(r.lng) ? r.lng : r.longitude;
    if (finite(lat) && finite(lng) && insideHomeZone({ lat, lng }, zones)) return true;
    for (const key of Object.keys(r)) stack.push(r[key]);
  }
  return false;
}

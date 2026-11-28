// Reine Kachel-Mathematik (Web Mercator / XYZ). Kein Netz, kein Dateisystem → voll testbar.

export type Bounds = { north: number; south: number; east: number; west: number };
export type TileKey = { z: number; x: number; y: number };

const MAX_LAT = 85.05112878;
const clampLat = (lat: number) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));

export function lngToTileX(lng: number, z: number): number {
  const n = 2 ** z;
  return Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n)));
}

export function latToTileY(lat: number, z: number): number {
  const n = 2 ** z;
  const rad = (clampLat(lat) * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return Math.min(n - 1, Math.max(0, y));
}

export function isValidBounds(b: Bounds | null | undefined): b is Bounds {
  if (!b) return false;
  const ok = (v: unknown, lim: number) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
  return ok(b.north, 90) && ok(b.south, 90) && ok(b.east, 180) && ok(b.west, 180)
    && b.north > b.south && b.east > b.west;
}

/** Kachelbereich (inklusiv) einer Zoomstufe. */
export function tileRange(b: Bounds, z: number) {
  return {
    minX: lngToTileX(b.west, z), maxX: lngToTileX(b.east, z),
    minY: latToTileY(b.north, z), maxY: latToTileY(b.south, z),
  };
}

export function countTiles(b: Bounds, minZoom: number, maxZoom: number): number {
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRange(b, z);
    total += (r.maxX - r.minX + 1) * (r.maxY - r.minY + 1);
  }
  return total;
}

/** Erzeugt die Kacheln lazy (grosse Gebiete nie komplett im Speicher). */
export function* iterateTiles(b: Bounds, minZoom: number, maxZoom: number): Generator<TileKey> {
  for (let z = minZoom; z <= maxZoom; z++) {
    const r = tileRange(b, z);
    for (let x = r.minX; x <= r.maxX; x++) {
      for (let y = r.minY; y <= r.maxY; y++) yield { z, x, y };
    }
  }
}

export function tileInBounds(t: TileKey, b: Bounds): boolean {
  const r = tileRange(b, t.z);
  return t.x >= r.minX && t.x <= r.maxX && t.y >= r.minY && t.y <= r.maxY;
}

/** true, wenn das Gebiet vollständig innerhalb der Abdeckung liegt. */
export function boundsInside(inner: Bounds, outer: Bounds): boolean {
  return inner.north <= outer.north && inner.south >= outer.south && inner.east <= outer.east && inner.west >= outer.west;
}

/** Kartenausschnitt (react-native-maps Region) → Bounds. */
export function regionToBounds(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }): Bounds {
  return {
    north: clampLat(r.latitude + r.latitudeDelta / 2), south: clampLat(r.latitude - r.latitudeDelta / 2),
    east: Math.min(180, r.longitude + r.longitudeDelta / 2), west: Math.max(-180, r.longitude - r.longitudeDelta / 2),
  };
}

/** Ungefähre Fläche in km² (für die Anzeige). */
export function approxAreaKm2(b: Bounds): number {
  const midLat = ((b.north + b.south) / 2) * (Math.PI / 180);
  const h = (b.north - b.south) * 111.32;
  const w = (b.east - b.west) * 111.32 * Math.cos(midLat);
  return Math.max(0, h * w);
}

/** [lng, lat]-Ring. */
export type Ring = readonly (readonly [number, number])[];

export function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Mittelpunkt liegt im Gebiet (Kacheln jenseits der Grenze liefert der Dienst einfach leer). */
export function boundsCenterInRing(b: Bounds, ring: Ring): boolean {
  return pointInRing((b.east + b.west) / 2, (b.north + b.south) / 2, ring);
}

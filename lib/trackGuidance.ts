// Reine Geometrie-Helfer für die Sprach-Führung beim Fährte-Ablaufen.
// Alle Berechnungen lokal in Metern über eine einfache equirectangulare
// Projektion um einen Referenzpunkt — auf Fährten-Distanzen (wenige hundert
// Meter) ausreichend genau und ohne externe Abhängigkeiten.

export interface LatLng { lat: number; lng: number; }

const M_PER_DEG_LAT = 111_320;

function toRad(d: number): number { return (d * Math.PI) / 180; }

// Haversine-Distanz in Metern zwischen zwei Koordinaten.
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const Δφ = toRad(b.lat - a.lat), Δλ = toRad(b.lng - a.lng);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Projiziert eine Koordinate relativ zu `ref` in lokale Meter (x = Ost, y = Nord).
function project(p: LatLng, ref: LatLng): { x: number; y: number } {
  const mPerLng = M_PER_DEG_LAT * Math.cos(toRad(ref.lat));
  return { x: (p.lng - ref.lng) * mPerLng, y: (p.lat - ref.lat) * M_PER_DEG_LAT };
}

// Abstand Punkt→Strecke + Vorzeichen der Seite (Kreuzprodukt-z).
function pointToSegment(
  px: number, py: number, ax: number, ay: number, bx: number, by: number,
): { dist: number; cross: number } {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const dist  = Math.hypot(px - cx, py - cy);
  const cross = dx * (py - ay) - dy * (px - ax); // > 0 ⇒ links der Laufrichtung
  return { dist, cross };
}

export interface Deviation {
  dist: number;                          // Meter zur nächsten Fährten-Linie
  side: 'links' | 'rechts' | null;       // auf welche Seite man abweicht
}

// Kürzester Abstand der aktuellen Position zur gelegten Fährte (Polylinie)
// plus die Seite, auf die abgewichen wird.
export function deviationFromTrack(cur: LatLng, track: LatLng[]): Deviation {
  if (track.length === 0) return { dist: Infinity, side: null };
  if (track.length === 1) return { dist: distanceM(cur, track[0]), side: null };

  const p = project(cur, cur); // = {0,0}
  let best = Infinity, bestCross = 0;
  for (let i = 1; i < track.length; i++) {
    const a = project(track[i - 1], cur);
    const b = project(track[i], cur);
    const { dist, cross } = pointToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
    if (dist < best) { best = dist; bestCross = cross; }
  }
  const side = best < 1.5 ? null : (bestCross > 0 ? 'links' : 'rechts');
  return { dist: best, side };
}

// Distanz (Meter) zum nächstgelegenen Gegenstand aus einer Liste; Infinity wenn leer.
export function nearestArticleDist(cur: LatLng, articles: LatLng[]): number {
  let best = Infinity;
  for (const a of articles) {
    const d = distanceM(cur, a);
    if (d < best) best = d;
  }
  return best;
}

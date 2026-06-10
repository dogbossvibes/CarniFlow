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

// ── Winkel-Erkennung der gelegten Fährte ────────────────────────────────────

export type CornerKind = 'stumpf' | 'recht' | 'spitz';

export interface Corner {
  index:     number;            // Index im resampelten Pfad (stabil pro Suche)
  point:     LatLng;            // Position der Ecke
  turnDeg:   number;            // Richtungsänderung 0..180°
  direction: 'links' | 'rechts';
  kind:      CornerKind;        // stumpf <65° · recht 65–115° · spitz >115°
}

// Resampling: glättet GPS-Rauschen, indem nur etwa alle `stepM` Meter ein Punkt
// behalten wird. So werden echte Winkel klar erkennbar statt im Zittern unterzugehen.
function resample(track: LatLng[], stepM: number): LatLng[] {
  if (track.length < 2) return [...track];
  const out: LatLng[] = [track[0]];
  let acc = 0;
  for (let i = 1; i < track.length; i++) {
    acc += distanceM(track[i - 1], track[i]);
    if (acc >= stepM) { out.push(track[i]); acc = 0; }
  }
  const last = track[track.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// Erkennt signifikante Ecken der gelegten Fährte und klassifiziert sie nach
// Richtung (links/rechts) und Art (stumpf/recht/spitz). GPS-geglättet.
export function detectCorners(track: LatLng[], stepM = 3): Corner[] {
  const pts = resample(track, stepM);
  const corners: Corner[] = [];
  if (pts.length < 3) return corners;

  const ref = pts[0];
  const pr = pts.map(p => project(p, ref));
  for (let i = 1; i < pr.length - 1; i++) {
    const ax = pr[i].x - pr[i - 1].x, ay = pr[i].y - pr[i - 1].y;
    const bx = pr[i + 1].x - pr[i].x, by = pr[i + 1].y - pr[i].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1.5 || lb < 1.5) continue;                 // zu kurz → Rauschen
    let dot = (ax * bx + ay * by) / (la * lb);
    dot = Math.max(-1, Math.min(1, dot));
    const turn = (Math.acos(dot) * 180) / Math.PI;      // 0 = gerade, 180 = Kehre
    if (turn < 25) continue;                            // kein echter Winkel

    const cross = ax * by - ay * bx;                    // > 0 ⇒ Linkskurve
    corners.push({
      index:     i,
      point:     pts[i],
      turnDeg:   turn,
      direction: cross > 0 ? 'links' : 'rechts',
      kind:      turn > 115 ? 'spitz' : turn >= 65 ? 'recht' : 'stumpf',
    });
  }

  // Eng beieinanderliegende Ecken (Rauschen) zusammenfassen — die schärfere gewinnt.
  const merged: Corner[] = [];
  for (const c of corners) {
    const prev = merged[merged.length - 1];
    if (prev && distanceM(prev.point, c.point) < 4) {
      if (c.turnDeg > prev.turnDeg) merged[merged.length - 1] = c;
    } else {
      merged.push(c);
    }
  }
  return merged;
}

// Sprechbare Bezeichnung für die Ansage.
export function cornerLabel(kind: CornerKind): string {
  return kind === 'spitz' ? 'spitzer Winkel' : kind === 'recht' ? 'rechter Winkel' : 'leichter Winkel';
}

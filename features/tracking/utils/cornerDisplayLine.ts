// Gelegte Linie durch die erkannten Winkelpunkte führen — REINE ANZEIGE.
//
// Die gespeicherte Linie ist ausgedünnt (etwa ein Punkt je 2 m) und schneidet Ecken ab; die
// Winkelmarke sitzt am Punkt, an dem der Winkel erkannt wurde, und liegt deshalb bis gut 1 m
// neben dem Knick der Linie. Für die Karte wird der Linienpunkt an der Ecke auf den Winkelpunkt
// gesetzt (oder der Winkelpunkt eingefügt), damit Marke und Ecke zusammenfallen.
//
// Gespeicherte Punkte, Bogenlängen, Fortschritt, Abweichung und Wertung bleiben unberührt:
// Die Funktion liefert eine Kopie nur zum Zeichnen. Die mitgegebenen Bogenlängen (`cum`)
// bleiben die der gespeicherten Linie, damit Fortschrittswerte weiter dazu passen.

export interface CornerLinePoint { latitude: number; longitude: number; breakBefore?: boolean }
export interface CornerPoint { latitude: number; longitude: number }

/** Winkelpunkte weiter weg von der Linie gehören nicht zu ihr (alte Daten, fremde Marken). */
export const CORNER_MAX_SNAP_M = 3;
/** Darunter lohnt sich keine Korrektur. */
export const CORNER_MIN_SNAP_M = 0.3;
/** Liegt der Lotfuss so nah an einem Linienpunkt, wird dieser versetzt statt ein Punkt eingefügt. */
export const CORNER_REPLACE_WITHIN_M = 1.5;

const M_PER_DEG = 111320;

export interface CornerDisplayLine<T> { points: T[]; cum: number[] | null; changed: number }

/**
 * @param points gespeicherte Linie (ein zusammenhängender Zug oder mit `breakBefore`-Lücken)
 * @param corners Winkelpunkte (Position der Winkelmarken)
 * @param cum optionale Bogenlängen zu `points`; werden für eingefügte Punkte ergänzt
 */
export function cornerDisplayLine<T extends CornerLinePoint>(
  points: readonly T[], corners: readonly CornerPoint[], cum?: readonly number[] | null,
): CornerDisplayLine<T> {
  const useCum = !!cum && cum.length === points.length;
  const out: T[] = points.slice();
  const outCum: number[] | null = useCum ? (cum as number[]).slice() : null;
  let changed = 0;
  if (out.length < 3 || corners.length === 0) return { points: out, cum: outCum, changed };

  const moved = new Set<T>();
  const kx = M_PER_DEG * Math.cos((out[0].latitude * Math.PI) / 180);
  const xy = (p: CornerPoint) => ({ x: p.longitude * kx, y: p.latitude * M_PER_DEG });
  // Ein Linienpunkt darf nur versetzt werden, wenn er zwischen zwei gezeichneten Stücken liegt.
  const interior = (i: number) => i > 0 && i < out.length - 1 && !out[i].breakBefore && !out[i + 1].breakBefore;

  for (const corner of corners) {
    if (!Number.isFinite(corner.latitude) || !Number.isFinite(corner.longitude)) continue;
    const c = xy(corner);
    let best: { i: number; t: number; d: number; len: number } | null = null;
    for (let i = 1; i < out.length; i++) {
      if (out[i].breakBefore) continue;
      const a = xy(out[i - 1]), b = xy(out[i]);
      const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2)) : 0;
      const d = Math.hypot(c.x - a.x - t * dx, c.y - a.y - t * dy);
      if (!best || d < best.d) best = { i, t, d, len: Math.sqrt(len2) };
    }
    if (!best || best.d > CORNER_MAX_SNAP_M || best.d < CORNER_MIN_SNAP_M) continue;
    const { i, t, len } = best;
    const toA = t * len, toB = (1 - t) * len;
    const target = toA <= toB
      ? (toA <= CORNER_REPLACE_WITHIN_M && interior(i - 1) ? i - 1 : toB <= CORNER_REPLACE_WITHIN_M && interior(i) ? i : -1)
      : (toB <= CORNER_REPLACE_WITHIN_M && interior(i) ? i : toA <= CORNER_REPLACE_WITHIN_M && interior(i - 1) ? i - 1 : -1);
    if (target >= 0) {
      if (moved.has(out[target])) continue;
      const next = { ...out[target], latitude: corner.latitude, longitude: corner.longitude };
      out[target] = next; moved.add(next); changed++;
    } else if (t > 0 && t < 1) {
      const inserted = { latitude: corner.latitude, longitude: corner.longitude } as T;
      out.splice(i, 0, inserted); moved.add(inserted); changed++;
      if (outCum) outCum.splice(i, 0, outCum[i - 1] + (outCum[i] - outCum[i - 1]) * t);
    }
  }
  return { points: out, cum: outCum, changed };
}

/** Winkelmarken, die als Eckpunkte in Frage kommen (kein Abriss, mit Position). */
export function cornerPointsFromMarkers(
  markers: readonly { type: string; angleKind?: string | null; lat: number | null; lng: number | null }[],
): CornerPoint[] {
  const corners: CornerPoint[] = [];
  for (const m of markers) {
    if (m.type !== 'winkel' || m.angleKind === 'abriss' || m.lat == null || m.lng == null) continue;
    corners.push({ latitude: m.lat, longitude: m.lng });
  }
  return corners;
}

/**
 * Wind im Verhältnis zur Laufrichtung beim Fährtenlegen (T-201).
 *
 * Reine Anzeigehilfe: Die meteorologische Windrichtung nennt, WOHER der Wind
 * kommt. Verglichen wird sie mit der Richtung der zuletzt gelegten Meter — nicht
 * mit dem Kompass des Handys, der in der Hosentasche nichts über die
 * Gehrichtung sagt. Nichts davon wird gespeichert oder fliesst in die
 * Aufzeichnung ein.
 */

export type WindRelation = 'headwind' | 'tailwind' | 'cross_left' | 'cross_right';

/** Unter dieser Windstärke (km/h) ist die Richtung meist unbeständig — keine Aussage. */
export const WIND_RELATION_MIN_SPEED_KMH = 5;
/** So viele Meter der zuletzt gelegten Linie bestimmen die Laufrichtung. */
export const WALK_BEARING_WINDOW_M = 8;

const COMPASS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'] as const;
const norm360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Himmelsrichtung (8 Sektoren) einer Gradzahl; null bei ungültigem Wert. */
export function compassLabel(deg: number | null | undefined): string | null {
  if (deg == null || !Number.isFinite(deg)) return null;
  return COMPASS[Math.round(norm360(deg) / 45) % 8];
}

/**
 * Lage des Windes zur Laufrichtung. `windFromDeg` = Richtung, aus der der Wind
 * kommt; `walkBearingDeg` = Richtung, in die gegangen wird (beide 0° = Nord,
 * im Uhrzeigersinn). Vier Sektoren zu je 90°.
 */
export function windRelation(windFromDeg: number | null | undefined, walkBearingDeg: number | null | undefined): WindRelation | null {
  if (windFromDeg == null || walkBearingDeg == null || !Number.isFinite(windFromDeg) || !Number.isFinite(walkBearingDeg)) return null;
  // Winkel der Windquelle relativ zur Laufrichtung: 0° = von vorn, 90° = von rechts.
  const rel = norm360(windFromDeg - walkBearingDeg);
  if (rel <= 45 || rel >= 315) return 'headwind';
  if (rel < 135) return 'cross_right';
  if (rel <= 225) return 'tailwind';
  return 'cross_left';
}

/**
 * Laufrichtung aus den zuletzt gelegten Metern der Linie (Grad, 0° = Nord).
 * Null, solange weniger als `windowM` Meter gelegt sind — dann gibt es noch
 * keine belastbare Richtung.
 */
export function walkBearingDeg(points: readonly { lat: number; lng: number }[], windowM: number = WALK_BEARING_WINDOW_M): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const mPerLat = 111320, mPerLng = 111320 * Math.cos((last.lat * Math.PI) / 180);
  for (let i = points.length - 2; i >= 0; i--) {
    const east = (last.lng - points[i].lng) * mPerLng, north = (last.lat - points[i].lat) * mPerLat;
    if (Math.hypot(east, north) >= windowM) return norm360((Math.atan2(east, north) * 180) / Math.PI);
  }
  return null;
}

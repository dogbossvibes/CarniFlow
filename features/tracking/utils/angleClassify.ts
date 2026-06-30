import { calculateHeading, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

// Schätzt aus den letzten Spur-Punkten den Winkel-Typ:
//  - Drehrichtung (Bearing-Differenz, +=rechts / −=links)
//  - Schärfe (Betrag der Richtungsänderung: deutlich >90° → Spitzwinkel)
// Gibt null zurück, wenn zu wenige Punkte oder (noch) kein klarer Knick —
// dann zeigt die UI keinen Vorschlag und der Nutzer wählt manuell.
// „Absatz" wird nie automatisch vorgeschlagen.
export function suggestAngleKind(points: Pick<LatLng, 'lat' | 'lng'>[]): AngleKind | null {
  if (points.length < 3) return null;
  const c = points[points.length - 1];
  const b = points[points.length - 2];
  const a = points[points.length - 3];

  const hIn = calculateHeading(a, b);   // einlaufende Richtung
  const hOut = calculateHeading(b, c);  // auslaufende Richtung
  let diff = hOut - hIn;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;

  const mag = Math.abs(diff);
  if (mag < 25) return null;            // kein nennenswerter Knick
  const dir: AngleKind = diff > 0 ? 'rechts' : 'links'; // im Uhrzeigersinn = rechts
  if (mag > 100) return dir === 'rechts' ? 'spitz_rechts' : 'spitz_links'; // spitzer als ~90°
  return dir;                           // rechtwinkliger Winkel nach links/rechts
}

export const ANGLE_LABEL: Record<AngleKind, string> = {
  links:        'Linkswinkel',
  rechts:       'Rechtswinkel',
  spitz_links:  'Spitzwinkel links',
  spitz_rechts: 'Spitzwinkel rechts',
  spitz:        'Spitzwinkel',          // Legacy (Altdaten ohne Richtung)
  absatz:       'Absatz',
  abriss:       'Abriss',
};

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
  if (mag > 110) return 'spitz';        // deutlich spitzer als rechtwinklig
  return diff > 0 ? 'rechts' : 'links'; // im Uhrzeigersinn = Rechtswinkel
}

export const ANGLE_LABEL: Record<AngleKind, string> = {
  links:  'Linkswinkel',
  rechts: 'Rechtswinkel',
  spitz:  'Spitzwinkel',
  absatz: 'Absatz',
};

import { calculateHeading, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

// Schätzt aus den letzten Spur-Punkten den Winkel-Typ:
//  - Drehrichtung (Bearing-Differenz, +=rechts / −=links)
//  - Schärfe (Betrag der Richtungsänderung: ab 120° → Spitzwinkel)
// Gibt null zurück, wenn zu wenige Punkte oder (noch) kein klarer Knick —
// dann zeigt die UI keinen Vorschlag und der Nutzer wählt manuell.
// „Absatz" wird nie automatisch vorgeschlagen.
/** Kursschwenk, ab dem ein Spitzwinkel vorgeschlagen wird (= Innenwinkel ≤ 60°). */
export const SPITZ_MIN_TURN_DEG = 120;

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
  // T-219: dieselbe Grenze wie die GPS-Erkennung (autoCornerDetection): spitz erst ab
  // Innenwinkel ≤ 60° (Kursschwenk ≥ 120°). Vorher reichte ein Schwenk über 100°, dann
  // konnte ein verrauschter 90°-Winkel als Spitzwinkel vorgeschlagen werden.
  if (mag >= SPITZ_MIN_TURN_DEG) return dir === 'rechts' ? 'spitz_rechts' : 'spitz_links';
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
  gw:           'Geschlossener Winkel',
  ow:           'Offener Winkel',
  bw:           'Bodenwinkel',
};

// Kompaktes Karten-Badge je Winkeltyp (geometrisch, klar unterscheidbar).
// Produktentscheidung Sandra, 2026-11-09 (GitHub-Issue #33, docs/agent/DECISIONS.md):
// normale Winkel tragen die gewohnte Fährtenschreibweise «90 L» / «90 R»,
// Spitzwinkel «SL» / «SR». Das ist ein reines Anzeige-Kürzel — die
// Winkelerkennung und die gespeicherte Geometrie bleiben unverändert.
export const ANGLE_SHORT: Record<AngleKind, string> = {
  links:        '90 L',
  rechts:       '90 R',
  spitz_links:  'SL',
  spitz_rechts: 'SR',
  spitz:        'S',
  absatz:       'A',
  abriss:       '',
  gw:           'GW',
  ow:           'OW',
  bw:           'BW',
};

// Karten-Darstellungsart je Winkeltyp (Dispatch für den Renderer). Abriss bleibt
// ein eigener Zustand; GW=Rechteck, OW=eigenes Badge, BW=Kreis; sonst normaler
// Winkel. Reine Funktion → testbar.
export type AngleMarkerKind = 'abriss' | 'gw' | 'ow' | 'bw' | 'angle';
export function angleMarkerKind(k: AngleKind | null | undefined): AngleMarkerKind {
  switch (k) {
    case 'abriss': return 'abriss';
    case 'gw':     return 'gw';
    case 'ow':     return 'ow';
    case 'bw':     return 'bw';
    default:       return 'angle';
  }
}

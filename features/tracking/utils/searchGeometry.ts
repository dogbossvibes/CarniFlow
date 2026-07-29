// ──────────────────────────────────────────────────────────────────────────
// Absuche-Geometrie für den 5/10-m-Hundeführerabstand — REINE, testbare Logik.
//
// Das Smartphone ist beim Hundeführer. Der Hund läuft `searchHandlerDistanceM`
// (5 oder 10 m) VORAUS. Daraus wird ENTLANG der gelegten Fährtenlinie (Bogenlänge)
// eine virtuelle Hundeposition abgeleitet — NICHT durch Verschieben der GPS-
// Koordinate. Es ist eine gewählte Annahme, keine gemessene Hundeposition.
//
// Keine zweite Geometrie-Engine: nutzt kumulative Bogenlängen (wie buildArc) und
// lineare Interpolation. Reine Funktionen, kein React/Expo.
// ──────────────────────────────────────────────────────────────────────────

export type SearchHandlerDistanceM = 5 | 10;

// Fallback, wenn keine Auswahl / keine gespeicherte Session vorliegt (Phase 3/4).
export const DEFAULT_HANDLER_DISTANCE_M: SearchHandlerDistanceM = 5;

export function isHandlerDistance(v: unknown): v is SearchHandlerDistanceM {
  return v === 5 || v === 10;
}

// Koordinatenform der gelegten Fährte (deckt sich mit useSearchRecorder.LatLng).
export interface LL { latitude: number; longitude: number }

// Virtueller Hundefortschritt (Bogenlänge). Handler-Fortschritt + Abstand,
// geklemmt auf die Track-Länge (nie über das Ende hinaus — Phase 14).
export function estimateDogProgressM(handlerProgressM: number, handlerDistanceM: number, trackTotalM: number): number {
  const base = Math.max(0, handlerProgressM) + handlerDistanceM;
  return Math.min(Math.max(0, trackTotalM), base);
}

// Vorwärtsgerichtete Bogenlängendistanz vom (virtuellen) Hund zu einem Ereignis.
// null = Ereignis liegt HINTER dem Hund → keine Ansage. Gemeinsam für Voice + Haptik
// (keine doppelte Businesslogik — Phase 12).
export function forwardDistanceFromDog(eventArcM: number, dogProgressM: number): number | null {
  const d = eventArcM - dogProgressM;
  return d >= 0 ? d : null;
}

// Koordinate auf der Polyline bei Bogenlänge d (0..total), linear interpoliert.
// clamp 0..total; null bei leerer Linie. Folgt der Fährte um Winkel herum, weil
// entlang der kumulierten Segmente gelaufen wird (kein Luftlinien-Versatz).
export function pointAtDistance(points: LL[], cum: number[], d: number): LL | null {
  const n = points.length;
  if (n === 0) return null;
  if (n === 1) return points[0];
  const total = cum.length ? cum[cum.length - 1] : 0;
  const dd = Math.max(0, Math.min(total, d));
  for (let i = 1; i < n; i++) {
    if (dd <= cum[i]) {
      const segLen = cum[i] - cum[i - 1];
      const t = segLen > 0 ? (dd - cum[i - 1]) / segLen : 0;
      return {
        latitude:  points[i - 1].latitude  + (points[i].latitude  - points[i - 1].latitude)  * t,
        longitude: points[i - 1].longitude + (points[i].longitude - points[i - 1].longitude) * t,
      };
    }
  }
  return points[n - 1];
}

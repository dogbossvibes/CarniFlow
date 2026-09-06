// ──────────────────────────────────────────────────────────────────────────
// Absuche-Geometrie für den 5/10-m-Hundeführerabstand — REINE, testbare Logik.
//
// Das Smartphone ist beim Hundeführer. Der Hund läuft `searchHandlerDistanceM`
// (1, 5 oder 10 m) VORAUS. Daraus wird ENTLANG der gelegten Fährtenlinie (Bogenlänge)
// eine virtuelle Hundeposition abgeleitet — NICHT durch Verschieben der GPS-
// Koordinate. Es ist eine gewählte Annahme, keine gemessene Hundeposition.
//
// Keine zweite Geometrie-Engine: nutzt kumulative Bogenlängen (wie buildArc) und
// lineare Interpolation. Reine Funktionen, kein React/Expo.
// ──────────────────────────────────────────────────────────────────────────

export type SearchHandlerDistanceM = 1 | 5 | 10;

// EINZIGE Source of Truth der erlaubten Hundeführerabstände (1/5/10 m). UI,
// Sanitizer, Persistenz-Recovery und Tests leiten sich hieraus ab — keine
// verstreuten Magic Numbers. 1 m ist vollwertig, kein Spezialfall.
export const HANDLER_DISTANCES_M: readonly SearchHandlerDistanceM[] = [1, 5, 10];

// Fallback, wenn keine Auswahl / keine gespeicherte Session vorliegt (Phase 3/4).
// Default bewusst UNVERÄNDERT bei 5 m (bestehende gespeicherte 5/10-m-Werte gültig).
export const DEFAULT_HANDLER_DISTANCE_M: SearchHandlerDistanceM = 5;

export function isHandlerDistance(v: unknown): v is SearchHandlerDistanceM {
  return v === 1 || v === 5 || v === 10;
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

// Projiziert p auf eine Polyline, aber NUR innerhalb eines Fortschritts-Fensters
// [fromM - backM, fromM + lookaheadM]. So zählt die Abweichung gegen den
// ERWARTETEN Abschnitt — nicht gegen irgendeinen geometrisch nahen Teil der
// Linie. Liefert die senkrechte Abweichung (m) und die projizierte Bogenlänge
// atM (m). Gemeinsam genutzt von useSearchRecorder (Fenster relativ zum
// laufenden Cursor) UND searchStartAcquisition (festes Fenster [0, startWindowM]
// vor dem Start-Lock) — eine Projektionsfunktion, keine zweite Geometrie-Engine.
export function projectForward(
  p: LL, line: LL[], cum: number[], fromM: number, lookaheadM: number, backM: number,
): { devM: number; atM: number } {
  if (line.length < 2) {
    if (!line.length) return { devM: Infinity, atM: fromM };
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(line[0].latitude - p.latitude);
    const dLng = toRad(line[0].longitude - p.longitude);
    const la1 = toRad(p.latitude), la2 = toRad(line[0].latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return { devM: 2 * R * Math.asin(Math.min(1, Math.sqrt(h))), atM: fromM };
  }
  const total = cum[cum.length - 1];
  const lo = Math.max(0, fromM - backM);
  const hi = Math.min(total, fromM + lookaheadM);
  const mPerLat = 111320;
  const mPerLng = 111320 * Math.cos((p.latitude * Math.PI) / 180);
  const X = (q: LL) => ({ x: (q.longitude - p.longitude) * mPerLng, y: (q.latitude - p.latitude) * mPerLat });
  let best = Infinity, bestAt = fromM;
  for (let i = 1; i < line.length; i++) {
    const segLo = cum[i - 1], segHi = cum[i];
    if (segHi < lo || segLo > hi) continue;          // Segment ausserhalb des Fensters
    const a = X(line[i - 1]), b = X(line[i]);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(a.x * dx + a.y * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    const d = Math.hypot(cx, cy);
    if (d < best) { best = d; bestAt = segLo + t * (segHi - segLo); }
  }
  if (!Number.isFinite(best)) return { devM: Infinity, atM: fromM };
  return { devM: best, atM: bestAt };
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

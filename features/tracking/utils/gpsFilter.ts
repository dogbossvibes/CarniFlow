// GPS-Filter & Geometrie für das Fährtenmodul. Baut auf den vorhandenen
// Helfern in lib/trackGuidance.ts auf (distanceM, deviationFromTrack) und
// ergänzt Annahme-/Glättungs-/Qualitäts-Logik gegen Zickzack-Aufzeichnung.
import { distanceM, deviationFromTrack, type LatLng } from '@/lib/trackGuidance';

export type { LatLng };

export interface GpsSample extends LatLng {
  accuracy?: number | null;   // Meter
  t?:        number;          // Zeitstempel in ms (Date.now())
}

export type GpsQuality = 'sehr-gut' | 'gut' | 'mittel' | 'schwach';

// Schwellen
// 40 m trennt echtes GPS (im Freien meist 5–15 m, unter Bäumen bis ~35 m) sauber
// von groben Funkmast-Fixes (Apple-Coarse liefert i. d. R. 65 m / 165 m / 1000 m).
// 25 m war für Fährten auf Feld/Wald zu streng → es wurden alle Punkte verworfen.
export const MAX_ACCURACY_M   = 40;   // schlechter → Punkt verwerfen (Rest glättet die Karte)
export const MIN_STEP_M        = 1.0;  // erst ab dieser Distanz neuen Punkt akzeptieren
export const MAX_SPEED_MPS     = 12;   // ~43 km/h: schneller = unrealistischer Sprung

export const calculateDistance = distanceM;
export const calculateDeviationFromTrack = deviationFromTrack;

// Entscheidet, ob ein neuer Fix als Trackpunkt akzeptiert wird.
export function shouldAcceptTrackPoint(last: GpsSample | null, next: GpsSample): boolean {
  // 1) Ersten Punkt IMMER annehmen — sonst bleibt der Track leer, wenn der erste
  //    Fix ungenau ist (typisch direkt nach App-Start). Ohne Startanker zeichnet
  //    die Karte keine Linie ("bleibt grad").
  if (!last) return true;

  // 2) Danach: zu ungenau → verwerfen.
  if (next.accuracy != null && next.accuracy > MAX_ACCURACY_M) return false;

  const dist = distanceM(last, next);
  // 3) Mindestabstand (filtert Stand-Jitter).
  if (dist < MIN_STEP_M) return false;

  // 3) Speed-Sanity: großer Sprung in kurzer Zeit → verwerfen.
  if (last.t != null && next.t != null) {
    const dtSec = (next.t - last.t) / 1000;
    if (dtSec > 0 && dist / dtSec > MAX_SPEED_MPS) return false;
  }
  return true;
}

// Leichte Glättung (gleitender Mittelwert über ein kleines Fenster). Lässt
// Endpunkte unangetastet, mildert nur Zwischen-Zacken.
export function smoothTrackPoints(points: LatLng[], window = 2): LatLng[] {
  if (points.length <= 2) return [...points];
  const out: LatLng[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) { out.push(points[i]); continue; }
    const lo = Math.max(0, i - window), hi = Math.min(points.length - 1, i + window);
    let lat = 0, lng = 0, n = 0;
    for (let j = lo; j <= hi; j++) { lat += points[j].lat; lng += points[j].lng; n++; }
    out.push({ lat: lat / n, lng: lng / n });
  }
  return out;
}

// Entfernt grobe Ausreißer (Punkt weicht stark von Nachbarn ab) — inkl.
// isolierter Anfangs-/Endpunkte (ein „Ausbruch", der nicht gelaufen wurde).
export function removeGpsJitter(points: LatLng[], maxJumpM = 25): LatLng[] {
  const n = points.length;
  if (n < 3) return [...points];

  // Isolierten Anfangs-/Endpunkt kappen: weit vom Nachbarn weg, während die
  // dahinter liegenden Punkte konsistent sind (so bleibt ein echter Endpunkt erhalten).
  let lo = 0, hi = n - 1;
  if (distanceM(points[0], points[1]) > maxJumpM && distanceM(points[1], points[2]) <= maxJumpM) lo = 1;
  if (distanceM(points[n - 1], points[n - 2]) > maxJumpM && distanceM(points[n - 2], points[n - 3]) <= maxJumpM) hi = n - 2;
  const src = lo === 0 && hi === n - 1 ? points : points.slice(lo, hi + 1);
  if (src.length < 3) return [...src];

  // Zwischen-Spitzen (hin und zurück) entfernen.
  const out: LatLng[] = [src[0]];
  for (let i = 1; i < src.length - 1; i++) {
    const prev = out[out.length - 1];
    const next = src[i + 1];
    const d1 = distanceM(prev, src[i]);
    const d2 = distanceM(src[i], next);
    const dDirect = distanceM(prev, next);
    // Spitze: Umweg über den Punkt viel länger als Direktweg → Ausreißer.
    if (d1 > maxJumpM && d2 > maxJumpM && d1 + d2 > dDirect * 3) continue;
    out.push(src[i]);
  }
  out.push(src[src.length - 1]);
  return out;
}

// Bearing (0–360°) von a nach b.
export function calculateHeading(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat), φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function bearingToCardinal(deg: number): string {
  return CARDINALS[Math.round(((deg % 360) / 45)) % 8];
}

export function getGpsQuality(accuracy: number | null | undefined): GpsQuality {
  if (accuracy == null) return 'schwach';
  if (accuracy <= 3)  return 'sehr-gut';
  if (accuracy <= 7)  return 'gut';
  if (accuracy <= 15) return 'mittel';
  return 'schwach';
}

export function calculateAverageAccuracy(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (!nums.length) return null;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

export const GPS_QUALITY_LABEL: Record<GpsQuality, string> = {
  'sehr-gut': 'Sehr gut',
  'gut':      'Gut',
  'mittel':   'Mittel',
  'schwach':  'Schwach',
};

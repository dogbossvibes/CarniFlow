// ──────────────────────────────────────────────────────────────────────────
// Kanonische Eventposition entlang der Search-Referenzlinie — REINE Logik.
//
// Root Cause (Audit „Legen → Absuche → Audio", P0-1): Auto-Winkel speichern
// `distance_from_start` auf dem DETEKTOR-Pfad (eigener Ursprung, eigene EMA,
// eigenes Distanz-Gate), manuelle Marker/Gegenstände auf `store.distanceMeters`
// (Linie). Die Absuche misst dagegen ausschliesslich auf der Bogenlänge der
// gelegten Linie (`laidPoints` → buildArc). Zwei Maßstäbe in derselben Spalte.
//
// Hier gilt nur EIN Maßstab: die Bogenlänge derselben `laidPoints`, gegen die
// useSearchRecorder projiziert. Die Eventposition wird aus der Marker-KOORDINATE
// per Projektion auf diese Linie abgeleitet (projectForward mit Vollfenster —
// dieselbe Projektionsfunktion wie Cursor/Start-Acquisition, keine zweite
// Geometrie). `distance_from_start` ist NICHT mehr Search-Authority; es dient
// nur noch als expliziter Fallback, wenn eine Projektion technisch unmöglich
// ist (keine Koordinate, oder Linie mit < 2 Punkten).
//
// Bewusst NICHT hier: Vertrauens-/Confidence-Logik, Klassifikation, Löschen.
// Ein falsch erkannter Winkel bleibt ein falscher Winkel — er liegt nur an der
// richtigen Stelle der Referenz.
//
// Bekannte Grenze (dokumentiert, keine Schwelle): bei selbstkreuzenden Linien
// (Self-Crossing) nimmt die Vollfenster-Projektion den geometrisch NÄCHSTEN
// Abschnitt — ein Marker nahe einer Kreuzung kann dann dem falschen Durchgang
// zugeordnet werden. `offLineM` wird nur gemessen/geloggt, nicht bewertet.
// ──────────────────────────────────────────────────────────────────────────
import { buildArc, projectForward, type LL } from '@/features/tracking/utils/searchGeometry';

export type CanonicalArcSource =
  | 'projected'        // aus lat/lng auf laidPoints projiziert (Normalfall)
  | 'stored_fallback'  // Projektion unmöglich → gespeicherter distance_from_start
  | 'unavailable';     // weder Koordinate noch gespeicherte Distanz → kein Event-Ort

export interface CanonicalArc {
  /** Bogenlänge (m) entlang laidPoints; null = nicht bestimmbar. */
  arcM: number | null;
  /** Seitlicher Abstand Marker → Referenzlinie (m); nur bei 'projected'. Reine Diagnose. */
  offLineM: number | null;
  source: CanonicalArcSource;
}

/** Minimale Markerform — deckt MarkerSample (Store) und Legacy-Daten ab. */
export interface CanonicalArcMarker {
  id: string;
  lat?: number | null;
  lng?: number | null;
  distance_from_start?: number | null;
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Kanonische Position EINES Markers. `cum` muss aus `buildArc(line)` stammen
 * (derselbe Maßstab wie in useSearchRecorder).
 */
export function canonicalArcM(
  marker: CanonicalArcMarker,
  line: readonly LL[],
  cum: readonly number[],
): CanonicalArc {
  const total = cum.length ? cum[cum.length - 1] : 0;
  if (isFiniteNum(marker.lat) && isFiniteNum(marker.lng) && line.length >= 2) {
    // Vollfenster [0, total]: projectForward betrachtet damit JEDES Segment und
    // liefert die geometrisch nächste Stelle der Linie (wie beim Cursor, nur
    // ohne Fortschrittsfenster — ein gelegter Marker hat keinen „Cursor").
    const proj = projectForward(
      { latitude: marker.lat, longitude: marker.lng },
      line as LL[], cum as number[], 0, total, 0,
    );
    if (Number.isFinite(proj.devM) && Number.isFinite(proj.atM)) {
      return { arcM: Math.max(0, Math.min(total, proj.atM)), offLineM: proj.devM, source: 'projected' };
    }
  }
  if (isFiniteNum(marker.distance_from_start)) {
    return { arcM: marker.distance_from_start, offLineM: null, source: 'stored_fallback' };
  }
  return { arcM: null, offLineM: null, source: 'unavailable' };
}

/**
 * Kanonische Positionen aller Marker eines Search-Snapshots, per Marker-ID.
 * Wird EINMAL beim Snapshot-Bau (run.tsx buildSnap) berechnet; die Bogenlänge
 * wird genau einmal gebaut.
 */
export function buildSearchEventArcs(
  markers: readonly CanonicalArcMarker[],
  laidPoints: readonly LL[],
): Record<string, CanonicalArc> {
  const { cum } = buildArc(laidPoints as LL[]);
  const out: Record<string, CanonicalArc> = {};
  for (const m of markers) out[m.id] = canonicalArcM(m, laidPoints, cum);
  return out;
}

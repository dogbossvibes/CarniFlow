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
// per Projektion auf diese Linie abgeleitet. `distance_from_start` ist NICHT
// Search-Authority; es dient nur noch als expliziter Fallback, wenn eine
// Projektion technisch unmöglich ist (keine Koordinate, oder Linie < 2 Punkte).
//
// P0-Fix „Self-Crossing / Parallel-Leg" (Feldtest qa-0ec8c4ca, Fixture
// spitz-qa-0ec8c4ca.json): die reine Nächstes-Segment-Projektion ordnete den
// späten Spitzwinkel (Linien-Scheitel bei 18.20 m, offLine 0.92 m) dem
// räumlich nahen FRÜHEN Schenkel zu (6.29 m, offLine 0.64 m) — bei
// zurücklaufenden Schenkeln liegen Linienanfang und -ende Dezimeter
// nebeneinander. Deshalb werden jetzt ALLE Segment-Projektionen betrachtet
// (projectOntoSegments) und der Kandidat über die gemeinsame ZEITACHSE von
// Marker und Linie gewählt: jeder Linienpunkt trägt den Zeitstempel seines
// GPS-Fixes (TrackPointSample.t), jeder Marker den Zeitpunkt seines Commits
// (MarkerSample.t; Auto-Winkel: Bestätigung kurz NACH dem Scheitel, manuell:
// Tastendruck an Ort und Stelle). Die Markerkoordinate wurde am/kurz vor
// marker.t an der Position des Hundeführers erfasst — welcher Durchgang an
// dieser Stelle gemeint ist, sagt also die Zeit, nicht der seitliche Abstand.
// Gewählt wird der lokale Abstands-Minimum-Kandidat, dessen (entlang der
// Linie interpolierte) Zeit marker.t am nächsten liegt. Keine Meter- oder
// Sekunden-Schwelle. Fehlt Zeitinformation (Legacy-Daten, Tests), bleibt
// exakt das bisherige Nächstes-Segment-Verhalten.
//
// `offLineM` bleibt reine Qualitäts-/Diagnoseinformation. Bewusst NICHT hier:
// Vertrauens-/Confidence-Logik, Klassifikation, Löschen. Ein falsch erkannter
// Winkel bleibt ein falscher Winkel — er liegt nur an der richtigen Stelle.
// ──────────────────────────────────────────────────────────────────────────
import { buildArc, projectOntoSegments, type LL, type SegmentProjection } from '@/features/tracking/utils/searchGeometry';

export type CanonicalArcSource =
  | 'projected'        // aus lat/lng auf laidPoints projiziert (Normalfall)
  | 'stored_fallback'  // Projektion unmöglich → gespeicherter distance_from_start
  | 'unavailable';     // weder Koordinate noch gespeicherte Distanz → kein Event-Ort

/** Wie der Kandidat unter mehreren Projektionen gewählt wurde. */
export type CanonicalArcSelection =
  | 'time'      // gemeinsame Zeitachse Marker ↔ Linie (Normalfall im Produkt)
  | 'nearest';  // keine Zeitinformation → geometrisch nächstes Segment (Legacy-Verhalten)

export interface CanonicalArc {
  /** Bogenlänge (m) entlang laidPoints; null = nicht bestimmbar. */
  arcM: number | null;
  /** Seitlicher Abstand Marker → Referenzlinie (m); nur bei 'projected'. Reine Diagnose. */
  offLineM: number | null;
  source: CanonicalArcSource;
  /** Segment line[i]→line[i+1], auf das projiziert wurde; nur bei 'projected'. */
  segmentIndex: number | null;
  /** Auswahlverfahren; nur bei 'projected'. */
  selection: CanonicalArcSelection | null;
}

/** Minimale Markerform — deckt MarkerSample (Store) und Legacy-Daten ab. */
export interface CanonicalArcMarker {
  id: string;
  lat?: number | null;
  lng?: number | null;
  distance_from_start?: number | null;
  /** Commit-Zeitpunkt (ms, Date.now()); MarkerSample.t. Optional → Legacy. */
  t?: number | null;
}

/** Linienpunkt mit optionalem Fix-Zeitstempel (ms); TrackPointSample.t. */
export interface CanonicalArcLinePoint extends LL { t?: number | null }

/** Ein Projektionskandidat (lokales Abstandsminimum) — für Tests/Diagnose exportiert. */
export interface ArcCandidate extends SegmentProjection {
  /** Entlang des Segments interpolierte Zeit (ms); null ohne Linien-Zeiten. */
  tMs: number | null;
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Zeitachse der Linie: nur verwendbar, wenn JEDER Punkt einen endlichen,
 * nicht fallenden Zeitstempel trägt (sonst null → Nearest-Fallback).
 */
export function lineTimesMs(line: readonly CanonicalArcLinePoint[]): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < line.length; i++) {
    const t = line[i].t;
    if (!isFiniteNum(t) || (i > 0 && t < out[i - 1])) return null;
    out.push(t);
  }
  return out.length === line.length && out.length >= 2 ? out : null;
}

/**
 * Alle lokalen Abstandsminima der Segment-Projektionen (Plateaus an
 * gemeinsamen Scheiteln zusammengefasst). Enthält immer das globale Minimum.
 */
export function arcCandidates(
  p: LL, line: readonly LL[], cum: readonly number[], times: readonly number[] | null,
): ArcCandidate[] {
  const all = projectOntoSegments(p, line, cum);
  const out: ArcCandidate[] = [];
  for (let k = 0; k < all.length; k++) {
    const c = all[k];
    const prev = k > 0 ? all[k - 1].offLineM : Infinity;
    const next = k < all.length - 1 ? all[k + 1].offLineM : Infinity;
    if (!(c.offLineM <= prev && c.offLineM <= next)) continue;
    // Plateau: identischer Punkt (gemeinsamer Scheitel zweier Segmente) → einmal.
    const last = out[out.length - 1];
    if (last && last.arcM === c.arcM && last.offLineM === c.offLineM) continue;
    const tMs = times ? times[c.segmentIndex] + c.frac * (times[c.segmentIndex + 1] - times[c.segmentIndex]) : null;
    out.push({ ...c, tMs });
  }
  return out;
}

/** Nearest-Auswahl: erstes Minimum von offLineM (identisch zu projectForward). */
function pickNearest(cands: readonly ArcCandidate[]): ArcCandidate | null {
  let best: ArcCandidate | null = null;
  for (const c of cands) if (!best || c.offLineM < best.offLineM) best = c;
  return best;
}

/**
 * Zeit-Auswahl: Kandidat mit minimalem |t_c − marker.t|. Gleichstand → kleinerer
 * offLineM. Voraussetzung: marker.t endlich UND Linien-Zeiten vorhanden.
 */
function pickByTime(cands: readonly ArcCandidate[], markerT: number): ArcCandidate | null {
  let best: ArcCandidate | null = null, bestDt = Infinity;
  for (const c of cands) {
    if (c.tMs == null) continue;
    const dt = Math.abs(c.tMs - markerT);
    if (dt < bestDt || (dt === bestDt && best && c.offLineM < best.offLineM)) { best = c; bestDt = dt; }
  }
  return best;
}

/**
 * Kanonische Position EINES Markers. `cum` muss aus `buildArc(line)` stammen
 * (derselbe Maßstab wie in useSearchRecorder). `line` darf Zeitstempel tragen
 * (TrackPointSample.t) — dann entscheidet die gemeinsame Zeitachse.
 */
export function canonicalArcM(
  marker: CanonicalArcMarker,
  line: readonly CanonicalArcLinePoint[],
  cum: readonly number[],
): CanonicalArc {
  const total = cum.length ? cum[cum.length - 1] : 0;
  if (isFiniteNum(marker.lat) && isFiniteNum(marker.lng) && line.length >= 2) {
    const times = lineTimesMs(line);
    const cands = arcCandidates({ latitude: marker.lat, longitude: marker.lng }, line, cum, times);
    const byTime = times && isFiniteNum(marker.t) ? pickByTime(cands, marker.t) : null;
    const chosen = byTime ?? pickNearest(cands);
    if (chosen && Number.isFinite(chosen.offLineM) && Number.isFinite(chosen.arcM)) {
      return {
        arcM: Math.max(0, Math.min(total, chosen.arcM)), offLineM: chosen.offLineM, source: 'projected',
        segmentIndex: chosen.segmentIndex, selection: byTime ? 'time' : 'nearest',
      };
    }
  }
  if (isFiniteNum(marker.distance_from_start)) {
    return { arcM: marker.distance_from_start, offLineM: null, source: 'stored_fallback', segmentIndex: null, selection: null };
  }
  return { arcM: null, offLineM: null, source: 'unavailable', segmentIndex: null, selection: null };
}

/**
 * Kanonische Positionen aller Marker eines Search-Snapshots, per Marker-ID.
 * Wird EINMAL beim Snapshot-Bau (run.tsx buildSnap) berechnet; die Bogenlänge
 * wird genau einmal gebaut. `laidPoints` mit `t` → Zeit-Auswahl, sonst Nearest.
 */
export function buildSearchEventArcs(
  markers: readonly CanonicalArcMarker[],
  laidPoints: readonly CanonicalArcLinePoint[],
): Record<string, CanonicalArc> {
  const { cum } = buildArc(laidPoints as LL[]);
  const out: Record<string, CanonicalArc> = {};
  for (const m of markers) out[m.id] = canonicalArcM(m, laidPoints, cum);
  return out;
}

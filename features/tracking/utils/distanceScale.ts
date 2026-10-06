// ──────────────────────────────────────────────────────────────────────────
// Fährten-Maßstab (Distanzmarkierungen) — REINE, testbare Darstellungslogik.
//
// Ticks liegen bei 1, 2, 3 … m Bogenlänge ENTLANG der Referenzfährte — derselben
// `laidPoints`-Linie und derselben Bogenlänge (buildArc), gegen die
// useSearchRecorder den Cursor projiziert und canonicalArc.ts die Ereignisse
// verortet. Keine Luftlinie, keine Rohspur des Hundes, keine zweite
// Distanzlogik. Die Interpolation entspricht exakt pointAtDistance().
//
// Nur Darstellung: kein React/Expo, kein Tracking-Zustand, keine Persistenz.
// ──────────────────────────────────────────────────────────────────────────
import { buildArc, type LL } from '@/features/tracking/utils/searchGeometry';

export type TickClass = 'one' | 'five' | 'ten';
export type DistanceScaleLevel = 'fine' | 'medium' | 'coarse' | 'off';

/** Einheitsvektor quer zur Fährte in der lokalen Ebene (Ost/Nord, Meter). */
export interface TickNormal { east: number; north: number }

export interface DistanceTick {
  /** Bogenlänge ab Start (ganze Meter, ≥ 1). */
  m: number;
  cls: TickClass;
  at: LL;
  /** null = Tangente nicht belastbar (scharfe Ecke, entartetes Segment) → kein Tick-Strich. */
  normal: TickNormal | null;
}

export interface DistanceTickSet { totalM: number; ticks: DistanceTick[] }

export const DISTANCE_SCALE = {
  /** Halbe Fensterbreite (m) entlang der Fährte für die lokale Tangente. */
  tangentHalfWindowM: 1,
  /**
   * Sehne / Weglänge im Tangentenfenster. Darunter knickt die Fährte innerhalb
   * von ±1 m so stark (Spitzwinkel), dass keine sinnvolle Querrichtung existiert
   * → Tick weglassen statt falscher Geometrie. 90° ergibt √2/2 ≈ 0.71 (bleibt).
   */
  minChordRatio: 0.6,
  /** Mindestabstand (pt) zwischen benachbarten sichtbaren Ticks einer Stufe. */
  minTickSpacingPt: { fine: 10, medium: 12, coarse: 12 },
  /** Mindestabstand (pt) zwischen zwei Zahlen-Labels. */
  minLabelSpacingPt: 34,
  labelStepsM: [10, 20, 50, 100, 200, 500] as const,
  /** Halbe Strichlänge (pt) je Tick-Klasse — bildschirmkonstant. */
  halfLengthPt: { one: 4, five: 6, ten: 8 } as const,
  /** Abstand (pt) des Labels von der Linie, quer zur Fährte. */
  labelOffsetPt: 16,
  /** Keine Zahl näher als dieser Abstand (pt) an Winkeln/Gegenständen — die bleiben sichtbar. */
  labelAvoidRadiusPt: 24,
  /** Obergrenzen gegen Render-Last (lange Fährten, weiter Zoom). */
  maxTickSegments: 180,
  maxLabels: 30,
} as const;

/** Meter je Breitengrad — identisch zur Haversine-Kugel in searchGeometry (R = 6 371 000 m). */
const M_PER_DEG_LAT = (6371000 * Math.PI) / 180;

const finite = (p: LL | null | undefined): p is LL =>
  !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

export function tickClass(m: number): TickClass {
  if (m % 10 === 0) return 'ten';
  if (m % 5 === 0) return 'five';
  return 'one';
}

/**
 * Punkte bei aufsteigenden Bogenlängen `ds` — gleiche Formel wie pointAtDistance
 * (Klemmung 0..total, lineare Interpolation im Segment), aber mit einem
 * mitlaufenden Segmentzeiger statt O(n) je Abfrage (lange Fährten).
 */
export function pointsAtSortedDistances(points: readonly LL[], cum: readonly number[], ds: readonly number[]): LL[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return ds.map(() => points[0]);
  const total = cum.length ? cum[cum.length - 1] : 0;
  const out: LL[] = [];
  let i = 1;
  for (const d of ds) {
    const dd = Math.max(0, Math.min(total, d));
    while (i < n - 1 && dd > cum[i]) i++;
    const segLen = cum[i] - cum[i - 1];
    const t = segLen > 0 ? Math.max(0, Math.min(1, (dd - cum[i - 1]) / segLen)) : 0;
    out.push({
      latitude:  points[i - 1].latitude  + (points[i].latitude  - points[i - 1].latitude)  * t,
      longitude: points[i - 1].longitude + (points[i].longitude - points[i - 1].longitude) * t,
    });
  }
  return out;
}

function toLocal(origin: LL, p: LL): { x: number; y: number } {
  const mPerLng = M_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180);
  return { x: (p.longitude - origin.longitude) * mPerLng, y: (p.latitude - origin.latitude) * M_PER_DEG_LAT };
}

/** Punkt `p` um (east, north) Meter versetzt. */
export function offsetLL(p: LL, eastM: number, northM: number): LL {
  const mPerLng = M_PER_DEG_LAT * Math.cos((p.latitude * Math.PI) / 180);
  return { latitude: p.latitude + northM / M_PER_DEG_LAT, longitude: p.longitude + (mPerLng > 0 ? eastM / mPerLng : 0) };
}

/**
 * Alle Meter-Ticks entlang der Referenzlinie (einmal je Referenz berechnen und
 * memoisieren — unabhängig von Zoom und GPS-Fix). Ungültige Geometrie (leer,
 * < 2 Punkte, nicht-endliche Koordinaten, Länge < 1 m) → keine Ticks.
 */
export function buildDistanceTicks(line: readonly LL[]): DistanceTickSet {
  if (line.length < 2 || !line.every(finite)) return { totalM: 0, ticks: [] };
  const { cum, total } = buildArc(line as LL[]);
  if (!Number.isFinite(total) || total < 1) return { totalM: Number.isFinite(total) ? total : 0, ticks: [] };
  const count = Math.floor(total + 1e-9);
  const w = DISTANCE_SCALE.tangentHalfWindowM;
  // Je Tick drei Abfragen (s − w, s, s + w); alle drei Folgen sind aufsteigend.
  const ms = Array.from({ length: count }, (_, k) => k + 1);
  const lo = ms.map(m => Math.max(0, m - w));
  const hi = ms.map(m => Math.min(total, m + w));
  const at = pointsAtSortedDistances(line, cum, ms);
  const pa = pointsAtSortedDistances(line, cum, lo);
  const pb = pointsAtSortedDistances(line, cum, hi);
  const ticks: DistanceTick[] = ms.map((m, k) => {
    const path = hi[k] - lo[k];
    let normal: TickNormal | null = null;
    if (path > 0.5) {
      const b = toLocal(pa[k], pb[k]);
      const chord = Math.hypot(b.x, b.y);
      if (chord > 0 && chord / path >= DISTANCE_SCALE.minChordRatio) {
        normal = { east: -b.y / chord, north: b.x / chord };   // Tangente um +90° gedreht
      }
    }
    return { m, cls: tickClass(m), at: at[k], normal };
  });
  return { totalM: total, ticks };
}

/** Bildschirmpunkte je Meter aus der react-native-maps-Region (latitudeDelta) und der Kartenhöhe (pt). */
export function pointsPerMeter(latitudeDelta: number, mapHeightPt: number): number {
  if (!(latitudeDelta > 0) || !(mapHeightPt > 0)) return 0;
  return mapHeightPt / (latitudeDelta * M_PER_DEG_LAT);
}

/**
 * Adaptive Stufe: die feinste Tick-Teilung, deren Abstand auf dem Bildschirm
 * noch mindestens minTickSpacingPt beträgt.
 *   fine   = 1-m-Ticks (+ 5/10 m betont, 10-m-Zahlen)
 *   medium = 5-m-Ticks (+ 10-m-Zahlen)
 *   coarse = nur 10-m-Ticks mit Zahlen
 *   off    = Übersicht: zu dicht, nichts zeichnen
 */
export function distanceScaleLevel(ptPerM: number): DistanceScaleLevel {
  const sp = DISTANCE_SCALE.minTickSpacingPt;
  if (!(ptPerM > 0)) return 'off';
  if (ptPerM * 1 >= sp.fine) return 'fine';
  if (ptPerM * 5 >= sp.medium) return 'medium';
  if (ptPerM * 10 >= sp.coarse) return 'coarse';
  return 'off';
}

/** Kleinster Label-Schritt (Vielfaches von 10 m), bei dem sich Zahlen nicht überdecken. */
export function labelStepM(ptPerM: number): number {
  const steps = DISTANCE_SCALE.labelStepsM;
  for (const s of steps) if (s * ptPerM >= DISTANCE_SCALE.minLabelSpacingPt) return s;
  return steps[steps.length - 1];
}

const LEVEL_CLASSES: Record<DistanceScaleLevel, readonly TickClass[]> = {
  fine: ['one', 'five', 'ten'], medium: ['five', 'ten'], coarse: ['ten'], off: [],
};
const COARSER: Record<DistanceScaleLevel, DistanceScaleLevel> = { fine: 'medium', medium: 'coarse', coarse: 'off', off: 'off' };

export interface ScaleBounds { minLat: number; maxLat: number; minLng: number; maxLng: number }

/** Sichtbarer Bereich mit Rand (Faktor auf die halbe Ausdehnung) — Rotation/Pitch grosszügig abgedeckt. */
export function regionBounds(r: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number }, margin = 1.5): ScaleBounds {
  const half = (Math.max(r.latitudeDelta, r.longitudeDelta) / 2) * margin;
  return { minLat: r.latitude - half, maxLat: r.latitude + half, minLng: r.longitude - half, maxLng: r.longitude + half };
}

const inBounds = (p: LL, b: ScaleBounds | null) =>
  !b || (p.latitude >= b.minLat && p.latitude <= b.maxLat && p.longitude >= b.minLng && p.longitude <= b.maxLng);

export interface TickSegment { key: string; cls: TickClass; coordinates: [LL, LL] }
export interface TickLabel { key: string; m: number; at: LL }
export interface DistanceScaleRender { level: DistanceScaleLevel; segments: TickSegment[]; labels: TickLabel[] }

/**
 * Zu zeichnende Tick-Striche + Zahlen für den aktuellen Zoom. Nur Ticks im
 * sichtbaren Bereich; überschreitet die Menge die Obergrenzen, wird auf die
 * nächstgröbere Stufe gewechselt (nie hunderte Kartenobjekte).
 */
export function distanceScaleRender(
  set: DistanceTickSet, ptPerM: number, bounds: ScaleBounds | null, forced?: DistanceScaleLevel,
  avoid: readonly LL[] = [],
): DistanceScaleRender {
  let level = forced ?? distanceScaleLevel(ptPerM);
  if (!(ptPerM > 0) || set.ticks.length === 0) return { level: 'off', segments: [], labels: [] };
  const visible = set.ticks.filter(t => inBounds(t.at, bounds));
  while (level !== 'off') {
    const classes = LEVEL_CLASSES[level];
    if (visible.filter(t => classes.includes(t.cls) && t.normal).length <= DISTANCE_SCALE.maxTickSegments) break;
    level = COARSER[level];
  }
  if (level === 'off') return { level, segments: [], labels: [] };
  const classes = LEVEL_CLASSES[level];
  const segments: TickSegment[] = [];
  for (const t of visible) {
    if (!classes.includes(t.cls) || !t.normal) continue;
    const halfM = DISTANCE_SCALE.halfLengthPt[t.cls] / ptPerM;
    const { east, north } = t.normal;
    segments.push({
      key: `tick-${t.m}`, cls: t.cls,
      coordinates: [offsetLL(t.at, -east * halfM, -north * halfM), offsetLL(t.at, east * halfM, north * halfM)],
    });
  }
  const step = labelStepM(ptPerM);
  const offM = DISTANCE_SCALE.labelOffsetPt / ptPerM;
  const avoidM = DISTANCE_SCALE.labelAvoidRadiusPt / ptPerM;
  const nearMarker = (p: LL) => avoid.some(a => {
    const d = toLocal(p, a);
    return Math.hypot(d.x, d.y) < avoidM;
  });
  const labels: TickLabel[] = [];
  for (const t of visible) {
    if (t.m % step !== 0 || !t.normal) continue;
    if (labels.length >= DISTANCE_SCALE.maxLabels) break;
    const pos = offsetLL(t.at, t.normal.east * offM, t.normal.north * offM);
    if (nearMarker(pos) || nearMarker(t.at)) continue;
    labels.push({ key: `lbl-${t.m}`, m: t.m, at: pos });
  }
  return { level, segments, labels };
}

/** Live-Anzeige „42 m / 86 m": Fortschritt entlang der Referenz, geklemmt auf 0..Länge. */
export function searchDistanceReadout(progressM: number, trackLengthM: number): { currentM: number; totalM: number } | null {
  if (!Number.isFinite(trackLengthM) || trackLengthM <= 0) return null;
  const p = Number.isFinite(progressM) ? Math.max(0, Math.min(trackLengthM, progressM)) : 0;
  return { currentM: Math.round(p), totalM: Math.round(trackLengthM) };
}

export interface ScaleObject { atM: number | null | undefined; status?: string | null }

/**
 * Distanz ENTLANG der Fährte bis zum nächsten noch offenen Gegenstand vor dem
 * aktuellen Fortschritt: atM − progressM, nur > 0. Bereits passierte (≤ 0) und
 * bereits erledigte (Status ≠ pending) werden übersprungen. atM = kanonische
 * Bogenlänge (canonicalArc.ts) auf derselben Referenzlinie.
 */
export function nextObjectDistance(objects: readonly ScaleObject[], progressM: number): { index: number; distanceM: number } | null {
  if (!Number.isFinite(progressM)) return null;
  let best: { index: number; distanceM: number } | null = null;
  objects.forEach((o, index) => {
    if (o.atM == null || !Number.isFinite(o.atM)) return;
    if (o.status != null && o.status !== 'pending') return;
    const d = o.atM - progressM;
    if (d <= 0) return;
    if (!best || d < best.distanceM) best = { index, distanceM: d };
  });
  return best;
}

/**
 * Region-Updates drosseln: react-native-maps meldet während Smart Follow mehrmals
 * pro Sekunde eine neue Region. Neu berechnet wird nur bei spürbarer Zoom-
 * änderung (> 25 %) oder wenn sich die Mitte um > 25 % der Ausdehnung bewegt.
 */
export function scaleRegionChanged(
  prev: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null,
  next: { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number },
): boolean {
  if (!Number.isFinite(next.latitudeDelta) || !(next.latitudeDelta > 0)) return false;
  if (!prev) return true;
  const zoomRatio = next.latitudeDelta / prev.latitudeDelta;
  if (zoomRatio > 1.25 || zoomRatio < 0.8) return true;
  const ext = Math.max(prev.latitudeDelta, prev.longitudeDelta);
  return Math.abs(next.latitude - prev.latitude) > ext * 0.25 || Math.abs(next.longitude - prev.longitude) > ext * 0.25;
}

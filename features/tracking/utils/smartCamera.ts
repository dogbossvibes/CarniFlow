// ──────────────────────────────────────────────────────────────────────────
// Reine Kamera-Mathematik für die navigationsartige Kartenansicht (Smart
// Follow). Bewusst OHNE React/Map/Native-Imports → vollständig testbar.
//
// STRIKTE ABGRENZUNG (Punkt 17/18 des Auftrags): dieses Modul beschreibt
// ausschliesslich DARSTELLUNG (Blickrichtung, Neigung, Kartenmittelpunkt).
// Es liest keine GPS-Fixe an, akzeptiert/verwirft nichts, kennt weder
// Recorder, Distanz, Corner-Detection, Fusion noch Start-Acquisition. Die
// Datenrichtung ist immer nur: Tracking-State → Kamera, niemals umgekehrt.
// ──────────────────────────────────────────────────────────────────────────

export type MapCameraMode = 'heading' | 'north' | 'free';

export interface CameraLatLng { lat: number; lng: number }

const EARTH_R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Normalisiert auf [0, 360). */
export function normalizeHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Kürzester Winkelweg von `from` nach `to`, als vorzeichenbehaftete Differenz
 * in (-180, 180]. Damit wird aus 355° → 2° ein Weg von +7°, nicht -353°.
 */
export function shortestAngleDelta(from: number, to: number): number {
  let d = (normalizeHeading(to) - normalizeHeading(from)) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Weiche Annäherung entlang des kürzesten Wegs. `alpha` 0..1 (0 = keine
 * Bewegung, 1 = sofort). Kleine Schwankungen unterhalb `deadzoneDeg` werden
 * ignoriert, damit die Karte bei GPS-Jitter nicht zittert.
 */
export function smoothHeading(current: number, target: number, alpha: number, deadzoneDeg = 3): number {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) < deadzoneDeg) return normalizeHeading(current);
  return normalizeHeading(current + delta * Math.max(0, Math.min(1, alpha)));
}

/** Distanz in Metern (Haversine) — nur für Bewegungs-/Look-ahead-Entscheidungen. */
export function cameraDistanceM(a: CameraLatLng, b: CameraLatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Peilung von a nach b in Grad (0 = Nord, 90 = Ost). */
export function cameraBearing(a: CameraLatLng, b: CameraLatLng): number {
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return normalizeHeading(toDeg(Math.atan2(y, x)));
}

/** Punkt in `distanceM` Metern Richtung `bearingDeg` — für den Look-ahead. */
export function offsetByBearing(from: CameraLatLng, bearingDeg: number, distanceM: number): CameraLatLng {
  const d = distanceM / EARTH_R;
  const br = toRad(normalizeHeading(bearingDeg));
  const la1 = toRad(from.lat), lo1 = toRad(from.lng);
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: toDeg(la2), lng: toDeg(lo2) };
}

// ── Laufrichtung ──────────────────────────────────────────────────────────
// PRIMÄR die tatsächliche Bewegungsrichtung (GPS course bzw., wenn der Fix
// keinen course liefert, die Peilung zwischen zwei hinreichend weit
// auseinanderliegenden Positionen). NICHT die rohe Geräteausrichtung: ein
// Hundeführer, der das Telefon dreht, darf die Karte nicht mitdrehen.

/** Mindeststrecke, ab der eine Peilung aus zwei Positionen belastbar ist. */
export const COURSE_MIN_STEP_M = 3;
/** Darunter gilt die Bewegung als zu langsam für eine GPS-Richtung. */
export const COURSE_MIN_SPEED_MPS = 0.5;

export interface CourseInput {
  /** Vom Fix gemeldeter Kurs (Grad) — < 0 oder null = ungültig (CoreLocation-Konvention). */
  courseDeg?: number | null;
  /** Gemeldete Geschwindigkeit (m/s) — < 0 oder null = unbekannt. */
  speedMps?: number | null;
  /** Aktuelle Position. */
  position?: CameraLatLng | null;
  /** Letzte Position, die weit genug entfernt war, um eine Peilung zu tragen. */
  lastAnchor?: CameraLatLng | null;
  /** Gerätekompass (Grad) — nur Fallback. */
  deviceHeadingDeg?: number | null;
  /** Zuletzt als belastbar bewertete Laufrichtung. */
  lastCourseDeg?: number | null;
}

export type CourseSource = 'gps_course' | 'position_delta' | 'device_heading' | 'hold';

export interface CourseResult {
  /** Blickrichtung, die die Kamera anstreben soll — null nur, wenn es noch gar keine gibt. */
  headingDeg: number | null;
  source: CourseSource;
  /** true, wenn diese Richtung als neuer belastbarer Stand gemerkt werden soll. */
  trustworthy: boolean;
}

/**
 * Ermittelt die anzustrebende Blickrichtung.
 *
 * Reihenfolge:
 *  1. gemeldeter GPS-course, wenn gültig UND die Bewegung schnell genug ist,
 *  2. sonst Peilung aus der Positionsfolge (ab COURSE_MIN_STEP_M),
 *  3. sonst — nur wenn es noch KEINE belastbare Laufrichtung gibt — der
 *     Gerätekompass als vorsichtiger Erstwert,
 *  4. sonst „hold": die letzte belastbare Richtung wird gehalten. Genau das
 *     verhindert das nervöse Drehen im Stillstand.
 */
export function resolveTravelHeading(input: CourseInput): CourseResult {
  const { courseDeg, speedMps, position, lastAnchor, deviceHeadingDeg, lastCourseDeg } = input;

  const movingFastEnough = speedMps != null && speedMps >= COURSE_MIN_SPEED_MPS;
  if (courseDeg != null && courseDeg >= 0 && movingFastEnough) {
    return { headingDeg: normalizeHeading(courseDeg), source: 'gps_course', trustworthy: true };
  }

  if (position && lastAnchor && cameraDistanceM(lastAnchor, position) >= COURSE_MIN_STEP_M) {
    return { headingDeg: cameraBearing(lastAnchor, position), source: 'position_delta', trustworthy: true };
  }

  // Kompass nur als Startwert, solange noch nie eine echte Laufrichtung
  // vorlag — sonst würde ein Drehen des Geräts im Stand die Karte mitdrehen.
  if (lastCourseDeg == null && deviceHeadingDeg != null && deviceHeadingDeg >= 0) {
    return { headingDeg: normalizeHeading(deviceHeadingDeg), source: 'device_heading', trustworthy: false };
  }

  return { headingDeg: lastCourseDeg != null ? normalizeHeading(lastCourseDeg) : null, source: 'hold', trustworthy: false };
}

// ── Kamera-Ziel ───────────────────────────────────────────────────────────

/** Voreinstellungen; bewusst konservativ (kein „Flugsimulator"-3D). */
export const CAMERA_DEFAULTS = {
  /** Anteil der Kartenhöhe, um den nach vorn verschoben wird (0.5 = Zentrum). */
  lookAheadFraction: 0.22,
  /** Sichtbare Kartenhöhe in Metern bei Standard-Zoom (grobe Annahme für den Versatz). */
  viewportSpanM: 220,
  /** Neigung im Perspektiv-Modus (Grad). */
  pitch3D: 40,
  /** Glättungsfaktor je Kamera-Update. */
  headingAlpha: 0.35,
  /** Kleinere Änderungen als das drehen die Kamera nicht. */
  headingDeadzoneDeg: 3,
  /** Mindestabstand zwischen zwei Kamera-Updates (ms) → ~4–5 Updates/s. */
  minUpdateIntervalMs: 220,
} as const;

export interface CameraTargetInput {
  position: CameraLatLng;
  /** Geglättete Blickrichtung der Kamera (Grad). */
  headingDeg: number;
  mode: MapCameraMode;
  pitchDeg: number;
  /** Sichtbare Kartenhöhe in Metern (für den Look-ahead-Versatz). */
  viewportSpanM?: number;
  lookAheadFraction?: number;
}

export interface CameraTarget {
  center: CameraLatLng;
  headingDeg: number;
  pitchDeg: number;
}

/**
 * Kamera-Zielwert. Der Nutzer sitzt NICHT im Bildschirmzentrum: das
 * Kartenzentrum wird in Blickrichtung nach vorn versetzt, sodass die eigene
 * Position im unteren Drittel liegt und mehr Fährte VOR einem sichtbar ist.
 * Die echte GPS-Koordinate bleibt unangetastet — verschoben wird nur die
 * Kamera.
 */
export function computeCameraTarget(input: CameraTargetInput): CameraTarget {
  const { position, mode, pitchDeg } = input;
  if (mode === 'north') {
    return { center: position, headingDeg: 0, pitchDeg };
  }
  const span = input.viewportSpanM ?? CAMERA_DEFAULTS.viewportSpanM;
  const fraction = input.lookAheadFraction ?? CAMERA_DEFAULTS.lookAheadFraction;
  const heading = normalizeHeading(input.headingDeg);
  const center = offsetByBearing(position, heading, span * fraction);
  return { center, headingDeg: heading, pitchDeg };
}

/**
 * Kamera-Update-Drosselung — AUSSCHLIESSLICH für die Darstellung. Sie
 * begrenzt, wie oft `animateCamera` aufgerufen wird, und berührt den
 * Location-/Fixstrom in keiner Weise (siehe Kopfkommentar).
 */
export function shouldUpdateCamera(args: {
  nowMs: number;
  lastUpdateMs: number | null;
  minIntervalMs?: number;
  headingDeltaDeg: number;
  centerMovedM: number;
  headingDeadzoneDeg?: number;
  minCenterMoveM?: number;
}): boolean {
  const minInterval = args.minIntervalMs ?? CAMERA_DEFAULTS.minUpdateIntervalMs;
  if (args.lastUpdateMs != null && args.nowMs - args.lastUpdateMs < minInterval) return false;
  const deadzone = args.headingDeadzoneDeg ?? CAMERA_DEFAULTS.headingDeadzoneDeg;
  const minMove = args.minCenterMoveM ?? 1;
  return Math.abs(args.headingDeltaDeg) >= deadzone || args.centerMovedM >= minMove;
}

// Test-Helfer (kein Test-Suite-Modul): DIE verbindliche Golden-Field-Route.
//
// Reale Referenzaufnahme (buildexpo.MP4), physisch gelaufen mit ANYVO-
// Schrittlänge 75 cm und je ~5 Schritten zwischen den Richtungswechseln:
//
//   Start → L → 3,75 m → R → 3,75 m → SR → 3,75 m → SL → ca. 1,25 m → Ende
//
// Erwartete Events: 90 L → 90 R → SR → SL.
//
// Der kurze Schlussnachlauf von 1,25 m ist Teil der Route und darf NICHT durch
// eine längere synthetische Schlussgerade ersetzt werden — genau er ist der
// Grund, warum der letzte Spitzwinkel im Feld fehlte.

import {
  detectShortLegCorners, DETECTOR_INPUT, type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import {
  legacyDetectCorner, type LegacyAcceptedPoint, type LegacyAngleKind,
} from '@/features/tracking/utils/legacyCornerDetection';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

export const M_PER_DEG = 111320;
const RAD = Math.PI / 180;

/** ANYVO-Schrittlänge des Läufers. */
export const FIELD_STEP_LEN_M = 0.75;
/** ~5 Schritte zwischen den Richtungswechseln. */
export const FIELD_STEPS_PER_LEG = 5;
/** Daraus die Schenkellänge: 3,75 m. */
export const FIELD_LEG_M = FIELD_STEP_LEN_M * FIELD_STEPS_PER_LEG;
/** VERBINDLICHER Schlussnachlauf der realen Route. */
export const FIELD_TAIL_M = 1.25;
/** Gemeldete Accuracy beim Legen. */
export const FIELD_ACCURACY_MIN_M = 5;
export const FIELD_ACCURACY_MAX_M = 9;
/** Im Video abgelesene Gesamtdistanz. */
export const FIELD_TOTAL_DISTANCE_M = 16;
/** Erwartete Reihenfolge — exakt die gelaufene. */
export const FIELD_EXPECTED: AngleKind[] = ['links', 'rechts', 'spitz_rechts', 'spitz_links'];

/**
 * Der Rohfix-Abstand ist nicht direkt bekannt: auf iOS ist `timeInterval` ein
 * No-op (nur Android), und `distanceInterval: 0` (kCLDistanceFilterNone) lässt
 * jedes Core-Location-Update durch. Er wird deshalb nicht geraten, sondern
 * über eine Kalibriermatrix bestimmt.
 */
export const FIELD_FIX_SPACINGS_M = [1.0, 0.75, 0.5, 0.25] as const;
export const FIELD_DRIFT_BAND_M = [0, 2, 4, 5, 6, 8] as const;

// Aufzeichnungsketten, unverändert aus useTrackRecorder.
export const LINE_EMA_ALPHA = 0.4;    // EMA_ALPHA — aufgezeichnete Linie
export const LINE_MIN_STEP_M = 2.0;   // MIN_STEP_M

export interface RawFix { x: number; y: number; accuracy: number; t: number }

export function makeRng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function walk(from: readonly [number, number], headingDeg: number, lenM: number, spacing: number): [number, number][] {
  const r = headingDeg * RAD;
  const out: [number, number][] = [];
  let d = spacing;
  while (d < lenM) { out.push([from[0] + Math.sin(r) * d, from[1] + Math.cos(r) * d]); d += spacing; }
  out.push([from[0] + Math.sin(r) * lenM, from[1] + Math.cos(r) * lenM]);
  return out;
}

/**
 * Die gelaufene Route. `tailM` ist ausschliesslich für die Nachlaufmatrix
 * parametrisierbar — der VERBINDLICHE Wert der Feldaufnahme ist FIELD_TAIL_M.
 */
export function fieldRouteCoords(spacing: number, tailM: number = FIELD_TAIL_M): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  let cur: [number, number] = [0, 0];
  const segs: [number, number][] = [
    [0, FIELD_LEG_M],     // Anlauf
    [270, FIELD_LEG_M],   // L  (90° links)
    [0, FIELD_LEG_M],     // R  (90° rechts)
    [135, FIELD_LEG_M],   // SR (Spitzwinkel rechts, Innenwinkel 45°)
    [0, tailM],           // SL (Spitzwinkel links) + Nachlauf
  ];
  for (const [hdg, len] of segs) {
    for (const p of walk(cur, hdg, len, spacing)) pts.push(p);
    cur = pts[pts.length - 1];
  }
  return pts;
}

/** Eine reine Gerade derselben Abtastung — Basis der False-Positive-Fälle. */
export function straightCoords(lengthM: number, spacing: number): [number, number][] {
  const out: [number, number][] = [];
  for (let d = 0; d <= lengthM + 1e-9; d += spacing) out.push([0, d]);
  return out;
}

/** Korrelierte GNSS-Drift (Waldrand) — kein weisses Rauschen. */
export function withDrift(coords: readonly (readonly [number, number])[], amplitudeM: number, seed: number): [number, number][] {
  if (amplitudeM <= 0) return coords.map(p => [p[0], p[1]] as [number, number]);
  const rng = makeRng(seed);
  let dx = (rng() - 0.5) * amplitudeM, dy = (rng() - 0.5) * amplitudeM;
  return coords.map(([x, y]) => {
    dx = dx * 0.85 + (rng() - 0.5) * amplitudeM * 0.5;
    dy = dy * 0.85 + (rng() - 0.5) * amplitudeM * 0.5;
    return [x + dx, y + dy] as [number, number];
  });
}

/** Accuracy-Verlauf im real gemeldeten Band 5–9 m, 1 Hz Zeitachse. */
export function fieldFixes(coords: readonly (readonly [number, number])[], seed: number): RawFix[] {
  const rng = makeRng(seed * 7919);
  return coords.map(([x, y], i) => ({
    x, y,
    accuracy: FIELD_ACCURACY_MIN_M + rng() * (FIELD_ACCURACY_MAX_M - FIELD_ACCURACY_MIN_M),
    t: 1_000_000 + i * 1000,
  }));
}

/** Die AUFGEZEICHNETE Linie (BUILD40 arbeitet auf dieser): EMA 0,4 / Gate 2 m. */
export function recordedLine(fixes: readonly RawFix[]): LegacyAcceptedPoint[] {
  let ema: [number, number] | null = null, last: [number, number] | null = null, cum = 0;
  const out: LegacyAcceptedPoint[] = [];
  for (const f of fixes) {
    ema = ema ? [ema[0] + LINE_EMA_ALPHA * (f.x - ema[0]), ema[1] + LINE_EMA_ALPHA * (f.y - ema[1])] : [f.x, f.y];
    if (!last) {
      last = ema;
      out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: 0, accuracy: f.accuracy, t: f.t });
      continue;
    }
    const step = Math.hypot(ema[0] - last[0], ema[1] - last[1]);
    if (step < LINE_MIN_STEP_M) continue;
    cum += step; last = ema;
    out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: cum, accuracy: f.accuracy, t: f.t });
  }
  return out;
}

/** Der DETEKTOR-Puffer (CURRENT arbeitet auf diesem): leichtere Glättung, feines Gate. */
export function detectorBuffer(fixes: readonly RawFix[]): ShortLegPoint[] {
  const a = DETECTOR_INPUT.emaAlpha;
  let ema: [number, number] | null = null, last: [number, number] | null = null, cum = 0;
  const out: ShortLegPoint[] = [];
  for (const f of fixes) {
    ema = ema ? [ema[0] + a * (f.x - ema[0]), ema[1] + a * (f.y - ema[1])] : [f.x, f.y];
    if (!last) {
      last = ema;
      out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: 0, accuracy: f.accuracy, t: f.t });
      continue;
    }
    const step = Math.hypot(ema[0] - last[0], ema[1] - last[1]);
    if (step < DETECTOR_INPUT.minStepM) continue;
    cum += step; last = ema;
    out.push({ lat: ema[1] / M_PER_DEG, lng: ema[0] / M_PER_DEG, cumDist: cum, accuracy: f.accuracy, t: f.t });
  }
  return out;
}

/**
 * UNGEGLÄTTETE Fixe mit cumDist — nur für den Stop-Flush-Nachlauf. Kein EMA,
 * kein Distanz-Gate: genau der Strom, wie er aus der Positionsquelle kommt.
 */
export function rawBuffer(fixes: readonly RawFix[]): ShortLegPoint[] {
  let cum = 0;
  const out: ShortLegPoint[] = [];
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    if (i > 0) cum += Math.hypot(f.x - fixes[i - 1].x, f.y - fixes[i - 1].y);
    out.push({ lat: f.y / M_PER_DEG, lng: f.x / M_PER_DEG, cumDist: cum, accuracy: f.accuracy, t: f.t });
  }
  return out;
}

/** BUILD40 exakt wie im Recorder: pro neuem Linienpunkt EIN Einzelschuss. */
export function runBuild40(line: readonly LegacyAcceptedPoint[]): { kinds: LegacyAngleKind[]; rejects: Record<string, number> } {
  const kinds: LegacyAngleKind[] = [];
  const rejects: Record<string, number> = {};
  let lastCornerAt = -Infinity;
  for (let n = 1; n <= line.length; n++) {
    const r = legacyDetectCorner(line.slice(0, n), lastCornerAt);
    if (r.reject) { rejects[r.reject] = (rejects[r.reject] ?? 0) + 1; continue; }
    kinds.push(r.kind);
    lastCornerAt = r.apex.cumDist;
  }
  return { kinds, rejects };
}

export function runCurrent(buf: readonly ShortLegPoint[]): { kinds: AngleKind[]; lastCornerAtM: number } {
  const { corners } = detectShortLegCorners(buf);
  return {
    kinds: corners.map(c => c.kind),
    lastCornerAtM: corners.length ? corners[corners.length - 1].atM : -Infinity,
  };
}

/** Wie viele der vier erwarteten Events wurden korrekt UND in Reihenfolge erkannt? */
export function scoreSequence(found: readonly string[]): number {
  let i = 0;
  for (const k of found) if (i < FIELD_EXPECTED.length && k === FIELD_EXPECTED[i]) i++;
  return i;
}

export const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

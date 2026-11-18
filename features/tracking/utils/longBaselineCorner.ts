// ──────────────────────────────────────────────────────────────────────────
// Long-Baseline-Rückfall für die Winkelerkennung (T-190).
//
// ANLASS (reale QA-Aufnahme 2026-11-10, iOS 1.0.8/60, Handy im Hosensack,
// langsames Legen mit ~0,2 m/s, GPS-Genauigkeit 6–9 m): die Spur enthält zwei
// klare Rechtswinkel, der Detektor meldete keinen. 166 von 209 Kandidaten
// scheiterten an `no_window_before/after`, darunter ALLE rund um die beiden
// Ecken — es wurde also nie ein Winkel gemessen.
//
// URSACHE (nachgerechnet): das Geradheits-Gate der Schenkelfenster prüft die
// GRÖSSTE Abweichung eines EINZELNEN Segments (STRAIGHT_TOL_DEG = 26°). Bei
// 0,7 m Punktabstand und einem GPS-Zittern in derselben Grössenordnung zeigt
// fast immer irgendein Segment quer: nur 16 von 208 der 8-m-Fenster bestehen.
// Das ist der in shortLegCornerDetection.ts dokumentierte „OFFENE BEFUND" —
// hier tritt er nicht durch hohe Fixrate, sondern durch langsames Gehen auf.
//
// LÖSUNG: der Regelpfad und der Split-Apex-Rescue bleiben UNVERÄNDERT. Dieser
// Rückfall läuft ausschliesslich dort, wo beide keine Ecke geliefert haben,
// und misst die Richtung über LANGE Schenkel (8 / 12 / 16 m) mit der robusten
// Ausgleichsgeraden. Einzelne Zitter-Segmente fallen bei dieser Länge nicht
// mehr ins Gewicht. Weil lange Fenster auch Bögen und Drift „begradigen"
// würden, sind die Bedingungen bewusst streng und rein geometrisch:
//
//   1. Mindestens zwei Schenkellängen (8 m UND 12 m) müssen dieselbe Ecke
//      zeigen: gleiche Richtung, je ≥ 60°, untereinander ≤ 25° Unterschied.
//      Ein gleichmässiger Bogen wächst mit der Schenkellänge und fällt durch.
//   2. Jeder Schenkel muss in sich gerade sein — gemessen NICHT über einzelne
//      Segmente, sondern über die Richtungen seiner beiden HÄLFTEN (≤ 30°).
//      Das ist das dichte- und zitter-unabhängige Geradheitsmass, das dem
//      Regelpfad fehlt. Ein Fenster, das in einen Nachbarwinkel oder einen
//      seitlichen Versatz läuft, fällt hier durch.
//   3. Jeder Schenkel muss echten Weg zurücklegen (Sehne ≥ 50 % der
//      Fensterlänge). Stand-Zittern summiert Pfadlänge ohne Fortschritt.
//
// GRENZEN (bewusst): Schenkel unter 12 m und die letzten 12 m vor dem Ende
// deckt dieser Pfad nicht ab — dort bleibt es beim bisherigen Verhalten.
//
// SCHÄRFE (T-211): „spitz" wird nur behauptet, wenn JEDE gültige Schenkellänge
// (mindestens 8 m und 12 m) für sich einen Innenwinkel im Spitz-Band misst und
// die Positionsunsicherheit die kürzeste Schenkellänge nicht klar übersteigt
// (gleiche Grenze wie im Regelpfad, SHARPNESS_MAX_RATIO). Das ist derselbe
// Konsens-Gedanke wie `spitzConsensus`, nur über lange statt kurze Fenster —
// lange Schenkel lösen den Winkel besser auf als die 2–8-m-Fenster des
// Regelpfads. Sonst bleibt die Ecke ausserhalb des Normalbands eine normale
// Ecke mit `sharpness: 'unresolved'`. Motion fliesst nicht ein: bei langsamem Gehen ist der Scheitel-Zeitpunkt nur auf
// viele Sekunden genau bekannt, ein ±1-s-Motion-Fenster wäre Zufall.
//
// Reine Funktion, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────
import { calculateDistance, calculateHeading } from '@/features/tracking/utils/gpsFilter';
import {
  robustBearing, normalizeDeg, clamp01, ACCEPT_SCORE, NORMAL_MIN, NORMAL_MAX, SPITZ_MIN, SPITZ_MAX,
  type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import { SHARPNESS_MAX_RATIO } from '@/features/tracking/utils/turnGeometryQuality';

/** Schenkellängen (m), aufsteigend. Die ersten LONG_BASELINE_REQUIRED sind Pflicht. */
export const LONG_BASELINES_M = [8, 12, 16] as const;
export const LONG_BASELINE_REQUIRED = 2;
/** Nur echte Ecken — deutlich über MIN_TURN_DEG (35°) des Regelpfads. */
export const LONG_BASELINE_MIN_TURN_DEG = 60;
/** Darüber ist es eine Beinahe-Umkehr; die löst dieser Pfad nicht auf. */
export const LONG_BASELINE_MAX_TURN_DEG = 150;
/** Das Fenster muss die Schenkellänge tatsächlich (fast) ausfüllen. */
export const LONG_BASELINE_MIN_FILL = 0.85;
/**
 * Sehne ÷ Schenkellänge: echter Fortschritt statt Stand-Zittern. Reines
 * Zittern im Stand erreicht ~0,3 (Irrfahrt: Sehne ≈ √n · Schritt); eine real
 * gelaufene, verrauschte Gerade lag in der Feldaufnahme bei 0,56–0,8, weil die
 * Pfadlänge des Detektor-Puffers das Zittern mitzählt (Legepause am Winkel).
 */
export const LONG_BASELINE_MIN_PROGRESS = 0.5;
/** Grösster Richtungsunterschied zwischen den beiden Hälften eines Schenkels. */
export const LONG_BASELINE_MAX_HALF_BEND_DEG = 30;
/** Grösster Unterschied der Drehung zwischen den Schenkellängen. */
export const LONG_BASELINE_MAX_DISAGREEMENT_DEG = 25;
/** Mindestpunkte je Schenkel (je Hälfte mindestens drei). */
export const LONG_BASELINE_MIN_SAMPLES = 6;
/**
 * Sperrabstand (m) zu jeder anderen Ecke — und zugleich der Abstand, um den
 * sich der Scheitel einer bereits gemeldeten Long-Baseline-Ecke zwischen zwei
 * Auswertungen verschieben darf, ohne als neue Ecke zu gelten.
 */
export const LONG_BASELINE_EXCLUSION_M = 8;
/**
 * Billiger Vorfilter: Drehung zwischen den SEHNEN der kürzesten Schenkel. Liegt
 * sie klar unter der Mindestdrehung, wird gar nicht erst gefittet — der Rückfall
 * läuft bei jedem Fix über den ganzen Puffer und soll auf Geraden nichts kosten.
 * Der Abstand zu LONG_BASELINE_MIN_TURN_DEG deckt das Endpunkt-Zittern ab.
 */
export const LONG_BASELINE_PREFILTER_TURN_DEG = 30;

export interface LongBaselineLeg {
  endIndex: number;
  lengthM: number;
  sampleCount: number;
  bearingDeg: number;
  residualM: number;
  halfBendDeg: number;
}

export interface LongBaselineHit {
  apexIndex: number;
  direction: 'links' | 'rechts';
  /** Mittel der Drehung über alle gültigen Schenkellängen (vorzeichenbehaftet). */
  headingDeltaDeg: number;
  interiorAngleDeg: number;
  sharpness: 'normal' | 'spitz' | 'unresolved';
  /** Grösster Innenwinkel über alle gültigen Schenkellängen (Grad) — Beleg für „spitz". */
  maxInteriorDeg: number;
  /** Median-Accuracy im längsten Fensterpaar ÷ kürzeste Schenkellänge; null = keine Accuracy. */
  accuracyToLegRatio: number | null;
  confidence: number;
  /** Gültige Schenkellängen (m), aufsteigend. */
  baselinesM: number[];
  /** Grösster Unterschied der Drehung zwischen den Schenkellängen. */
  disagreementDeg: number;
  /** Längstes gültiges Fensterpaar — für die Diagnose. */
  before: LongBaselineLeg;
  after: LongBaselineLeg;
}

function longLeg(points: readonly ShortLegPoint[], apexIndex: number, forward: boolean, baselineM: number): LongBaselineLeg | null {
  const apex = points[apexIndex];
  const along = (k: number) => forward ? points[k].cumDist - apex.cumDist : apex.cumDist - points[k].cumDist;
  const end = windowEnd(points, apexIndex, forward, baselineM);
  const lengthM = along(end);
  const sampleCount = Math.abs(end - apexIndex) + 1;
  if (lengthM < baselineM * LONG_BASELINE_MIN_FILL || sampleCount < LONG_BASELINE_MIN_SAMPLES) return null;
  if (calculateDistance(apex, points[end]) < baselineM * LONG_BASELINE_MIN_PROGRESS) return null;

  // Hälften nach Weglänge teilen; der Mittelpunkt gehört zu beiden.
  let mid = apexIndex;
  while (mid !== end && along(mid) < lengthM / 2) mid += forward ? 1 : -1;
  if (Math.abs(mid - apexIndex) < 2 || Math.abs(end - mid) < 2) return null;

  // robustBearing orientiert immer in Laufrichtung (aufsteigende Indizes).
  const fit = robustBearing(points, apexIndex, end);
  const near = robustBearing(points, apexIndex, mid);
  const far = robustBearing(points, mid, end);
  if (!fit || !near || !far) return null;
  const halfBendDeg = Math.abs(normalizeDeg(far.deg - near.deg));
  if (halfBendDeg > LONG_BASELINE_MAX_HALF_BEND_DEG) return null;
  return { endIndex: end, lengthM, sampleCount, bearingDeg: fit.deg, residualM: fit.residualM, halfBendDeg };
}

function windowEnd(points: readonly ShortLegPoint[], apexIndex: number, forward: boolean, baselineM: number): number {
  const apex = points[apexIndex];
  let end = apexIndex;
  for (;;) {
    const next = end + (forward ? 1 : -1);
    if (next < 0 || next >= points.length) break;
    if ((forward ? points[next].cumDist - apex.cumDist : apex.cumDist - points[next].cumDist) > baselineM) break;
    end = next;
  }
  return end;
}

/** Bewertet EINEN Scheitel über lange Schenkel. `null` = kein belastbarer Winkel. */
export function evaluateLongBaselineCorner(points: readonly ShortLegPoint[], apexIndex: number): LongBaselineHit | null {
  if (apexIndex < 1 || apexIndex > points.length - 2) return null;
  const start = windowEnd(points, apexIndex, false, LONG_BASELINES_M[0]);
  const stop = windowEnd(points, apexIndex, true, LONG_BASELINES_M[0]);
  if (start === apexIndex || stop === apexIndex) return null;
  const coarse = normalizeDeg(calculateHeading(points[apexIndex], points[stop]) - calculateHeading(points[start], points[apexIndex]));
  if (Math.abs(coarse) < LONG_BASELINE_PREFILTER_TURN_DEG) return null;
  const turns: number[] = [];
  const baselinesM: number[] = [];
  let before: LongBaselineLeg | null = null, after: LongBaselineLeg | null = null;
  for (const baselineM of LONG_BASELINES_M) {
    const b = longLeg(points, apexIndex, false, baselineM);
    const a = b ? longLeg(points, apexIndex, true, baselineM) : null;
    if (!b || !a) {
      // Pflichtlängen müssen lückenlos gültig sein; darüber endet die Suche einfach.
      if (baselinesM.length < LONG_BASELINE_REQUIRED) return null;
      break;
    }
    turns.push(normalizeDeg(a.bearingDeg - b.bearingDeg));
    baselinesM.push(baselineM);
    before = b; after = a;
  }
  if (!before || !after || baselinesM.length < LONG_BASELINE_REQUIRED) return null;

  const sign = turns[0] >= 0 ? 1 : -1;
  const magnitudes = turns.map(t => t * sign);
  const minMag = Math.min(...magnitudes), maxMag = Math.max(...magnitudes);
  if (minMag < LONG_BASELINE_MIN_TURN_DEG || maxMag > LONG_BASELINE_MAX_TURN_DEG) return null;
  const disagreementDeg = maxMag - minMag;
  if (disagreementDeg > LONG_BASELINE_MAX_DISAGREEMENT_DEG) return null;

  const magnitude = magnitudes.reduce((s, m) => s + m, 0) / magnitudes.length;
  const interior = 180 - magnitude;
  const turnScore = clamp01((magnitude - LONG_BASELINE_MIN_TURN_DEG) / 30);
  const agreeScore = 1 - disagreementDeg / LONG_BASELINE_MAX_DISAGREEMENT_DEG;
  const bendScore = 1 - Math.max(before.halfBendDeg, after.halfBendDeg) / LONG_BASELINE_MAX_HALF_BEND_DEG;
  const confidence = clamp01(
    0.45 + 0.15 * turnScore + 0.15 * agreeScore + 0.15 * bendScore + (baselinesM.length > LONG_BASELINE_REQUIRED ? 0.1 : 0),
  );
  if (confidence < ACCEPT_SCORE) return null;

  // Schärfe: jede Schenkellänge muss für sich im Spitz-Band liegen, und die
  // Geometrie muss den Winkel auflösen können (Accuracy ÷ kürzeste Schenkellänge).
  const maxInteriorDeg = 180 - minMag;
  const accs: number[] = [];
  for (let k = before.endIndex; k <= after.endIndex; k++) {
    const a = points[k].accuracy;
    if (a != null && Number.isFinite(a)) accs.push(a);
  }
  accs.sort((x, y) => x - y);
  const accuracyToLegRatio = accs.length ? accs[Math.floor(accs.length / 2)] / baselinesM[0] : null;
  const spitz = maxInteriorDeg <= SPITZ_MAX && 180 - maxMag >= SPITZ_MIN
    && (accuracyToLegRatio == null || accuracyToLegRatio <= SHARPNESS_MAX_RATIO);

  return {
    apexIndex,
    direction: sign > 0 ? 'rechts' : 'links',
    headingDeltaDeg: magnitude * sign,
    interiorAngleDeg: interior,
    sharpness: interior >= NORMAL_MIN && interior <= NORMAL_MAX ? 'normal' : spitz ? 'spitz' : 'unresolved',
    maxInteriorDeg: Math.round(maxInteriorDeg * 10) / 10,
    accuracyToLegRatio: accuracyToLegRatio == null ? null : Math.round(accuracyToLegRatio * 100) / 100,
    confidence, baselinesM, disagreementDeg, before, after,
  };
}

/**
 * Sucht Long-Baseline-Ecken in den Bereichen, in denen noch keine Ecke liegt.
 * `takenAtM` = Wegpositionen der bereits gefundenen Ecken. Nicht-Maximum-
 * Unterdrückung: stärkste zuerst, je LONG_BASELINE_EXCLUSION_M gesperrt.
 */
export function detectLongBaselineCorners(points: readonly ShortLegPoint[], takenAtM: readonly number[]): LongBaselineHit[] {
  const minPath = LONG_BASELINES_M[LONG_BASELINE_REQUIRED - 1] * LONG_BASELINE_MIN_FILL;
  const total = points.length ? points[points.length - 1].cumDist - points[0].cumDist : 0;
  if (total < 2 * minPath) return [];
  const blocked = [...takenAtM];
  const free = (atM: number) => !blocked.some(m => Math.abs(m - atM) < LONG_BASELINE_EXCLUSION_M);

  const hits: LongBaselineHit[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const atM = points[i].cumDist;
    if (atM - points[0].cumDist < minPath || points[points.length - 1].cumDist - atM < minPath) continue;
    if (!free(atM)) continue;
    const hit = evaluateLongBaselineCorner(points, i);
    if (hit) hits.push(hit);
  }
  hits.sort((x, y) => y.confidence - x.confidence || Math.abs(y.headingDeltaDeg) - Math.abs(x.headingDeltaDeg) || x.apexIndex - y.apexIndex);
  const kept: LongBaselineHit[] = [];
  for (const hit of hits) {
    const atM = points[hit.apexIndex].cumDist;
    if (!free(atM)) continue;
    blocked.push(atM);
    kept.push(hit);
  }
  return kept.sort((x, y) => x.apexIndex - y.apexIndex);
}

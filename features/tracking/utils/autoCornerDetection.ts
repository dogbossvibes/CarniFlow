import { calculateHeading, type LatLng } from '@/features/tracking/utils/gpsFilter';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

export interface AutoCornerPoint extends LatLng {
  cumDist: number;
  accuracy: number | null;
}

export type CornerKind = Extract<AngleKind, 'links' | 'rechts' | 'spitz_links' | 'spitz_rechts'>;

export interface AutoCorner {
  apex: AutoCornerPoint;
  kind: CornerKind;
  angleDeg: number;
  confidence: number;   // 0..1 — wie sicher der Kandidat ein echter Winkel ist
}

// ── Tunables ────────────────────────────────────────────────────────────────
const LEG_MIN_M = 4;                    // Mindestlänge je Schenkel (für Turn-Messung)
const CORNER_GAP_M = LEG_MIN_M;         // Mindestabstand zum vorherigen Winkel
const MIN_TURN_DEG = 15;                // darunter kein Winkel
const STRAIGHT_WINDOW_M = 8;            // Fenster für die Schenkel-Geradheit (mehr Punkte → robust ggü. 1 Ausreißer)
const SEG_ALIGN_DEG = 18;              // Segment gilt als „gerade", wenn Heading-Abweichung ≤ diesem Wert
// Winkelklassen (überlappungsfrei; ~90° ±15° normal, 30–60° spitz; dazwischen Totzone).
const NORMAL_MIN = 75, NORMAL_MAX = 105;
const SPITZ_MIN = 30, SPITZ_MAX = 60;
// GPS-Accuracy → Score (robust über den MEDIAN der Schenkelpunkte, nicht Einzelpunkt).
const ACC_GOOD_M = 12;                  // ≤ → Score 1
const ACC_BAD_M = 40;                   // ≥ → Score 0
const SUPPORT_TARGET = 5;               // Punkte über beide Schenkel für vollen Support
// Confidence-Gewichte (Summe = 1).
const WEIGHTS = {
  angle:          0.24,   // Nähe zum Zielwinkel (90 bzw. 45)
  straightBefore: 0.16,   // Geradheit vor dem Scheitel
  straightAfter:  0.16,   // Geradheit nach dem Scheitel
  support:        0.10,   // Anzahl unterstützender Punkte
  accuracy:       0.12,   // robuste GPS-Genauigkeit (Median)
  bearing:        0.12,   // Stabilität der Bearings
  legLength:      0.10,   // Mindestlänge beider Schenkel
} as const;
// Zustandsschwellen.
const STRAIGHT_ACCEPT = 0.70;   // Geradheit-Untergrenze für accept (Schlangenlinie bleibt darunter)
const STRAIGHT_REJECT = 0.45;   // darunter → reject (klare Kurve/Schlangenlinie)
const ACCEPT_CONF = 0.62;
const REJECT_CONF = 0.42;

export type CandidateState = 'reject' | 'pending' | 'accept';
export interface CornerFactors {
  angle: number; straightBefore: number; straightAfter: number;
  support: number; accuracy: number; bearing: number; legLength: number;
}
export interface CornerCandidate {
  state: CandidateState;
  confidence: number;
  kind: CornerKind | null;
  angleDeg: number;
  reason: string | null;   // Grund bei reject/pending (z. B. 'deadzone', 'short_legs', 'curve')
  factors: CornerFactors;
}

const ZERO_FACTORS: CornerFactors = { angle: 0, straightBefore: 0, straightAfter: 0, support: 0, accuracy: 0, bearing: 0, legLength: 0 };

function normalizeDeg(degrees: number): number {
  while (degrees > 180) degrees -= 360;
  while (degrees < -180) degrees += 360;
  return degrees;
}
function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }
function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Indizes eines Schenkels innerhalb STRAIGHT_WINDOW_M ab dem Scheitel (vor/nach).
function legIndices(points: readonly AutoCornerPoint[], apexIndex: number, forward: boolean): number[] {
  const apex = points[apexIndex];
  const idxs = [apexIndex];
  if (forward) {
    let i = apexIndex;
    while (i < points.length - 1 && points[i + 1].cumDist - apex.cumDist <= STRAIGHT_WINDOW_M) { i++; idxs.push(i); }
  } else {
    let i = apexIndex;
    while (i > 0 && apex.cumDist - points[i - 1].cumDist <= STRAIGHT_WINDOW_M) { i--; idxs.push(i); }
    idxs.reverse();
  }
  return idxs;
}

// Anteil „gerader" Segmente eines Schenkels (robust ggü. einzelnen Ausreißern:
// je länger der Schenkel, desto weniger kippt ein schlechter Punkt das Ergebnis).
// Schlangenlinien/Kurven haben VIELE abweichende Segmente → niedriger Anteil.
export function legStraightness(points: readonly AutoCornerPoint[], idxs: number[]): number {
  if (idxs.length < 3) return 0;   // < 2 Segmente → nicht bestätigbar
  const chord = calculateHeading(points[idxs[0]], points[idxs[idxs.length - 1]]);
  let aligned = 0, total = 0;
  for (let k = 0; k < idxs.length - 1; k++) {
    const h = calculateHeading(points[idxs[k]], points[idxs[k + 1]]);
    total++;
    if (Math.abs(normalizeDeg(h - chord)) <= SEG_ALIGN_DEG) aligned++;
  }
  return total ? aligned / total : 0;
}

// Bearing-Stabilität: 1 − mittlere Abweichung der Segment-Headings zur Sehne.
function legBearingStability(points: readonly AutoCornerPoint[], idxs: number[]): number {
  if (idxs.length < 3) return 0.5;
  const chord = calculateHeading(points[idxs[0]], points[idxs[idxs.length - 1]]);
  let sum = 0, n = 0;
  for (let k = 0; k < idxs.length - 1; k++) {
    sum += Math.abs(normalizeDeg(calculateHeading(points[idxs[k]], points[idxs[k + 1]]) - chord));
    n++;
  }
  return n ? clamp01(1 - (sum / n) / SEG_ALIGN_DEG) : 0.5;
}

function robustAccuracyScore(points: readonly AutoCornerPoint[], idxs: number[]): number {
  const accs = idxs.map(i => (points[i].accuracy == null ? ACC_BAD_M : (points[i].accuracy as number)));
  const med = median(accs);
  if (!Number.isFinite(med)) return 0;
  if (med <= ACC_GOOD_M) return 1;
  if (med >= ACC_BAD_M) return 0;
  return clamp01((ACC_BAD_M - med) / (ACC_BAD_M - ACC_GOOD_M));
}

type Band = 'normal' | 'spitz' | null;
function bandOf(angleDeg: number): Band {
  const cls = Math.round(angleDeg);
  if (cls >= NORMAL_MIN && cls <= NORMAL_MAX) return 'normal';
  if (cls >= SPITZ_MIN && cls <= SPITZ_MAX) return 'spitz';
  return null;
}
function angleScore(angleDeg: number, band: Band): number {
  if (band === 'normal') return clamp01(1 - Math.abs(angleDeg - 90) / (NORMAL_MAX - 90));
  if (band === 'spitz') return clamp01(1 - Math.abs(angleDeg - 45) / (45 - SPITZ_MIN));
  return 0;
}

// Legacy-Helfer (Rückwärtskompatibilität; strikte All-Segment-Prüfung).
export function hasStableCornerLegs(
  points: readonly AutoCornerPoint[], inboundIndex: number, apexIndex: number, outboundIndex: number,
): boolean {
  return legStraightness(points, indicesBetween(inboundIndex, apexIndex)) >= STRAIGHT_ACCEPT
    && legStraightness(points, indicesBetween(apexIndex, outboundIndex)) >= STRAIGHT_ACCEPT;
}
function indicesBetween(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

// Bewertet einen einzelnen Kandidaten (Scheitel) zu reject | pending | accept.
export function classifyCornerCandidate(points: readonly AutoCornerPoint[], apexIndex: number): CornerCandidate {
  const apex = points[apexIndex];

  // Turn über LEG_MIN_M-Sehnen (stabile Winkelmessung).
  let inb = apexIndex;
  while (inb > 0 && apex.cumDist - points[inb].cumDist < LEG_MIN_M) inb--;
  let outb = apexIndex;
  while (outb < points.length - 1 && points[outb].cumDist - apex.cumDist < LEG_MIN_M) outb++;
  const inLen = apex.cumDist - points[inb].cumDist;
  const outLen = points[outb].cumDist - apex.cumDist;
  if (inLen < LEG_MIN_M || outLen < LEG_MIN_M) {
    return { state: 'pending', confidence: 0, kind: null, angleDeg: NaN, reason: 'short_legs', factors: ZERO_FACTORS };
  }

  const diff = normalizeDeg(calculateHeading(apex, points[outb]) - calculateHeading(points[inb], apex));
  const magnitude = Math.abs(diff);
  if (magnitude < MIN_TURN_DEG) {
    return { state: 'reject', confidence: 0, kind: null, angleDeg: 180 - magnitude, reason: 'no_turn', factors: ZERO_FACTORS };
  }
  const angleDeg = 180 - magnitude;
  const band = bandOf(angleDeg);
  const direction: 'rechts' | 'links' = diff > 0 ? 'rechts' : 'links';
  const kind: CornerKind | null = band === 'normal'
    ? direction
    : band === 'spitz'
      ? (direction === 'rechts' ? 'spitz_rechts' : 'spitz_links')
      : null;

  // Geradheit/Bearing über das erweiterte Fenster (robust ggü. einem Ausreißer).
  const beforeIdx = legIndices(points, apexIndex, false);
  const afterIdx = legIndices(points, apexIndex, true);
  const straightBefore = legStraightness(points, beforeIdx);
  const straightAfter = legStraightness(points, afterIdx);
  const support = clamp01((beforeIdx.length + afterIdx.length - 2) / (SUPPORT_TARGET * 2));
  const accuracy = robustAccuracyScore(points, [...beforeIdx, ...afterIdx]);
  const bearing = (legBearingStability(points, beforeIdx) + legBearingStability(points, afterIdx)) / 2;
  const legLength = clamp01(Math.min(inLen, outLen) / LEG_MIN_M);

  const factors: CornerFactors = {
    angle: angleScore(angleDeg, band),
    straightBefore, straightAfter, support, accuracy, bearing, legLength,
  };
  const confidence =
    WEIGHTS.angle * factors.angle +
    WEIGHTS.straightBefore * straightBefore +
    WEIGHTS.straightAfter * straightAfter +
    WEIGHTS.support * support +
    WEIGHTS.accuracy * accuracy +
    WEIGHTS.bearing * bearing +
    WEIGHTS.legLength * legLength;

  const minStraight = Math.min(straightBefore, straightAfter);
  let state: CandidateState;
  let reason: string | null = null;
  if (!kind) { state = 'reject'; reason = 'deadzone'; }
  else if (minStraight < STRAIGHT_REJECT || confidence < REJECT_CONF) { state = 'reject'; reason = 'curve'; }
  else if (minStraight >= STRAIGHT_ACCEPT && confidence >= ACCEPT_CONF) { state = 'accept'; }
  else { state = 'pending'; reason = 'low_confidence'; }

  return { state, confidence, kind, angleDeg, reason, factors };
}

// Bester Kandidat über den Puffer (für Tests/Diagnose). Wählt bei mehreren
// Accepts die höchste Confidence; sonst den „besten" Pending, sonst Reject.
export function evaluateBestCorner(
  points: readonly AutoCornerPoint[], lastCornerDistanceM: number,
): { apexIndex: number; candidate: CornerCandidate } | null {
  if (points.length < 3) return null;
  const latest = points[points.length - 1];
  let bestAccept: { apexIndex: number; candidate: CornerCandidate } | null = null;
  let bestOther: { apexIndex: number; candidate: CornerCandidate } | null = null;
  for (let apexIndex = points.length - 2; apexIndex > 0; apexIndex--) {
    const apex = points[apexIndex];
    if (latest.cumDist - apex.cumDist < LEG_MIN_M) continue;              // Auslauf noch zu kurz
    if (apex.cumDist - lastCornerDistanceM < CORNER_GAP_M) break;        // zu nah am letzten Winkel
    const candidate = classifyCornerCandidate(points, apexIndex);
    if (candidate.state === 'accept') {
      if (!bestAccept || candidate.confidence > bestAccept.candidate.confidence) bestAccept = { apexIndex, candidate };
    } else if (!bestOther || candidate.confidence > bestOther.candidate.confidence) {
      bestOther = { apexIndex, candidate };
    }
  }
  return bestAccept ?? bestOther;
}

// Öffentliche Detektion: liefert NUR akzeptierte Winkel (Recorder erzeugt daraus
// den Marker). Pending/Reject → null; bei „pending" sammelt der Recorder beim
// nächsten Fix mehr Punkte und bewertet erneut. Signatur unverändert (+confidence).
export function detectAutoCorner(
  points: readonly AutoCornerPoint[],
  lastCornerDistanceM: number,
): AutoCorner | null {
  const best = evaluateBestCorner(points, lastCornerDistanceM);
  if (!best || best.candidate.state !== 'accept' || !best.candidate.kind) return null;
  return {
    apex: points[best.apexIndex],
    kind: best.candidate.kind,
    angleDeg: best.candidate.angleDeg,
    confidence: best.candidate.confidence,
  };
}

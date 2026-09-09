// STOP-ASSISTED FINAL CORNER FLUSH — der letzte Winkel am Fährtenende.
//
// ANLASS (reale Golden-Field-Route, buildexpo.MP4): der letzte Spitzwinkel (SL)
// hat nur ~1,25 m Nachlauf. Die laufende Erkennung
// (shortLegCornerDetection.ts) verlangt zu Recht auf BEIDEN Seiten ein
// stabiles Schenkelfenster von mindestens MIN_LEG_M = 2,0 m — deshalb kann sie
// diesen Winkel prinzipiell nicht bestätigen, egal wie gut das GPS ist.
//
// WARUM NICHT EINFACH DIE MINDEST-NACHLAUFSTRECKE SENKEN:
// Das würde die Anforderung auf der GESAMTEN Fährte absenken und damit
// mitten im Lauf jede Drift-Beule zu einem Winkelkandidaten machen. Der
// Nachlauf ist während der Aufnahme das einzige Signal dafür, dass die neue
// Richtung wirklich gehalten wird.
//
// DIE IDEE: das ausdrückliche Session-ENDE ist selbst eine Information, die
// während der Aufnahme nicht zur Verfügung steht. Nach dem Stop ist bekannt,
// dass der kurze Nachlauf nicht „noch nicht fertig", sondern vollständig ist.
// Deshalb — und NUR beim ausdrücklichen Stop, genau EINMAL — darf ein noch
// offener letzter Kandidat ein zweites Mal bewertet werden, mit einem kürzeren
// Nachlauf, dafür STRENGEREN Anforderungen an alles andere:
//   • die Geometrie VOR dem Scheitel muss voll stabil sein (unverändert),
//   • die Richtungsänderung muss deutlicher sein (minTurnDeg > MIN_TURN_DEG),
//   • das Signal-Rausch-Verhältnis muss höher sein (> MIN_TURN_TO_NOISE),
//   • die Drehung muss konzentrierter sein,
//   • die Gesamt-Evidenz muss über einer höheren Schwelle liegen.
//
// HARTE ZUSAGE: Stop erfindet nie einen Winkel. Ohne klassifizierbare
// Geometrie gibt diese Funktion `null` zurück — das Ende allein erzeugt
// nichts.
//
// Diese Datei verändert den laufenden Detektor NICHT und wird von ihm nicht
// aufgerufen. Sie ist ein eigener, einmaliger Schritt am Sessionende.

import {
  robustBearing, stableLegWindow,
  MIN_LEG_M, MIN_TURN_DEG, MIN_TURN_TO_NOISE, MIN_TURN_CONCENTRATION,
  TURN_CONCENTRATION_M, CORNER_GAP_M, NORMAL_MIN, NORMAL_MAX, SPITZ_MIN, SPITZ_MAX,
  ACC_GOOD_M, ACC_BAD_M, STRAIGHT_TOL_DEG,
  type ShortLegPoint,
} from '@/features/tracking/utils/shortLegCornerDetection';
import type { AngleKind } from '@/features/tracking/store/trackingStore';

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function normalizeDeg(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export interface StopFlushParams {
  /** Kürzester Nachlauf, der überhaupt bewertet wird (m). */
  minTailM: number;
  /** Punkte im Nachlauf (inkl. Scheitel). */
  minTailSamples: number;
  /** Weiter als dieser Abstand vom Ende wird nicht gesucht — dort ist die
   *  laufende Erkennung zuständig. */
  maxTailM: number;
  /** Mindest-Richtungsänderung. Strenger als MIN_TURN_DEG. */
  minTurnDeg: number;
  /** Mindest-Verhältnis Änderung zu Schenkelstreuung. Strenger als MIN_TURN_TO_NOISE. */
  minTurnToNoise: number;
  /** Mindest-Konzentration der Drehung am Scheitel. */
  minConcentration: number;
  /** Mindest-Evidenz. Strenger als ACCEPT_SCORE. */
  acceptScore: number;
}

export const STOP_FLUSH_DEFAULTS: StopFlushParams = {
  // 0,75 m statt 1,0 m — GEMESSEN, nicht geschätzt: im Parameter-Sweep
  // (stopFlushCorner.test.ts) holt dieser Wert den 1,5-m-Nachlauf zurück und
  // kostet in der gesamten False-Positive-Batterie exakt null zusätzliche
  // Winkel. Der reale 1,25-m-Fall bleibt auch damit unerreichbar (siehe
  // Matrix) — das ist die dokumentierte Grenze, kein Ziel zum Weiterdrehen.
  minTailM: 0.75,
  minTailSamples: 3,
  maxTailM: 4.5,
  minTurnDeg: 45,          // ACCEPT: MIN_TURN_DEG = 35
  minTurnToNoise: 2.6,     // ACCEPT: MIN_TURN_TO_NOISE = 2.2
  minConcentration: 0.55,  // ACCEPT: MIN_TURN_CONCENTRATION = 0.5
  acceptScore: 0.70,       // ACCEPT: ACCEPT_SCORE = 0.62
};

export type StopFlushReject =
  | 'too_few_points' | 'no_candidate_in_tail' | 'too_close_to_previous'
  | 'no_window_before' | 'tail_too_short' | 'tail_too_few_samples'
  | 'no_tail_bearing' | 'no_turn' | 'turn_below_noise' | 'turn_not_concentrated'
  | 'angle_unclear' | 'low_evidence';

export interface StopFlushDiagnostics {
  apexIndex: number | null;
  t: number | null;
  atM: number | null;
  legBeforeM: number | null;
  tailM: number | null;
  tailSamples: number | null;
  bearingBefore: number | null;
  bearingAfter: number | null;
  headingDeltaDeg: number | null;
  interiorAngleDeg: number | null;
  spreadBeforeDeg: number | null;
  spreadTailDeg: number | null;
  turnConcentration: number | null;
  accuracyM: number | null;
  confidence: number;
  classification: AngleKind | null;
  rejectReason: StopFlushReject | null;
}

export interface StopFlushResult {
  corner: { kind: AngleKind; apexIndex: number; atM: number } | null;
  diagnostics: StopFlushDiagnostics;
}

/**
 * Wie weit ist ein Kandidat gekommen? Der Rückgabewert meldet die Ablehnung
 * des am WEITESTEN gekommenen Kandidaten — sonst überschreibt der letzte
 * (vom Ende am weitesten entfernte) Kandidat die eigentlich interessante
 * Begründung, und die Diagnose zeigt dauerhaft `too_close_to_previous`.
 */
const REJECT_RANK: Record<StopFlushReject, number> = {
  too_few_points: 0, no_candidate_in_tail: 0, too_close_to_previous: 1,
  no_window_before: 2, tail_too_short: 3, tail_too_few_samples: 4,
  no_tail_bearing: 5, no_turn: 6, turn_below_noise: 7,
  turn_not_concentrated: 8, angle_unclear: 9, low_evidence: 10,
};

function emptyDiag(reason: StopFlushReject): StopFlushDiagnostics {
  return {
    apexIndex: null, t: null, atM: null, legBeforeM: null, tailM: null, tailSamples: null,
    bearingBefore: null, bearingAfter: null, headingDeltaDeg: null, interiorAngleDeg: null,
    spreadBeforeDeg: null, spreadTailDeg: null, turnConcentration: null, accuracyM: null,
    confidence: 0, classification: null, rejectReason: reason,
  };
}

/** Streuung der Segment-Richtungen zwischen zwei Indizes (Grad). */
function segmentSpread(points: readonly ShortLegPoint[], fromIdx: number, toIdx: number): number {
  const lo = Math.min(fromIdx, toIdx), hi = Math.max(fromIdx, toIdx);
  if (hi - lo < 2) return 0;
  const mPerLat = 111320;
  const bearings: number[] = [];
  for (let i = lo; i < hi; i++) {
    const mPerLng = 111320 * Math.cos((points[i].lat * Math.PI) / 180);
    const dx = (points[i + 1].lng - points[i].lng) * mPerLng;
    const dy = (points[i + 1].lat - points[i].lat) * mPerLat;
    if (Math.hypot(dx, dy) < 1e-6) continue;
    bearings.push((Math.atan2(dx, dy) * 180) / Math.PI);
  }
  if (bearings.length < 2) return 0;
  let sx = 0, sy = 0;
  for (const b of bearings) { sx += Math.cos((b * Math.PI) / 180); sy += Math.sin((b * Math.PI) / 180); }
  const r = Math.hypot(sx, sy) / bearings.length;
  // Kreisförmige Standardabweichung in Grad.
  return (Math.sqrt(Math.max(0, -2 * Math.log(Math.max(1e-9, r)))) * 180) / Math.PI;
}

/**
 * Wählt die Punkte für die Nachlauf-Richtung. Ohne `rawTail` ist es derselbe
 * (geglättete) Puffer wie sonst; mit `rawTail` werden die ungeglätteten Fixe ab
 * dem Scheitel-Weg verwendet.
 */
function pickTail(
  points: readonly ShortLegPoint[], apexIndex: number, rawTail?: readonly ShortLegPoint[] | null,
): { points: readonly ShortLegPoint[]; fromIdx: number; toIdx: number } {
  if (!rawTail || rawTail.length < 2) {
    return { points, fromIdx: apexIndex, toIdx: points.length - 1 };
  }
  // Ausrichtung über die ZEIT, nicht über cumDist: der geglättete Pfad ist
  // kürzer als der rohe, die beiden cumDist-Skalen sind also nicht vergleichbar.
  const apexT = points[apexIndex].t;
  if (apexT == null) return { points, fromIdx: apexIndex, toIdx: points.length - 1 };
  let from = 0;
  while (from < rawTail.length - 1 && (rawTail[from].t ?? 0) < apexT) from++;
  if (rawTail.length - 1 - from < 1) {
    return { points, fromIdx: apexIndex, toIdx: points.length - 1 };
  }
  return { points: rawTail, fromIdx: from, toIdx: rawTail.length - 1 };
}

/** Index des ersten Punkts, der mindestens `spanM` vor `apexIndex` liegt. */
function backIndexForSpan(points: readonly ShortLegPoint[], apexIndex: number, spanM: number): number {
  let i = apexIndex;
  while (i > 0 && points[apexIndex].cumDist - points[i].cumDist < spanM) i--;
  return i;
}

/**
 * EINMALIGE Bewertung am ausdrücklichen Sessionende.
 *
 * @param points        derselbe Detektor-Puffer, den die laufende Erkennung nutzt
 * @param lastCornerAtM cumDist des zuletzt bestätigten Winkels (-Infinity = keiner)
 */
export function evaluateStopFlush(
  points: readonly ShortLegPoint[],
  lastCornerAtM: number,
  params: StopFlushParams = STOP_FLUSH_DEFAULTS,
  rawTail?: readonly ShortLegPoint[] | null,
): StopFlushResult {
  const n = points.length;
  if (n < 4) return { corner: null, diagnostics: emptyDiag('too_few_points') };

  const endDist = points[n - 1].cumDist;

  // Kandidaten im Nachlauf-Bereich, vom Ende nach hinten. Der stärkste
  // (grösste Richtungsänderung mit ausreichender Evidenz) gewinnt.
  let best: { diag: StopFlushDiagnostics; kind: AngleKind; apexIndex: number; atM: number } | null = null;
  let lastReject: StopFlushReject = 'no_candidate_in_tail';
  let bestReject: StopFlushDiagnostics | null = null;
  const note = (reason: StopFlushReject, diag?: StopFlushDiagnostics) => {
    if (REJECT_RANK[reason] >= REJECT_RANK[lastReject]) {
      lastReject = reason;
      bestReject = diag ? { ...diag, rejectReason: reason } : null;
    }
    return reason;
  };

  for (let i = n - 2; i > 0; i--) {
    const tailM = endDist - points[i].cumDist;
    if (tailM > params.maxTailM) break;          // weiter hinten ist die laufende Erkennung zuständig
    if (tailM <= 0) continue;

    const apex = points[i];
    if (apex.cumDist - lastCornerAtM < CORNER_GAP_M) { note('too_close_to_previous'); continue; }

    // Vor dem Scheitel gilt die UNVERÄNDERTE Anforderung.
    const before = stableLegWindow(points, i, false);
    if (!before) { note('no_window_before'); continue; }

    if (tailM < params.minTailM) { note('tail_too_short'); continue; }
    const tailSamples = n - i;
    if (tailSamples < params.minTailSamples) { note('tail_too_few_samples'); continue; }

    // Nachlauf-Richtung: optional aus den UNGEGLÄTTETEN Fixen. Grund (gemessen,
    // siehe stopFlushCorner.test.ts): über 1,25 m hat die Glättung des
    // Detektor-Puffers (EMA 0,7 + 0,5-m-Gate) die neue Richtung noch gar nicht
    // eingeholt — der Fit zeigt dort nur ~10° statt 135°. Die Glättung ist auf
    // der langen Strecke richtig, am abrupten Ende aber genau der Fehler.
    // Rauschen ist im Nachlauf zweitrangig, weil die Strenge-Kriterien
    // (Turn-to-Noise, Konzentration, Evidenz) unverändert darüber liegen.
    const tailPts = pickTail(points, i, rawTail);
    const afterFit = robustBearing(tailPts.points, tailPts.fromIdx, tailPts.toIdx);
    if (!afterFit) { note('no_tail_bearing'); continue; }

    const spreadTail = segmentSpread(tailPts.points, tailPts.fromIdx, tailPts.toIdx);
    const headingDelta = normalizeDeg(afterFit.deg - before.bearingDeg);
    const magnitude = Math.abs(headingDelta);
    const interior = 180 - magnitude;

    const diag: StopFlushDiagnostics = {
      apexIndex: i, t: apex.t ?? null, atM: Math.round(apex.cumDist * 100) / 100,
      legBeforeM: Math.round(before.lengthM * 100) / 100,
      tailM: Math.round(tailM * 100) / 100, tailSamples,
      bearingBefore: Math.round(before.bearingDeg * 10) / 10,
      bearingAfter: Math.round(afterFit.deg * 10) / 10,
      headingDeltaDeg: Math.round(headingDelta * 10) / 10,
      interiorAngleDeg: Math.round(interior * 10) / 10,
      spreadBeforeDeg: Math.round(before.spreadDeg * 10) / 10,
      spreadTailDeg: Math.round(spreadTail * 10) / 10,
      turnConcentration: null, accuracyM: apex.accuracy,
      confidence: 0, classification: null, rejectReason: null,
    };

    if (magnitude < params.minTurnDeg) { diag.rejectReason = note('no_turn', diag); continue; }

    const noiseDeg = Math.max(before.spreadDeg, spreadTail, 4);
    if (magnitude < noiseDeg * params.minTurnToNoise) { diag.rejectReason = note('turn_below_noise', diag); continue; }

    // Konzentration: findet die Drehung unmittelbar am Scheitel statt, oder
    // ist sie über den ganzen Einlauf verteilt (Bogen/Drift)?
    const shortBeforeIdx = backIndexForSpan(points, i, TURN_CONCENTRATION_M);
    const shortBefore = robustBearing(points, shortBeforeIdx, i);
    const shortTurn = shortBefore ? Math.abs(normalizeDeg(afterFit.deg - shortBefore.deg)) : 0;
    const concentration = magnitude > 0 ? clamp01(shortTurn / magnitude) : 0;
    diag.turnConcentration = Math.round(concentration * 1000) / 1000;
    if (concentration < params.minConcentration) { diag.rejectReason = note('turn_not_concentrated', diag); continue; }

    const dir: 'links' | 'rechts' = headingDelta > 0 ? 'rechts' : 'links';
    let kind: AngleKind | null = null;
    if (interior >= NORMAL_MIN && interior <= NORMAL_MAX) kind = dir;
    else if (interior >= SPITZ_MIN && interior <= SPITZ_MAX) kind = dir === 'rechts' ? 'spitz_rechts' : 'spitz_links';
    if (!kind) { diag.rejectReason = note('angle_unclear', diag); continue; }
    diag.classification = kind;

    // Evidenz — dieselben Faktoren wie im laufenden Detektor, zusätzlich mit
    // einem eigenen Nachlauf-Anteil: je kürzer der Nachlauf, desto weniger
    // Evidenz. Ein 1,25-m-Nachlauf muss den Rest also klar kompensieren.
    const lengthScore = clamp01((before.lengthM - MIN_LEG_M) / (4.5 - MIN_LEG_M)) * 0.75 + 0.25;
    const tailScore = clamp01((tailM - params.minTailM) / (MIN_LEG_M - params.minTailM)) * 0.5 + 0.5;
    const sampleScore = clamp01((Math.min(before.sampleCount, tailSamples) - 1) / 3);
    const straightScore = clamp01(1 - Math.max(before.spreadDeg, spreadTail) / STRAIGHT_TOL_DEG);
    const turnScore = clamp01((magnitude - params.minTurnDeg) / 55);
    const concScore = clamp01((concentration - params.minConcentration) / (1 - params.minConcentration));
    const acc = apex.accuracy;
    const accScore = acc == null ? 0.5 : clamp01((ACC_BAD_M - acc) / (ACC_BAD_M - ACC_GOOD_M));

    const confidence = clamp01(
      0.20 * lengthScore + 0.16 * tailScore + 0.18 * sampleScore +
      0.20 * straightScore + 0.14 * turnScore + 0.06 * concScore + 0.06 * accScore,
    );
    diag.confidence = Math.round(confidence * 1000) / 1000;
    if (confidence < params.acceptScore) { diag.rejectReason = note('low_evidence', diag); continue; }

    if (!best || magnitude > Math.abs(best.diag.headingDeltaDeg ?? 0)) {
      best = { diag, kind, apexIndex: i, atM: apex.cumDist };
    }
  }

  if (!best) return { corner: null, diagnostics: bestReject ?? emptyDiag(lastReject) };
  return { corner: { kind: best.kind, apexIndex: best.apexIndex, atM: best.atM }, diagnostics: best.diag };
}

/** Nur zur Sicherheit im Aufrufer: MIN_TURN_* des laufenden Detektors bleiben unangetastet. */
export const STOP_FLUSH_IS_STRICTER =
  STOP_FLUSH_DEFAULTS.minTurnDeg > MIN_TURN_DEG &&
  STOP_FLUSH_DEFAULTS.minTurnToNoise > MIN_TURN_TO_NOISE &&
  STOP_FLUSH_DEFAULTS.minConcentration > MIN_TURN_CONCENTRATION;

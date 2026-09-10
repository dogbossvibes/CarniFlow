// ──────────────────────────────────────────────────────────────────────────
// Adaptive Short-Leg Corner Detection.
//
// ANLASS (realer Feldtest, Wald-/Waldrand, BUILD40 + EXPO): das Laufschema
// Start → L → 5 Schritte → R → 5 Schritte → SR → 5 Schritte → SL → Stop
// ergibt bei 75 cm Schrittlänge Zwischenschenkel von nur ~3,75 m. Beide
// bisherigen Engines konnten das NICHT erkennen — nachgerechnet, nicht
// vermutet:
//
//   1. Punktdichte: der Lege-Recorder gibt Linienpunkte erst ab
//      MIN_STEP_M = 2,0 m frei. Ein 3,75-m-Schenkel enthält damit ~1
//      akzeptierten Punkt; die komplette Vier-Winkel-Fährte (5 × 3,75 m)
//      bestand aus 5 Punkten. Mit einem Punkt pro Schenkel lässt sich vorher/
//      nachher gar keine Richtung messen — das ist kein Schwellenwert-, das
//      ist ein Informationsproblem.
//   2. Harte Untergrenze: classifyCornerCandidate verlangt
//      inLen >= LEG_MIN_M (4 m) UND outLen >= LEG_MIN_M. 3,75 m fällt
//      unabhängig von jeder Punktdichte IMMER in 'short_legs'. BUILD40
//      verlangt mit LEG_MIN_M = 4 m dasselbe.
//
// LÖSUNG: keine simple Absenkung der Konstante (4 → 2 würde GPS-Zickzack und
// Drift in Winkel verwandeln), sondern eine mehrskalige Auswertung, deren
// Mindest-Evidenz aus MEHREREN Faktoren entsteht: zurückgelegte Strecke,
// Anzahl unabhängiger Punkte, Stabilität der Vorher-/Nachher-Richtung,
// Konzentration der Richtungsänderung, GPS-Genauigkeit und optional Motion.
// Keine einzelne Meterzahl entscheidet allein.
//
//   3. Glättung: der Linien-EMA (EMA_ALPHA = 0,4) rundet eine Ecke über
//      ~2 m ab — bei einem 3,75-m-Schenkel ist das mehr als die halbe
//      Geometrie. Gemessen an derselben Route ergab das Heading-Deltas von
//      −72°/8°/55°/126° statt −90°/90°/135°/−128°: die Winkel sind nach der
//      Glättung schlicht nicht mehr im Signal. Mit leichter Glättung (0,7)
//      liegen alle vier korrekt.
//
// EINGABE-VERTRAG DIESES DETEKTORS (siehe DETECTOR_INPUT):
// leicht geglättete Fixe (EMA ~0,7) mit feinem Distanz-Gate (~0,75 m ≈ ein
// Schritt). Die AUFGEZEICHNETE Linie bleibt davon unberührt — sie behält ihre
// ruhige Glättung und ihr 2-m-Gate; der Detektor bekommt lediglich einen
// eigenen, dichteren Puffer derselben Fixe.
//
// Reine Funktion, kein React/Native — vollständig testbar. Verändert weder
// Recorder-Linie, Persistenz, Auswertung noch Search-/Start-Logik.
// ──────────────────────────────────────────────────────────────────────────
import { calculateHeading, calculateDistance } from '@/features/tracking/utils/gpsFilter';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import { applyMotionToConfidence, type TurnEvidence } from '@/features/tracking/utils/motionTurnEvidence';

/**
 * Nachschlagefunktion für die Core-Motion-Turn-Evidenz zu einem Kandidaten-
 * Zeitpunkt. Wird von aussen hereingereicht (der Detector kennt Core Motion
 * nicht selbst). Fehlt sie oder liefert sie `null`, bleibt die Confidence
 * exakt wie zuvor — der gesamte bisherige Pfad ist damit unverändert.
 */
export type TurnEvidenceLookup = (tMs: number | null) => TurnEvidence | null | undefined;

export interface ShortLegPoint {
  lat: number; lng: number;
  cumDist: number;
  accuracy: number | null;
  t?: number;
}

/** Optionale Bewegungs-Evidenz (Core Motion). Niemals allein ausschlaggebend. */
export interface ShortLegMotion {
  /** Bewegt sich der Handler nachweislich zu Fuss? */
  walking: boolean;
  /** 0..1 — Verlässlichkeit der Motion-Klassifikation. */
  confidence: number;
  /** Schritte seit dem letzten Fix, falls verfügbar. */
  stepDelta?: number | null;
}

// ── Skalen ────────────────────────────────────────────────────────────────
// Mehrskalige Auswertung: das Schenkelfenster wächst, solange die Richtung
// stabil bleibt. Dadurch nutzt ein 10-m-Schenkel automatisch eine lange
// Basislinie, ein 3,75-m-Schenkel eine kurze — ohne feste Meterzahl.
export const SCALES_M = [2.0, 2.75, 3.5, 4.5, 6.0, 8.0] as const;

/**
 * Eingabe-Vertrag: so muss der Fix-Strom aufbereitet sein, den dieser
 * Detektor sieht. Bewusst NICHT die Werte der aufgezeichneten Linie
 * (EMA 0,4 / Gate 2,0 m) — siehe Kopfkommentar Punkt 1 und 3.
 */
export const DETECTOR_INPUT = {
  /** Leichte Glättung des Roh-Stroms: hält Rauschen fern, ohne Ecken abzurunden. */
  emaAlpha: 0.7,
  /** Distanz-Gate des Roh-Puffers im Recorder (Vorfilter). */
  minStepM: 0.5,

} as const;

/** Absolute Untergrenze: darunter ist Geometrie nicht mehr sinnvoll messbar. */
export const MIN_LEG_M = 2.0;
/** Unabhängige Punkte je Schenkel — kurze Schenkel brauchen relativ MEHR Belege. */
export const MIN_SAMPLES_SHORT = 3;   // Fenster < 4,5 m
export const MIN_SAMPLES_LONG = 2;    // Fenster >= 4,5 m
/** Maximale Streuung der Segment-Richtungen — nur noch Diagnose, kein Gate. */
export const STRAIGHT_TOL_DEG = 26;
/**
 * OFFENER BEFUND (10-Hz-Ausfall, nicht gelöst):
 * Das Geradheits-Gate benutzt die maximale Streuung der SEGMENT-Richtungen
 * (STRAIGHT_TOL_DEG). Diese ist abtastdichteabhängig — bei 0,58 m
 * Punktabstand (10 Hz) streuen benachbarte Segment-Bearings schon durch
 * minimale Wackler so stark, dass Fenster verworfen werden: gemessen
 * scheiterten 27 von 29 Kandidaten an `no_window_before/after`.
 *
 * Der naheliegende Ersatz — das Median-Residuum der robusten
 * Ausgleichsgeraden in Metern, das dichteunabhängig wäre — wurde
 * implementiert und GEMESSEN VERWORFEN: mit diesem Schwellenwert fielen
 * auch legitime kurze Schenkel durch (Längenmatrix 0/4 bis 6 m). Warum das
 * Residuum auf geraden Kurzschenkeln so hoch ausfällt, ist noch nicht
 * geklärt — das ist der nächste konkrete Ansatzpunkt.
 */
export const MAX_FIT_RESIDUAL_M = 0.35;
/** Fenstergrösse (m) für die Messung der Änderung unmittelbar am Scheitel. */
export const TURN_CONCENTRATION_M = 2.5;
/**
 * Anteil der Gesamtänderung, der im kurzen Scheitelfenster liegen muss.
 * Echte Ecke: nahezu 1. Gleichmässiger Bogen/Drift: deutlich darunter.
 */
export const MIN_TURN_CONCENTRATION = 0.5;
/** Segmente unter dieser Länge tragen keine verlässliche Richtung (Stand-Jitter). */
export const MICRO_SEGMENT_M = 0.4;
/** Mindest-Richtungsänderung, darunter ist es keine Ecke. */
export const MIN_TURN_DEG = 35;
/** Genauigkeitsfenster für den Accuracy-Faktor. */
export const ACC_GOOD_M = 10, ACC_BAD_M = 35;
/** Innenwinkel-Bänder (identisch zur bestehenden Klassifikation). */
export const NORMAL_MIN = 65, NORMAL_MAX = 115;
export const SPITZ_MIN = 15, SPITZ_MAX = 60;
/** Mindestabstand zum zuletzt bestätigten Winkel. */
export const CORNER_GAP_M = 2.0;
/** Gesamt-Evidenz, ab der ein Kandidat angenommen wird. */
export const ACCEPT_SCORE = 0.62;
/**
 * Signal-Rausch-Kriterium: die Richtungsänderung muss deutlich grösser sein
 * als die Richtungsstreuung der beiden Schenkel. Genau daran scheitert
 * korrelierte GNSS-Drift — dort „biegt" der scheinbare Pfad zwar, aber die
 * Schenkel selbst streuen dann ebenso stark. Ein echter 90°-Knick hat
 * dagegen ruhige Schenkel und eine grosse Änderung dazwischen. Dieses
 * Verhältnis ersetzt eine starre Winkel-Schwelle.
 */
export const MIN_TURN_TO_NOISE = 2.2;

/**
 * ROBUSTE LOKALE RICHTUNGSSCHÄTZUNG (gewichtete Regression mit Huber-Gewichten).
 *
 * Statt einzelner Punkt-zu-Punkt-Bearings wird eine Gerade durch ALLE Punkte
 * des Fensters gelegt: erst gewichtete Hauptachse (Total Least Squares über
 * die Kovarianz), dann zwei Huber-Iterationen, die Ausreisser herunterwichten.
 * Genauigkeit geht nur als GEWICHT ein (schlechtere Fixe zählen weniger) —
 * niemals als Verschiebung einer Koordinate.
 *
 * Wirkung gegen korrelierte Drift: eine seitlich mitwandernde Punktwolke
 * verschiebt die gefittete Gerade, dreht sie aber deutlich weniger als ein
 * einzelnes Segment-Bearing.
 */
export function robustBearing(
  points: readonly ShortLegPoint[], fromIdx: number, toIdx: number,
): { deg: number; residualM: number; samples: number } | null {
  const lo = Math.min(fromIdx, toIdx), hi = Math.max(fromIdx, toIdx);
  const n = hi - lo + 1;
  if (n < 2) return null;

  // Lokale Meter-Koordinaten relativ zum ersten Punkt (kleine Distanzen).
  const lat0 = points[lo].lat;
  const mPerLat = 111320, mPerLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  const xs: number[] = [], ys: number[] = [], w0: number[] = [];
  for (let i = lo; i <= hi; i++) {
    xs.push((points[i].lng - points[lo].lng) * mPerLng);
    ys.push((points[i].lat - points[lo].lat) * mPerLat);
    const a = points[i].accuracy;
    // Genauigkeit als Gewicht: gute Fixe zählen mehr, schlechte weniger.
    w0.push(a == null ? 1 : clamp01(ACC_BAD_M / Math.max(ACC_GOOD_M, a)));
  }

  let w = w0.slice();
  let deg = 0, residual = 0;
  for (let iter = 0; iter < 3; iter++) {
    let sw = 0, mx = 0, my = 0;
    for (let i = 0; i < n; i++) { sw += w[i]; mx += w[i] * xs[i]; my += w[i] * ys[i]; }
    if (sw <= 0) return null;
    mx /= sw; my /= sw;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      sxx += w[i] * dx * dx; syy += w[i] * dy * dy; sxy += w[i] * dx * dy;
    }
    // Hauptachse der gewichteten Kovarianz (Total Least Squares).
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(theta), uy = Math.sin(theta);
    // Residuen = senkrechter Abstand zur Geraden.
    const res: number[] = [];
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - mx, dy = ys[i] - my;
      res.push(Math.abs(dx * -uy + dy * ux));
    }
    const sorted = [...res].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 0;
    residual = med;
    // Huber: ab dem 1.5-fachen Median wird linear statt quadratisch gewichtet.
    const k = Math.max(0.35, 1.5 * med);
    for (let i = 0; i < n; i++) w[i] = w0[i] * (res[i] <= k ? 1 : k / res[i]);
    // Richtung entlang der Hauptachse, orientiert in Laufrichtung.
    const along = (xs[n - 1] - xs[0]) * ux + (ys[n - 1] - ys[0]) * uy;
    const dirX = along >= 0 ? ux : -ux, dirY = along >= 0 ? uy : -uy;
    deg = ((Math.atan2(dirX, dirY) * 180) / Math.PI + 360) % 360;
  }
  return { deg, residualM: residual, samples: n };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function normalizeDeg(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Richtungs-Mittel über alle Segmente eines Fensters (Vektormittel, 0/360-fest).
 * IMMER in LAUFRICHTUNG, also aufsteigend über die Indizes — auch für das
 * Fenster VOR dem Scheitel. (Eine rückwärts gerechnete Vorher-Richtung würde
 * jeden Heading-Delta um 180° verfälschen: gerade Strecken landeten dann im
 * Spitzwinkel-Band und erzeugten massenhaft Falscherkennungen.)
 */
function meanBearing(points: readonly ShortLegPoint[], from: number, to: number): { deg: number; spreadDeg: number; segments: number } | null {
  let sx = 0, sy = 0, n = 0;
  const bearings: number[] = [];
  const lo = Math.min(from, to), hi = Math.max(from, to);
  for (let i = lo; i < hi; i++) {
    const a = points[i], b = points[i + 1];
    if (calculateDistance(a, b) < MICRO_SEGMENT_M) continue;
    const deg = calculateHeading(a, b);
    bearings.push(deg);
    const r = (deg * Math.PI) / 180;
    sx += Math.sin(r); sy += Math.cos(r); n++;
  }
  if (n === 0) return null;
  const mean = ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
  let spread = 0;
  for (const b of bearings) spread = Math.max(spread, Math.abs(normalizeDeg(b - mean)));
  return { deg: mean, spreadDeg: spread, segments: n };
}

/** Index in Laufrichtung (forward) bzw. zurück, höchstens `maxDistM` entfernt. */
function nearIndex(points: readonly ShortLegPoint[], apexIndex: number, forward: boolean, maxDistM: number): number {
  const apex = points[apexIndex];
  let idx = apexIndex;
  for (;;) {
    const next = idx + (forward ? 1 : -1);
    if (next < 0 || next >= points.length) break;
    const d = forward ? points[next].cumDist - apex.cumDist : apex.cumDist - points[next].cumDist;
    if (d > maxDistM) break;
    idx = next;
  }
  return idx;
}

export interface LegWindow {
  /** Index des äussersten verwendeten Punkts. */
  endIndex: number;
  lengthM: number;
  sampleCount: number;
  bearingDeg: number;
  spreadDeg: number;
  scaleM: number;
  /** Median-Residuum der Ausgleichsgeraden (m) — Mass für die Streuung um die Gerade. */
  residualM: number;
}

/**
 * Grösstes noch STABILES Schenkelfenster: wächst über die Skalen, solange die
 * Richtungsstreuung im Fenster unter der Toleranz bleibt. Dadurch endet das
 * Fenster von selbst am Nachbarwinkel — ohne feste Obergrenze.
 */
export function stableLegWindow(points: readonly ShortLegPoint[], apexIndex: number, forward: boolean): LegWindow | null {
  const apex = points[apexIndex];
  let best: LegWindow | null = null;

  for (const scale of SCALES_M) {
    // Punkte innerhalb dieser Skala einsammeln.
    let end = apexIndex;
    for (;;) {
      const next = end + (forward ? 1 : -1);
      if (next < 0 || next >= points.length) break;
      const d = forward ? points[next].cumDist - apex.cumDist : apex.cumDist - points[next].cumDist;
      if (d > scale) break;
      end = next;
    }
    const lengthM = forward ? points[end].cumDist - apex.cumDist : apex.cumDist - points[end].cumDist;
    if (lengthM < MIN_LEG_M) continue;

    const sampleCount = Math.abs(end - apexIndex) + 1;
    const needed = scale < 4.5 ? MIN_SAMPLES_SHORT : MIN_SAMPLES_LONG;
    if (sampleCount < needed) continue;

    // Richtung robust über eine gewichtete Regression durch ALLE Fensterpunkte
    // (nicht Punkt-zu-Punkt) — deutlich stabiler gegen korrelierte Drift.
    const fit = robustBearing(points, apexIndex, end);
    if (!fit) continue;
    // Geradheit über das Fit-Residuum (dichteunabhängig, s. MAX_FIT_RESIDUAL_M).
    // Die Segment-Streuung wird nur noch als Diagnosewert mitgeführt.
    const mb = meanBearing(points, apexIndex, end);
    const spread = mb ? mb.spreadDeg : 0;
    if (spread > STRAIGHT_TOL_DEG) {
      // WICHTIG: nur abbrechen, wenn bereits ein gültiges (kleineres) Fenster
      // gefunden wurde. Bricht schon die kleinste Skala, hiess das früher
      // „gar kein Fenster" — genau daran scheiterten bei 10 Hz 27 von 29
      // Kandidaten (`no_window_before/after`), obwohl ein kürzeres, sauberes
      // Fenster verfügbar gewesen wäre. Ohne Treffer wird deshalb die nächste
      // Skala geprüft statt die Suche zu beenden.
      if (best) break;
      continue;
    }

    best = { endIndex: end, lengthM, sampleCount, bearingDeg: fit.deg, spreadDeg: spread, scaleM: scale, residualM: fit.residualM };
  }
  return best;
}

export type ShortLegRejectReason =
  | 'no_window_before' | 'no_window_after' | 'too_close_to_previous'
  | 'no_turn' | 'turn_below_noise' | 'turn_not_concentrated' | 'angle_unclear' | 'low_evidence';

/** Vollständige QA-Diagnose je Kandidat (Punkt 12 der Vorgabe). */
export interface ShortLegDiagnostics {
  t: number | null;
  lat: number; lng: number;
  legBeforeM: number | null;
  legAfterM: number | null;
  sampleCountBefore: number | null;
  sampleCountAfter: number | null;
  bearingBefore: number | null;
  bearingAfter: number | null;
  headingDeltaDeg: number | null;
  interiorAngleDeg: number | null;
  classification: AngleKind | null;
  accuracyM: number | null;
  confidence: number;
  rejectReason: ShortLegRejectReason | null;
  scaleBeforeM: number | null;
  scaleAfterM: number | null;
  spreadBeforeDeg: number | null;
  spreadAfterDeg: number | null;
  turnConcentrationM: number | null;
  motionSupported: boolean;
  // ── Erweiterte Feld-Diagnose ──
  /** Punkte im Detektor-Puffer insgesamt. */
  detectorPointCount: number | null;
  /** Mittlerer räumlicher Punktabstand im Detektor-Puffer (m). */
  effectiveSpatialSpacingM: number | null;
  /** Verwendetes Richtungs-Schätzverfahren. */
  fitMethod: 'huber_tls' | null;
  /** Median-Residuum der Ausgleichsgeraden je Schenkel (m). */
  fitResidualBeforeM: number | null;
  fitResidualAfterM: number | null;
  /** Genauigkeits-gewichteter Confidence-Anteil. */
  accuracyWeightedConfidence: number | null;
  /** Tatsächlich gewählte Fensterskala (m). */
  chosenScaleM: number | null;
  // ── Motion-Confidence-Kopplung (±0,12, siehe motionTurnEvidence.ts) ──
  /** Confidence VOR der Motion-Kopplung. */
  confidenceBeforeMotion: number | null;
  /** Verschiebung durch Motion (−0,12 … +0,12). 0 = keine Motion-Daten. */
  motionAdjustment: number | null;
  /** Turn-Evidenz, die zur Verschiebung geführt hat (0..1, null = keine Daten). */
  motionTurnEvidence: number | null;
}

export interface ShortLegCandidate {
  accepted: boolean;
  kind: AngleKind | null;
  apexIndex: number;
  diagnostics: ShortLegDiagnostics;
}

function emptyDiag(p: ShortLegPoint, reason: ShortLegRejectReason): ShortLegDiagnostics {
  return {
    t: p.t ?? null, lat: p.lat, lng: p.lng,
    legBeforeM: null, legAfterM: null, sampleCountBefore: null, sampleCountAfter: null,
    bearingBefore: null, bearingAfter: null, headingDeltaDeg: null, interiorAngleDeg: null,
    classification: null, accuracyM: p.accuracy, confidence: 0, rejectReason: reason,
    scaleBeforeM: null, scaleAfterM: null, spreadBeforeDeg: null, spreadAfterDeg: null,
    turnConcentrationM: null, motionSupported: false,
    detectorPointCount: null, effectiveSpatialSpacingM: null, fitMethod: null,
    fitResidualBeforeM: null, fitResidualAfterM: null,
    accuracyWeightedConfidence: null, chosenScaleM: null,
    confidenceBeforeMotion: null, motionAdjustment: null, motionTurnEvidence: null,
  };
}

/**
 * Bewertet EINEN Scheitelkandidaten mehrskalig und mehrfaktoriell.
 * `lastCornerAtM` = cumDist des zuletzt bestätigten Winkels (-Infinity = keiner).
 */
export function evaluateShortLegCorner(
  points: readonly ShortLegPoint[], apexIndex: number, lastCornerAtM: number, motion?: ShortLegMotion | null,
  turnEvidenceAt?: TurnEvidenceLookup,
): ShortLegCandidate {
  const apex = points[apexIndex];
  const reject = (r: ShortLegRejectReason): ShortLegCandidate =>
    ({ accepted: false, kind: null, apexIndex, diagnostics: emptyDiag(apex, r) });

  if (apex.cumDist - lastCornerAtM < CORNER_GAP_M) return reject('too_close_to_previous');

  const before = stableLegWindow(points, apexIndex, false);
  if (!before) return reject('no_window_before');
  const after = stableLegWindow(points, apexIndex, true);
  if (!after) return reject('no_window_after');

  const headingDelta = normalizeDeg(after.bearingDeg - before.bearingDeg);
  const magnitude = Math.abs(headingDelta);
  const interior = 180 - magnitude;

  const diag: ShortLegDiagnostics = {
    t: apex.t ?? null, lat: apex.lat, lng: apex.lng,
    legBeforeM: Math.round(before.lengthM * 100) / 100,
    legAfterM: Math.round(after.lengthM * 100) / 100,
    sampleCountBefore: before.sampleCount, sampleCountAfter: after.sampleCount,
    bearingBefore: Math.round(before.bearingDeg * 10) / 10,
    bearingAfter: Math.round(after.bearingDeg * 10) / 10,
    headingDeltaDeg: Math.round(headingDelta * 10) / 10,
    interiorAngleDeg: Math.round(interior * 10) / 10,
    classification: null, accuracyM: apex.accuracy, confidence: 0, rejectReason: null,
    scaleBeforeM: before.scaleM, scaleAfterM: after.scaleM,
    spreadBeforeDeg: Math.round(before.spreadDeg * 10) / 10,
    spreadAfterDeg: Math.round(after.spreadDeg * 10) / 10,
    turnConcentrationM: null,
    motionSupported: !!(motion && motion.walking && motion.confidence >= 0.6),
    detectorPointCount: points.length,
    effectiveSpatialSpacingM: points.length > 1
      ? Math.round((points[points.length - 1].cumDist / (points.length - 1)) * 100) / 100
      : null,
    fitMethod: 'huber_tls',
    fitResidualBeforeM: Math.round(before.residualM * 100) / 100,
    fitResidualAfterM: Math.round(after.residualM * 100) / 100,
    accuracyWeightedConfidence: null,
    chosenScaleM: Math.max(before.scaleM, after.scaleM),
    confidenceBeforeMotion: null, motionAdjustment: null, motionTurnEvidence: null,
  };

  if (magnitude < MIN_TURN_DEG) { diag.rejectReason = 'no_turn'; return { accepted: false, kind: null, apexIndex, diagnostics: diag }; }

  // Signal-Rausch: Änderung muss die Schenkel-Streuung klar übersteigen.
  const noiseDeg = Math.max(before.spreadDeg, after.spreadDeg, 4);
  if (magnitude < noiseDeg * MIN_TURN_TO_NOISE) {
    diag.rejectReason = 'turn_below_noise';
    return { accepted: false, kind: null, apexIndex, diagnostics: diag };
  }

  // KONZENTRATION — das eigentliche Unterscheidungsmerkmal gegenüber
  // korrelierter GNSS-Drift und langsamen Bögen: bei einer echten Ecke findet
  // praktisch die GESAMTE Richtungsänderung unmittelbar am Scheitel statt.
  // Eine Drift/ein Bogen verteilt dieselbe Gesamtänderung gleichmässig über
  // das ganze Fenster. Gemessen als Verhältnis „Änderung im kurzen
  // Scheitelfenster" zu „Änderung im vollen Fenster".
  const shortBefore = meanBearing(points, nearIndex(points, apexIndex, false, TURN_CONCENTRATION_M), apexIndex);
  const shortAfter = meanBearing(points, apexIndex, nearIndex(points, apexIndex, true, TURN_CONCENTRATION_M));
  const shortTurn = shortBefore && shortAfter ? Math.abs(normalizeDeg(shortAfter.deg - shortBefore.deg)) : 0;
  const concentration = magnitude > 0 ? clamp01(shortTurn / magnitude) : 0;
  diag.turnConcentrationM = Math.round(concentration * 1000) / 1000;
  if (concentration < MIN_TURN_CONCENTRATION) {
    diag.rejectReason = 'turn_not_concentrated';
    return { accepted: false, kind: null, apexIndex, diagnostics: diag };
  }

  const dir: 'links' | 'rechts' = headingDelta > 0 ? 'rechts' : 'links';
  let kind: AngleKind | null = null;
  if (interior >= NORMAL_MIN && interior <= NORMAL_MAX) kind = dir;
  else if (interior >= SPITZ_MIN && interior <= SPITZ_MAX) kind = dir === 'rechts' ? 'spitz_rechts' : 'spitz_links';
  if (!kind) { diag.rejectReason = 'angle_unclear'; return { accepted: false, kind: null, apexIndex, diagnostics: diag }; }
  diag.classification = kind;

  // ── Mehrfaktorielle Evidenz — keine einzelne Grösse entscheidet allein ──
  const lengthScore = clamp01((Math.min(before.lengthM, after.lengthM) - MIN_LEG_M) / (4.5 - MIN_LEG_M)) * 0.75 + 0.25;
  const sampleScore = clamp01((Math.min(before.sampleCount, after.sampleCount) - 1) / 3);
  const straightScore = clamp01(1 - Math.max(before.spreadDeg, after.spreadDeg) / STRAIGHT_TOL_DEG);
  const turnScore = clamp01((magnitude - MIN_TURN_DEG) / 55);
  const concScore = clamp01((concentration - MIN_TURN_CONCENTRATION) / (1 - MIN_TURN_CONCENTRATION));
  const acc = apex.accuracy;
  const accScore = acc == null ? 0.5 : clamp01((ACC_BAD_M - acc) / (ACC_BAD_M - ACC_GOOD_M));
  // Motion ist reine ZUSATZ-Evidenz: sie kann einen knappen Kandidaten stützen,
  // aber niemals allein einen Winkel erzwingen (max. +0.06).
  const motionBonus = diag.motionSupported ? 0.06 : 0;

  const confidence = clamp01(
    0.24 * lengthScore + 0.22 * sampleScore + 0.22 * straightScore +
    0.16 * turnScore + 0.10 * concScore + 0.06 * accScore + motionBonus,
  );
  diag.accuracyWeightedConfidence = Math.round(accScore * 1000) / 1000;

  // ── MOTION-CONFIDENCE-KOPPLUNG (±0,12) ─────────────────────────────────
  // Greift AUSSCHLIESSLICH hier, an der Confidence-Stufe, und nur für
  // Kandidaten, die den vollständigen Geometriepfad bereits durchlaufen haben
  // (stabile Fenster, Turn, Signal-Rausch, Konzentration, Klassifikation sind
  // zu diesem Zeitpunkt alle bestanden). Ein Kandidat, der vorher an
  // no_window_before/after gescheitert ist, kommt hier nie an — Motion kann
  // ihn also strukturell nicht retten.
  //
  // Genau die in der Research-Runde vermessene Kopplung, unverändert
  // übernommen (applyMotionToConfidence, max ±0,12): starke passende
  // Turn-Evidenz hebt leicht an, klar widersprüchliche senkt leicht ab,
  // starke Geometrie wird nie gesenkt. Ohne Motion-Daten passiert nichts.
  const ev = turnEvidenceAt?.(apex.t ?? null) ?? null;
  const confidenceBefore = confidence;
  const adjusted = ev ? applyMotionToConfidence(confidence, ev) : confidence;
  diag.confidenceBeforeMotion = Math.round(confidenceBefore * 1000) / 1000;
  diag.motionAdjustment = Math.round((adjusted - confidenceBefore) * 1000) / 1000;
  diag.motionTurnEvidence = ev?.evidence ?? null;
  diag.confidence = Math.round(adjusted * 1000) / 1000;

  if (adjusted < ACCEPT_SCORE) { diag.rejectReason = 'low_evidence'; return { accepted: false, kind: null, apexIndex, diagnostics: diag }; }
  return { accepted: true, kind, apexIndex, diagnostics: diag };
}

/**
 * Läuft über alle Kandidaten und liefert die bestätigten Winkel in
 * Laufreihenfolge. Bei mehreren Kandidaten im selben Bereich gewinnt der mit
 * der stärksten Richtungsänderung (echter Scheitel statt Nachbarpunkt).
 */
export function detectShortLegCorners(
  rawPoints: readonly ShortLegPoint[], motion?: ShortLegMotion | null,
  turnEvidenceAt?: TurnEvidenceLookup,
): { corners: { kind: AngleKind; apexIndex: number; atM: number }[]; diagnostics: ShortLegDiagnostics[]; detectorPointCount: number } {
  // Räumliche Normalisierung ZUERST: ab hier ist die Punktfolge unabhängig
  // von der Fixrate (siehe resampleBySpacing).
  // Der Puffer liefert bereits leicht geglättete Punkte mit feinem Gate
  // (siehe DETECTOR_INPUT). Zwei weitergehende Normalisierungen wurden
  // gemessen und VERWORFEN, weil sie die Längenmatrix verschlechterten:
  //  • räumliches Resampling in festen Abständen — schneidet den Scheitel ab,
  //    wenn dort kein Stützpunkt liegt (Längenmatrix brach auf 0–1/4 ein);
  //  • distanzbasierte Glättung statt Glättung pro Fix — brachte bei 2/4 Hz
  //    keine Verbesserung, sondern Ausfälle.
  // Der verbleibende Fixraten-Ausfall bei sehr dichten Strömen (10 Hz) ist
  // damit NICHT gelöst und im Bericht offen ausgewiesen.
  const points = rawPoints;
  const corners: { kind: AngleKind; apexIndex: number; atM: number }[] = [];
  const diagnostics: ShortLegDiagnostics[] = [];

  // Alle Kandidaten bewerten, dann NICHT-MAXIMUM-UNTERDRÜCKUNG: die stärksten
  // zuerst, jeweils CORNER_GAP_M Umgebung sperren. Der frühere sequenzielle
  // Scan hing von Punktphase/-dichte ab und übersprang bei dichter Abtastung
  // echte Ecken, ohne sie überhaupt zu bewerten (belegt bei 4 Hz).
  const scored: { c: ShortLegCandidate; kind: AngleKind; atM: number; conf: number }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const c = evaluateShortLegCorner(points, i, -Infinity, motion, turnEvidenceAt);
    diagnostics.push(c.diagnostics);
    if (c.accepted && c.kind) scored.push({ c, kind: c.kind, atM: points[i].cumDist, conf: c.diagnostics.confidence });
  }
  scored.sort((a, b) => b.conf - a.conf || a.atM - b.atM);
  const taken: number[] = [];
  for (const cand of scored) {
    if (taken.some(m => Math.abs(m - cand.atM) < CORNER_GAP_M)) continue;
    taken.push(cand.atM);
    corners.push({ kind: cand.kind, apexIndex: cand.c.apexIndex, atM: cand.atM });
  }
  corners.sort((a, b) => a.atM - b.atM);
  return { corners, diagnostics, detectorPointCount: points.length };
}

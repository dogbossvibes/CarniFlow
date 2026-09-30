/**
 * Referenz-Qualität der GELEGTEN Fährte (T-TRACK-FUSION-QUALITY-2026-09-30, RC-9).
 *
 * Das bestehende Analyse-Grundlage-System (`analysisConfidence`, Band, Hinweis)
 * bewertet ausschliesslich die Fix-/Sample-Qualität der ABSUCHE. Es wusste
 * nichts davon, wie belastbar die Referenz selbst ist — deshalb konnte ein
 * Score von 100/100 neben einer Referenz stehen, die einen echten Winkel
 * verloren hat oder mit 8 m Accuracy auf 3-m-Schenkeln aufgezeichnet wurde.
 *
 * Dieses Modul liefert genau diesen fehlenden Eingang. Es ändert weder Score
 * noch Geometrie: die Referenz-Qualität senkt nur die Analyse-KONFIDENZ und
 * erzeugt einen eigenen Hinweis (Score ≠ Confidence).
 *
 * Zwei Gründe, beide an realen QA-Läufen kalibriert (11 Läufe):
 *   • reference_geometry_low   — Median-Accuracy der gelegten Linie ≥ 7 m
 *                                (F1 8,1 m, FT2 7,9 m, Lauf 3 9,2 m; alle übrigen
 *                                Läufe ≤ 5,9 m)
 *   • reference_turn_uncertain — ein INNERER Linien-Knoten mit ≥ 100° Richtungs-
 *                                änderung ohne Winkel-Marker in 4,5 m Bogenlänge.
 *                                SEMANTIK: ANYVO hat keine externe Ground Truth.
 *                                Der Grund sagt NUR „die aufgezeichnete Linie
 *                                zeigt einen scharfen Knick, dem kein Winkel-
 *                                Marker zugeordnet ist" — nicht, dass ein Winkel
 *                                tatsächlich gelaufen wurde/fehlt (es kann ein
 *                                GPS-Ausreisser, ein Umweg oder ein gewollter
 *                                Absatz sein). Beobachtet auf den 11 Läufen:
 *                                F1 (1), Spitz-QA (2); Lauf 3/7/8 keine Auslösung.
 * Die ersten zwei und der letzte Knoten zählen nie: dort dominiert Start-Anker-/
 * Stop-Jitter (gemessen 141–178° auf Läufen, die geradeaus starten).
 *
 * Reine Funktion, kein React/Native.
 */

export type ReferenceQualityReason = 'reference_geometry_low' | 'reference_turn_uncertain';
export type ReferenceQualityLevel = 'good' | 'fair' | 'poor';

export const REFERENCE_QUALITY_THRESHOLDS = Object.freeze({
  /** Median-Accuracy (m), ab der die Referenz-Geometrie als niedrig gilt. */
  lowGeometryMedianAccuracyM: 7,
  /** Accuracy (m), ab der der Geometrie-Abzug beginnt / voll ausgeschöpft ist. */
  accuracyPenaltyFromM: 4,
  accuracyPenaltyToM: 9,
  /** Richtungsänderung (Grad) eines inneren Linien-Knotens, ab der eine Ecke erwartet wird. */
  unmarkedTurnDeg: 100,
  /** So nah (m Bogenlänge) muss ein Winkel-Marker liegen, damit die Ecke als erfasst gilt. */
  markerMatchM: 4.5,
  /** Mindest-Punktzahl der Linie für eine Aussage. */
  minPoints: 4,
  /** Gewichte im Referenz-Score. */
  geometryWeight: 0.4,
  unmarkedWeightEach: 0.15,
  unmarkedWeightMax: 0.3,
  /** Stufen. */
  goodMin: 0.75,
  fairMin: 0.5,
  /** Wirkung auf die Analyse-Konfidenz: Faktor = floor + span × Score. */
  confidenceFloor: 0.8,
  confidenceSpan: 0.2,
} as const);

export interface ReferenceLinePoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export interface ReferenceQualityInput {
  /** Die persistierte, gelegte Linie (`point_type='lay'`). */
  line: readonly ReferenceLinePoint[];
  /** Bogenlänge (m) der gelegten Winkel-Marker. */
  cornerAtM: readonly number[];
}

export interface UnmarkedSharpTurn {
  /** Bogenlänge (m) des Linien-Knotens. */
  atM: number;
  /** Betrag der Richtungsänderung (Grad). */
  turnDeg: number;
}

export interface ReferenceQuality {
  /** 0..1 — 1 = belastbare Referenz. */
  score: number;
  level: ReferenceQualityLevel;
  reasons: ReferenceQualityReason[];
  medianAccuracyM: number | null;
  /** Faktor (≤ 1), mit dem die Analyse-Konfidenz skaliert wird. */
  confidenceFactor: number;
  unmarkedSharpTurns: UnmarkedSharpTurn[];
  pointCount: number;
}

const M_PER_DEG = 111320;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Ohne verwertbare Linie gibt es keine Aussage — die Konfidenz bleibt unverändert. */
export const NEUTRAL_REFERENCE_QUALITY: ReferenceQuality = Object.freeze({
  score: 1, level: 'good' as const, reasons: [], medianAccuracyM: null, confidenceFactor: 1,
  unmarkedSharpTurns: [], pointCount: 0,
});

export function computeReferenceQuality(input: ReferenceQualityInput): ReferenceQuality {
  const T = REFERENCE_QUALITY_THRESHOLDS;
  const line = input.line;
  if (line.length < T.minPoints) return { ...NEUTRAL_REFERENCE_QUALITY, pointCount: line.length };

  // Lokale Meter-Koordinaten (kleine Fährten → flache Näherung genügt).
  const lat0 = line[0].latitude;
  const mPerLng = M_PER_DEG * Math.cos((lat0 * Math.PI) / 180);
  const xy = line.map(p => [(p.longitude - line[0].longitude) * mPerLng, (p.latitude - lat0) * M_PER_DEG] as const);
  const cum: number[] = [0];
  for (let i = 1; i < xy.length; i++) cum.push(cum[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));

  const accs = line.map(p => p.accuracy).filter((a): a is number => a != null && Number.isFinite(a));
  const medianAccuracyM = median(accs);

  // Innere Knoten mit grosser Richtungsänderung, ohne Winkel-Marker in der Nähe.
  // Die ersten ZWEI Knoten zählen nicht: der Start-Anker/Start-Lock erzeugt am
  // Linienanfang künstliche Umkehrungen (gemessen 141–178° auf FT2/Lauf 3/Lauf 9,
  // obwohl dort geradeaus gestartet wurde).
  const unmarkedSharpTurns: UnmarkedSharpTurn[] = [];
  for (let i = 2; i < xy.length - 1; i++) {
    const a = xy[i - 1], b = xy[i], c = xy[i + 1];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5 || Math.hypot(c[0] - b[0], c[1] - b[1]) < 0.5) continue;
    let d = (Math.atan2(c[0] - b[0], c[1] - b[1]) - Math.atan2(b[0] - a[0], b[1] - a[1])) * 180 / Math.PI;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) < T.unmarkedTurnDeg) continue;
    if (input.cornerAtM.some(m => Math.abs(m - cum[i]) <= T.markerMatchM)) continue;
    unmarkedSharpTurns.push({ atM: round2(cum[i]), turnDeg: Math.round(Math.abs(d)) });
  }

  const reasons: ReferenceQualityReason[] = [];
  if (medianAccuracyM != null && medianAccuracyM >= T.lowGeometryMedianAccuracyM) reasons.push('reference_geometry_low');
  if (unmarkedSharpTurns.length) reasons.push('reference_turn_uncertain');

  const geometryPenalty = medianAccuracyM == null ? 0
    : T.geometryWeight * clamp01((medianAccuracyM - T.accuracyPenaltyFromM) / (T.accuracyPenaltyToM - T.accuracyPenaltyFromM));
  const turnPenalty = Math.min(T.unmarkedWeightMax, unmarkedSharpTurns.length * T.unmarkedWeightEach);
  const score = clamp01(1 - geometryPenalty - turnPenalty);
  // Ein benannter Grund macht die Referenz mindestens „fair" — nie „good".
  let level: ReferenceQualityLevel = score >= T.goodMin ? 'good' : score >= T.fairMin ? 'fair' : 'poor';
  if (reasons.length && level === 'good') level = 'fair';
  return {
    score: round2(score), level, reasons, medianAccuracyM: medianAccuracyM == null ? null : round2(medianAccuracyM),
    confidenceFactor: round2(T.confidenceFloor + T.confidenceSpan * score),
    unmarkedSharpTurns, pointCount: line.length,
  };
}

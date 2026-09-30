// ──────────────────────────────────────────────────────────────────────────
// Turn-Geometrie-Qualität — eine eigenständige Grösse, getrennt von der
// Erkennungs-Confidence.
//
// ANLASS (T-TRACK-FUSION-QUALITY-2026-09-30, RC-1/RC-2): der GPS-Innenwinkel
// wurde bisher OHNE jede Auflösbarkeitsprüfung in „normal" oder „spitz"
// übersetzt. Bei einer Positionsunsicherheit von ~8 m und Schenkeln von ~3 m
// (FT2: 8,2 m / 3,1 m) ist ein Winkel schlicht nicht auflösbar — die
// Confidence blieb trotzdem bei 0,76, weil der Accuracy-Faktor bei ≤ 10 m
// gesättigt war und nur mit 0,06 einging.
//
// Diese Grösse beantwortet: „Wie gut lässt sich die SCHÄRFE dieses Winkels aus
// der vorliegenden Geometrie überhaupt bestimmen?" Sie entscheidet NICHT, ob
// eine Ecke existiert und in welche Richtung sie zeigt (das bleibt Aufgabe des
// Detektors) — nur, ob „spitz" belegt werden darf.
//
// Kalibrierung (real gemessen, Detektor-Puffer, Median-Accuracy im Fenster ÷
// kürzester Schenkel): bestätigte Spitzwinkel 0,98 (Spitz-QA) und 1,53
// (Lauf 2); der nicht auflösbare FT2-„Spitz" 2,67. Normale, aber schlecht
// aufgelöste Ecken liegen bei 2,7–4,0 — sie bleiben erkannt, verlieren nur die
// Berechtigung zu „spitz".
//
// Reine Funktion, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────

/** Accuracy÷Schenkel: ab hier ist die Schärfe voll auflösbar / nicht mehr auflösbar. */
export const RATIO_RESOLVABLE = 1.0;
export const RATIO_UNRESOLVABLE = 3.0;
/** Untere Grenzen der Qualitätsstufen. */
export const QUALITY_HIGH_MIN = 0.65;
export const QUALITY_MEDIUM_MIN = 0.45;
/**
 * „spitz" darf nur belegt werden, wenn die Positionsunsicherheit nicht deutlich
 * grösser als der kürzeste Schenkel ist. Harte Grenze auf dem gemessenen
 * Accuracy÷Schenkel-Verhältnis: bestätigte Spitzwinkel liegen real bei ≤ 1,53,
 * der nicht auflösbare FT2-Fall bei 2,67. Die Grenze sitzt bewusst NAHE an der
 * unauflösbaren Seite (2,5) — sie soll nur klar unauflösbare Geometrie
 * abfangen, nicht die im Feld üblichen 5–9 m Accuracy bei 3,75-m-Schenkeln
 * (Golden-Route, Verhältnis ≈ 1,3–2,4) pauschal entwerten.
 */
export const SHARPNESS_MAX_RATIO = 2.5;
/** Zusätzliche Mindestqualität (Gesamtscore), unterhalb derer „spitz" nie belegt wird. */
export const SHARPNESS_MIN_QUALITY = 0.3;

export type GeometryQualityLevel = 'high' | 'medium' | 'low';

export interface TurnGeometryInput {
  /** Längen der beiden stabilen Schenkel (m). */
  legBeforeM: number;
  legAfterM: number;
  /** Punkte je Schenkelfenster. */
  sampleCountBefore: number;
  sampleCountAfter: number;
  /** Richtungsstreuung je Schenkel (Grad). */
  spreadBeforeDeg: number;
  spreadAfterDeg: number;
  /** Accuracy der Punkte im Gesamtfenster (m); null-Einträge werden ignoriert. */
  windowAccuraciesM: readonly (number | null)[];
  /** Maximal zulässige Streuung (Grad) — Normierung der Richtungsstabilität. */
  straightTolDeg?: number;
}

export interface TurnGeometryQuality {
  /** 0..1 — Gesamtqualität für die Schärfebestimmung. */
  score: number;
  level: GeometryQualityLevel;
  /** Median-Accuracy ÷ kürzester Schenkel. Klein = gut auflösbar. */
  accuracyToLegRatio: number | null;
  medianAccuracyM: number | null;
  /** Kürzester Schenkel = wirksame Basislinie (m). */
  baselineM: number;
  /** Teilnoten 0..1 (QA: warum hoch/niedrig). */
  parts: { ratio: number; samples: number; stability: number; baseline: number };
  /** Darf „spitz" belegt werden? */
  sharpnessResolvable: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function turnGeometryQuality(input: TurnGeometryInput): TurnGeometryQuality {
  const tol = input.straightTolDeg ?? 26;
  const baselineM = Math.min(input.legBeforeM, input.legAfterM);
  const accs = input.windowAccuraciesM.filter((a): a is number => a != null && Number.isFinite(a));
  const medianAccuracyM = median(accs);
  const ratio = medianAccuracyM != null && baselineM > 0 ? medianAccuracyM / baselineM : null;

  // Fehlt die Accuracy ganz, ist die Auflösbarkeit UNBEKANNT — neutral (0,5)
  // statt stillschweigend „perfekt".
  const ratioPart = ratio == null
    ? 0.5
    : clamp01((RATIO_UNRESOLVABLE - ratio) / (RATIO_UNRESOLVABLE - RATIO_RESOLVABLE));
  const samplesPart = clamp01((Math.min(input.sampleCountBefore, input.sampleCountAfter) - 2) / 3);
  const stabilityPart = clamp01(1 - Math.max(input.spreadBeforeDeg, input.spreadAfterDeg) / tol);
  const baselinePart = clamp01((baselineM - 2) / 4);

  const score = clamp01(0.45 * ratioPart + 0.2 * samplesPart + 0.2 * stabilityPart + 0.15 * baselinePart);
  // Ist die Positionsunsicherheit klar grösser als der Schenkel, ist die
  // Geometrie „low" — unabhängig von den übrigen Teilnoten.
  const overRatio = ratio != null && ratio > SHARPNESS_MAX_RATIO;
  const level: GeometryQualityLevel = overRatio ? 'low'
    : score >= QUALITY_HIGH_MIN ? 'high' : score >= QUALITY_MEDIUM_MIN ? 'medium' : 'low';
  return {
    score: Math.round(score * 1000) / 1000,
    level,
    accuracyToLegRatio: ratio == null ? null : Math.round(ratio * 100) / 100,
    medianAccuracyM: medianAccuracyM == null ? null : Math.round(medianAccuracyM * 100) / 100,
    baselineM: Math.round(baselineM * 100) / 100,
    parts: {
      ratio: Math.round(ratioPart * 1000) / 1000, samples: Math.round(samplesPart * 1000) / 1000,
      stability: Math.round(stabilityPart * 1000) / 1000, baseline: Math.round(baselinePart * 1000) / 1000,
    },
    sharpnessResolvable: (ratio == null || ratio <= SHARPNESS_MAX_RATIO)
      && score >= SHARPNESS_MIN_QUALITY,
  };
}

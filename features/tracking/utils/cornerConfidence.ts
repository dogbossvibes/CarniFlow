// ──────────────────────────────────────────────────────────────────────────
// CONFIDENCE-VIEW für automatisch erkannte Winkel.
//
// Die eigentliche Confidence-Berechnung (gewichteter Score, State accept/pending/
// reject, Level) liegt in `autoCornerDetection.ts` und wird NICHT dupliziert. Dieses
// Modul bildet die internen `CornerFactors` nur auf eine stabile, gut benennbare
// Struktur ab (turnStrength/legSupport/gpsQuality/straightness/stability/speedSupport)
// und leitet nachvollziehbare `reasons` ab. Rein für Diagnose/QA/spätere Debug-UI —
// KEINE Kunden-Prozentanzeige.
// ──────────────────────────────────────────────────────────────────────────

import type {
  AutoCorner, ConfidenceLevel, CornerFactors,
} from '@/features/tracking/utils/autoCornerDetection';

export interface CornerConfidence {
  score: number;              // 0..1, deterministisch (übernimmt confidence 1:1)
  level: ConfidenceLevel;     // 'low' | 'medium' | 'high'
  components: {
    turnStrength: number;     // Nähe der Richtungsänderung zur erkannten Winkelklasse
    legSupport: number;       // belegte Schenkel (Punktzahl UND Mindestlänge, bindend = min)
    gpsQuality: number;       // robuste Accuracy (Median über die Schenkelpunkte)
    straightness: number;     // Geradheit des schwächeren Schenkels (bindend = min)
    stability: number;        // Bearing-Stabilität der Schenkel
    speedSupport?: number;    // optional: nur wenn Zeitstempel vorlagen
  };
  reasons?: string[];         // undefined, wenn nichts auffällig ist
}

// Ab hier gilt eine Komponente als „schwach" und wird als Grund vermerkt.
const WEAK = 0.5;

// Eingabe: alles, was Score + Faktoren trägt — sowohl CornerCandidate als auch
// AutoCorner erfüllen das strukturell (AutoCorner ohne reason).
type ConfidenceSource = {
  confidence: number;
  factors: CornerFactors;
  reason?: string | null;
  level?: ConfidenceLevel;
};

export function toCornerConfidence(source: ConfidenceSource): CornerConfidence {
  const f = source.factors;
  const components = {
    turnStrength: f.angle,
    legSupport: Math.min(f.support, f.legLength),           // beide müssen tragen → Minimum
    gpsQuality: f.accuracy,
    straightness: Math.min(f.straightBefore, f.straightAfter),
    stability: f.bearing,
    ...(f.speedSupport === undefined ? {} : { speedSupport: f.speedSupport }),
  };

  const reasons: string[] = [];
  if (source.reason) reasons.push(source.reason);           // z. B. 'deadzone', 'short_legs', 'curve'
  if (components.turnStrength < WEAK) reasons.push('weak_turn');
  if (components.straightness < WEAK) reasons.push('curvy_legs');
  if (components.gpsQuality < WEAK) reasons.push('poor_gps');
  if (components.legSupport < WEAK) reasons.push('short_legs');
  if (components.stability < WEAK) reasons.push('unstable_bearing');
  if (components.speedSupport !== undefined && components.speedSupport < WEAK) reasons.push('low_movement');

  return {
    score: source.confidence,
    level: source.level ?? levelFromScore(source.confidence),
    components,
    ...(reasons.length ? { reasons } : {}),
  };
}

// Fällt nur, wenn die Quelle kein Level mitliefert (z. B. Ad-hoc-Konstruktion).
// Die kanonischen Grenzen leben in autoCornerDetection.confidenceLevel().
function levelFromScore(score: number): ConfidenceLevel {
  if (score >= 0.80) return 'high';
  if (score >= 0.60) return 'medium';
  return 'low';
}

// Bequemer Alias für den akzeptierten Winkel aus detectAutoCorner().
export function cornerConfidenceOf(corner: AutoCorner): CornerConfidence {
  return toCornerConfidence(corner);
}

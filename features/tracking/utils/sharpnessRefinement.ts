// ──────────────────────────────────────────────────────────────────────────
// Nachträgliche Schärfe-Prüfung eines bereits gemeldeten Winkels (T-211).
//
// ANLASS: der Regelpfad meldet einen Winkel, sobald 2–3 m nach dem Scheitel
// vorliegen. Bei einem Spitzwinkel ist der Innenwinkel dann oft noch nicht
// messbar (Simulator: 65–90° statt 30–45°, oder nur ein Fensterpaar ohne
// Konsens) → gespeichert als normaler Winkel. Die frühe Meldung soll bleiben
// (Ansage beim Legen); die KLASSE darf aber genau einmal nachgeprüft werden,
// sobald beide Schenkel lang genug vorliegen.
//
// REGEL: dieselbe Messung und dieselben Gates wie der Long-Baseline-Rückfall
// (longBaselineCorner.ts: 8 m UND 12 m, in sich gerade Schenkel, Konsens aller
// Schenkellängen im Spitz-Band, auflösbare Genauigkeit). Gesucht wird nur im
// Umkreis des gemeldeten Scheitels; die Richtung muss übereinstimmen. Es gibt
// ausschliesslich die Hochstufung normal → spitz — nie eine neue Ecke, nie
// eine andere Richtung, nie eine Rückstufung. Ein verschobener Scheitel mischt
// alte Richtung in den Schenkel und VERKLEINERT die gemessene Drehung; er kann
// einen rechten Winkel also nicht spitz erscheinen lassen.
//
// Reine Funktion, kein React/Native.
// ──────────────────────────────────────────────────────────────────────────
import { evaluateLongBaselineCorner, type LongBaselineHit } from '@/features/tracking/utils/longBaselineCorner';
import type { ShortLegPoint } from '@/features/tracking/utils/shortLegCornerDetection';

/** Weg (m) nach dem gemeldeten Scheitel, ab dem genau einmal nachgeprüft wird: 12-m-Schenkel + Suchradius. */
export const SHARPNESS_REFINE_AFTER_M = 15;
/** Der wahre Scheitel darf so weit (m) vom gemeldeten liegen. */
export const SHARPNESS_REFINE_APEX_SEARCH_M = 2.5;

export interface SharpnessRefinement {
  /** true = der Winkel ist über lange Schenkel als Spitzwinkel belegt. */
  spitz: boolean;
  /** Beste Long-Baseline-Messung im Suchradius; null = keine belastbare Messung. */
  hit: LongBaselineHit | null;
}

/** Ist genug Weg nach dem Scheitel aufgezeichnet, um nachzuprüfen? */
export function sharpnessRefinementDue(points: readonly ShortLegPoint[], atM: number): boolean {
  return points.length > 0 && points[points.length - 1].cumDist - atM >= SHARPNESS_REFINE_AFTER_M;
}

/** Prüft einen gemeldeten Winkel (Wegposition `atM`, Richtung) über lange Schenkel nach. */
export function refineCornerSharpness(
  points: readonly ShortLegPoint[], atM: number, direction: 'links' | 'rechts',
): SharpnessRefinement {
  let best: LongBaselineHit | null = null;
  for (let i = 1; i < points.length - 1; i++) {
    const d = points[i].cumDist - atM;
    if (d < -SHARPNESS_REFINE_APEX_SEARCH_M) continue;
    if (d > SHARPNESS_REFINE_APEX_SEARCH_M) break;
    const hit = evaluateLongBaselineCorner(points, i);
    if (!hit) continue;
    // Gleiche Rangfolge wie detectLongBaselineCorners: Confidence, dann Drehung, dann früherer Punkt.
    if (!best || hit.confidence > best.confidence
      || (hit.confidence === best.confidence && Math.abs(hit.headingDeltaDeg) > Math.abs(best.headingDeltaDeg))) best = hit;
  }
  return { spitz: !!best && best.sharpness === 'spitz' && best.direction === direction, hit: best };
}

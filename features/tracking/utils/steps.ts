// Zentrale Umrechnung Meter ↔ Schritte (IGP-Fährtenmass). EINZIGE Wahrheit für
// die Schrittlänge. „Schritte" sind GESCHÄTZT (aus GPS-Distanz), solange ANYVO
// keinen echten Pedometer nutzt — siehe docs/architecture/FAEHRTE_STEP_ACCURACY_ANALYSIS.md.
//
// Optionale persönliche Schrittlänge (`stepLengthM`) wird durchgereicht; fehlt sie
// oder ist sie ungültig, gilt der Default. Keine zweite Umrechnung/Konstante irgendwo.

export const DEFAULT_STEP_LENGTH_M = 0.75;

// Persönliche Schrittlänge (Meter/Schritt). Später aus User-/Tracking-Settings.
export type StepLengthM = number;

// Ungültige/nicht-positive Werte → Default. Nie Division durch 0.
export function normalizeStepLength(value?: number | null): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_STEP_LENGTH_M;
}

// Meter → geschätzte Schritte (gerundet). Negative/ungültige Meter → 0.
export function metersToSteps(meters: number, stepLengthM?: number | null): number {
  const len = normalizeStepLength(stepLengthM);
  const m = Number.isFinite(meters) && meters > 0 ? meters : 0;
  return Math.round(m / len);
}

// Schritte → Meter. Negative/ungültige Schritte → 0.
export function stepsToMeters(steps: number, stepLengthM?: number | null): number {
  const len = normalizeStepLength(stepLengthM);
  const s = Number.isFinite(steps) && steps > 0 ? steps : 0;
  return s * len;
}

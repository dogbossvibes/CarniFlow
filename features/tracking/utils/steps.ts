// Umrechnung Meter → Schritte (IGP-Fährtenmass). Ein „Schritt" ≈ 0,75 m.
export const STEP_LENGTH_M = 0.75;

export function metersToSteps(meters: number): number {
  return Math.round(meters / STEP_LENGTH_M);
}

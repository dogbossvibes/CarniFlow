// ──────────────────────────────────────────────────────────────────────────
// Persönliche Schrittlängen-Kalibrierung — REINE, testbare Logik (kein React/GPS).
//
// Der Nutzer geht CALIBRATION_STEPS echte Fährtenschritte (zählt selbst — ANYVO
// hat KEINEN Pedometer), ANYVO misst die zurückgelegte Distanz entlang der Gehlinie
// (kumulierte Haversine, Runtime-only) und leitet ab:
//     stepLengthM = measuredDistanceM / CALIBRATION_STEPS
// Ergebnis wird NICHT vor dem Speichern gerundet; die Anzeige darf runden.
// ──────────────────────────────────────────────────────────────────────────

export const CALIBRATION_STEPS = 50;

// Plausible Feldgrenzen (konservativ, keine biometrische Interpretation):
// 50 Schritte ⇒ Strecke zwischen ~20 m (0,40 m/Schritt) und ~60 m (1,20 m/Schritt).
export const MIN_CALIBRATED_STEP_LENGTH_M = 0.40;
export const MAX_CALIBRATED_STEP_LENGTH_M = 1.20;

// Zu kurze Gesamtstrecke ⇒ GPS-Rauschen dominiert → unbrauchbar.
export const MIN_CALIBRATION_DISTANCE_M = 5;

// Schrittlänge aus gemessener Distanz + Schrittzahl. KEINE Rundung.
export function calibrateStepLength(measuredDistanceM: number, steps: number = CALIBRATION_STEPS): number {
  if (!Number.isFinite(measuredDistanceM) || !Number.isFinite(steps) || steps <= 0) return NaN;
  return measuredDistanceM / steps;
}

// Plausibilität der berechneten Schrittlänge (Feldgrenzen).
export function isPlausibleStepLength(stepLengthM: number): boolean {
  return Number.isFinite(stepLengthM)
    && stepLengthM >= MIN_CALIBRATED_STEP_LENGTH_M
    && stepLengthM <= MAX_CALIBRATED_STEP_LENGTH_M;
}

// Gesamt-Akzeptanz: genug Strecke UND plausible Schrittlänge.
export function isAcceptableCalibration(measuredDistanceM: number, steps: number = CALIBRATION_STEPS): boolean {
  if (!Number.isFinite(measuredDistanceM) || measuredDistanceM < MIN_CALIBRATION_DISTANCE_M) return false;
  return isPlausibleStepLength(calibrateStepLength(measuredDistanceM, steps));
}

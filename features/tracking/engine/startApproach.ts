// ──────────────────────────────────────────────────────────────────────────
// Fährtenansatz-Annäherung (Arming) — REINE, testbare Logik (kein React/Expo).
//
// Die Absuche darf erst beginnen, wenn der Hundeführer den URSPRÜNGLICHEN
// Startpunkt der gelegten Fährte erreicht hat. Während der Navigation dorthin
// läuft die Suchzeit NICHT.
//
// Reparatur (siehe docs/architecture/FAEHRTE_STARTPOINT_GPS_ANALYSIS.md):
//  • KEIN fixer 1,5-m-Radius / 3-m-Accuracy-Zwang mehr (im Feld unerfüllbar).
//  • DYNAMISCHER Startradius, gekoppelt an die real gemeldete horizontale
//    Genauigkeit: effectiveRadius = clamp(acc·FACTOR, MIN, MAX).
//  • Auto-Start erst nach mehreren AUFEINANDERFOLGENDEN gültigen Fixes
//    (kein Start durch einen einzelnen GPS-Ausreißer).
//  • Stale-/Ausreißer-Absicherung (Alter, Sprunggeschwindigkeit, Accuracy-Cap).
//
// 20 cm Genauigkeit sind mit reinem Smartphone-GPS NICHT garantierbar — die
// Logik arbeitet ausschließlich mit der GEMELDETEN horizontalAccuracy.
// Nutzt NUR vorhandene GPS-Daten (Position + Genauigkeit) — keine neue Engine.
// ──────────────────────────────────────────────────────────────────────────

// Wie der Startpunkt bestätigt wurde (Runtime-Info; keine DB-Persistenz nötig).
export type StartMode = 'automatic' | 'manual-at-start' | 'manual-override';

export interface ApproachConfig {
  /** Untergrenze des dynamischen Startradius (m). */
  minRadiusM:           number;
  /** Obergrenze des dynamischen Startradius (m). */
  maxRadiusM:           number;
  /** Faktor: Radius = Accuracy · Faktor (dann auf [min,max] geklemmt). */
  accuracyRadiusFactor: number;
  /** Schlechtere gemeldete Genauigkeit als dies → Fix NICHT für Auto-Start. */
  maxAccuracyM:         number;
  /** So viele aufeinanderfolgende gültige Fixes → armed (Auto-Start). */
  requiredFixes:        number;
  /** Fixes älter als dies gelten als stale und werden verworfen (ms). */
  maxLocationAgeMs:     number;
  /** Sprunggeschwindigkeit zum Vorfix darüber = unplausibel → verworfen (m/s). */
  maxJumpSpeedMps:      number;
}

// Konservative, benannte Standardwerte (keine Magic Numbers in Hook/UI).
export const MIN_START_RADIUS_M      = 3;
export const MAX_START_RADIUS_M      = 12;
export const ACCURACY_RADIUS_FACTOR  = 1.5;
export const MAX_APPROACH_ACCURACY_M = 12;   // acc > 12 m ⇒ nicht automatisch starten (z. B. 15 m)
export const REQUIRED_CONSECUTIVE_FIXES = 3;
export const MAX_LOCATION_AGE_MS     = 5000;
export const MAX_JUMP_SPEED_MPS      = 12;   // ~43 km/h — konsistent mit gpsFilter.MAX_SPEED_MPS

export const DEFAULT_APPROACH_CONFIG: ApproachConfig = {
  minRadiusM:           MIN_START_RADIUS_M,
  maxRadiusM:           MAX_START_RADIUS_M,
  accuracyRadiusFactor: ACCURACY_RADIUS_FACTOR,
  maxAccuracyM:         MAX_APPROACH_ACCURACY_M,
  requiredFixes:        REQUIRED_CONSECUTIVE_FIXES,
  maxLocationAgeMs:     MAX_LOCATION_AGE_MS,
  maxJumpSpeedMps:      MAX_JUMP_SPEED_MPS,
};

// Dynamischer Startradius aus der gemeldeten Genauigkeit. null ⇒ Accuracy unbekannt.
export function effectiveRadiusM(accuracy: number | null | undefined, cfg: ApproachConfig): number | null {
  if (accuracy == null) return null;
  const raw = accuracy * cfg.accuracyRadiusFactor;
  return Math.min(cfg.maxRadiusM, Math.max(cfg.minRadiusM, raw));
}

// Ein GPS-Fix, wie ihn der Hook der reinen Logik übergibt.
export interface ApproachSample {
  distanceM:     number | null;       // Distanz zum gespeicherten Startpunkt (m)
  accuracy:      number | null;       // gemeldete horizontale Genauigkeit (m)
  t:             number;              // ms (now)
  ageMs?:        number | null;       // Alter des Fixes (now − loc.timestamp)
  jumpSpeedMps?: number | null;       // Sprunggeschwindigkeit zum Vorfix (m/s)
}

// Frisch = nicht stale. Unbekanntes Alter wird NICHT als stale gewertet.
export function isFreshFix(ageMs: number | null | undefined, cfg: ApproachConfig): boolean {
  if (ageMs == null) return true;
  return ageMs >= 0 && ageMs <= cfg.maxLocationAgeMs;
}

// Plausible Bewegung. Unbekannte Geschwindigkeit (erster Fix) ist erlaubt.
export function isPlausibleSpeed(jumpSpeedMps: number | null | undefined, cfg: ApproachConfig): boolean {
  if (jumpSpeedMps == null) return true;
  return jumpSpeedMps <= cfg.maxJumpSpeedMps;
}

// Ein Fix ist für den AUTOMATISCHEN Start gültig, wenn er
//   • eine Genauigkeit hat und diese ≤ maxAccuracyM ist,
//   • frisch (nicht stale) und plausibel (keine unmögliche Sprungdistanz) ist,
//   • innerhalb des DYNAMISCHEN Radius liegt.
export function isEligible(sample: ApproachSample, cfg: ApproachConfig): boolean {
  if (sample.accuracy == null || sample.accuracy > cfg.maxAccuracyM) return false;
  if (sample.distanceM == null) return false;
  if (!isFreshFix(sample.ageMs, cfg)) return false;
  if (!isPlausibleSpeed(sample.jumpSpeedMps, cfg)) return false;
  const r = effectiveRadiusM(sample.accuracy, cfg);
  return r != null && sample.distanceM <= r;
}

export interface ApproachState {
  consecutive: number;   // aufeinanderfolgende gültige Fixes im Radius
  armed:       boolean;  // Startpunkt erreicht + stabil → Absuche darf beginnen
}

export const INITIAL_APPROACH: ApproachState = { consecutive: 0, armed: false };

// Reiner Reducer: verrechnet einen neuen Fix mit dem Arming-Zustand.
//   • gültig   → Zähler +1; ab requiredFixes → armed
//   • ungültig → Zähler zurück auf 0 (ein Ausreißer setzt zurück)
//   • einmal armed → bleibt armed (kein Zurückfallen).
export function reduceApproach(state: ApproachState, sample: ApproachSample, cfg: ApproachConfig): ApproachState {
  if (state.armed) return state;
  if (isEligible(sample, cfg)) {
    const consecutive = state.consecutive + 1;
    return { consecutive, armed: consecutive >= cfg.requiredFixes };
  }
  return { consecutive: 0, armed: false };
}

// Verbleibende gültige Fixes bis zum Auto-Start (nur Anzeige).
export function fixesRemaining(state: ApproachState, cfg: ApproachConfig): number {
  return Math.max(0, cfg.requiredFixes - state.consecutive);
}

// Entscheidung für den MANUELLEN „Jetzt starten"-Button:
//   • 'at-start'        → Nutzer ist innerhalb des dynamischen Radius → sofort starten
//   • 'override-needed' → außerhalb / Position unbekannt → bewusste Bestätigung nötig
export type ManualStartDecision = 'at-start' | 'override-needed';
export function classifyManualStart(
  distanceM: number | null,
  accuracy: number | null,
  cfg: ApproachConfig,
): ManualStartDecision {
  if (distanceM == null || accuracy == null) return 'override-needed';
  const r = effectiveRadiusM(accuracy, cfg);
  if (r == null) return 'override-needed';
  return distanceM <= r ? 'at-start' : 'override-needed';
}

export const APPROACH_HINT = 'Bitte zum Fährtenansatz gehen. Die Suchzeit startet automatisch.';

// ──────────────────────────────────────────────────────────────────────────
// Fährtenansatz-Annäherung (Arming) — REINE, testbare Logik (kein React/Expo).
//
// Die Absuche darf erst beginnen, wenn der Hundeführer den URSPRÜNGLICHEN
// Startpunkt der gelegten Fährte erreicht hat. Während der Navigation dorthin
// läuft die Suchzeit NICHT. Der Start erfolgt automatisch, sobald der Nutzer
//   • innerhalb eines konfigurierbaren Radius ist (Standard 1,5 m),
//   • dort für eine Mindestdauer stabil bleibt (Standard 2 s) und
//   • die GPS-Genauigkeit ausreichend ist (Standard ≤ 3 m).
//
// Nutzt NUR vorhandene GPS-Daten (Position + Genauigkeit) — keine neue Engine.
// ──────────────────────────────────────────────────────────────────────────

export interface ApproachConfig {
  radiusM:      number;   // Standard 1.5 — Abstand zum Ansatz, ab dem „erreicht"
  stableMs:     number;   // Standard 2000 — Mindestverweildauer im Radius
  accuracyMaxM: number;   // Standard 3 — schlechtere Genauigkeit blockiert den Start
}

export const DEFAULT_APPROACH_CONFIG: ApproachConfig = { radiusM: 1.5, stableMs: 2000, accuracyMaxM: 3 };

export interface ApproachState {
  withinSince: number | null;  // ms: erster gültiger Fix im Radius (Basis für die Stabilität)
  armed:       boolean;        // true = Startpunkt erreicht → Absuche darf beginnen
}

export const INITIAL_APPROACH: ApproachState = { withinSince: null, armed: false };

// Ein Fix ist „gültig", wenn er innerhalb des Radius liegt UND genau genug ist.
export function isEligible(distanceM: number | null, accuracy: number | null, cfg: ApproachConfig): boolean {
  return distanceM != null && distanceM <= cfg.radiusM
    && accuracy != null && accuracy <= cfg.accuracyMaxM;
}

// Reiner Reducer: verrechnet einen neuen GPS-Fix mit dem bisherigen Arming-Zustand.
//   • gültig  → Verweildauer messen; ab stableMs → armed
//   • ungültig→ Timer zurücksetzen (Radius verlassen / zu ungenau)
//   • einmal armed → bleibt armed (kein Zurückfallen).
export function reduceApproach(
  state: ApproachState,
  sample: { distanceM: number | null; accuracy: number | null; t: number },
  cfg: ApproachConfig,
): ApproachState {
  if (state.armed) return state;
  if (isEligible(sample.distanceM, sample.accuracy, cfg)) {
    const since = state.withinSince ?? sample.t;
    return { withinSince: since, armed: sample.t - since >= cfg.stableMs };
  }
  return { withinSince: null, armed: false };
}

// Verbleibende Stabilitätszeit (Sekunden, aufgerundet) bis zum Auto-Start —
// nur für die Anzeige, wenn der Nutzer bereits im Radius ist.
export function stableRemainingS(state: ApproachState, now: number, cfg: ApproachConfig): number {
  if (state.withinSince == null) return Math.ceil(cfg.stableMs / 1000);
  return Math.max(0, Math.ceil((cfg.stableMs - (now - state.withinSince)) / 1000));
}

export const APPROACH_HINT = 'Bitte zum Fährtenansatz gehen. Die Suchzeit startet automatisch.';

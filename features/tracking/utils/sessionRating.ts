// `training_sessions.rating` ist ein allgemeines 1–5-Rating mit DB-Check-Constraint
// (`training_sessions_rating_check`). Der Fährten-Score ist eine 0–100-Prozentzahl und
// gehört NICHT in dieses Feld — er wird in `track_data.score` (Evaluation-Payload)
// persistiert. Diese Funktion lässt nur einen gültigen 1–5-Wert durch; alles andere
// (0–100-Score, 0, out-of-range) → null, damit der Constraint nie verletzt wird.
// NULL ist erlaubt (eine Fährte ohne 1–5-Rating).
export function validSessionRating(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5 ? v : null;
}

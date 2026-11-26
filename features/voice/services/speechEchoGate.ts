// Eigene Ansagen dürfen keine Befehle auslösen (Spec 03, Punkt 9; Release-Review 2026-11-25).
// Zwei Schutzschichten, beide rein und testbar:
//   1) Stummschalten: Solange ANYVO spricht und bis ECHO_GRACE_MS nach dem Ende der Ansage
//      hört die Erkennung gar nicht zu (Sitzung wird abgebrochen, danach neu gestartet).
//      So kann ein verspätet ausgewertetes Echo («Winkel links», «Gegenstand gefunden»)
//      keinen zusätzlichen Marker setzen – unabhängig davon, wie spät das Ergebnis kommt.
//   2) Verwerfen: Ein Ergebnis, das trotzdem in dieses Fenster fällt, wird ignoriert.

/** Nachlauf nach dem Ende einer Ansage (Hall, verzögerte Erkennung). */
export const ECHO_GRACE_MS = 1500;

export interface SpeechActivity { speaking: boolean; endedAtMs: number }

export function acceptsRecognition(nowMs: number, activity: SpeechActivity, graceMs = ECHO_GRACE_MS): boolean {
  if (activity.speaking) return false;
  return nowMs - activity.endedAtMs >= graceMs;
}

/** Muss die Erkennung jetzt stumm sein (eigene Ansage läuft oder klingt nach)? */
export function shouldMute(nowMs: number, activity: SpeechActivity, graceMs = ECHO_GRACE_MS): boolean {
  return !acceptsRecognition(nowMs, activity, graceMs);
}

/**
 * Wurde während dieser Erkennungssitzung gesprochen? Dann gehört ihr Ergebnis womöglich zur
 * eigenen Ansage und wird verworfen, auch wenn es erst nach dem Nachlauf ankommt.
 */
export function sessionOverlapsSpeech(sessionStartMs: number, activity: SpeechActivity): boolean {
  return activity.speaking || activity.endedAtMs > sessionStartMs;
}

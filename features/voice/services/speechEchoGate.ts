// Eigene Ansagen dürfen keine Befehle auslösen (Spec 03, Punkt 9): Während ANYVO
// spricht und kurz danach wird Erkanntes verworfen. Rein und testbar.

/** Nachlauf nach dem Ende einer Ansage (Hall, verzögerte Erkennung). */
export const ECHO_GRACE_MS = 800;

export function acceptsRecognition(nowMs: number, activity: { speaking: boolean; endedAtMs: number }, graceMs = ECHO_GRACE_MS): boolean {
  if (activity.speaking) return false;
  return nowMs - activity.endedAtMs >= graceMs;
}

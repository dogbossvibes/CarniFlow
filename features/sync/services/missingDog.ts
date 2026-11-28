// Erkennung „Hund fehlt" und lesbare Sync-Fehlergründe (Sync-Center).
//
// Production-Befund 28.11.2026: Fährten, deren lokale dog_id auf dem Server nicht
// (mehr) existiert, scheitern bei jedem Upload mit Postgres 23503
// (training_sessions_dog_id_fkey, „Key is not present in table dogs"). Das ist kein
// vorübergehender Fehler: ein Retry hilft nie, nur eine Zuordnung zu einem
// bestehenden Hund. Reine Funktionen, ohne DB/Netz, damit sie testbar bleiben.

/** Antwort des Servers „dog_id verweist auf keinen Hund" bzw. „dog_id fehlt" (NOT NULL). */
export function isMissingDogError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  if (m.includes('training_sessions_dog_id_fkey')) return true;
  // Robust gegen andere Constraint-Namen: FK-Verletzung (23503) mit Bezug auf dog_id / dogs.
  const fk = m.includes('23503') || m.includes('foreign key constraint');
  if (fk && (m.includes('dog_id') || m.includes('"dogs"'))) return true;
  // dog_id leer (23502) → ebenfalls nur durch Zuordnung lösbar.
  if (m.includes('null value in column "dog_id"')) return true;
  return false;
}

/** Netz-/Offline-Fehler: dürfen NIE als „Hund fehlt" gelten. */
export function isNetworkError(message: string | null | undefined): boolean {
  if (!message) return false;
  return /network request failed|failed to fetch|network ?error|timed? ?out|timeout|offline|internet|aborted|econn|enotfound|socket/i.test(message);
}

export interface FailedTrainingCandidate {
  dogId: string | null;
  lastError: string | null;
}

/**
 * Hund fehlt, wenn
 *  - der Server den Upload mit dem dog_id-FK (23503) bzw. NOT NULL abgelehnt hat, oder
 *  - die Hunde des Kontos frisch und erfolgreich vom Server geladen wurden (nicht leer)
 *    und die lokale dog_id nicht darunter ist.
 * `serverDogIds = null` heisst: nicht geladen (offline/Fehler) → nur der Serverfehler zählt.
 * Ein reiner Netzfehler zählt nie, auch wenn die Hundeliste etwas anderes vermuten liesse.
 */
export function isMissingDog(c: FailedTrainingCandidate, serverDogIds: ReadonlySet<string> | null): boolean {
  if (isMissingDogError(c.lastError)) return true;
  if (isNetworkError(c.lastError)) return false;
  if (!serverDogIds || serverDogIds.size === 0) return false;
  return !c.dogId || !serverDogIds.has(c.dogId);
}

export type SyncErrorKind = 'missing_dog' | 'network' | 'auth' | 'markers' | 'server' | 'unknown';

export function syncErrorKind(message: string | null | undefined): SyncErrorKind {
  if (!message) return 'unknown';
  if (isMissingDogError(message)) return 'missing_dog';
  if (isNetworkError(message)) return 'network';
  if (/jwt|auth|401|403|permission denied|row-level security|not authorized|unauthori[sz]ed/i.test(message)) return 'auth';
  if (/^markers:/i.test(message)) return 'markers';
  return 'server';
}

/** Übersetzungsschlüssel des lesbaren Grundes. */
export function syncErrorTextKey(kind: SyncErrorKind): string {
  return `sync.reason.${kind}`;
}

/** Kurzer technischer Zusatz (für Support), ohne lange Server-Details. */
export function shortTechnicalError(message: string | null | undefined, max = 140): string | null {
  if (!message) return null;
  const firstLine = message.split('\n')[0].trim();
  return firstLine.length > max ? `${firstLine.slice(0, max - 1)}…` : firstLine;
}

export interface PayloadSummary { distanceMeters: number | null; searched: boolean }

/** Länge und Stand (gelegt/abgesucht) aus payload_json – tolerant für Altformate. */
export function summarizePayload(payloadJson: string | null | undefined): PayloadSummary {
  let p: Record<string, unknown> | null = null;
  try { p = payloadJson ? JSON.parse(payloadJson) : null; } catch { p = null; }
  if (!p || typeof p !== 'object') return { distanceMeters: null, searched: false };
  const d = typeof p.distanceMeters === 'number' && Number.isFinite(p.distanceMeters) ? p.distanceMeters : null;
  const run = p.run as Record<string, unknown> | null | undefined;
  return { distanceMeters: d, searched: !!run && typeof run === 'object' };
}

// Aufteilung für das Sync-Center: „Hund fehlt" (nur eigene, lokal vorhandene Fährten)
// vs. übrige Fehler. Reine Funktion; bestimmt nur die Anzeige, ändert nichts.
export function splitFailedItems<T extends {
  entityType: string; lastError: string | null;
  session: { userId: string; dogId: string | null } | null;
}>(items: readonly T[], ownerId: string | null | undefined, serverDogIds: ReadonlySet<string> | null): { missingDog: T[]; other: T[] } {
  const missingDog: T[] = [];
  const other: T[] = [];
  for (const it of items) {
    const own = it.entityType === 'training_session' && !!it.session && !!ownerId && it.session.userId === ownerId;
    if (own && isMissingDog({ dogId: it.session!.dogId, lastError: it.lastError }, serverDogIds)) missingDog.push(it);
    else other.push(it);
  }
  return { missingDog, other };
}

// Identität des Liegezeit-Screens — REIN, testbar.
//
// Benachrichtigung und Live Activity öffnen `/track/liegen?id=<sessionId>` OHNE dogId (auch bereits
// angezeigte, ältere Einträge). Früher fiel der Screen dann auf den Store bzw. den JÜNGSTEN Puffer
// IRGENDEINES Hundes zurück (loadPending(undefined) → loadMostRecentPending) und zeigte bei mehreren
// liegenden Fährten die Fährte eines anderen Hundes. Regel (fail closed, nie „neuester Puffer"):
//   1. sessionId + dogId → genau diese; widerspricht die lokale Session dem Hund → keine Anzeige
//   2. nur sessionId     → Hund ausschliesslich aus GENAU dieser lokalen Session
//   3. nur dogId         → der eigene Slot dieses Hundes (Vorwärts-Flow aus Legen/Absuche)
//   4. nichts            → keine Anzeige
export type RestingIdentity =
  | { ok: true; sessionId: string | null; dogId: string; source: 'route' | 'session' | 'dog' }
  | { ok: false; reason: 'no_identity' | 'unknown_session' | 'dog_mismatch' };

/**
 * @param sessionDogId dog_id der lokalen Session zu routeSessionId: string = gefunden,
 *   null = keine lokale Session, undefined = nicht nachgeschlagen (nur ohne routeSessionId zulässig).
 */
export function resolveRestingIdentity(input: {
  routeSessionId: string | null | undefined;
  routeDogId: string | null | undefined;
  sessionDogId: string | null | undefined;
}): RestingIdentity {
  const sessionId = input.routeSessionId || null;
  const dogId = input.routeDogId || null;
  if (sessionId && dogId) {
    if (input.sessionDogId && input.sessionDogId !== dogId) return { ok: false, reason: 'dog_mismatch' };
    return { ok: true, sessionId, dogId, source: 'route' };
  }
  if (sessionId) {
    return input.sessionDogId ? { ok: true, sessionId, dogId: input.sessionDogId, source: 'session' } : { ok: false, reason: 'unknown_session' };
  }
  if (dogId) return { ok: true, sessionId: null, dogId, source: 'dog' };
  return { ok: false, reason: 'no_identity' };
}

/**
 * Darf ein geladener Puffer bzw. der Store für diese Identität angezeigt werden? Nur derselbe Hund
 * und — wenn eine Session vorgegeben ist — genau diese Session (nie eine andere desselben Hundes).
 */
export function matchesRestingIdentity(
  identity: { sessionId: string | null; dogId: string },
  candidate: { dogId?: string | null; sessionId?: string | null } | null | undefined,
): boolean {
  if (!candidate) return false;
  if (candidate.dogId != null && candidate.dogId !== identity.dogId) return false;
  return !identity.sessionId || candidate.sessionId === identity.sessionId;
}

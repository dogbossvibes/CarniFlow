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
 * Gehört ein Puffer bzw. der Aufnahme-Store zu Session `target.sessionId` von Hund `target.dogId`?
 * Der Recorder hält die lokale Session-ID bewusst NICHT im Aufnahme-Store (currentSessionId bleibt
 * null, siehe useTrackRecorder) — Puffer frisch gelegter Fährten tragen daher `sessionId: null`.
 * Die verbindliche Zuordnung Hund → offene Session steht in der Aktive-Fährten-Registry (beim
 * Lege-Ende mit der lokalen Session-ID gesetzt). Deshalb:
 *   • gleiche sessionId (und kein fremder Hund) → ja
 *   • sessionId fehlt → NUR mit Registry-Beleg: derselbe Hund UND Registry(Hund).sessionId === Ziel
 *   • sonst → nein (nie ein anderer Hund, nie „irgendein" Puffer)
 */
export function belongsToSession(
  candidate: { dogId?: string | null; sessionId?: string | null } | null | undefined,
  target: { dogId: string; sessionId: string },
  registrySessionId?: string | null,
): boolean {
  if (!candidate) return false;
  if (candidate.dogId != null && candidate.dogId !== target.dogId) return false;
  if (candidate.sessionId != null) return candidate.sessionId === target.sessionId;
  return registrySessionId != null && registrySessionId === target.sessionId;
}

/**
 * Darf ein geladener Puffer bzw. der Store für diese Identität angezeigt werden? Nur derselbe Hund
 * und — wenn eine Session vorgegeben ist — genau diese Session (ohne eigene sessionId nur mit
 * Registry-Beleg, siehe belongsToSession).
 */
export function matchesRestingIdentity(
  identity: { sessionId: string | null; dogId: string },
  candidate: { dogId?: string | null; sessionId?: string | null } | null | undefined,
  registrySessionId?: string | null,
): boolean {
  if (!candidate) return false;
  if (!identity.sessionId) return candidate.dogId == null || candidate.dogId === identity.dogId;
  return belongsToSession(candidate, { dogId: identity.dogId, sessionId: identity.sessionId }, registrySessionId);
}

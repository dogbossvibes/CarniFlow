// Referenz-Fährten beim Legen (I/O-Teil). Die Regeln liegen rein in
// store/trackReferenceOverlays.ts. Dieser Loader LIEST ausschliesslich lokal
// (AsyncStorage-Pending-Slot ohne Migration + SQLite) und schreibt NICHTS: kein
// Recovery, keine Registry-Reparatur, kein Pending-Write, keine Session, kein Quota.
// Offline-fähig. Fehler einer einzelnen Fährte blenden nur diese aus.
import { peekPending } from '@/features/tracking/store/trackPersist';
import {
  pendingMatches, resolveReferenceOverlay,
  type TrackReferenceCandidate, type TrackReferenceOverlay, type TrackReferenceSources,
} from '@/features/tracking/store/trackReferenceOverlays';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { getLayTrackPointsBySession } from '@/features/tracking/repositories/localTrackRepository';

async function loadSources(c: TrackReferenceCandidate): Promise<TrackReferenceSources> {
  const [pending, session] = await Promise.all([
    peekPending(c.dogId).catch(() => null),
    getLocalTrainingSessionById(c.sessionId).catch(() => null),
  ]);
  // SQLite-Punkte nur, wenn der Pending-Puffer keine passende Geometrie liefert.
  const layPoints = !pendingMatches(pending, c) && session
    ? await getLayTrackPointsBySession(c.sessionId).catch(() => null)
    : null;
  return { pending, session, layPoints };
}

/** Geometrie aller Kandidaten laden (Reihenfolge der Kandidaten bleibt erhalten). */
export async function loadActiveTrackOverlays(
  candidates: readonly TrackReferenceCandidate[],
  userId: string | null | undefined,
): Promise<TrackReferenceOverlay[]> {
  const results = await Promise.all(candidates.map(async c => {
    try {
      return resolveReferenceOverlay(c, await loadSources(c), userId);
    } catch (e) {
      if (__DEV__) console.warn('[trackReferenceOverlays] load', c.dogId, e);
      return null;
    }
  }));
  return results.filter((o): o is TrackReferenceOverlay => !!o);
}

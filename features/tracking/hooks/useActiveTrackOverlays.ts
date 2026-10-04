import { useEffect, useMemo, useState } from 'react';
import { useActiveFaehrten } from '@/features/tracking/store/activeFaehrten';
import {
  filterVisibleReferenceOverlays, ownedDogNames, referenceCandidatesKey, selectReferenceCandidates,
  type TrackReferenceOverlay, type TrackReferenceScope,
} from '@/features/tracking/store/trackReferenceOverlays';
import { loadActiveTrackOverlays } from '@/features/tracking/services/trackReferenceOverlayService';

const EMPTY: TrackReferenceOverlay[] = [];

export interface UseActiveTrackOverlaysArgs extends Omit<TrackReferenceScope, 'ownerUserId'> {
  /** Angemeldeter Nutzer — Ownership-Kriterium (Dog.owner_id) und Sperre gegen fremde
   *  lokale Session-Zeilen. Ohne Nutzer → keine Referenzen. */
  userId: string | null | undefined;
}

/**
 * Read-only Referenz-Fährten der anderen eigenen Hunde (offen: laid/resting/searching).
 *
 * Lädt Geometrie NUR, wenn sich der relevante Registry-Schlüssel (Hund/Session/
 * Status/Name), der aktuelle Hund/die Session oder der Nutzer ändert — NIE pro
 * GPS-Fix: der Store-Selektor liefert einen String, sodass die 4-s-Kennzahl-Updates
 * der laufenden Aufnahme weder ein Re-Render noch einen Ladevorgang auslösen.
 * Kein Schreiben, kein Recovery, keine Registry-Reparatur.
 */
export function useActiveTrackOverlays({ userId, currentUserDogs, currentDogId, currentSessionId }: UseActiveTrackOverlaysArgs): TrackReferenceOverlay[] {
  const scope: TrackReferenceScope = { currentUserDogs, ownerUserId: userId, currentDogId, currentSessionId };
  const key = useActiveFaehrten(s => referenceCandidatesKey(selectReferenceCandidates(s.byDog, scope)));
  const [overlays, setOverlays] = useState<TrackReferenceOverlay[]>(EMPTY);

  useEffect(() => {
    if (!key) { setOverlays(EMPTY); return; }
    // Effect-Cleanup = Generations-Schutz: ein älterer, später fertiger Ladevorgang
    // (vorheriger Schlüssel/Nutzer) überschreibt nie das Ergebnis des neueren.
    let cancelled = false;
    const candidates = selectReferenceCandidates(useActiveFaehrten.getState().byDog, scope);
    loadActiveTrackOverlays(candidates, userId)
      .then(r => { if (!cancelled) setOverlays(r.length ? r : EMPTY); })
      .catch(() => { if (!cancelled) setOverlays(EMPTY); });
    return () => { cancelled = true; };
    // Bewusst nur der Schlüssel (+ Nutzer): currentUserDogs/currentDogId/currentSessionId
    // fliessen vollständig in `key` ein; ein neues Array gleichen Inhalts lädt nicht neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, userId]);

  // Bis ein Neuladen fertig ist, bleibt das vorige Ergebnis im State — die Anzeige
  // wird daher immer gegen den AKTUELLEN Hund/Session/Nutzer gefiltert. Stabile
  // Referenz (memo), solange sich nichts Relevantes ändert.
  const ownedKey = [...ownedDogNames(scope).keys()].join('|');
  return useMemo(
    () => {
      const visible = filterVisibleReferenceOverlays(overlays, scope);
      return visible.length === overlays.length ? overlays : visible;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overlays, ownedKey, currentDogId, currentSessionId],
  );
}

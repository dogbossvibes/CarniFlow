import { clearTrackChoice } from './choice';
import { setUnitTrackSelection, trackLinksAvailable } from './store';
import { syncTrackLinks } from './sync';

/**
 * Übernimmt die Auswahl eines Trainings in den lokalen Speicher und stösst den
 * Abgleich an. `null` heisst «Auswahl nicht geladen»: dann wird nichts verändert,
 * damit ein Ladefehler nie bestehende Verknüpfungen löst. Wirft nicht.
 */
export async function applyTrackChoice(ownerId: string, unitId: string, sessionIds: readonly string[] | null): Promise<boolean> {
  if (!ownerId || !unitId || sessionIds == null || !trackLinksAvailable()) return false;
  try {
    await setUnitTrackSelection(ownerId, unitId, sessionIds);
    await clearTrackChoice(ownerId, unitId);
    void syncTrackLinks(ownerId);
    return true;
  } catch { return false; }
}

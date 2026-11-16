import { getLocalDb } from '@/lib/localDb/client';

/** Markierung in payload_json einer Gruppenfährte (siehe groupTrackLocal.ts). */
export const GROUP_TRACK_KEY = 'groupTrack';
export interface GroupTrackMarker { version: 1; trackId: string; blind: boolean }

export function readGroupTrackMarker(payloadJson: string | null | undefined): GroupTrackMarker | null {
  try {
    const value = JSON.parse(payloadJson ?? '{}')?.[GROUP_TRACK_KEY];
    if (!value || value.version !== 1 || typeof value.trackId !== 'string' || typeof value.blind !== 'boolean') return null;
    return { version: 1, trackId: value.trackId, blind: value.blind };
  } catch { return null; }
}

/** «Blind absuchen»: Verlauf und Abweichungswarnungen bleiben aus, solange keine Absuche abgeschlossen ist. Reine Anzeigeregel. */
export async function isBlindSearch(localId: string): Promise<boolean> {
  const db = await getLocalDb();
  const row = await db.getFirstAsync<{ payload_json: string | null }>('select payload_json from local_training_sessions where local_id=?', localId);
  if (!row || !readGroupTrackMarker(row.payload_json)?.blind) return false;
  try { return !JSON.parse(row.payload_json ?? '{}')?.run; } catch { return true; }
}

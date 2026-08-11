import { getUserTrackSessions } from '@/features/tracking/services/trackService';
import { getLocalTrainingSessions } from '@/features/training/repositories/localTrainingRepository';
import { mergeTrackHistory, type TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';

// Verlauf laden = Remote (Supabase) + lokale (SQLite) Fährten zusammenführen.
// WICHTIG: Ein Remote-Fehler (offline / Supabase down) darf die lokalen Fährten
// NICHT verdecken — remote fällt dann auf [] zurück, lokale bleiben sichtbar.
export async function getTrackHistory(ownerId: string): Promise<TrackHistoryRow[]> {
  const [remoteRes, local] = await Promise.all([
    getUserTrackSessions(ownerId).catch(() => ({ data: null, error: 'load' as const })),
    getLocalTrainingSessions(ownerId, { type: 'track' }).catch(() => []),
  ]);
  return mergeTrackHistory(remoteRes.data ?? [], local ?? []);
}

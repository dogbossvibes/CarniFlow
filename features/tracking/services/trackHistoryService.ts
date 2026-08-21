import { getUserTrackSessions } from '@/features/tracking/services/trackService';
import {
  getLocalTrainingSessions, getLocalTrainingSessionById, updateLocalTrackEvaluation,
} from '@/features/training/repositories/localTrainingRepository';
import { getTrackPointsBySession, getTrackMarkersBySession } from '@/features/tracking/repositories/localTrackRepository';
import { enqueueSyncOperation } from '@/features/sync/repositories/syncQueueRepository';
import { mergeTrackHistory, type TrackHistoryRow } from '@/features/tracking/utils/trackHistoryMerge';
import { buildLocalTrackDetail, runSupplementFromPayload } from '@/features/tracking/utils/localTrackDetail';

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

// Detail einer noch nicht synchronisierten Fährte lokal (SQLite) zusammenbauen —
// Fallback, wenn getTrackSessionById (remote) nichts liefert. null, wenn lokal unbekannt.
export async function getLocalTrackDetail(localId: string): Promise<Record<string, any> | null> {
  const local = await getLocalTrainingSessionById(localId).catch(() => null);
  if (!local) return null;
  const [points, markers] = await Promise.all([
    getTrackPointsBySession(localId).catch(() => []),
    getTrackMarkersBySession(localId).catch(() => []),
  ]);
  return buildLocalTrackDetail(local, points, markers);
}

// Run-Ergänzung aus der lokalen Session — für eine remote-Session, deren Absuche-Run
// (track_runs) noch nicht synchronisiert ist. null, wenn lokal kein Run vorliegt.
export async function getLocalRunSupplement(localId: string): Promise<ReturnType<typeof runSupplementFromPayload>> {
  const local = await getLocalTrainingSessionById(localId).catch(() => null);
  return local ? runSupplementFromPayload(local.payload_json) : null;
}

// Auswertung (Score/Notiz) einer lokal-only Fährte lokal speichern + zur Re-Sync
// einreihen. Kein Remote-Direktschreiben (das würde ohne Remote-Zeile verpuffen).
export async function saveLocalTrackEvaluation(localId: string, input: { score: number; notes: string | null; legs?: { name: string; score: number; max: number }[] }): Promise<void> {
  await updateLocalTrackEvaluation(localId, input);   // flippt synced→pending
  await enqueueSyncOperation({ entityType: 'training_session', entityLocalId: localId, operation: 'create', priority: 1 }).catch(() => {});
}

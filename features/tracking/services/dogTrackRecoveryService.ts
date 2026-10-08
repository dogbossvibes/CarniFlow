import { getLocalTrainingSessions } from '@/features/training/repositories/localTrainingRepository';
import { durableLifecycle } from '@/features/tracking/store/trackRecovery';
import type { LocalTrainingSession } from '@/features/sync/types/sync';

export interface DogRecoveryTrack { id: string; date: string | null; cancelled: boolean }
/** Candidate list only. The existing recovery service rechecks geometry and conflicts before any action. */
export function dogRecoveryCandidates(rows: readonly LocalTrainingSession[], userId: string, dogId: string): DogRecoveryTrack[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (!userId || !dogId || row.user_id !== userId || row.dog_id !== dogId || row.type !== 'track'
      || row.deleted_at || !row.ended_at || seen.has(row.local_id)) return false;
    seen.add(row.local_id);
    if (durableLifecycle(row) === 'completed_without_app') return false;
    try { if (row.payload_json && JSON.parse(row.payload_json)?.run) return false; } catch { return false; }
    return true;
  }).map(row => ({ id: row.local_id, date: row.started_at ?? row.created_at, cancelled: durableLifecycle(row) === 'cancelled' }))
    .sort((a, b) => (Date.parse(b.date ?? '') || 0) - (Date.parse(a.date ?? '') || 0));
}
export async function getDogRecoveryTracks(userId: string, dogId: string) {
  return dogRecoveryCandidates(await getLocalTrainingSessions(userId, { type: 'track', dogId }), userId, dogId);
}

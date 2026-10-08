import { getTrackSessionById } from './trackService';
import { getLocalTrackDetail } from './trackHistoryService';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import { buildTrackDetailMap } from '@/features/tracking/utils/trackDetailMap';
import { validSketchPoint } from '@/features/tracking/utils/trackSketchGeometry';

/** Scope-checked read-only preview. Local GPS remains available before sync or offline. */
export async function getTrackPreview(sessionId: string, dogId: string, userId: string, localOnly = false) {
  const localRow = await getLocalTrainingSessionById(sessionId).catch(() => null);
  const ownLocal = localRow?.user_id === userId && localRow.dog_id === dogId && !localRow.deleted_at && localRow.type === 'track';
  const local = ownLocal ? await getLocalTrackDetail(sessionId).catch(() => null) : null;
  const remote = localOnly ? null : (await getTrackSessionById(sessionId)).data;
  const ownRemote = remote?.owner_id === userId && remote?.dog_id === dogId && remote?.id === sessionId;
  const hasRemotePoints = ownRemote && buildTrackDetailMap(remote).lay.some(validSketchPoint);
  const detail = hasRemotePoints ? remote : local ?? (ownRemote ? remote : null);
  if (!detail) return null;
  const map = buildTrackDetailMap(detail);
  return { ...map, markers: map.markers.filter(m => validSketchPoint({ lat: m.lat, lng: m.lng })) };
}

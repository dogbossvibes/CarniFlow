import { fetchIsOnline } from '@/features/sync/services/netinfo';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/features/sync/store/syncStore';
import {
  getPendingSyncOperations, markSyncProcessing, markSyncCompleted, markSyncFailed,
  retryFailedOperations, syncQueueCounts, clearCompleted,
} from '@/features/sync/repositories/syncQueueRepository';
import {
  getLocalTrainingSessionById, setTrainingRemoteId, updateTrainingSyncStatus,
} from '@/features/training/repositories/localTrainingRepository';
import {
  getTrackPointsBySession, getTrackMarkersBySession, updateTrackPointSyncStatus,
} from '@/features/tracking/repositories/localTrackRepository';
import { getPendingMediaFiles, markMediaUploaded, markMediaUploadFailed } from '@/features/media/repositories/localMediaRepository';
import {
  createRemoteTrainingSession, updateRemoteTrainingSession, deleteRemoteTrainingSession,
  createRemoteTrackPointsBatch, createRemoteTrackMarkersBatch, uploadRemoteMediaFile,
  deleteRemoteLayTrackPoints, deleteRemoteTrackMarkers,
} from '@/features/sync/services/remoteTrainingSyncService';

let running = false;

async function isOnline(): Promise<boolean> {
  return fetchIsOnline();
}

async function refreshCounts() {
  const c = await syncQueueCounts();
  const st = useSyncStore.getState();
  st.setPendingCount(c.pending); st.setFailedCount(c.failed); st.setConflictCount(c.conflict);
}

// Eine Trainings-Session + ihre Kinder (Punkte, Marker) hochladen. Exportiert für
// gezielte Idempotenz-/Replace-Tests (kein Verhaltenswechsel gegenüber intern).
export async function syncTrainingSession(localId: string): Promise<{ ok: boolean; error?: string }> {
  const local = await getLocalTrainingSessionById(localId);
  if (!local) return { ok: true };   // lokal weg → nichts zu tun

  // Idempotenter Session-Upsert: die remote_id IST die lokale UUID (local_id).
  // Auch wenn eine ACK zuvor verloren ging (remote_id lokal noch null), erzeugt der
  // Upsert keine zweite Zeile — er aktualisiert dieselbe id.
  const sres = await createRemoteTrainingSession(local);
  if (sres.error || !sres.data) return { ok: false, error: sres.error ?? 'Session-Upload fehlgeschlagen' };
  const remoteId = sres.data.id;   // == local.local_id
  if (!local.remote_id) await setTrainingRemoteId(localId, remoteId);   // verknüpft Kinder (session_remote_id)

  // Punkte — idempotenter Replace-by-session (nur gelegte Spur, point_type='lay';
  // Suchpunkte bleiben unberührt). Delete + Insert → keine Duplikate bei Retry.
  const layPoints = (await getTrackPointsBySession(localId)).filter(p => (p.point_type ?? 'lay') === 'lay');
  const dp = await deleteRemoteLayTrackPoints(remoteId);
  if (dp.error) return { ok: false, error: dp.error };
  if (layPoints.length > 0) {
    const pr = await createRemoteTrackPointsBatch(remoteId, layPoints);
    if (pr.error) return { ok: false, error: pr.error };
    await updateTrackPointSyncStatus(layPoints.map(p => p.local_id), 'synced');
  }

  // Marker — idempotenter Replace-by-session.
  const markers = await getTrackMarkersBySession(localId);
  const dm = await deleteRemoteTrackMarkers(remoteId);
  if (dm.error) return { ok: false, error: dm.error };
  if (markers.length > 0) {
    const mr = await createRemoteTrackMarkersBatch(remoteId, markers);
    if (mr.error) return { ok: false, error: mr.error };
  }

  await updateTrainingSyncStatus(localId, 'synced');
  return { ok: true };
}

async function processQueueItem(item: Awaited<ReturnType<typeof getPendingSyncOperations>>[number]): Promise<void> {
  useSyncStore.getState().setCurrentSyncItem(`${item.entity_type}:${item.operation}`);
  await markSyncProcessing(item.id);
  try {
    if (item.entity_type === 'training_session') {
      if (item.operation === 'delete') {
        const local = await getLocalTrainingSessionById(item.entity_local_id);
        if (local?.remote_id) { const r = await deleteRemoteTrainingSession(local.remote_id); if (r.error) throw new Error(r.error); }
        await markSyncCompleted(item.id);
      } else if (item.operation === 'update') {
        const local = await getLocalTrainingSessionById(item.entity_local_id);
        if (local?.remote_id) { const r = await updateRemoteTrainingSession(local.remote_id, { notes: local.notes, rating: local.score, status: local.status, ended_at: local.ended_at, duration_seconds: local.duration_seconds }); if (r.error) throw new Error(r.error); }
        else { const res = await syncTrainingSession(item.entity_local_id); if (!res.ok) throw new Error(res.error); }
        await markSyncCompleted(item.id);
      } else {
        const res = await syncTrainingSession(item.entity_local_id);
        if (!res.ok) throw new Error(res.error);
        await markSyncCompleted(item.id);
      }
    } else if (item.entity_type === 'media_file') {
      await syncMediaItem(item.id, item.entity_local_id);
    } else {
      // track_point/track_marker werden mit ihrer Session synchronisiert.
      await markSyncCompleted(item.id);
    }
  } catch (e: any) {
    await markSyncFailed(item.id, e?.message ?? 'Unbekannter Fehler');
    await updateTrainingSyncStatus(item.entity_local_id, 'failed', e?.message).catch(() => {});
  }
}

async function syncMediaItem(queueId: string, mediaLocalId: string) {
  const pending = await getPendingMediaFiles(50);
  const m = pending.find(x => x.local_id === mediaLocalId);
  if (!m) { await markSyncCompleted(queueId); return; }
  const res = await uploadRemoteMediaFile(m);
  if (res.error || !res.data) { await markMediaUploadFailed(m.local_id, res.error ?? 'Upload fehlgeschlagen'); await markSyncFailed(queueId, res.error ?? 'Upload fehlgeschlagen'); return; }
  await markMediaUploaded(m.local_id, res.data.url);
  await markSyncCompleted(queueId);
}

// Haupt-Einstieg: alle ausstehenden Operationen abarbeiten.
export async function syncNow(): Promise<void> {
  if (running) return;
  const st = useSyncStore.getState();
  if (!(await isOnline())) { st.setOnlineStatus(false); return; }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;   // ohne Login kein Sync

  running = true;
  st.setSyncing(true);
  st.setLastError(null);
  try {
    const ops = await getPendingSyncOperations(200);
    for (let i = 0; i < ops.length; i++) {
      await processQueueItem(ops[i]);
      st.setSyncProgress((i + 1) / ops.length);
    }
    await clearCompleted();
    st.setLastSyncAt(Date.now());
  } catch (e: any) {
    st.setLastError(e?.message ?? 'Sync-Fehler');
  } finally {
    await refreshCounts().catch(() => {});
    st.setSyncing(false);
    running = false;
  }
}

export async function syncPendingOperations() { return syncNow(); }
export async function retryFailedSync() { await retryFailedOperations(); await syncNow(); }
export async function updateSyncCounts() { await refreshCounts(); }

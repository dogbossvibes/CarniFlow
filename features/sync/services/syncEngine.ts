import { fetchIsOnline } from '@/features/sync/services/netinfo';
import { supabase } from '@/lib/supabase';
import { useSyncStore } from '@/features/sync/store/syncStore';
import {
  getPendingSyncOperations, markSyncProcessing, markSyncCompleted, markSyncFailed,
  retryFailedOperations, markSyncConflict, syncQueueCounts, clearCompleted,
} from '@/features/sync/repositories/syncQueueRepository';
import {
  getLocalTrainingSessionById, setTrainingRemoteId, updateTrainingSyncStatus,
} from '@/features/training/repositories/localTrainingRepository';
import {
  getTrackPointsBySession, getTrackMarkersBySession, updateTrackPointSyncStatus,
} from '@/features/tracking/repositories/localTrackRepository';
import { getPendingMediaFiles, markMediaUploaded, markMediaUploadFailed } from '@/features/media/repositories/localMediaRepository';
import { validSessionRating } from '@/features/tracking/utils/sessionRating';
import {
  createRemoteTrainingSession, updateRemoteTrainingSession, deleteRemoteTrainingSession,
  createRemoteTrackPointsBatch, createRemoteTrackMarkersBatch, createRemoteTrackMarkersIndividually, uploadRemoteMediaFile,
  deleteRemoteLayTrackPoints, deleteRemoteTrackMarkers, upsertRemoteTrackRun,
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

// Grund, warum ein Queue-Item NICHT rekonstruierbar ist: die lokale Session
// (mit Punkten, Markern, Run) existiert auf diesem Gerät nicht mehr. Früher
// wurde dieser Fall still als `ok: true` („nichts zu tun") abgehakt — der
// Nutzer sah „synchronisiert", obwohl remote track_markers/track_runs fehlten
// (Production-Befund 84b3c0ea: 0 Marker, 0 Runs, nie nachgezogen).
export const LOCAL_SESSION_MISSING = 'Lokale Session nicht gefunden – nicht rekonstruierbar';

export interface SyncSessionResult { ok: boolean; error?: string; reason?: 'local_missing' }

// Eine Trainings-Session + ihre Kinder (Punkte, Marker) hochladen. Exportiert für
// gezielte Idempotenz-/Replace-Tests (kein Verhaltenswechsel gegenüber intern).
export async function syncTrainingSession(localId: string): Promise<SyncSessionResult> {
  const local = await getLocalTrainingSessionById(localId);
  if (!local) return { ok: false, error: LOCAL_SESSION_MISSING, reason: 'local_missing' };

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

  // Marker — idempotenter Replace-by-session. Ein Marker-Fehler darf den
  // Run-Sync NICHT verhindern (Production-Befund: ein einziger vom DB-Contract
  // abgelehnter Marker liess Batch + Run scheitern → 0 Marker, 0 track_runs).
  // Ablauf: Batch → bei Fehler Einzel-Inserts (gültige Marker bleiben erhalten)
  // → Run wird in jedem Fall geschrieben → Marker-Fehler wird DANACH als
  // ok:false gemeldet (Queue-Item bleibt failed/retry, Session nicht 'synced').
  const markers = await getTrackMarkersBySession(localId);
  const dm = await deleteRemoteTrackMarkers(remoteId);
  if (dm.error) return { ok: false, error: dm.error };
  let markerError: string | null = null;
  if (markers.length > 0) {
    const mr = await createRemoteTrackMarkersBatch(remoteId, markers);
    if (mr.error) {
      const single = await createRemoteTrackMarkersIndividually(remoteId, markers);
      if (single.failed.length > 0) {
        markerError = `markers: ${single.failed.length}/${markers.length} abgelehnt (${single.failed[0].error})`;
      }
    }
  }

  // Absuche-Run (RUN-SAVE2) — NACH dem Parent-Upsert (FK-Reihenfolge). track_runs wird
  // idempotent per runUuid geschrieben (run_points = kanonische Absuche-Spur). Fehlt
  // payload_json.run, ist nichts zu tun (reiner Lay-Track). Kein Push von point_type=
  // 'search' nach track_points (der Detail-Screen liest die Spur aus track_runs.run_points).
  const run = ((): Record<string, any> | null => {
    try { const p = local.payload_json ? JSON.parse(local.payload_json) : null; return p?.run ?? null; } catch { return null; }
  })();
  if (run?.run_id) {
    const rr = await upsertRemoteTrackRun(remoteId, run);
    if (rr.error) return { ok: false, error: rr.error };
  }

  // Marker-Fehler erst JETZT melden: Run ist gesichert, der Retry versucht die
  // Marker erneut (Replace-by-session), nichts wird still verschluckt.
  if (markerError) return { ok: false, error: markerError };

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
        // rating nur gültig (1–5) übernehmen; der Fährten-Score (0–100) bleibt in
        // track_data.score (autoritativ über den create/upsert-Pfad synchronisiert).
        if (local?.remote_id) { const r = await updateRemoteTrainingSession(local.remote_id, { notes: local.notes, rating: validSessionRating(local.score), status: local.status, ended_at: local.ended_at, duration_seconds: local.duration_seconds }); if (r.error) throw new Error(r.error); }
        else {
          const res = await syncTrainingSession(item.entity_local_id);
          if (res.reason === 'local_missing') { await markSyncConflict(item.id, res.error); return; }
          if (!res.ok) throw new Error(res.error);
        }
        await markSyncCompleted(item.id);
      } else {
        const res = await syncTrainingSession(item.entity_local_id);
        // Lokale Session weg → terminal 'conflict' (sichtbar, nicht endlos
        // retried; retryFailedOperations fasst nur 'failed' an). Kein
        // updateTrainingSyncStatus: die Zeile existiert nicht mehr.
        if (res.reason === 'local_missing') { await markSyncConflict(item.id, res.error); return; }
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

// Beim Öffnen einer Fährte/Einheit: ist die lokale Session nicht 'synced'
// (pending/failed), fehlgeschlagene Queue-Items wieder in den Retry-Pfad
// nehmen — egal von welchem Screen aus geöffnet wurde (Startliste, Logbuch,
// Hero, Run-Abschluss). Vorher hing der Retry nur an der Startliste, am
// Sync-Screen und am Dev-Debug; ein 'failed' Item blieb sonst dauerhaft liegen.
// Bestehende Semantik unverändert: retryFailedOperations (failed → pending,
// attempts bleiben gezählt) + syncNow. Ohne lokale Session: nichts zu retryen.
export async function retryFailedSyncForSession(localId: string): Promise<boolean> {
  const local = await getLocalTrainingSessionById(localId).catch(() => null);
  if (!local || local.sync_status === 'synced') return false;
  await retryFailedSync();
  return true;
}
export async function updateSyncCounts() { await refreshCounts(); }

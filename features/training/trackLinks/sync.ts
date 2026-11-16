import { supabase } from '@/lib/supabase';
import { getLocalTrainingSessionById } from '@/features/training/repositories/localTrainingRepository';
import {
  confirmLinkRemoved, confirmLinkSynced, dropOrphanLink, mergeRemoteLinks, noteLinkError, openLinkOperations,
  type RemoteTrackLink, type TrackLink,
} from './store';

// Abgleich der lokalen Verknüpfungen mit public.training_unit_tracks (#114).
// Eine Verknüpfung wartet ohne Fehlerstatus, solange Training oder Fährte noch
// nicht auf dem Server liegen oder die Tabelle dort noch fehlt. Es wird nie
// etwas anderes als die Verknüpfungszeile geschrieben oder gelöscht.

const REMOTE = 'training_unit_tracks';
export const WAITING_FOR_SERVER = 'WAITING_FOR_SERVER';   // Training/Fährte noch nicht synchronisiert
export const SERVER_NOT_READY = 'SERVER_NOT_READY';       // Tabelle fehlt (Migration noch nicht ausgeführt)

type PgError = { code?: string | null; message?: string | null } | null;
const tableMissing = (e: PgError) => !!e && (e.code === '42P01' || e.code === 'PGRST205'
  || /training_unit_tracks.*(does not exist|schema cache)/i.test(e.message ?? ''));
const parentMissing = (e: PgError) => !!e && (e.code === '42501' || e.code === '23503');
const duplicate = (e: PgError) => !!e && e.code === '23505';

export interface TrackLinkSyncResult { synced: number; removed: number; waiting: number; failed: number; serverReady: boolean }

async function existsRemote(table: 'training_units' | 'training_sessions', id: string): Promise<boolean | null> {
  const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
  return error ? null : !!data;
}

// Die Fährte existiert weder auf dem Server noch lokal: Sie wurde gelöscht, die
// Verknüpfung ist gegenstandslos. Alles andere (Training noch im Speicherauftrag,
// Fährte noch nicht hochgeladen) wartet.
async function trackGone(link: TrackLink): Promise<boolean> {
  if (await existsRemote('training_sessions', link.training_session_id) !== false) return false;
  const local = await getLocalTrainingSessionById(link.training_session_id).catch(() => undefined);
  return local === null || (!!local && !!local.deleted_at);
}

async function pushCreate(link: TrackLink): Promise<'synced' | 'removed' | 'waiting' | 'failed' | 'not_ready'> {
  const { error } = await supabase.from(REMOTE).upsert({
    id: link.id, owner_id: link.owner_id, training_unit_id: link.training_unit_id,
    training_session_id: link.training_session_id, track_run_id: link.track_run_id,
  }, { onConflict: 'id', ignoreDuplicates: true });
  // 23505: dieselbe Verknüpfung existiert bereits (anderes Gerät) – Ziel erreicht.
  if (!error || duplicate(error)) { await confirmLinkSynced(link); return 'synced'; }
  if (tableMissing(error)) { await noteLinkError(link, SERVER_NOT_READY); return 'not_ready'; }
  if (parentMissing(error)) {
    if (await trackGone(link)) {
      // Nur die lokale Verknüpfungszeile; serverseitig gibt es nichts zu lösen.
      await dropOrphanLink(link);
      return 'removed';
    }
    await noteLinkError(link, WAITING_FOR_SERVER); return 'waiting';
  }
  await noteLinkError(link, error.message ?? 'Sync-Fehler'); return 'failed';
}

async function pushDelete(link: TrackLink): Promise<'removed' | 'failed'> {
  // Über den fachlichen Schlüssel lösen: die Server-ID kann von einem anderen Gerät stammen.
  let query = supabase.from(REMOTE).delete().eq('owner_id', link.owner_id)
    .eq('training_unit_id', link.training_unit_id).eq('training_session_id', link.training_session_id);
  query = link.track_run_id ? query.eq('track_run_id', link.track_run_id) : query.is('track_run_id', null);
  const { error } = await query;
  // Fehlt die Tabelle, wurde nie etwas hochgeladen.
  if (!error || tableMissing(error)) { await confirmLinkRemoved(link); return 'removed'; }
  await noteLinkError(link, error.message ?? 'Sync-Fehler'); return 'failed';
}

let running: Promise<TrackLinkSyncResult> | null = null;

/** Gleicht alle offenen Verknüpfungen der angemeldeten Person ab. Wirft nicht. */
export function syncTrackLinks(ownerId: string, options?: { sessionVerified?: boolean }): Promise<TrackLinkSyncResult> {
  if (running) return running;
  const task = (async (): Promise<TrackLinkSyncResult> => {
    const result: TrackLinkSyncResult = { synced: 0, removed: 0, waiting: 0, failed: 0, serverReady: true };
    try {
      if (!ownerId) return result;
      // Die Sync-Engine hat die Sitzung unmittelbar vorher geprüft; sonst hier prüfen.
      if (!options?.sessionVerified) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user.id !== ownerId) return result;
      }
      for (const link of await openLinkOperations(ownerId)) {
        const outcome = link.state === 'delete_pending' ? await pushDelete(link) : await pushCreate(link);
        if (outcome === 'not_ready') { result.serverReady = false; result.waiting++; continue; }
        result[outcome]++;
      }
    } catch { result.failed++; }
    return result;
  })();
  running = task;
  void task.finally(() => { if (running === task) running = null; });
  return task;
}

async function pull(ownerId: string, scope: { unitId: string } | { sessionId: string }): Promise<boolean> {
  if (!ownerId) return false;
  try {
    const [column, value] = 'unitId' in scope ? ['training_unit_id', scope.unitId] : ['training_session_id', scope.sessionId];
    const { data, error } = await supabase.from(REMOTE)
      .select('id, training_unit_id, training_session_id, track_run_id, created_at')
      .eq('owner_id', ownerId).eq(column, value);
    if (error || !Array.isArray(data)) return false;
    await mergeRemoteLinks(ownerId, scope, data as RemoteTrackLink[]);
    return true;
  } catch { return false; }
}

/** Serverstand eines Trainings nachladen (anderes Gerät). Offline oder ohne Tabelle: keine Wirkung. */
export const refreshUnitLinks = (ownerId: string, unitId: string) => pull(ownerId, { unitId });
/** Serverstand einer Fährte nachladen. Offline oder ohne Tabelle: keine Wirkung. */
export const refreshSessionLinks = (ownerId: string, sessionId: string) => pull(ownerId, { sessionId });

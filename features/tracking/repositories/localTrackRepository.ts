import { getLocalDb } from '@/lib/localDb/client';
import { newLocalId, nowIso } from '@/lib/localDb/ids';
import type { LocalTrackPoint, LocalTrackMarker, SyncStatus } from '@/features/sync/types/sync';

export interface NewTrackPoint {
  latitude: number; longitude: number;
  accuracy?: number | null; altitude?: number | null; speed?: number | null; heading?: number | null;
  timestamp?: string; point_type?: string;
}

// GPS-Punkte laufend als Batch persistieren (Crash-/Akku-sicher).
export async function createLocalTrackPointsBatch(sessionLocalId: string, points: NewTrackPoint[]): Promise<void> {
  if (points.length === 0) return;
  const db = await getLocalDb();
  const ts = nowIso();
  await db.withTransactionAsync(async () => {
    for (const p of points) {
      await db.runAsync(
        `insert into local_track_points (local_id, remote_id, session_local_id, session_remote_id, latitude, longitude, accuracy, altitude, speed, heading, timestamp, point_type, created_at, sync_status, payload_json)
         values (?, null, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', null)`,
        newLocalId('pt'), sessionLocalId, p.latitude, p.longitude, p.accuracy ?? null, p.altitude ?? null,
        p.speed ?? null, p.heading ?? null, p.timestamp ?? ts, p.point_type ?? 'lay', ts,
      );
    }
  });
}

export interface NewTrackMarker {
  marker_type: string; material?: string | null;
  latitude?: number | null; longitude?: number | null; accuracy?: number | null;
  distance_from_start?: number | null; note?: string | null; audio_local_uri?: string | null;
}

export async function createLocalTrackMarker(sessionLocalId: string, m: NewTrackMarker): Promise<string> {
  const db = await getLocalDb();
  const id = newLocalId('mk');
  await db.runAsync(
    `insert into local_track_markers (local_id, remote_id, session_local_id, session_remote_id, marker_type, material, latitude, longitude, accuracy, distance_from_start, note, audio_local_uri, audio_remote_url, created_at, sync_status, payload_json)
     values (?, null, ?, null, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, 'pending', null)`,
    id, sessionLocalId, m.marker_type, m.material ?? null, m.latitude ?? null, m.longitude ?? null,
    m.accuracy ?? null, m.distance_from_start ?? null, m.note ?? null, m.audio_local_uri ?? null, nowIso(),
  );
  return id;
}

export async function getTrackPointsBySession(sessionLocalId: string): Promise<LocalTrackPoint[]> {
  const db = await getLocalDb();
  return db.getAllAsync<LocalTrackPoint>(`select * from local_track_points where session_local_id=? order by timestamp asc`, sessionLocalId);
}

export async function getPendingTrackPoints(sessionLocalId: string): Promise<LocalTrackPoint[]> {
  const db = await getLocalDb();
  return db.getAllAsync<LocalTrackPoint>(`select * from local_track_points where session_local_id=? and sync_status!='synced' order by timestamp asc`, sessionLocalId);
}

export async function getTrackMarkersBySession(sessionLocalId: string): Promise<LocalTrackMarker[]> {
  const db = await getLocalDb();
  return db.getAllAsync<LocalTrackMarker>(`select * from local_track_markers where session_local_id=? order by created_at asc`, sessionLocalId);
}

export async function updateTrackPointSyncStatus(localIds: string[], status: SyncStatus): Promise<void> {
  if (localIds.length === 0) return;
  const db = await getLocalDb();
  const placeholders = localIds.map(() => '?').join(',');
  await db.runAsync(`update local_track_points set sync_status=? where local_id in (${placeholders})`, status, ...localIds);
}

export async function updateMarkerRemoteId(localId: string, remoteId: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update local_track_markers set remote_id=?, sync_status='synced' where local_id=?`, remoteId, localId);
}

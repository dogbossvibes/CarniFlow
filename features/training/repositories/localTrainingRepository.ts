import { getLocalDb } from '@/lib/localDb/client';
import { newLocalId, nowIso } from '@/lib/localDb/ids';
import type { LocalTrainingSession, SyncStatus } from '@/features/sync/types/sync';

// Lokales Repository für Trainingseinheiten/Fährten-Sessions (SQLite = primäre Quelle).

export interface NewLocalTrainingSession {
  user_id: string;
  dog_id?: string | null;
  category?: string | null;
  type?: string;
  status?: string;
  title?: string | null;
  notes?: string | null;
  score?: number | null;
  visibility?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  temperature?: number | null;
  weather_condition?: string | null;
  wind_speed?: number | null;
  humidity?: number | null;
  surface_types?: string[] | null;
  terrain_conditions?: string[] | null;
}

export async function createLocalTrainingSession(input: NewLocalTrainingSession): Promise<LocalTrainingSession> {
  const db = await getLocalDb();
  const ts = nowIso();
  const row: LocalTrainingSession = {
    local_id: newLocalId(), remote_id: null,
    user_id: input.user_id, dog_id: input.dog_id ?? null, category: input.category ?? 'IGP',
    type: input.type ?? 'track', status: input.status ?? 'active', title: input.title ?? 'Fährte',
    notes: input.notes ?? null, score: input.score ?? null, visibility: input.visibility ?? null,
    started_at: input.started_at ?? ts, ended_at: input.ended_at ?? null, duration_seconds: input.duration_seconds ?? null,
    location_name: input.location_name ?? null, latitude: input.latitude ?? null, longitude: input.longitude ?? null,
    temperature: input.temperature ?? null, weather_condition: input.weather_condition ?? null,
    wind_speed: input.wind_speed ?? null, humidity: input.humidity ?? null,
    surface_types: input.surface_types ? JSON.stringify(input.surface_types) : null,
    terrain_conditions: input.terrain_conditions ? JSON.stringify(input.terrain_conditions) : null,
    created_at: ts, updated_at: ts, deleted_at: null,
    sync_status: 'pending', sync_attempts: 0, last_sync_error: null, last_synced_at: null,
    dirty_fields: null, payload_json: null,
  };
  await db.runAsync(
    `insert into local_training_sessions (
      local_id, remote_id, user_id, dog_id, category, type, status, title, notes, score, visibility,
      started_at, ended_at, duration_seconds, location_name, latitude, longitude, temperature,
      weather_condition, wind_speed, humidity, surface_types, terrain_conditions, created_at, updated_at,
      deleted_at, sync_status, sync_attempts, last_sync_error, last_synced_at, dirty_fields, payload_json
    ) values (${Array(32).fill('?').join(',')})`,
    row.local_id, row.remote_id, row.user_id, row.dog_id, row.category, row.type, row.status, row.title, row.notes, row.score, row.visibility,
    row.started_at, row.ended_at, row.duration_seconds, row.location_name, row.latitude, row.longitude, row.temperature,
    row.weather_condition, row.wind_speed, row.humidity, row.surface_types, row.terrain_conditions, row.created_at, row.updated_at,
    row.deleted_at, row.sync_status, row.sync_attempts, row.last_sync_error, row.last_synced_at, row.dirty_fields, row.payload_json,
  );
  return row;
}

export async function updateLocalTrainingSession(localId: string, patch: Partial<NewLocalTrainingSession & { status: string; ended_at: string | null; duration_seconds: number | null; score: number | null; notes: string | null }>): Promise<void> {
  const db = await getLocalDb();
  const map: Record<string, any> = { ...patch };
  if ('surface_types' in patch) map.surface_types = patch.surface_types ? JSON.stringify(patch.surface_types) : null;
  if ('terrain_conditions' in patch) map.terrain_conditions = patch.terrain_conditions ? JSON.stringify(patch.terrain_conditions) : null;
  const keys = Object.keys(map);
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k}=?`).join(', ');
  await db.runAsync(
    `update local_training_sessions set ${sets}, updated_at=?, sync_status=case when sync_status='synced' then 'pending' else sync_status end where local_id=?`,
    ...keys.map(k => map[k]), nowIso(), localId,
  );
}

export async function markTrainingAsDeleted(localId: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update local_training_sessions set deleted_at=?, sync_status='deleted_pending', updated_at=? where local_id=?`, nowIso(), nowIso(), localId);
}

export async function getLocalTrainingSessions(userId: string, opts: { type?: string; dogId?: string } = {}): Promise<LocalTrainingSession[]> {
  const db = await getLocalDb();
  let sql = `select * from local_training_sessions where user_id=? and deleted_at is null`;
  const args: any[] = [userId];
  if (opts.type) { sql += ` and type=?`; args.push(opts.type); }
  if (opts.dogId) { sql += ` and dog_id=?`; args.push(opts.dogId); }
  sql += ` order by coalesce(started_at, created_at) desc`;
  return db.getAllAsync<LocalTrainingSession>(sql, ...args);
}

export async function getLocalTrainingSessionById(localId: string): Promise<LocalTrainingSession | null> {
  const db = await getLocalDb();
  return (await db.getFirstAsync<LocalTrainingSession>(`select * from local_training_sessions where local_id=?`, localId)) ?? null;
}

export async function updateTrainingSyncStatus(localId: string, status: SyncStatus, error?: string | null): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(
    `update local_training_sessions set sync_status=?, last_sync_error=?, sync_attempts=sync_attempts+(case when ?='failed' then 1 else 0 end),
       last_synced_at=case when ?='synced' then ? else last_synced_at end where local_id=?`,
    status, error ?? null, status, status, nowIso(), localId,
  );
}

export async function setTrainingRemoteId(localId: string, remoteId: string): Promise<void> {
  const db = await getLocalDb();
  await db.runAsync(`update local_training_sessions set remote_id=?, sync_status='synced', last_synced_at=? where local_id=?`, remoteId, nowIso(), localId);
  // Kind-Datensätze mit der neuen remote_id verknüpfen.
  await db.runAsync(`update local_track_points set session_remote_id=? where session_local_id=?`, remoteId, localId);
  await db.runAsync(`update local_track_markers set session_remote_id=? where session_local_id=?`, remoteId, localId);
  await db.runAsync(`update local_media_files set session_remote_id=? where session_local_id=?`, remoteId, localId);
}

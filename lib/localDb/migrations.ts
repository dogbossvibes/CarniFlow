import { RAW_CAPTURE_SCHEMA } from '@/features/tracking/storage/rawCaptureSchema';
import { EXCHANGE_SCHEMA } from '@/features/tracking-exchange/schema';
import { PLANNER_SCHEMA } from '@/features/tracking-planner/schema';
import { DISTRACTION_SCHEMA } from '@/features/tracking-distractions/schema';
// Lokale SQLite-Migrationen (idempotent). Jede Migration hat eine Version;
// angewandte Versionen stehen in local_schema_migrations.
export interface LocalMigration { version: number; name: string; sql: string }

export const MIGRATIONS: LocalMigration[] = [
  {
    version: 1,
    name: 'create_local_training_sessions',
    sql: `create table if not exists local_training_sessions (
      local_id text primary key,
      remote_id text,
      user_id text,
      dog_id text,
      category text,
      type text,
      status text,
      title text,
      notes text,
      score real,
      visibility text,
      started_at text,
      ended_at text,
      duration_seconds integer,
      location_name text,
      latitude real,
      longitude real,
      temperature real,
      weather_condition text,
      wind_speed real,
      humidity real,
      surface_types text,
      terrain_conditions text,
      created_at text,
      updated_at text,
      deleted_at text,
      sync_status text,
      sync_attempts integer default 0,
      last_sync_error text,
      last_synced_at text,
      dirty_fields text,
      payload_json text
    );`,
  },
  {
    version: 2,
    name: 'create_local_track_points',
    sql: `create table if not exists local_track_points (
      local_id text primary key,
      remote_id text,
      session_local_id text not null,
      session_remote_id text,
      latitude real,
      longitude real,
      accuracy real,
      altitude real,
      speed real,
      heading real,
      timestamp text,
      point_type text,
      created_at text,
      sync_status text,
      payload_json text
    );
    create index if not exists idx_ltp_session on local_track_points (session_local_id);`,
  },
  {
    version: 3,
    name: 'create_local_track_markers',
    sql: `create table if not exists local_track_markers (
      local_id text primary key,
      remote_id text,
      session_local_id text not null,
      session_remote_id text,
      marker_type text,
      material text,
      latitude real,
      longitude real,
      accuracy real,
      distance_from_start real,
      note text,
      audio_local_uri text,
      audio_remote_url text,
      created_at text,
      sync_status text,
      payload_json text
    );
    create index if not exists idx_ltm_session on local_track_markers (session_local_id);`,
  },
  {
    version: 4,
    name: 'create_local_media_files',
    sql: `create table if not exists local_media_files (
      local_id text primary key,
      remote_id text,
      session_local_id text,
      session_remote_id text,
      file_type text,
      local_uri text,
      remote_url text,
      mime_type text,
      file_size integer,
      duration_seconds integer,
      width integer,
      height integer,
      created_at text,
      sync_status text,
      upload_attempts integer default 0,
      last_upload_error text,
      metadata_json text
    );`,
  },
  {
    version: 5,
    name: 'create_sync_queue',
    sql: `create table if not exists sync_queue (
      id text primary key,
      entity_type text not null,
      entity_local_id text not null,
      operation text not null,
      priority integer default 5,
      payload_json text,
      created_at text,
      updated_at text,
      attempts integer default 0,
      last_error text,
      status text default 'pending'
    );
    create index if not exists idx_sq_status on sync_queue (status, priority);`,
  },
  {
    version: 6,
    name: 'add_angle_kind_to_local_track_markers',
    sql: `alter table local_track_markers add column angle_kind text;`,
  },
  {
    version: 7,
    name: 'create_local_track_transfer_sync',
    sql: `create table if not exists local_track_transfer_sync (
      session_id text primary key references local_training_sessions(local_id) on delete cascade,
      receipt_id text not null unique,
      user_id text not null,
      receipt_json text not null,
      revision integer not null,
      base_patch_json text not null,
      pending_json text,
      deleted integer not null default 0
    );`,
  },
  { version: 8, name: 'independent_distraction_tracks', sql: DISTRACTION_SCHEMA },
  {
    version: 9,
    name: 'create_track_object_review_store',
    // Separate from sync_queue: older clients discard unknown queue entity types.
    // No foreign-key cascade: pending human observations survive parent resync.
    sql: `create table if not exists track_object_review_cache (
      owner_id text not null, run_id text not null, session_id text not null,
      dog_id text not null, revision integer not null, response_json text not null,
      updated_at text not null, primary key (owner_id, run_id)
    );
    create table if not exists track_object_review_outbox (
      operation_id text primary key, owner_id text not null, run_id text not null,
      session_id text not null, dog_id text not null, request_json text not null,
      state text not null check (state in ('pending','failed','conflict','sent','cancelled')),
      created_at text not null, last_error text
    );
    create unique index if not exists idx_review_one_open
      on track_object_review_outbox (owner_id, run_id)
      where state in ('pending','failed','conflict');
    create index if not exists idx_review_owner_state
      on track_object_review_outbox (owner_id, state);`,
  },
  { version: 10, name: 'local_track_planner', sql: PLANNER_SCHEMA },
  { version: 11, name: 'distraction_parent_reference', sql: `create table if not exists local_distraction_parents (
    owner_id text not null, session_id text not null, payload_json text not null, primary key(owner_id,session_id)
  );` },
  { version: 12, name: 'track_file_exchange', sql: EXCHANGE_SCHEMA },
  { version: 13, name: 'isolated_raw_capture', sql: RAW_CAPTURE_SCHEMA },
];

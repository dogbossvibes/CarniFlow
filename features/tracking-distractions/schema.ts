export const DISTRACTION_SCHEMA = `create table if not exists local_track_distractions (
 id text primary key, owner_id text not null, parent_session_id text not null,
 revision integer not null, updated_at integer not null, payload_json text not null
);
create index if not exists idx_distraction_parent on local_track_distractions(owner_id,parent_session_id);`;

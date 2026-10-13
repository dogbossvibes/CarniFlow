export const PLANNER_SCHEMA = `create table if not exists local_track_plans (
 owner_id text not null, id text not null, revision integer not null check(revision > 0),
 updated_at integer not null, payload_json text not null, primary key(owner_id,id)
);`;

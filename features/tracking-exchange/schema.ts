export const EXCHANGE_SCHEMA = `create table if not exists local_track_exchange (
 owner_id text not null, task_id text not null, role text not null check(role in ('outgoing','incoming')),
 parent_id text not null, offer_json text not null, created_at integer not null,
 primary key(owner_id,task_id), unique(owner_id,parent_id,task_id)
);
create index if not exists idx_exchange_parent on local_track_exchange(owner_id,parent_id,role);
create table if not exists local_track_exchange_receipts (
 owner_id text not null, task_id text not null, contribution_id text not null,
 payload_json text not null, local_child_id text not null, created_at integer not null,
 primary key(owner_id,task_id,contribution_id)
 );
create table if not exists local_track_group_tasks (
 owner_id text not null, server_task_id text not null, local_task_id text not null,
 reference_digest text not null, primary key(owner_id,server_task_id),unique(owner_id,local_task_id)
);`;

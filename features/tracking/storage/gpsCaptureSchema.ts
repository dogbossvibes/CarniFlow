/** Links preserve lay/search/attempt identity outside rendered geometry and sync. */
export const GPS_CAPTURE_LINK_SCHEMA = `
create table if not exists raw_capture_deleted_parents (
 owner_id text not null, parent_session_id text not null, primary key(owner_id,parent_session_id)
);
create table if not exists raw_capture_links (
 owner_id text not null, archive_id text not null, parent_session_id text not null,
 phase text not null check(phase in ('lay','search')), attempt_id text not null, parent_local_id text,
 primary key(owner_id,archive_id)
);
create index if not exists raw_capture_parent_phase
 on raw_capture_links(owner_id,parent_session_id,phase);
`;

/** Additive local-only schema. No relation to line/marker tables or sync queue. */
export const RAW_CAPTURE_SCHEMA = `
create table if not exists raw_capture_accounts (
 owner_id text primary key, generation integer not null, active integer not null check(active in (0,1))
);
create table if not exists raw_capture_sessions (
 owner_id text not null, session_id text not null, generation integer not null,
 state text not null check(state in ('open','interrupted','complete','deleted')),
 primary key(owner_id,session_id)
);
create table if not exists raw_capture_measurements (
 arrival_id integer primary key autoincrement,
 owner_id text not null, session_id text not null, generation integer not null,
 measured_at real not null, received_at real not null, payload_json text not null,
 foreign key(owner_id,session_id) references raw_capture_sessions(owner_id,session_id)
);
create index if not exists raw_capture_owner_session_arrival
 on raw_capture_measurements(owner_id,session_id,arrival_id);
`;

/** Close old callbacks without deleting any saved raw measurements. */
export const RAW_CAPTURE_REVOKE = `
update raw_capture_accounts set active=0,generation=generation+1;
update raw_capture_sessions set state='interrupted',generation=generation+1 where state='open';
`;

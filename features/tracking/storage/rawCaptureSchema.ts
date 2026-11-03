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
create table if not exists raw_capture_counts (
 owner_id text primary key, record_count integer not null check(record_count >= 0)
);
insert into raw_capture_counts(owner_id,record_count)
 select owner_id,count(*) from raw_capture_measurements group by owner_id
 on conflict(owner_id) do update set record_count=excluded.record_count;
create trigger if not exists raw_capture_count_insert after insert on raw_capture_measurements
 begin
  insert into raw_capture_counts(owner_id,record_count) values(new.owner_id,1)
   on conflict(owner_id) do update set record_count=record_count+1;
 end;
create trigger if not exists raw_capture_count_delete after delete on raw_capture_measurements
 begin
  update raw_capture_counts set record_count=record_count-1 where owner_id=old.owner_id;
 end;
create index if not exists raw_capture_owner_session_arrival
 on raw_capture_measurements(owner_id,session_id,arrival_id);
`;

/** Close old callbacks without deleting any saved raw measurements. */
export const RAW_CAPTURE_REVOKE = `
update raw_capture_accounts set active=0,generation=generation+1;
update raw_capture_sessions set state='interrupted',generation=generation+1 where state='open';
`;

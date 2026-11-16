-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261116210000_training_unit_tracks.sql on top of the baseline and
-- TRACK_MODULE_SETUP.sql (track_runs). Never run against a linked or remote project.
--
--   docker exec -i <local supabase db container> \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
--     < supabase/local/training_unit_tracks_cases.sql
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'UNIT TRACKS FAIL: %', label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare got text := null;
begin
 begin execute command; exception when insufficient_privilege then got := 'denied'; when others then got := sqlstate || ' ' || sqlerrm; end;
 if got is distinct from 'denied' then raise exception 'UNIT TRACKS FAIL: % (got %)', label, coalesce(got, 'success'); end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;

-- OWNER (zwei Hunde, zwei Fährten, eine Absuche), OTHER (eigenes Training, eigene Fährte).
-- Nur die ID: funktioniert mit dem vollen lokalen Supabase-Stack und mit dem nackten Datenbank-Image.
insert into auth.users(id) values ('a1111111-1111-4111-8111-111111111111'), ('b2222222-2222-4222-8222-222222222222');
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-0000000000a1','a1111111-1111-4111-8111-111111111111','Luna'),
 ('a0000000-0000-4000-8000-0000000000a2','a1111111-1111-4111-8111-111111111111','Balu'),
 ('b0000000-0000-4000-8000-0000000000b1','b2222222-2222-4222-8222-222222222222','Rex');
insert into public.training_sessions(id,owner_id,dog_id,category,session_date,type) values
 ('5a000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111','a0000000-0000-4000-8000-0000000000a1','faehrte',current_date,'track'),
 ('5a000000-0000-4000-8000-000000000002','a1111111-1111-4111-8111-111111111111','a0000000-0000-4000-8000-0000000000a1','faehrte',current_date,'track'),
 ('5b000000-0000-4000-8000-000000000001','b2222222-2222-4222-8222-222222222222','b0000000-0000-4000-8000-0000000000b1','faehrte',current_date,'track');
insert into public.track_runs(id,session_id) values
 ('7a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000001'),
 ('7a000000-0000-4000-8000-000000000002','5a000000-0000-4000-8000-000000000002');
insert into public.training_units(id,owner_id,dog_id,session_date,status) values
 ('1a000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111','a0000000-0000-4000-8000-0000000000a1',current_date,'completed'),
 ('1a000000-0000-4000-8000-000000000002','a1111111-1111-4111-8111-111111111111','a0000000-0000-4000-8000-0000000000a2',current_date,'completed'),
 ('1b000000-0000-4000-8000-000000000001','b2222222-2222-4222-8222-222222222222','b0000000-0000-4000-8000-0000000000b1',current_date,'completed');
create temporary table qa_counts as select
 (select count(*) from public.training_sessions) as sessions, (select count(*) from public.track_runs) as runs,
 (select count(*) from public.training_units) as units;
grant select on qa_counts to authenticated;

set local role authenticated;
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');

-- Mehrere Fährten pro Training, mehrere Trainings (Hunde) pro Fährte, Absuche optional.
insert into public.training_unit_tracks(id,training_unit_id,training_session_id) values
 ('11000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000001'),
 ('11000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000002'),
 ('11000000-0000-4000-8000-000000000003','1a000000-0000-4000-8000-000000000002','5a000000-0000-4000-8000-000000000001');
insert into public.training_unit_tracks(training_unit_id,training_session_id,track_run_id) values
 ('1a000000-0000-4000-8000-000000000002','5a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001');
select pg_temp.ok('owner links several tracks and several trainings', (select count(*) from public.training_unit_tracks) = 4);
select pg_temp.ok('owner_id defaults to the signed-in user',
 (select bool_and(owner_id = 'a1111111-1111-4111-8111-111111111111') from public.training_unit_tracks));

-- Eindeutigkeit je Training/Fährte und je Training/Fährte/Absuche.
do $$ begin
 begin
  insert into public.training_unit_tracks(training_unit_id,training_session_id) values ('1a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000001');
  raise exception 'UNIT TRACKS FAIL: duplicate track link accepted';
 exception when unique_violation then perform pg_temp.ok('duplicate track link rejected', true); end;
 begin
  insert into public.training_unit_tracks(training_unit_id,training_session_id,track_run_id) values ('1a000000-0000-4000-8000-000000000002','5a000000-0000-4000-8000-000000000001','7a000000-0000-4000-8000-000000000001');
  raise exception 'UNIT TRACKS FAIL: duplicate run link accepted';
 exception when unique_violation then perform pg_temp.ok('duplicate run link rejected', true); end;
end $$;
-- Wiederholung mit derselben ID ist ohne Wirkung (Sync-Wiederholung).
insert into public.training_unit_tracks(id,training_unit_id,training_session_id) values
 ('11000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000001')
 on conflict (id) do nothing;
select pg_temp.ok('retry with the same id is a no-op', (select count(*) from public.training_unit_tracks) = 4);

-- Fremdes Training, fremde Fährte, fremder Besitz, Absuche einer anderen Fährte.
select pg_temp.denied('foreign training rejected', $q$insert into public.training_unit_tracks(training_unit_id,training_session_id) values ('1b000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied('foreign track rejected', $q$insert into public.training_unit_tracks(training_unit_id,training_session_id) values ('1a000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied('foreign owner_id rejected', $q$insert into public.training_unit_tracks(owner_id,training_unit_id,training_session_id) values ('b2222222-2222-4222-8222-222222222222','1a000000-0000-4000-8000-000000000002','5a000000-0000-4000-8000-000000000002')$q$);
select pg_temp.denied('run of another track rejected', $q$insert into public.training_unit_tracks(training_unit_id,training_session_id,track_run_id) values ('1a000000-0000-4000-8000-000000000002','5a000000-0000-4000-8000-000000000002','7a000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied('update is not granted', $q$update public.training_unit_tracks set track_run_id = null$q$);

-- Fremde Person sieht und löscht nichts.
select pg_temp.as_user('b2222222-2222-4222-8222-222222222222');
select pg_temp.ok('other user sees no links', (select count(*) from public.training_unit_tracks) = 0);
with gone as (delete from public.training_unit_tracks returning 1)
select pg_temp.ok('other user deletes no links', (select count(*) from gone) = 0);
select pg_temp.denied('other user cannot link into foreign rows', $q$insert into public.training_unit_tracks(training_unit_id,training_session_id) values ('1a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000001')$q$);

-- anon hat keinen Zugriff.
reset role; set local role anon;
select pg_temp.denied('anon cannot read links', 'select 1 from public.training_unit_tracks');
reset role; set local role authenticated;
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
select pg_temp.ok('links survived the foreign attempts', (select count(*) from public.training_unit_tracks) = 4);

-- Lösen entfernt nur die Verknüpfung.
delete from public.training_unit_tracks where id = '11000000-0000-4000-8000-000000000002';
select pg_temp.ok('unlink removes one link only', (select count(*) from public.training_unit_tracks) = 3);

-- Training löschen entfernt nur dessen Verknüpfungen, nie Fährte oder Absuche.
delete from public.training_units where id = '1a000000-0000-4000-8000-000000000002';
select pg_temp.ok('deleting a training removes only its links',
 (select count(*) from public.training_unit_tracks) = 1
 and (select count(*) from public.training_unit_tracks where training_unit_id = '1a000000-0000-4000-8000-000000000002') = 0);
reset role;
select pg_temp.ok('tracks and runs untouched by unlink and training delete',
 (select count(*) from public.training_sessions) = (select sessions from qa_counts)
 and (select count(*) from public.track_runs) = (select runs from qa_counts)
 and (select count(*) from public.training_units) = (select units from qa_counts) - 1);

-- Fährte löschen entfernt die Verknüpfung, das Training bleibt.
delete from public.training_sessions where id = '5a000000-0000-4000-8000-000000000001';
select pg_temp.ok('deleting a track keeps the training',
 (select count(*) from public.training_unit_tracks) = 0
 and exists (select 1 from public.training_units where id = '1a000000-0000-4000-8000-000000000001'));

select pg_temp.ok('table and helper closed to anon',
 not has_table_privilege('anon','public.training_unit_tracks','select')
 and not has_table_privilege('authenticated','public.training_unit_tracks','update')
 and not has_function_privilege('anon','public.training_unit_track_link_allowed(uuid,uuid,uuid)','execute'));

select 'TRAINING_UNIT_TRACKS|PASS|assertions=' || count(*) from qa_assertions;
rollback;

-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261125090000_dog_exam_book.sql (Prüfungsbuch) on top of the baseline
-- (dogs, connections, training_sessions, training_units, dog_documents).
-- Never run against a linked or remote project.
--
--   docker exec -i <local supabase db container> \
--     psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
--     < supabase/local/dog_exam_book_cases.sql
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'EXAM BOOK FAIL: %', label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare got text := null;
begin
 begin execute command; exception when insufficient_privilege then got := 'denied'; when others then got := sqlstate || ' ' || sqlerrm; end;
 if got is distinct from 'denied' then raise exception 'EXAM BOOK FAIL: % (got %)', label, coalesce(got, 'success'); end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;

-- OWNER (Luna, Balu), TRAINER (verbunden, akzeptiert), STRANGER (nicht verbunden),
-- PENDING (Verbindung nur angefragt).
insert into auth.users(id) values
 ('a1111111-1111-4111-8111-111111111111'), ('c3333333-3333-4333-8333-333333333333'),
 ('d4444444-4444-4444-8444-444444444444'), ('e5555555-5555-4555-8555-555555555555');
insert into public.dogs(id,owner_id,name) values
 ('a0000000-0000-4000-8000-0000000000a1','a1111111-1111-4111-8111-111111111111','Luna'),
 ('a0000000-0000-4000-8000-0000000000a2','a1111111-1111-4111-8111-111111111111','Balu'),
 ('d0000000-0000-4000-8000-0000000000d1','d4444444-4444-4444-8444-444444444444','Rex');
-- Verbindung vom Trainer angefragt (umgekehrte Richtung muss auch gelten).
insert into public.connections(id,owner_user_id,connected_user_id,status) values
 ('cc000000-0000-4000-8000-000000000001','c3333333-3333-4333-8333-333333333333','a1111111-1111-4111-8111-111111111111','accepted'),
 ('cc000000-0000-4000-8000-000000000002','a1111111-1111-4111-8111-111111111111','e5555555-5555-4555-8555-555555555555','pending');
insert into public.training_sessions(id,owner_id,dog_id,category,session_date,type) values
 ('5a000000-0000-4000-8000-000000000001','a1111111-1111-4111-8111-111111111111','a0000000-0000-4000-8000-0000000000a1','faehrte',current_date,'track'),
 ('5d000000-0000-4000-8000-000000000001','d4444444-4444-4444-8444-444444444444','d0000000-0000-4000-8000-0000000000d1','faehrte',current_date,'track');
create temporary table qa_counts as select (select count(*) from public.training_sessions) as sessions, (select count(*) from public.dogs) as dogs;
grant select on qa_counts to authenticated;

set local role authenticated;
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');

-- Besitzerin legt an (owner_id per Default), auch Wiederholung mit derselben ID.
insert into public.dog_exam_results(id,dog_id,client_local_id,exam_date,exam_type,exam_level,sections,total_points,max_points,passed,notes) values
 ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-0000000000a1','e0000000-0000-4000-8000-000000000001','2027-04-12','igp','2',
  '[{"key":"A","label":"Fährte","points":92,"maxPoints":100}]',92,100,true,'Notiz'),
 ('e0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-0000000000a2','e0000000-0000-4000-8000-000000000002','2026-10-03','bh','bh','[]',null,null,true,null);
insert into public.dog_exam_results(id,dog_id,client_local_id,exam_date,exam_type) values
 ('e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-0000000000a1','e0000000-0000-4000-8000-000000000001','2027-04-12','igp')
 on conflict (id) do update set notes = excluded.notes;
select pg_temp.ok('owner creates entries, owner_id defaults to user',
 (select count(*) from public.dog_exam_results) = 2
 and (select bool_and(owner_id = 'a1111111-1111-4111-8111-111111111111') from public.dog_exam_results));

-- Plausibilität auf dem Server.
do $$ begin
 begin
  insert into public.dog_exam_results(dog_id,client_local_id,exam_date,exam_type) values ('a0000000-0000-4000-8000-0000000000a1','x1','2027-01-01','IGP!');
  raise exception 'EXAM BOOK FAIL: invalid type accepted';
 exception when check_violation then perform pg_temp.ok('invalid exam_type rejected', true); end;
 begin
  insert into public.dog_exam_results(dog_id,client_local_id,exam_date,exam_type,total_points) values ('a0000000-0000-4000-8000-0000000000a1','x2','2027-01-01','igp',-1);
  raise exception 'EXAM BOOK FAIL: negative points accepted';
 exception when check_violation then perform pg_temp.ok('negative points rejected', true); end;
 begin
  insert into public.dog_exam_results(dog_id,client_local_id,exam_date,exam_type) values ('a0000000-0000-4000-8000-0000000000a1','e0000000-0000-4000-8000-000000000001','2027-01-01','igp');
  raise exception 'EXAM BOOK FAIL: duplicate client_local_id accepted';
 exception when unique_violation then perform pg_temp.ok('duplicate client_local_id rejected', true); end;
end $$;

-- Fremder Hund, fremder Besitz, Hund umhängen auf fremden Hund.
select pg_temp.denied('entry for foreign dog rejected', $q$insert into public.dog_exam_results(dog_id,client_local_id,exam_date,exam_type) values ('d0000000-0000-4000-8000-0000000000d1','x3','2027-01-01','igp')$q$);
select pg_temp.denied('foreign owner_id rejected', $q$insert into public.dog_exam_results(owner_id,dog_id,client_local_id,exam_date,exam_type) values ('d4444444-4444-4444-8444-444444444444','a0000000-0000-4000-8000-0000000000a1','x4','2027-01-01','igp')$q$);
select pg_temp.denied('moving entry to foreign dog rejected', $q$update public.dog_exam_results set dog_id = 'd0000000-0000-4000-8000-0000000000d1' where id = 'e0000000-0000-4000-8000-000000000001'$q$);
select pg_temp.denied('hard delete not granted', $q$delete from public.dog_exam_results$q$);

-- Soft-Delete und Wiederherstellen.
update public.dog_exam_results set deleted_at = now() where id = 'e0000000-0000-4000-8000-000000000002';
select pg_temp.ok('owner still sees soft-deleted entry', (select count(*) from public.dog_exam_results) = 2);

-- Verknüpfungen: nur eigene Ziele.
insert into public.dog_exam_links(exam_id,kind,target_id) values
 ('e0000000-0000-4000-8000-000000000001','training_session','5a000000-0000-4000-8000-000000000001');
select pg_temp.ok('owner links own track', (select count(*) from public.dog_exam_links) = 1);
select pg_temp.denied('link to foreign track rejected', $q$insert into public.dog_exam_links(exam_id,kind,target_id) values ('e0000000-0000-4000-8000-000000000001','training_session','5d000000-0000-4000-8000-000000000001')$q$);

-- Freigaben: nur über akzeptierte Verbindung, nur eigener Hund.
insert into public.dog_exam_access_grants(id,dog_id,grantee_user_id,connection_id) values
 ('9a000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-0000000000a1','c3333333-3333-4333-8333-333333333333','cc000000-0000-4000-8000-000000000001');
select pg_temp.ok('owner grants to connected trainer (either direction)', (select count(*) from public.dog_exam_access_grants) = 1);
select pg_temp.denied('grant without accepted connection rejected', $q$insert into public.dog_exam_access_grants(dog_id,grantee_user_id,connection_id) values ('a0000000-0000-4000-8000-0000000000a1','e5555555-5555-4555-8555-555555555555','cc000000-0000-4000-8000-000000000002')$q$);
select pg_temp.denied('grant via someone else''s connection rejected', $q$insert into public.dog_exam_access_grants(dog_id,grantee_user_id,connection_id) values ('a0000000-0000-4000-8000-0000000000a1','d4444444-4444-4444-8444-444444444444','cc000000-0000-4000-8000-000000000001')$q$);
select pg_temp.denied('grant for foreign dog rejected', $q$insert into public.dog_exam_access_grants(dog_id,grantee_user_id,connection_id) values ('d0000000-0000-4000-8000-0000000000d1','c3333333-3333-4333-8333-333333333333','cc000000-0000-4000-8000-000000000001')$q$);

-- Trainer liest nur Luna, nur nicht entfernte Einträge, schreibt nichts.
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('trainer sees exactly the shared, visible entry',
 (select array_agg(id::text) from public.dog_exam_results) = array['e0000000-0000-4000-8000-000000000001']);
select pg_temp.ok('trainer sees links of shared entry', (select count(*) from public.dog_exam_links) = 1);
with changed as (update public.dog_exam_results set notes = 'Trainer' returning 1)
select pg_temp.ok('trainer updates nothing', (select count(*) from changed) = 0);
select pg_temp.denied('trainer cannot create entries for the dog', $q$insert into public.dog_exam_results(dog_id,client_local_id,exam_date,exam_type) values ('a0000000-0000-4000-8000-0000000000a1','t1','2027-01-01','igp')$q$);
with changed as (update public.dog_exam_access_grants set revoked_at = now() returning 1)
select pg_temp.ok('trainer cannot revoke or alter grants', (select count(*) from changed) = 0);

-- Fremde Person sieht nichts.
select pg_temp.as_user('d4444444-4444-4444-8444-444444444444');
select pg_temp.ok('stranger sees no entries, links or grants',
 (select count(*) from public.dog_exam_results) = 0 and (select count(*) from public.dog_exam_links) = 0
 and (select count(*) from public.dog_exam_access_grants) = 0);

-- Verbindung endet → Sicht endet sofort.
reset role;
update public.connections set status = 'declined' where id = 'cc000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('ended connection hides entries', (select count(*) from public.dog_exam_results) = 0);
reset role;
update public.connections set status = 'accepted' where id = 'cc000000-0000-4000-8000-000000000001';
set local role authenticated;

-- Widerruf durch die Besitzerin wirkt sofort und lässt sich nicht zurücknehmen.
select pg_temp.as_user('a1111111-1111-4111-8111-111111111111');
update public.dog_exam_access_grants set revoked_at = now() where id = '9a000000-0000-4000-8000-000000000001';
select pg_temp.denied('grantee cannot be changed', $q$update public.dog_exam_access_grants set grantee_user_id = 'd4444444-4444-4444-8444-444444444444'$q$);
with changed as (update public.dog_exam_access_grants set revoked_at = null returning 1)
select pg_temp.ok('revocation cannot be undone by update', (select count(*) from changed) = 0);
select pg_temp.as_user('c3333333-3333-4333-8333-333333333333');
select pg_temp.ok('revoked grant hides entries', (select count(*) from public.dog_exam_results) = 0);

-- anon hat keinen Zugriff.
reset role; set local role anon;
select pg_temp.denied('anon cannot read entries', 'select 1 from public.dog_exam_results');
select pg_temp.denied('anon cannot read grants', 'select 1 from public.dog_exam_access_grants');
reset role;

-- Löschen des Verknüpfungsziels oder der Verknüpfung berührt nichts anderes.
delete from public.dog_exam_links;
select pg_temp.ok('unlink keeps track and entry',
 (select count(*) from public.training_sessions) = (select sessions from qa_counts)
 and exists (select 1 from public.dog_exam_results where id = 'e0000000-0000-4000-8000-000000000001'));

-- Hund löschen entfernt nur dessen Einträge und Freigaben.
delete from public.dogs where id = 'a0000000-0000-4000-8000-0000000000a1';
select pg_temp.ok('deleting a dog removes only its exam rows',
 not exists (select 1 from public.dog_exam_results where dog_id = 'a0000000-0000-4000-8000-0000000000a1')
 and exists (select 1 from public.dog_exam_results where dog_id = 'a0000000-0000-4000-8000-0000000000a2')
 and (select count(*) from public.dog_exam_access_grants) = 0);

select pg_temp.ok('tables and helpers closed to anon',
 not has_table_privilege('anon','public.dog_exam_results','select')
 and not has_table_privilege('authenticated','public.dog_exam_results','delete')
 and not has_function_privilege('anon','public.can_view_dog_exams(uuid)','execute'));

select count(*) as assertions_passed from qa_assertions;
rollback;

-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies supabase/migrations/20261114220000_umfrage_rls_hardening.sql
-- (requires UMFRAGE_SETUP.sql tables + public.connections).
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'UMFRAGE FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute command; exception when insufficient_privilege then blocked:=true; end;
 perform pg_temp.ok(label,blocked);
end $$;
create function pg_temp.as_user(p uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub', p::text, true), set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated')::text, true);
$$;
grant execute on function pg_temp.ok(text,boolean), pg_temp.denied(text,text), pg_temp.as_user(uuid) to authenticated;

-- TRAINER, KUNDE + KUNDE2 (verbunden), FREMD (nicht verbunden).
insert into auth.users(id) values
 ('a1111111-1111-1111-1111-111111111111'),('b2222222-2222-2222-2222-222222222222'),
 ('c3333333-3333-3333-3333-333333333333'),('d4444444-4444-4444-4444-444444444444');
insert into public.connections(owner_user_id, connected_user_id, status) values
 ('b2222222-2222-2222-2222-222222222222','a1111111-1111-1111-1111-111111111111','accepted'),
 ('c3333333-3333-3333-3333-333333333333','a1111111-1111-1111-1111-111111111111','accepted'),
 ('d4444444-4444-4444-4444-444444444444','a1111111-1111-1111-1111-111111111111','pending');

set local role authenticated;

-- Trainer:in legt Umfrage wie die App an (createUmfrage).
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
insert into trainer_umfragen(id, trainer_id, trainer_name) values ('11111111-0000-0000-0000-000000000001','a1111111-1111-1111-1111-111111111111','Trainerin');
insert into umfrage_termine(id, umfrage_id, datum, uhrzeit_von, uhrzeit_bis) values
 ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','2026-12-01','10:00','11:00');
insert into umfrage_einladungen(umfrage_id, user_id) values
 ('11111111-0000-0000-0000-000000000001','b2222222-2222-2222-2222-222222222222'),
 ('11111111-0000-0000-0000-000000000001','c3333333-3333-3333-3333-333333333333');
select pg_temp.ok('trainer creates umfrage, termine, invitations', (select count(*) from umfrage_einladungen) = 2);
select pg_temp.denied('trainer cannot invite unconnected person',
 $q$insert into umfrage_einladungen(umfrage_id, user_id) values ('11111111-0000-0000-0000-000000000001','d4444444-4444-4444-4444-444444444444')$q$);

-- Fremde zweite Umfrage (von FREMD), um Quer-Zugriffe zu prüfen.
select pg_temp.as_user('d4444444-4444-4444-4444-444444444444');
insert into trainer_umfragen(id, trainer_id, trainer_name) values ('11111111-0000-0000-0000-000000000002','d4444444-4444-4444-4444-444444444444','Fremd');
insert into umfrage_termine(id, umfrage_id, datum, uhrzeit_von, uhrzeit_bis) values
 ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000002','2026-12-02','10:00','11:00');
select pg_temp.ok('stranger sees no foreign termine', (select count(*) from umfrage_termine where umfrage_id = '11111111-0000-0000-0000-000000000001') = 0);
select pg_temp.ok('stranger sees no foreign invitations', (select count(*) from umfrage_einladungen where umfrage_id = '11111111-0000-0000-0000-000000000001') = 0);
select pg_temp.denied('stranger cannot add termin to foreign umfrage',
 $q$insert into umfrage_termine(umfrage_id, datum, uhrzeit_von, uhrzeit_bis) values ('11111111-0000-0000-0000-000000000001','2026-12-03','10:00','11:00')$q$);
select pg_temp.denied('stranger cannot invite self to foreign umfrage',
 $q$insert into umfrage_einladungen(umfrage_id, user_id) values ('11111111-0000-0000-0000-000000000001','d4444444-4444-4444-4444-444444444444')$q$);
select pg_temp.denied('stranger cannot answer uninvited',
 $q$insert into umfrage_antworten(termin_id, umfrage_id, user_id, antwort) values ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','d4444444-4444-4444-4444-444444444444','ja')$q$);

-- Eingeladene Kundin.
select pg_temp.as_user('b2222222-2222-2222-2222-222222222222');
select pg_temp.ok('invitee sees umfrage (no policy recursion)', (select count(*) from trainer_umfragen where id = '11111111-0000-0000-0000-000000000001') = 1);
select pg_temp.ok('invitee sees termine', (select count(*) from umfrage_termine where umfrage_id = '11111111-0000-0000-0000-000000000001') = 1);
select pg_temp.ok('invitee sees only own invitation', (select count(*) from umfrage_einladungen) = 1);
insert into umfrage_antworten(termin_id, umfrage_id, user_id, antwort) values ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','b2222222-2222-2222-2222-222222222222','ja')
 on conflict (termin_id, user_id) do update set antwort = excluded.antwort;
insert into umfrage_antworten(termin_id, umfrage_id, user_id, antwort) values ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','b2222222-2222-2222-2222-222222222222','evtl')
 on conflict (termin_id, user_id) do update set antwort = excluded.antwort;
select pg_temp.ok('invitee upserts own answer', (select antwort from umfrage_antworten where user_id = 'b2222222-2222-2222-2222-222222222222') = 'evtl');
select pg_temp.denied('invitee cannot answer as someone else',
 $q$insert into umfrage_antworten(termin_id, umfrage_id, user_id, antwort) values ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','c3333333-3333-3333-3333-333333333333','nein')$q$);
select pg_temp.denied('invitee cannot attach foreign termin',
 $q$insert into umfrage_antworten(termin_id, umfrage_id, user_id, antwort) values ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','b2222222-2222-2222-2222-222222222222','ja')$q$);
select pg_temp.denied('invitee cannot add termine',
 $q$insert into umfrage_termine(umfrage_id, datum, uhrzeit_von, uhrzeit_bis) values ('11111111-0000-0000-0000-000000000001','2026-12-04','10:00','11:00')$q$);
delete from umfrage_einladungen;
update umfrage_einladungen set umfrage_id = '11111111-0000-0000-0000-000000000002';

-- Zweite Kundin sieht die Doodle-Übersicht inkl. Antwort der ersten.
select pg_temp.as_user('c3333333-3333-3333-3333-333333333333');
select pg_temp.ok('co-invitee sees other answers (doodle view)', (select count(*) from umfrage_antworten where umfrage_id = '11111111-0000-0000-0000-000000000001') = 1);

-- Trainer:in: Einladungen unverändert, Antworten sichtbar.
select pg_temp.as_user('a1111111-1111-1111-1111-111111111111');
select pg_temp.ok('invitations survive invitee delete/update attempts',
 (select count(*) from umfrage_einladungen where umfrage_id = '11111111-0000-0000-0000-000000000001') = 2);
select pg_temp.ok('trainer sees answers', (select count(*) from umfrage_antworten) = 1);

-- Fremd sieht keine Antworten der Umfrage.
select pg_temp.as_user('d4444444-4444-4444-4444-444444444444');
select pg_temp.ok('stranger sees no foreign answers', (select count(*) from umfrage_antworten where umfrage_id = '11111111-0000-0000-0000-000000000001') = 0);

reset role;
select count(*) as passed_assertions from qa_assertions;
rollback;

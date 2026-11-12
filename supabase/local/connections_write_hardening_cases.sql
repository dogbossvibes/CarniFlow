-- LOCAL ONLY: local Docker/Unix socket. All fixtures roll back.
-- Verifies 20261111210000_connections_write_hardening.sql.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'CONN-HARDENING FAIL: %',label; end if;
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

-- OWNER (Hundehalterin), TRAINER, PERSON (Gesundheitskontakt), STRANGER.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values
 ('91111111-1111-1111-1111-111111111111','authenticated','authenticated','ch-owner@local.test',now(),'{}','{}',now(),now(),false,false),
 ('92222222-2222-2222-2222-222222222222','authenticated','authenticated','ch-trainer@local.test',now(),'{}','{}',now(),now(),false,false),
 ('93333333-3333-3333-3333-333333333333','authenticated','authenticated','ch-person@local.test',now(),'{}','{}',now(),now(),false,false),
 ('94444444-4444-4444-4444-444444444444','authenticated','authenticated','ch-stranger@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.dogs(id,owner_id,name) values ('9d000000-0000-0000-0000-000000000001','91111111-1111-1111-1111-111111111111','Hardening Dog');
insert into public.dog_documents(owner_id,dog_id,kind,title) values ('91111111-1111-1111-1111-111111111111','9d000000-0000-0000-0000-000000000001','impfpass','Impfpass');
-- Altbestand: offene Anfrage, die von der verbundenen Seite stammt, und eine
-- von der Eigentümerin blockierte Verbindung.
insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type) values
 ('9c000000-0000-0000-0000-000000000001','91111111-1111-1111-1111-111111111111','92222222-2222-2222-2222-222222222222','pending','owner','trainer_client'),
 ('9c000000-0000-0000-0000-000000000002','91111111-1111-1111-1111-111111111111','94444444-4444-4444-4444-444444444444','pending','connected','trainer_client'),
 ('9c000000-0000-0000-0000-000000000003','91111111-1111-1111-1111-111111111111','94444444-4444-4444-4444-444444444444','blocked','owner','health_contact');

set local role authenticated;

-- ── STRANGER: die Lücke ist geschlossen ────────────────────────────────
select pg_temp.as_user('94444444-4444-4444-4444-444444444444');
select pg_temp.denied('stranger cannot self-insert an accepted connection',
 $$insert into public.connections(owner_user_id,connected_user_id,status,created_by,connection_type) values ('91111111-1111-1111-1111-111111111111','94444444-4444-4444-4444-444444444444','accepted','connected','family')$$);
select pg_temp.denied('stranger cannot self-insert a pending connection either',
 $$insert into public.connections(owner_user_id,connected_user_id,status,created_by,connection_type) values ('91111111-1111-1111-1111-111111111111','94444444-4444-4444-4444-444444444444','pending','connected','family2')$$);
select pg_temp.denied('stranger cannot insert as owner for someone else',
 $$insert into public.connections(owner_user_id,connected_user_id,status,created_by,connection_type) values ('91111111-1111-1111-1111-111111111111','94444444-4444-4444-4444-444444444444','accepted','owner','family3')$$);
select pg_temp.denied('connected side cannot self-accept its own request',
 $$update public.connections set status='accepted' where id='9c000000-0000-0000-0000-000000000002'$$);
select pg_temp.denied('connected side cannot lift a block set by the owner',
 $$update public.connections set status='accepted' where id='9c000000-0000-0000-0000-000000000003'$$);
select pg_temp.denied('connected side cannot rewrite created_by',
 $$update public.connections set created_by='owner' where id='9c000000-0000-0000-0000-000000000002'$$);
select pg_temp.denied('connected side cannot change connection_type',
 $$update public.connections set connection_type='health_contact' where id='9c000000-0000-0000-0000-000000000002'$$);
select pg_temp.denied('connected side cannot swap the owner',
 $$update public.connections set owner_user_id='94444444-4444-4444-4444-444444444444', connected_user_id='91111111-1111-1111-1111-111111111111' where id='9c000000-0000-0000-0000-000000000002'$$);
select pg_temp.ok('stranger still sees no owner documents', (select count(*) from public.dog_documents) = 0);
update public.connections set status='declined' where id='9c000000-0000-0000-0000-000000000002';
select pg_temp.ok('connected side may always decline', (select status from public.connections where id='9c000000-0000-0000-0000-000000000002') = 'declined');

-- ── TRAINER: bestehender Ablauf «Kunden-Anfrage annehmen/ablehnen» ──────
select pg_temp.as_user('92222222-2222-2222-2222-222222222222');
update public.connections set status='accepted' where id='9c000000-0000-0000-0000-000000000001';
select pg_temp.ok('trainer accepts a pending request created by the owner', (select status from public.connections where id='9c000000-0000-0000-0000-000000000001') = 'accepted');
update public.connections set connection_name='Kundin' where id='9c000000-0000-0000-0000-000000000001';
select pg_temp.ok('participant may rename', (select connection_name from public.connections where id='9c000000-0000-0000-0000-000000000001') = 'Kundin');
update public.connections set status='declined' where id='9c000000-0000-0000-0000-000000000001';
select pg_temp.denied('trainer cannot re-accept after declining',
 $$update public.connections set status='accepted' where id='9c000000-0000-0000-0000-000000000001'$$);

-- ── OWNER: bestehende App-Abläufe bleiben möglich ──────────────────────
select pg_temp.as_user('91111111-1111-1111-1111-111111111111');
insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type) values
 ('9c000000-0000-0000-0000-000000000010','91111111-1111-1111-1111-111111111111','93333333-3333-3333-3333-333333333333','accepted','owner','health_contact');
select pg_temp.ok('owner connects a health contact (connectAnyvoPerson)', exists(select 1 from public.connections where id='9c000000-0000-0000-0000-000000000010'));
delete from public.connections where id='9c000000-0000-0000-0000-000000000001';
insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type) values
 ('9c000000-0000-0000-0000-000000000011','91111111-1111-1111-1111-111111111111','92222222-2222-2222-2222-222222222222','accepted','owner','trainer_client');
select pg_temp.ok('owner connects a trainer (trainerService)', exists(select 1 from public.connections where id='9c000000-0000-0000-0000-000000000011'));
select pg_temp.denied('owner cannot connect to herself',
 $$insert into public.connections(owner_user_id,connected_user_id,status,created_by,connection_type) values ('91111111-1111-1111-1111-111111111111','91111111-1111-1111-1111-111111111111','accepted','owner','self')$$);
select pg_temp.denied('owner cannot forge created_by = connected',
 $$insert into public.connections(owner_user_id,connected_user_id,status,created_by,connection_type) values ('91111111-1111-1111-1111-111111111111','94444444-4444-4444-4444-444444444444','pending','connected','forged')$$);
update public.connections set status='accepted' where id='9c000000-0000-0000-0000-000000000002';
select pg_temp.ok('owner may accept a request from the connected side', (select status from public.connections where id='9c000000-0000-0000-0000-000000000002') = 'accepted');
update public.connections set status='blocked' where id='9c000000-0000-0000-0000-000000000002';
select pg_temp.ok('owner may block', (select status from public.connections where id='9c000000-0000-0000-0000-000000000002') = 'blocked');
select pg_temp.denied('owner cannot change connected_user_id',
 $$update public.connections set connected_user_id='93333333-3333-3333-3333-333333333333' where id='9c000000-0000-0000-0000-000000000002'$$);

-- ── PERSON: sieht die eigene Verbindung, darf sie lösen ────────────────
select pg_temp.as_user('93333333-3333-3333-3333-333333333333');
select pg_temp.ok('health contact reads own connection', (select count(*) from public.connections) = 1);
delete from public.connections where id='9c000000-0000-0000-0000-000000000010';
select pg_temp.ok('health contact may remove the connection', (select count(*) from public.connections) = 0);

reset role;
-- Ohne Endnutzer-Sitzung (Dashboard/service_role) greift der Trigger nicht.
select set_config('request.jwt.claim.sub','',true);
update public.connections set status='accepted' where id='9c000000-0000-0000-0000-000000000003';
select pg_temp.ok('maintenance without end-user session is not blocked', (select status from public.connections where id='9c000000-0000-0000-0000-000000000003') = 'accepted');

select count(*) as passed_assertions from qa_assertions;
rollback;

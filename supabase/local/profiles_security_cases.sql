-- LOCAL ONLY: local Docker Unix socket. All fixtures roll back.
-- Verifies 20260926080000_profiles_least_privilege_access.sql: ANON has zero
-- access to public.profiles; authenticated users read only their own row
-- directly; cross-user display names are reachable ONLY through
-- get_profile_display_names(), scoped to trainer rows and existing
-- trainer_client connections; deleting a connection removes that access;
-- shared_track_display() (Track Sharing) is unaffected since it is itself
-- SECURITY DEFINER.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'PROFILES RLS FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute command; exception when insufficient_privilege then blocked:=true; end;
 perform pg_temp.ok(label,blocked);
end $$;

-- Synthetic identities. OWNER_A/OWNER_B are plain users; TRAINER has role
-- 'trainer' (public directory) AND an accepted trainer_client connection
-- with OWNER_A specifically (OWNER_B stays unconnected throughout).
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values
 ('b1111111-1111-1111-1111-111111111111','authenticated','authenticated','psec-owner-a@local.test',now(),'{}','{}',now(),now(),false,false),
 ('b2222222-2222-2222-2222-222222222222','authenticated','authenticated','psec-owner-b@local.test',now(),'{}','{}',now(),now(),false,false),
 ('b3333333-3333-3333-3333-333333333333','authenticated','authenticated','psec-trainer@local.test',now(),'{}','{}',now(),now(),false,false);

insert into public.profiles(id,full_name,username,role,phone_number) values
 ('b1111111-1111-1111-1111-111111111111','Synthetic Owner A','psec_owner_a','user','+41 79 000 00 01'),
 ('b2222222-2222-2222-2222-222222222222','Synthetic Owner B','psec_owner_b','user','+41 79 000 00 02'),
 ('b3333333-3333-3333-3333-333333333333','Synthetic Trainer','psec_trainer','trainer',null);

insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type)
values ('c9111111-1111-1111-1111-111111111111','b1111111-1111-1111-1111-111111111111','b3333333-3333-3333-3333-333333333333','accepted','owner','trainer_client');

-- ── ANON: zero access ──────────────────────────────────────────────────────
-- revoke all ... from anon (in the migration) denies at the grant layer, not
-- just via RLS — anon's queries raise insufficient_privilege outright rather
-- than returning an RLS-filtered empty set. Stronger than RLS alone.
set local role anon;
set local request.jwt.claim.sub to '';
select pg_temp.denied('anon cannot enumerate profiles',$q$select count(*) from public.profiles$q$);
select pg_temp.denied('anon cannot read id',$q$select count(*) from public.profiles where id='b1111111-1111-1111-1111-111111111111'$q$);
select pg_temp.denied('anon cannot read full_name',$q$select full_name from public.profiles$q$);
select pg_temp.denied('anon cannot read phone_number',$q$select phone_number from public.profiles$q$);
select pg_temp.denied('anon cannot call get_profile_display_names',$q$select * from public.get_profile_display_names(array['b1111111-1111-1111-1111-111111111111']::uuid[])$q$);

-- ── OWNER_A: own row only ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'b1111111-1111-1111-1111-111111111111';
select pg_temp.ok('owner_a reads own row',(select count(*)=1 from public.profiles where id='b1111111-1111-1111-1111-111111111111'));
select pg_temp.ok('owner_a own phone_number visible',(select phone_number='+41 79 000 00 01' from public.profiles where id='b1111111-1111-1111-1111-111111111111'));
select pg_temp.ok('owner_a cannot read owner_b row',(select count(*)=0 from public.profiles where id='b2222222-2222-2222-2222-222222222222'));
select pg_temp.ok('owner_a can resolve trainer name (connected)',(select full_name='Synthetic Trainer' from public.get_profile_display_names(array['b3333333-3333-3333-3333-333333333333']::uuid[])));

-- ── OWNER_B: cannot read OWNER_A's sensitive fields, direct or via RPC ──────
set local role authenticated;
set local request.jwt.claim.sub = 'b2222222-2222-2222-2222-222222222222';
select pg_temp.ok('owner_b cannot read owner_a row directly',(select count(*)=0 from public.profiles where id='b1111111-1111-1111-1111-111111111111'));
select pg_temp.ok('owner_b cannot read owner_a phone_number directly',(select count(*)=0 from (select phone_number from public.profiles where id='b1111111-1111-1111-1111-111111111111') x));
select pg_temp.ok('owner_b has no connection to owner_a: RPC returns nothing',(select count(*)=0 from public.get_profile_display_names(array['b1111111-1111-1111-1111-111111111111']::uuid[])));
select pg_temp.ok('owner_b CAN resolve trainer name (public trainer directory, no connection needed)',(select full_name='Synthetic Trainer' from public.get_profile_display_names(array['b3333333-3333-3333-3333-333333333333']::uuid[])));
-- get_profile_display_names RETURNS TABLE(id, full_name, username) — phone_number
-- cannot be selected from it under ANY caller: Postgres rejects the column
-- reference at parse time (undefined_column), not merely at runtime. Stronger
-- than a runtime access-denial check, so no denied()/ok() probe is needed —
-- the function's declared signature in 20260926080000 is the proof.

-- ── TRAINER: only what the connection/trainer-directory relationship allows ─
set local role authenticated;
set local request.jwt.claim.sub = 'b3333333-3333-3333-3333-333333333333';
select pg_temp.ok('trainer cannot read owner_a row directly',(select count(*)=0 from public.profiles where id='b1111111-1111-1111-1111-111111111111'));
select pg_temp.ok('trainer resolves connected owner_a name via RPC',(select full_name='Synthetic Owner A' from public.get_profile_display_names(array['b1111111-1111-1111-1111-111111111111']::uuid[])));
select pg_temp.ok('trainer has no connection to owner_b: RPC returns nothing',(select count(*)=0 from public.get_profile_display_names(array['b2222222-2222-2222-2222-222222222222']::uuid[])));

-- ── Revocation: deleting the connection removes RPC access ─────────────────
set local role authenticated;
set local request.jwt.claim.sub = 'b1111111-1111-1111-1111-111111111111';
delete from public.connections where id='c9111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claim.sub = 'b3333333-3333-3333-3333-333333333333';
select pg_temp.ok('trainer no longer resolves owner_a name after connection deleted',(select count(*)=0 from public.get_profile_display_names(array['b1111111-1111-1111-1111-111111111111']::uuid[])));

-- ── Track Sharing helper unaffected (SECURITY DEFINER bypasses caller RLS) ──
-- Fixture rows inserted as the local superuser (bypasses RLS), matching
-- supabase/local/track_sharing_security_cases.sql's own convention.
reset role;
insert into public.dogs(id,owner_id,name) values ('d9111111-1111-1111-1111-111111111111','b1111111-1111-1111-1111-111111111111','Synthetic dog');
insert into public.training_sessions(id,owner_id,dog_id,type,status,title,session_date,category,training_type,duration_seconds,distance_meters)
values ('e9111111-1111-1111-1111-111111111111','b1111111-1111-1111-1111-111111111111','d9111111-1111-1111-1111-111111111111','track','completed','Synthetic track',current_date,'IGP','privat',60,100);
insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type)
values ('c9222222-2222-2222-2222-222222222222','b1111111-1111-1111-1111-111111111111','b3333333-3333-3333-3333-333333333333','accepted','owner','trainer_client');
insert into public.track_shares(id,track_id,owner_user_id,trainer_user_id)
values ('f9111111-1111-1111-1111-111111111111','e9111111-1111-1111-1111-111111111111','b1111111-1111-1111-1111-111111111111','b3333333-3333-3333-3333-333333333333');
set local role authenticated;
set local request.jwt.claim.sub = 'b3333333-3333-3333-3333-333333333333';
select pg_temp.ok('shared_track_display still resolves dog/owner names under the new profiles policy',
  (select dog_name='Synthetic dog' and owner_name='Synthetic Owner A' from public.shared_track_display('e9111111-1111-1111-1111-111111111111')));

select 'PROFILES_SECURITY_RLS|PASS|assertions='||count(*) from qa_assertions;
rollback;

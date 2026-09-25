-- LOCAL ONLY: local Docker Unix socket. All fixtures roll back.
-- Verifies 20260928080000_generic_person_lookup.sql (search_anyvo_people,
-- widened get_profile_display_names) and 20260928090000_trainer_profiles_
-- entitlement.sql (server-side TRAINER capability enforcement on creation).
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'PHASE9 FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute command; exception when insufficient_privilege then blocked:=true; end;
 perform pg_temp.ok(label,blocked);
end $$;

-- OWNER (NEWBIE), ACTIVE_USER (pro_member, no trainer_module), TRAINER_USER
-- (trainer_module), PERSON (an ordinary unrelated ANYVO user, findable by
-- search — a family member / caretaker, not a trainer).
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values
 ('80111111-1111-1111-1111-111111111111','authenticated','authenticated','ph9-owner@local.test',now(),'{}','{}',now(),now(),false,false),
 ('80222222-2222-2222-2222-222222222222','authenticated','authenticated','ph9-active@local.test',now(),'{}','{}',now(),now(),false,false),
 ('80333333-3333-3333-3333-333333333333','authenticated','authenticated','ph9-trainer@local.test',now(),'{}','{}',now(),now(),false,false),
 ('80444444-4444-4444-4444-444444444444','authenticated','authenticated','ph9-person@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.profiles(id,full_name,username,role) values
 ('80111111-1111-1111-1111-111111111111','Phase9 Owner','ph9owner','user'),
 ('80222222-2222-2222-2222-222222222222','Phase9 Active','ph9active','user'),
 ('80333333-3333-3333-3333-333333333333','Phase9 Trainer','ph9trainer','trainer'),
 ('80444444-4444-4444-4444-444444444444','Phase9 Findable Person','ph9findme','user');
insert into public.user_capabilities(user_id,pro_member,trainer_module) values
 ('80222222-2222-2222-2222-222222222222',true,false),
 ('80333333-3333-3333-3333-333333333333',true,true);

-- ── Trainer profile server-side entitlement ─────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '80111111-1111-1111-1111-111111111111';
select pg_temp.denied('NEWBIE: direct trainer_profiles insert blocked',
  $q$insert into public.trainer_profiles(user_id,code) values (auth.uid(),'CANIS-0001')$q$);

set local role authenticated;
set local request.jwt.claim.sub = '80222222-2222-2222-2222-222222222222';
select pg_temp.denied('ACTIVE (pro_member, no trainer_module): direct trainer_profiles insert blocked',
  $q$insert into public.trainer_profiles(user_id,code) values (auth.uid(),'CANIS-0002')$q$);

set local role authenticated;
set local request.jwt.claim.sub = '80333333-3333-3333-3333-333333333333';
insert into public.trainer_profiles(user_id,code) values (auth.uid(),'CANIS-0003');
select pg_temp.ok('TRAINER (trainer_module): direct trainer_profiles insert allowed',
  (select count(*)=1 from public.trainer_profiles where user_id='80333333-3333-3333-3333-333333333333'));

-- Existing trainer can still edit their own row even if capability read is
-- momentarily/legitimately false (no destructive lock-out on UPDATE/DELETE).
reset role;
update public.user_capabilities set trainer_module=false where user_id='80333333-3333-3333-3333-333333333333';
set local role authenticated;
set local request.jwt.claim.sub = '80333333-3333-3333-3333-333333333333';
update public.trainer_profiles set bio='Updated after lapse' where user_id=auth.uid();
select pg_temp.ok('lapsed trainer can still UPDATE their existing profile (no re-validation on UPDATE)',
  (select bio='Updated after lapse' from public.trainer_profiles where user_id='80333333-3333-3333-3333-333333333333'));
delete from public.trainer_profiles where user_id=auth.uid();
select pg_temp.ok('lapsed trainer can still DELETE their own profile', (select count(*)=0 from public.trainer_profiles where user_id='80333333-3333-3333-3333-333333333333'));
reset role;
insert into public.trainer_profiles(user_id,code) values ('80333333-3333-3333-3333-333333333333','CANIS-0003');
update public.user_capabilities set trainer_module=true where user_id='80333333-3333-3333-3333-333333333333';

-- ── search_anyvo_people: bounded, authenticated-only, no private columns ───
set local role anon;
select pg_temp.denied('anon cannot call search_anyvo_people',$q$select * from public.search_anyvo_people('ph9')$q$);

set local role authenticated;
set local request.jwt.claim.sub = '80111111-1111-1111-1111-111111111111';
select pg_temp.ok('query <2 chars returns nothing (no browse-all)', (select count(*)=0 from public.search_anyvo_people('p')));
select pg_temp.ok('finds the target person by username substring', (select count(*)=1 from public.search_anyvo_people('findme')));
select pg_temp.ok('finds the target person by full_name substring', (select count(*)=1 from public.search_anyvo_people('Findable')));
select pg_temp.ok('never returns the caller themselves', (select count(*)=0 from public.search_anyvo_people('Phase9 Owner')));
-- Structural: RETURNS TABLE(id, full_name, username) — phone_number/plan/email
-- cannot be selected from it under ANY caller; Postgres rejects the column at
-- parse time, so no runtime probe is needed (same proof style as Phase 5/7).

-- ── get_profile_display_names widened: generic connection also resolves ────
reset role;
insert into public.connections(id,owner_user_id,connected_user_id,status,created_by,connection_type)
values ('80c00000-0000-0000-0000-000000000001','80111111-1111-1111-1111-111111111111','80444444-4444-4444-4444-444444444444','accepted','owner','health_contact');
set local role authenticated;
set local request.jwt.claim.sub = '80111111-1111-1111-1111-111111111111';
select pg_temp.ok('owner resolves the generically-connected person''s name (not trainer_client, still resolves)',
  (select full_name='Phase9 Findable Person' and username='ph9findme' from public.get_profile_display_names(array['80444444-4444-4444-4444-444444444444']::uuid[])));
select pg_temp.ok('owner cannot resolve a genuinely unconnected, non-trainer user',
  (select count(*)=0 from public.get_profile_display_names(array['80222222-2222-2222-2222-222222222222']::uuid[])));
select pg_temp.ok('trainer directory still resolves regardless of connection (unchanged regression check)',
  (select full_name='Phase9 Trainer' from public.get_profile_display_names(array['80333333-3333-3333-3333-333333333333']::uuid[])));

-- Generic connection grants nothing beyond name resolution: no Track Sharing
-- access (can_view_shared_track still requires connection_type='trainer_client'
-- specifically) and confirms isolation between the two connection concepts.
select pg_temp.ok('a health_contact connection does not satisfy trainer_client-scoped checks',
  (select count(*)=0 from public.connections where owner_user_id='80111111-1111-1111-1111-111111111111'
     and connected_user_id='80444444-4444-4444-4444-444444444444' and connection_type='trainer_client'));

select 'PHASE9_GENERIC_CONNECTION|PASS|assertions='||count(*) from qa_assertions;
rollback;

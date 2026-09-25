-- LOCAL ONLY: local Docker Unix socket. All fixtures roll back.
-- Verifies 20260929080000_training_plans_entitlement.sql (server-side TRAINER
-- capability enforcement on training_plans creation) — the second real gap
-- found while root-causing the "Meine Trainer" paywall bug (Customer Release
-- Phase 10): removing app/trainer/_layout.tsx's blanket redirect meant
-- app/trainer/plan-neu.tsx (create plan) needed its own gate, and the
-- underlying training_plans RLS had no entitlement check at all either.
\set ON_ERROR_STOP on
begin;
do $$ begin if inet_server_addr() is not null then raise exception 'Local Unix socket required'; end if; end $$;
create temporary table qa_assertions(label text);
grant all on qa_assertions to authenticated, anon;
create function pg_temp.ok(label text, condition boolean) returns void language plpgsql as $$
begin
 if condition is distinct from true then raise exception 'PHASE10 FAIL: %',label; end if;
 insert into qa_assertions values(label);
end $$;
create function pg_temp.denied(label text, command text) returns void language plpgsql as $$
declare blocked boolean := false;
begin
 begin execute command; exception when insufficient_privilege then blocked:=true; end;
 perform pg_temp.ok(label,blocked);
end $$;

-- OWNER (NEWBIE), ACTIVE_USER (pro_member, no trainer_module), TRAINER_USER
-- (trainer_module), CLIENT_USER (an ordinary client a plan gets shared with).
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous)
values
 ('90111111-1111-1111-1111-111111111111','authenticated','authenticated','ph10-newbie@local.test',now(),'{}','{}',now(),now(),false,false),
 ('90222222-2222-2222-2222-222222222222','authenticated','authenticated','ph10-active@local.test',now(),'{}','{}',now(),now(),false,false),
 ('90333333-3333-3333-3333-333333333333','authenticated','authenticated','ph10-trainer@local.test',now(),'{}','{}',now(),now(),false,false),
 ('90444444-4444-4444-4444-444444444444','authenticated','authenticated','ph10-client@local.test',now(),'{}','{}',now(),now(),false,false);
insert into public.profiles(id,full_name,username,role) values
 ('90111111-1111-1111-1111-111111111111','Phase10 Newbie','ph10newbie','user'),
 ('90222222-2222-2222-2222-222222222222','Phase10 Active','ph10active','user'),
 ('90333333-3333-3333-3333-333333333333','Phase10 Trainer','ph10trainer','trainer'),
 ('90444444-4444-4444-4444-444444444444','Phase10 Client','ph10client','user');
insert into public.user_capabilities(user_id,pro_member,trainer_module) values
 ('90222222-2222-2222-2222-222222222222',true,false),
 ('90333333-3333-3333-3333-333333333333',true,true);

-- ── training_plans server-side entitlement ──────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '90111111-1111-1111-1111-111111111111';
select pg_temp.denied('NEWBIE: direct training_plans insert blocked',
  $q$insert into public.training_plans(trainer_id,title,steps) values (auth.uid(),'Sitz Plan','{Schritt 1}')$q$);

set local role authenticated;
set local request.jwt.claim.sub = '90222222-2222-2222-2222-222222222222';
select pg_temp.denied('ACTIVE (pro_member, no trainer_module): direct training_plans insert blocked',
  $q$insert into public.training_plans(trainer_id,title,steps) values (auth.uid(),'Sitz Plan','{Schritt 1}')$q$);

set local role authenticated;
set local request.jwt.claim.sub = '90333333-3333-3333-3333-333333333333';
insert into public.training_plans(trainer_id,title,steps,shared_with)
  values (auth.uid(),'Leinenführigkeit','{Schritt 1,Schritt 2}',array['90444444-4444-4444-4444-444444444444']::uuid[]);
select pg_temp.ok('TRAINER (trainer_module): direct training_plans insert allowed',
  (select count(*)=1 from public.training_plans where trainer_id='90333333-3333-3333-3333-333333333333'));

-- Lapsed trainer keeps managing (select/update/delete) plans they already
-- created — no destructive lock-out, mirrors the trainer_profiles pattern.
reset role;
update public.user_capabilities set trainer_module=false where user_id='90333333-3333-3333-3333-333333333333';
set local role authenticated;
set local request.jwt.claim.sub = '90333333-3333-3333-3333-333333333333';
select pg_temp.ok('lapsed trainer can still SELECT their own plan',
  (select count(*)=1 from public.training_plans where trainer_id='90333333-3333-3333-3333-333333333333'));
update public.training_plans set notes='Aktualisiert nach Ablauf' where trainer_id=auth.uid();
select pg_temp.ok('lapsed trainer can still UPDATE their own plan',
  (select notes='Aktualisiert nach Ablauf' from public.training_plans where trainer_id='90333333-3333-3333-3333-333333333333'));

-- Client the plan is shared with keeps reading it — including NEWBIE/ACTIVE,
-- unaffected by the trainer_module gate (SELECT policy untouched).
set local role authenticated;
set local request.jwt.claim.sub = '90444444-4444-4444-4444-444444444444';
select pg_temp.ok('shared client (no trainer_module) can still read the plan shared with them',
  (select count(*)=1 from public.training_plans where '90444444-4444-4444-4444-444444444444' = any(shared_with)));

set local role authenticated;
set local request.jwt.claim.sub = '90333333-3333-3333-3333-333333333333';
delete from public.training_plans where trainer_id=auth.uid();
select pg_temp.ok('lapsed trainer can still DELETE their own plan',
  (select count(*)=0 from public.training_plans where trainer_id='90333333-3333-3333-3333-333333333333'));
reset role;
update public.user_capabilities set trainer_module=true where user_id='90333333-3333-3333-3333-333333333333';

-- ── Regression: Trainer Connect (connections/trainer_profiles) untouched ───
-- "Meine Trainer" is a pure navigation fix (app/trainer/_layout.tsx); no
-- connections/trainer_profiles RLS changed in this phase. Sanity check that
-- Phase 9's server-side trainer_profiles entitlement still holds.
set local role authenticated;
set local request.jwt.claim.sub = '90111111-1111-1111-1111-111111111111';
select pg_temp.denied('NEWBIE: direct trainer_profiles insert still blocked (Phase 9 unaffected)',
  $q$insert into public.trainer_profiles(user_id,code) values (auth.uid(),'CANIS-P10-1')$q$);

select 'PHASE10_MEINE_TRAINER|PASS|assertions='||count(*) from qa_assertions;
rollback;

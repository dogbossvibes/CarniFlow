-- Isolated PostgreSQL 17 only; synthetic fixtures. Never run against Production.
-- Copy migrations to /tmp/active-lifetime-migrations before running this harness.
\set ON_ERROR_STOP on
begin;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now(); return new; end;
$$;
create table public.user_capabilities (
  user_id uuid primary key references auth.users(id),
  pro_member boolean not null default false,
  trainer_module boolean not null default false
);
create table public.trainer_profiles (user_id uuid primary key references auth.users(id));
alter table public.trainer_profiles enable row level security;
grant all on public.trainer_profiles to authenticated;
create function public.qa_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end;
$$;

\ir /tmp/active-lifetime-migrations/20260802100000_user_entitlements.sql
\ir /tmp/active-lifetime-migrations/20260802110000_lifetime_quota_access.sql
\ir /tmp/active-lifetime-migrations/20260928090000_trainer_profiles_entitlement.sql
\ir /tmp/active-lifetime-migrations/20261008170000_active_lifetime_access.sql

-- Production has Supabase's existing DML table grants. RLS must still deny
-- writes; testing only missing table privileges would miss this configuration.
grant insert, update, delete on public.user_entitlements to authenticated;

insert into auth.users values
 ('11111111-1111-4111-8111-111111111111','active@example.invalid'),
 ('22222222-2222-4222-8222-222222222222','other@example.invalid'),
 ('33333333-3333-4333-8333-333333333333','lifetime@example.invalid'),
 ('44444444-4444-4444-8444-444444444444','trainer@example.invalid'),
 ('55555555-5555-4555-8555-555555555555','expired@example.invalid');
insert into public.user_capabilities values
 ('11111111-1111-4111-8111-111111111111',false,false),
 ('22222222-2222-4222-8222-222222222222',false,false),
 ('33333333-3333-4333-8333-333333333333',false,false),
 ('44444444-4444-4444-8444-444444444444',true,true),
 ('55555555-5555-4555-8555-555555555555',false,false);
insert into public.user_entitlements(user_id,entitlement,expires_at) values
 ('11111111-1111-4111-8111-111111111111','active_lifetime',null),
 ('33333333-3333-4333-8333-333333333333','lifetime',null),
 ('55555555-5555-4555-8555-555555555555','lifetime',now()-interval '1 day');

select qa_assert(is_pro_member('11111111-1111-4111-8111-111111111111'),'ACTIVE grants pro');
select qa_assert(not is_trainer_module('11111111-1111-4111-8111-111111111111'),'ACTIVE never grants trainer');
select qa_assert(not is_pro_member('22222222-2222-4222-8222-222222222222'),'unrelated user denied');
select qa_assert(is_pro_member('33333333-3333-4333-8333-333333333333'),'existing lifetime preserved');
select qa_assert(is_pro_member('44444444-4444-4444-8444-444444444444') and is_trainer_module('44444444-4444-4444-8444-444444444444'),'paid trainer preserved');
select qa_assert(not is_pro_member('55555555-5555-4555-8555-555555555555'),'expired lifetime denied');
select qa_assert(not (select pro_member from user_capabilities where user_id='11111111-1111-4111-8111-111111111111'),'no capability mirroring');

do $$ begin
  begin
    insert into public.user_entitlements(user_id,entitlement,expires_at)
    values('22222222-2222-4222-8222-222222222222','active_lifetime',now()+interval '2 years');
    raise exception 'FAIL: finite ACTIVE lifetime accepted';
  exception when check_violation then null; end;
  begin
    insert into public.user_entitlements(user_id,entitlement)
    values('11111111-1111-4111-8111-111111111111','active_lifetime');
    raise exception 'FAIL: duplicate ACTIVE grant accepted';
  exception when unique_violation then null; end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select qa_assert((select count(*)=1 from user_entitlements),'only own active grant visible');
do $$ declare affected integer; begin
  begin
    insert into user_entitlements(user_id,entitlement) values(auth.uid(),'active_lifetime');
    raise exception 'FAIL: client grant permitted';
  exception when insufficient_privilege then null; end;
  update user_entitlements set revoked_at=now() where user_id=auth.uid();
  get diagnostics affected = row_count;
  perform qa_assert(affected=0,'RLS denies client update despite table grant');
  delete from user_entitlements where user_id=auth.uid();
  get diagnostics affected = row_count;
  perform qa_assert(affected=0,'RLS denies client delete despite table grant');
  begin
    perform is_pro_member(auth.uid());
    raise exception 'FAIL: internal quota helper callable by client';
  exception when insufficient_privilege then null; end;
  begin
    insert into trainer_profiles(user_id) values(auth.uid());
    raise exception 'FAIL: ACTIVE can create trainer profile';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select qa_assert((select count(*)=0 from user_entitlements),'account switch loses grants');
reset role;

-- Simulate normal Store expiry/refresh; the independent grant must survive.
update user_capabilities set pro_member=false, trainer_module=false
where user_id='11111111-1111-4111-8111-111111111111';
select qa_assert(is_pro_member('11111111-1111-4111-8111-111111111111'),'store expiry preserves administrative ACTIVE');
update user_entitlements set revoked_at=now()
where user_id='11111111-1111-4111-8111-111111111111' and entitlement='active_lifetime';
select qa_assert(not is_pro_member('11111111-1111-4111-8111-111111111111'),'revocation removes ACTIVE');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select qa_assert((select count(*)=0 from user_entitlements),'revoked grant no longer client-visible');
reset role;
update user_capabilities set pro_member=true, trainer_module=true
where user_id='11111111-1111-4111-8111-111111111111';
select qa_assert(is_pro_member('11111111-1111-4111-8111-111111111111') and is_trainer_module('11111111-1111-4111-8111-111111111111'),'revocation preserves later genuine paid access');

select 'ACTIVE_LIFETIME_DB|PASS' as result;
rollback;

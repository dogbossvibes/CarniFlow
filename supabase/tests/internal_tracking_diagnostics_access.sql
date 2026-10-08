-- Disposable PostgreSQL 17 database ONLY. Not a Production script.
-- Run from this directory with psql -v ON_ERROR_STOP=1 -f internal_tracking_diagnostics_access.sql.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create table public.profiles(id uuid primary key references auth.users, is_internal_tester boolean not null default false, tester_level text, plan text default 'free', updated_at timestamptz default now());
create table public.user_capabilities(user_id uuid primary key, pro_member boolean, trainer_module boolean);
create table public.subscriptions(id uuid primary key, user_id uuid, plan text, expires_at timestamptz);
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_own on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
\ir ../migrations/20260913200000_protect_internal_tester_insert.sql
\ir ../migrations/20261008190000_internal_tracking_diagnostics_access.sql
-- Idempotence must not grant any account or weaken the guard.
\ir ../migrations/20261008190000_internal_tracking_diagnostics_access.sql
insert into auth.users values
('00000000-0000-0000-0000-000000000001','einfachich503@gmail.com',now()),
('00000000-0000-0000-0000-000000000002','other@example.invalid',now()),
('00000000-0000-0000-0000-000000000003','insert@example.invalid',now());
insert into public.profiles(id) select id from auth.users where id <> '00000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.role','service_role',false);
update public.profiles set is_internal_tester=true,tester_level='developer' where id='00000000-0000-0000-0000-000000000001';
insert into public.user_capabilities values ('00000000-0000-0000-0000-000000000001',true,true);
insert into public.subscriptions values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','active',now()+interval '1 year');
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
set role authenticated;
insert into public.profiles(id,can_use_internal_tracking_diagnostics,is_internal_tester,tester_level)
 values ('00000000-0000-0000-0000-000000000003',true,true,'admin');
update public.profiles set can_use_internal_tracking_diagnostics=true;
insert into public.profiles(id,can_use_internal_tracking_diagnostics) values ('00000000-0000-0000-0000-000000000003',true)
 on conflict(id) do update set can_use_internal_tracking_diagnostics=excluded.can_use_internal_tracking_diagnostics;
do $$ begin
 if exists(select 1 from public.profiles where can_use_internal_tracking_diagnostics or is_internal_tester or tester_level is not null) then
  raise exception 'FAIL client INSERT/UPDATE/UPSERT escalated privileges';
 end if;
 if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL own-row RLS'; end if;
end $$;
reset role;
\ir ../operations/20261008_grant_personal_tracking_diagnostics.sql
\ir ../operations/20261008_grant_personal_tracking_diagnostics.sql
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
update public.profiles set can_use_internal_tracking_diagnostics=false, is_internal_tester=false, tester_level=null;
do $$ begin
 if not (select can_use_internal_tracking_diagnostics and is_internal_tester and tester_level='developer' from public.profiles) then
  raise exception 'FAIL client changed protected granted fields';
 end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ begin
 if exists(select 1 from public.profiles where id='00000000-0000-0000-0000-000000000001') then
  raise exception 'FAIL cross-account read';
 end if;
 update public.profiles set can_use_internal_tracking_diagnostics=true;
 if exists(select 1 from public.profiles where can_use_internal_tracking_diagnostics) then raise exception 'FAIL other account escalated'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.role','anon',false);
set role anon;
do $$ begin
 begin
  perform id from public.profiles;
  raise exception 'FAIL anonymous read allowed';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.role','service_role',false);
do $$ begin
 begin
  update public.profiles set can_use_internal_tracking_diagnostics=true where id='00000000-0000-0000-0000-000000000002';
  raise exception 'FAIL multiple personal grants allowed';
 exception when unique_violation then null;
 end;
 update public.profiles set can_use_internal_tracking_diagnostics=false where id='00000000-0000-0000-0000-000000000001';
 if exists(select 1 from public.profiles where can_use_internal_tracking_diagnostics) then raise exception 'FAIL admin revoke'; end if;
 if not (select pro_member and trainer_module from public.user_capabilities where user_id='00000000-0000-0000-0000-000000000001') then raise exception 'FAIL existing capabilities changed'; end if;
end $$;
select 'PASS: idempotence, default deny, INSERT, UPDATE, UPSERT, own-row RLS, anonymous denial, confirmed personal grant, existing tester/paid rights, singleton, admin revoke' as result;

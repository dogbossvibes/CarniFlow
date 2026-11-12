-- Explicitly authorized personal grant. Run as administrator after migration
-- 20261008190000_internal_tracking_diagnostics_access.sql, in verified ANYVO Production.
-- STOP on missing/ambiguous/unconfirmed account, missing profile, unsafe RLS,
-- disabled protection, or an existing grant to somebody else. No account creation.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';
lock table public.profiles in share row exclusive mode;

do $$
declare
  target_id uuid;
  before_profile jsonb;
  before_capabilities jsonb;
  before_subscriptions jsonb;
  after_profile jsonb;
  matches integer;
begin
  select count(*) into matches from auth.users where lower(email) = 'einfachich503@gmail.com';
  if matches <> 1 then raise exception 'STOP: expected exactly one target account'; end if;
  select id into target_id from auth.users
    where lower(email) = 'einfachich503@gmail.com' and email_confirmed_at is not null;
  if target_id is null then raise exception 'STOP: target email is not confirmed'; end if;
  select to_jsonb(p) into before_profile from public.profiles p where id = target_id for update;
  if before_profile is null then raise exception 'STOP: target profile is missing'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'STOP: profiles RLS is disabled';
  end if;
  -- Existing own-row RLS is a prerequisite; do not silently rewrite live policies.
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') <> 3
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
       and policyname = 'profiles_select_own' and cmd = 'SELECT' and roles = array['authenticated']::name[]
       and qual = '(id = auth.uid())')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
       and policyname = 'profiles_insert_own' and cmd = 'INSERT' and roles = array['authenticated']::name[]
       and with_check = '(id = auth.uid())')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
       and policyname = 'profiles_update_own' and cmd = 'UPDATE' and roles = array['authenticated']::name[]
       and qual = '(id = auth.uid())' and with_check = '(id = auth.uid())') then
    raise exception 'STOP: profiles policies differ from reviewed own-row baseline';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
      and tgname = 'trg_protect_internal_tracking_diagnostics_access' and tgenabled = 'O'
      and tgfoid = 'public.protect_internal_tracking_diagnostics_access()'::regprocedure) then
    raise exception 'STOP: capability protection is not enabled';
  end if;
  if exists (select 1 from public.profiles where can_use_internal_tracking_diagnostics and id <> target_id) then
    raise exception 'STOP: another account already has this personal capability';
  end if;
  select to_jsonb(c) into before_capabilities from public.user_capabilities c where user_id = target_id;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) into before_subscriptions from public.subscriptions s where user_id = target_id;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  update public.profiles set can_use_internal_tracking_diagnostics = true where id = target_id;
  select to_jsonb(p) into after_profile from public.profiles p where id = target_id;
  if (after_profile - 'can_use_internal_tracking_diagnostics' - 'updated_at')
      is distinct from (before_profile - 'can_use_internal_tracking_diagnostics' - 'updated_at') then
    raise exception 'STOP: unrelated profile fields changed';
  end if;
  if before_capabilities is distinct from (select to_jsonb(c) from public.user_capabilities c where user_id = target_id)
      or before_subscriptions is distinct from (select coalesce(jsonb_agg(to_jsonb(s) order by s.id), '[]'::jsonb) from public.subscriptions s where user_id = target_id) then
    raise exception 'STOP: existing membership/trainer capabilities changed';
  end if;
  if (select count(*) from public.profiles where can_use_internal_tracking_diagnostics) <> 1
      or after_profile->>'can_use_internal_tracking_diagnostics' <> 'true' then
    raise exception 'STOP: grant postcondition failed';
  end if;
end $$;

select count(*) = 1 as exactly_one_personal_grant,
  bool_and(lower(u.email) = 'einfachich503@gmail.com' and u.email_confirmed_at is not null) as only_confirmed_target
from public.profiles p join auth.users u on u.id = p.id
where p.can_use_internal_tracking_diagnostics;
commit;

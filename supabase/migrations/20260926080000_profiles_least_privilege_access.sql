-- ============================================================================
-- profiles: restore least-privilege access.
--
-- Befund (Production, read-only anon-key probe, 25.09.2026): an UNAUTHENTICATED
-- request could read public.profiles.id, .full_name, .role and .plan for
-- multiple rows. The only two profiles-SELECT policies tracked anywhere in
-- this repository (supabase/local/baseline.sql's "profiles_select" — id =
-- auth.uid() OR role = 'trainer' — and the older PREMIUM_SETUP.sql's
-- "profiles: select own" — id = auth.uid() only) are both scoped strictly
-- `to authenticated` and cannot explain anonymous access to arbitrary rows.
-- The exact live mechanism on Production (RLS disabled, a policy not present
-- in any tracked migration, or a stray table-level grant) could not be
-- determined read-only: pg_policies/information_schema/pg_class.relrowsecurity
-- require psql/service-role access this project does not have available.
--
-- This migration does not depend on knowing the exact cause. It is written to
-- deterministically reach a known-correct end state regardless of the current
-- one:
--   1. Force RLS on (idempotent if already on).
--   2. Drop EVERY existing policy on public.profiles by querying pg_policies,
--      not by guessing names — this removes whatever the unsafe policy
--      actually is, including one added outside version control.
--   3. Revoke any table-level grant to anon/public, then grant only
--      authenticated the base privileges RLS then restricts per row.
--   4. Recreate exactly three policies: authenticated users may select/
--      insert/update only their OWN row (id = auth.uid()). No anon access,
--      no blanket "role = 'trainer'" row exception.
--
-- Cross-user name lookups (trainer/client connection lists, trainer search)
-- no longer go through direct table SELECT at all: get_profile_display_names()
-- below is a narrow SECURITY DEFINER RPC returning only (id, full_name,
-- username) for authenticated callers. Sensitive/future columns — phone_number,
-- plan, role, created_at, trainer_name, push_token, etc. — are never returned
-- by it and can never become broadly readable just by adding a column to
-- profiles. services/connectionService.ts and services/trainerService.ts are
-- updated in this same release to call it instead of `.from('profiles').select`.
-- services/commentService.ts, services/calendarService.ts and
-- services/trainingUnitService.ts are UNCHANGED: their profiles reads use the
-- acting (calling) user's own id, already covered by the own-row policy.
--
-- shared_track_display() (20260924110000) is unaffected: it is itself
-- SECURITY DEFINER, so its internal join to profiles already bypasses caller
-- RLS and continues to work exactly as before.
--
-- No data changed. No table dropped. No column dropped.
-- ============================================================================

alter table public.profiles enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;
end $$;

revoke all on public.profiles from anon, public;
grant select, insert, update on public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_own
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Narrow, explicit-column, relationship-scoped cross-user name lookup — NOT
-- an arbitrary-id lookup. A row is resolvable only if it is a trainer
-- (public trainer-search directory, matching the prior "role = 'trainer'"
-- row exception's actual intent) or the caller has any trainer_client
-- connection row with it, any status (pending shows "X wants to connect";
-- accepted is the ongoing relationship) — matching what
-- services/connectionService.ts and services/trainerService.ts each
-- legitimately need and nothing broader. Deleting the connections row (not
-- merely changing its status) removes this access on its next call.
create or replace function public.get_profile_display_names(p_ids uuid[])
returns table(id uuid, full_name text, username text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.username
  from public.profiles p
  where auth.uid() is not null
    and p.id = any (p_ids)
    and (
      p.role = 'trainer'
      or exists (
        select 1 from public.connections c
        where c.connection_type = 'trainer_client'
          and ((c.owner_user_id = auth.uid() and c.connected_user_id = p.id)
            or (c.connected_user_id = auth.uid() and c.owner_user_id = p.id))
      )
    )
$$;

revoke all on function public.get_profile_display_names(uuid[]) from public, anon;
grant execute on function public.get_profile_display_names(uuid[]) to authenticated;

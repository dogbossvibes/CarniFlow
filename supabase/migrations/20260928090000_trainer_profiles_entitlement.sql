-- ============================================================================
-- trainer_profiles: enforce TRAINER capability server-side for creation.
--
-- Befund (Staging, read-only, 27.09.2026): the live "trainer_profiles_write"
-- policy is `for ALL to public using (user_id = auth.uid()) with check
-- (user_id = auth.uid())` — any authenticated user can INSERT their own row
-- (and therefore a Trainer Code) with zero entitlement check, for free.
-- Client-side gating (app/trainer/edit.tsx, an earlier phase) is real UX but
-- not defense in depth; this migration is the server-side backstop, using the
-- project's actual entitlement source (public.user_capabilities.trainer_module)
-- rather than any client-supplied value — the same pattern already
-- established by public.is_pro_member().
--
-- Scope: CREATE only. UPDATE and DELETE stay ownership-only (user_id =
-- auth.uid()), unchanged from today's behavior — an existing trainer whose
-- subscription later lapses can still edit or remove their own profile; only
-- a brand-new row requires the capability at insert time. This mirrors the
-- client-side gate in app/trainer/edit.tsx (`!isTrainerModule && !existing`)
-- exactly, and matches "no destructive migration, existing valid Trainer
-- Codes remain valid": no row is touched, dropped, or revalidated here.
--
-- trainer_profiles_select (to public using (auth.uid() is not null)) is
-- unchanged — the public trainer directory for authenticated users is
-- intentional (Customer Release Phase 9 section 2) and out of scope here.
--
-- redeem_trainer_code() (TRAINER_FLOW_REPAIR.sql) only reads trainer_profiles
-- and writes to connections/connection_permissions — it never inserts into
-- trainer_profiles, so it is unaffected by this policy change.
-- ============================================================================

create or replace function public.is_trainer_module(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select trainer_module from public.user_capabilities where user_id = p_user_id), false)
$$;

revoke all on function public.is_trainer_module(uuid) from public, anon;
grant execute on function public.is_trainer_module(uuid) to authenticated;

drop policy if exists trainer_profiles_write on public.trainer_profiles;

create policy trainer_profiles_insert
  on public.trainer_profiles for insert to authenticated
  with check (user_id = auth.uid() and public.is_trainer_module(auth.uid()));

create policy trainer_profiles_update
  on public.trainer_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy trainer_profiles_delete
  on public.trainer_profiles for delete to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- training_plans: enforce TRAINER capability server-side for creation.
--
-- Befund (Customer Release Phase 10, 25.09.2026, while root-causing the
-- "Meine Trainer" paywall bug): TRAININGPLAENE_SETUP.sql's live policy is
-- `"trainer manage plans" for ALL to authenticated using (trainer_id =
-- auth.uid()) with check (trainer_id = auth.uid())` — any authenticated user,
-- including NEWBIE, can INSERT a training_plans row naming themselves as
-- trainer_id, with zero entitlement check. Client-side gating
-- (app/trainer/plan-neu.tsx, this phase) is real UX but not defense in depth.
-- This mirrors 20260928090000_trainer_profiles_entitlement.sql exactly: same
-- public.is_trainer_module(uuid) helper, same split (gate INSERT only; SELECT/
-- UPDATE/DELETE stay ownership-only so a lapsed trainer keeps managing plans
-- they already created).
--
-- "clients read shared plans" (select to authenticated using (auth.uid() =
-- any(shared_with))) is unchanged — a client, including NEWBIE/ACTIVE, must
-- keep reading plans their trainer shared with them (app/plaene.tsx,
-- app/trainer/plan/[id].tsx — intentionally ungated, dual-use screens).
-- ============================================================================

drop policy if exists "trainer manage plans" on public.training_plans;

create policy training_plans_trainer_insert
  on public.training_plans for insert to authenticated
  with check (trainer_id = auth.uid() and public.is_trainer_module(auth.uid()));

create policy training_plans_trainer_select
  on public.training_plans for select to authenticated
  using (trainer_id = auth.uid());

create policy training_plans_trainer_update
  on public.training_plans for update to authenticated
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());

create policy training_plans_trainer_delete
  on public.training_plans for delete to authenticated
  using (trainer_id = auth.uid());

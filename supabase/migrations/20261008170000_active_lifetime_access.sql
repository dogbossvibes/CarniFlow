-- Administrative, permanent ACTIVE-only access. Existing lifetime retains TRAINER.
-- No store subscription/profile/capability mutation and no client write policy.
alter table public.user_entitlements
  drop constraint user_entitlements_entitlement_chk;
alter table public.user_entitlements
  add constraint user_entitlements_entitlement_chk
  check (entitlement in ('lifetime', 'active_lifetime', 'beta_tester', 'ambassador', 'staff'));
alter table public.user_entitlements
  add constraint user_entitlements_active_lifetime_permanent_chk
  check (entitlement <> 'active_lifetime' or expires_at is null);

create or replace function public.is_pro_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select uc.pro_member
      from public.user_capabilities uc
      where uc.user_id = p_user_id
    ), false)
    or exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = p_user_id
        and ue.entitlement in ('lifetime', 'active_lifetime')
        and ue.revoked_at is null
        and (ue.expires_at is null or ue.expires_at > now())
    )
$$;

-- Keep this helper internal; public quota RPCs bind their checks to auth.uid().
revoke execute on function public.is_pro_member(uuid) from public, anon, authenticated;
grant execute on function public.is_pro_member(uuid) to service_role;

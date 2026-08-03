-- ANYVO: server-side lifetime access for NEWBIE quota checks.
-- Additive follow-up migration. Do not run from the mobile client.

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
        and ue.entitlement = 'lifetime'
        and ue.revoked_at is null
        and (ue.expires_at is null or ue.expires_at > now())
    )
$$;

-- is_pro_member is an internal helper for the SECURITY DEFINER quota RPCs.
-- Normal clients must use claim_newbie_quota/newbie_quota_status, which pass
-- auth.uid(); they must not be able to probe an arbitrary user UUID directly.
revoke execute on function public.is_pro_member(uuid) from public, authenticated;
grant execute on function public.is_pro_member(uuid) to service_role;

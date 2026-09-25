-- ============================================================================
-- Health domain SECURITY DEFINER functions: close a residual anon EXECUTE gap.
--
-- Befund (Production, 26.09.2026, immediately after applying
-- 20260921120000_health_access_grants.sql): that migration's
-- `revoke all on function ... from public` did NOT remove EXECUTE for role
-- anon on these six functions. In Postgres, revoking from the PUBLIC
-- pseudo-role only removes the implicit "everyone" privilege — it does not
-- touch an explicit grant previously made directly to a specific role. All
-- six functions still had a standalone `grant execute ... to anon` predating
-- this migration (likely from when they were first created), so anon could
-- still call SECURITY DEFINER functions that read dog_health_*/dog_documents
-- data, even though the underlying tables' RLS was correctly tightened.
--
-- Production was already corrected manually with these exact six revokes
-- (verified: all six now report FALSE for anon EXECUTE). This migration
-- makes that fix permanent/version-controlled and reproducible on Staging
-- and any future environment. Purely a privilege revoke: no table, column,
-- policy, or function body is touched; no data is read or written.
-- ============================================================================

revoke execute on function public.health_dog_owner_matches(uuid, uuid) from anon;
revoke execute on function public.health_grant_connection_valid(uuid, uuid, uuid) from anon;
revoke execute on function public.can_view_dog_health(uuid, text) from anon;
revoke execute on function public.can_view_legacy_dog_document(uuid) from anon;
revoke execute on function public.can_view_dog_document(uuid) from anon;
revoke execute on function public.can_read_dog_document_path(text) from anon;

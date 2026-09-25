-- ============================================================================
-- Generic ANYVO person lookup for Health Sharing "Person verbinden".
--
-- Health Sharing must not require the recipient to be a professional trainer
-- (Customer Release Phase 9). connections.connection_type is already a plain
-- text column with no CHECK constraint, and its RLS (create/read/update/delete
-- own connection) is already type-agnostic — no schema/RLS change needed there
-- to support a second connection_type value ('health_contact', see
-- services/connectionService.ts PERSON_CONNECTION_TYPE). Two things ARE
-- needed server-side:
--
--   1. A way to SEARCH for a person to connect to in the first place — no
--      connection exists yet at search time, so get_profile_display_names
--      (20260926080000, which requires the caller already be a trainer or
--      already have a connection to the target) cannot be reused for this.
--      search_anyvo_people() below is a separate, narrow, bounded RPC for
--      exactly that: authenticated only, requires a real (>=2 char) query so
--      it can never be used to browse/enumerate all profiles, matches
--      username/full_name, capped at 20 rows, returns only id/full_name/
--      username — never phone_number/plan/email/subscription state.
--
--   2. Once connected, existing UI (services/connectionService.ts
--      listConnections) resolves counterpart display names through
--      get_profile_display_names — but that function's connection clause was
--      written scoped to connection_type = 'trainer_client' only, so a
--      generic health_contact connection would silently resolve to no name.
--      CREATE OR REPLACE widens it to accept a connection of ANY type between
--      caller and target, not just trainer_client. This is a compatible
--      widening, not a narrowing: every case that worked before (trainer
--      directory rows, existing trainer_client connections) still works
--      identically; only a new class of connections that could not resolve
--      at all before now can.
--
-- No table/column/constraint change. No data touched.
-- ============================================================================

create or replace function public.search_anyvo_people(p_query text)
returns table(id uuid, full_name text, username text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.username
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(coalesce(p_query, ''))) >= 2
    and (
      p.username ilike '%' || trim(p_query) || '%'
      or p.full_name ilike '%' || trim(p_query) || '%'
    )
  order by
    (p.username ilike trim(p_query) || '%') desc,
    (p.full_name ilike trim(p_query) || '%') desc,
    p.username nulls last
  limit 20
$$;

revoke all on function public.search_anyvo_people(text) from public, anon;
grant execute on function public.search_anyvo_people(text) to authenticated;

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
        where (c.owner_user_id = auth.uid() and c.connected_user_id = p.id)
           or (c.connected_user_id = auth.uid() and c.owner_user_id = p.id)
      )
    )
$$;

revoke all on function public.get_profile_display_names(uuid[]) from public, anon;
grant execute on function public.get_profile_display_names(uuid[]) to authenticated;

-- ANYVO: unique public username (social identity) on public.profiles.
--
-- Additive migration for T-43. Adds a nullable, case-insensitive-unique `username`
-- column to public.profiles. It is displayed as `@username` in the profile,
-- home greeting and trainer/connection lists, and editable in "Profil bearbeiten".
--
-- Normalization contract (mirrored in services/profileService.ts):
--   • stored WITHOUT leading '@', lowercase, trimmed
--   • allowed characters: a–z, 0–9, underscore; dots only between segments
--     (no leading/trailing/double dots), length 3–24
--   • NULL = no username set (multiple NULLs allowed)
--
-- Availability check:
--   public.check_username_available(text) — SECURITY DEFINER RPC that returns
--   whether the normalized name is free AND not on the reserved list. The name
--   counts as free when NO OTHER profile uses it case-insensitively (the current
--   user's own row via auth.uid() is excluded, so an unchanged/own username is
--   always "available"). The unique index below remains the authoritative last
--   line of defence against races.
--
-- RLS:
--   Unchanged. No new global SELECT policy on public.profiles — the existing
--   own-row / trainer-directory / coach-link policies already cover every place
--   the username is displayed. Availability goes through the RPC only.
--
-- Safety:
--   Additive only. No column is dropped, no table is dropped. Apply ONLY via the
--   Supabase migration workflow; do NOT run from the mobile client and do NOT run
--   remotely from this environment.

alter table public.profiles
  add column if not exists username text;

-- Format: canonical stored form (already normalized client-side). Rejects
-- everything the app would never send, so the UI contract and DB contract agree.
alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (
    username is null
    or (
      length(username) between 3 and 24
      and username ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'
    )
  );

-- Case-insensitive uniqueness; NULLs stay allowed (partial index).
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- Availability RPC: SECURITY DEFINER (bypasses RLS, uses the table owner's
-- rights), stable, returns true only for a free, non-reserved name.
create or replace function public.check_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_username is not null
    and lower(p_username) not in (
      'admin', 'administrator', 'support', 'help', 'anyvo', 'official',
      'moderator', 'system', 'root', 'staff', 'trainer', 'null', 'undefined'
    )
    and not exists (
      select 1 from public.profiles p
      where p.username is not null
        and lower(p.username) = lower(p_username)
        and p.id <> auth.uid()
    );
$$;

revoke all on function public.check_username_available(text) from public;
grant execute on function public.check_username_available(text) to authenticated;

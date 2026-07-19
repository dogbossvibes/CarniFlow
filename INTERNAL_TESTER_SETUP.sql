-- ============================================================================
-- INTERNAL_TESTER_SETUP.sql
-- Interner Tester-Modus für ANYVO.
--
-- Zweck: ausgewählte interne Entwickler/Tester erhalten vollen Feature-Zugriff
-- (Active + Founder Active + Trainer) OHNE echten RevenueCat-Kauf. Die App
-- ergänzt die Entitlements nur in der Berechtigungslogik (getMyCapabilities);
-- RevenueCat/Store bleiben unverändert.
--
-- Sicherheit: Der Status liegt AUSSCHLIESSLICH hier (profiles.is_internal_tester).
-- Ein normaler Nutzer darf zwar seine eigene profiles-Zeile updaten, aber NIEMALS
-- dieses Flag setzen — ein BEFORE-UPDATE-Trigger friert is_internal_tester und
-- tester_level für alle außer service_role ein. Wird das Flag auf FALSE gesetzt,
-- verschwindet der Zugriff beim nächsten Login (Neuberechnung der Capabilities).
--
-- Idempotent; kann mehrfach ausgeführt werden.
-- ============================================================================

-- 1. tester_level ENUM (developer | qa | trainer | admin)
do $$ begin
  create type public.tester_level as enum ('developer', 'qa', 'trainer', 'admin');
exception
  when duplicate_object then null;
end $$;

-- 2. Spalten auf profiles
alter table public.profiles
  add column if not exists is_internal_tester boolean not null default false;

alter table public.profiles
  add column if not exists tester_level public.tester_level;

-- 3. Schutz: nur service_role darf is_internal_tester / tester_level ändern.
--    Für alle anderen (authenticated) werden diese Felder auf den alten Wert
--    zurückgesetzt — normale Profil-Updates (Name etc.) bleiben erlaubt.
create or replace function public.protect_internal_tester_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    new.is_internal_tester := old.is_internal_tester;
    new.tester_level       := old.tester_level;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_internal_tester on public.profiles;
create trigger trg_protect_internal_tester
  before update on public.profiles
  for each row
  execute function public.protect_internal_tester_fields();

-- ============================================================================
-- Verwaltung (nur mit service_role / SQL-Editor ausführen, NICHT aus der App):
--
--   update public.profiles
--      set is_internal_tester = true, tester_level = 'developer'
--    where id = '<user-uuid>';
--
--   -- Entzug:
--   update public.profiles
--      set is_internal_tester = false, tester_level = null
--    where id = '<user-uuid>';
-- ============================================================================

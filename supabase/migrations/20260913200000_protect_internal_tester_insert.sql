-- ============================================================================
-- Härtung der Internal-Tester-Authority (profiles.is_internal_tester /
-- profiles.tester_level): Schutz auch bei INSERT.
--
-- Ist-Stand Production (read-only geprüft, 13.09.2026):
--   • trg_protect_internal_tester: BEFORE UPDATE — friert beide Felder für alle
--     Aufrufer ausser auth.role() = 'service_role' auf den alten Wert ein.
--   • RLS: authenticated darf die eigene Zeile INSERTen/UPDATEn (id = auth.uid());
--     Tabellen-Grants INSERT/UPDATE für authenticated auf allen Spalten.
--   • Rest-Risiko: ein INSERT der eigenen Profilzeile (falls sie fehlen sollte)
--     lief bisher OHNE Trigger → is_internal_tester=true / tester_level='…'
--     hätte gesetzt werden können. Praktisch durch on_auth_user_created +
--     fehlende DELETE-Policy gedeckt, aber nicht serverseitig erzwungen.
--
-- Änderung (minimal, dieselbe Funktion/derselbe Trigger — keine zweite Authority):
--   • Funktion unterscheidet TG_OP:
--       INSERT (nicht privilegiert): NEW.is_internal_tester := false,
--                                    NEW.tester_level       := null
--       UPDATE (nicht privilegiert): NEW.* := OLD.*   (wie bisher)
--       privilegiert (auth.role() = 'service_role'): NEW bleibt unverändert
--   • Trigger feuert BEFORE INSERT OR UPDATE.
--   • search_path leer (Funktion nutzt ausschliesslich schema-qualifiziertes auth.role()).
--
-- Privilegierter Kontext — bewusst UNVERÄNDERT auf auth.role() = 'service_role':
--   • REST/API mit Service-Role-Key (JWT role=service_role): darf setzen.
--   • Client-JWT (role=authenticated) / anon: nie privilegiert.
--   • SQL-Editor / psql als postgres OHNE JWT: auth.role() = NULL → NICHT
--     privilegiert; administrative Pflege dort nur mit explizitem Claim-Kontext
--     in derselben Transaktion, z. B.:
--         begin;
--         select set_config('request.jwt.claim.role', 'service_role', true);
--         update public.profiles set is_internal_tester = true, tester_level = 'developer'
--          where id = '<user-uuid>';
--         commit;
--     Das ist Absicht: keine current_user-/postgres-Ausnahme, kein Komfort-Bypass.
--
-- Kein Datenupdate, keine Grants/Policies geändert. Idempotent.
-- ============================================================================

create or replace function public.protect_internal_tester_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'INSERT' then
      -- Neue Zeile ohne Privileg: nie als Tester anlegen (kein OLD bei INSERT).
      new.is_internal_tester := false;
      new.tester_level       := null;
    else
      -- UPDATE ohne Privileg: Felder auf den gespeicherten Wert zurücksetzen
      -- (weder Setzen noch Entfernen durch den Client möglich).
      new.is_internal_tester := old.is_internal_tester;
      new.tester_level       := old.tester_level;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_internal_tester on public.profiles;
create trigger trg_protect_internal_tester
  before insert or update on public.profiles
  for each row
  execute function public.protect_internal_tester_fields();

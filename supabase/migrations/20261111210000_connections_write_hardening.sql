-- Connections: Schreibrechte härten.
--
-- Vorher durfte jede angemeldete Person eine Verbindung anlegen, in der sie
-- selbst die verbundene Person (connected_user_id) ist, mit beliebigem Status.
-- Damit liess sich ohne Zutun der Eigentümerin eine angenommene Verbindung
-- erzeugen. Ebenso konnte die verbundene Person jede Spalte ändern, auch den
-- Status.
--
-- Neu:
--   * Anlegen nur durch die Eigentümerin (owner_user_id), created_by = 'owner'.
--     Das deckt alle App-Abläufe ab (Trainer verbinden, Person für die
--     Gesundheitsakte verbinden). redeem_connection_invite läuft als
--     SECURITY DEFINER und ist nicht betroffen.
--   * Ändern: Beteiligte, Identitätsspalten sind unveränderlich. Die verbundene
--     Person darf eine offene Anfrage der Eigentümerin annehmen oder ablehnen
--     und eine Verbindung jederzeit ablehnen/blockieren, aber nie selbst
--     (wieder) freischalten.
--   * Lesen und Löschen unverändert: beide Beteiligten.
--
-- Keine Datenänderung: bestehende Zeilen bleiben unberührt.
-- Vor dem Ausführen: supabase/operations/20261111_preflight_connections_policies.sql

begin;

-- Alle bisherigen permissiven Policies entfernen (Namen unterscheiden sich je
-- nach Setup-Skript), danach genau vier neu anlegen. Permissive Policies werden
-- mit ODER verknüpft; eine übersehene alte Policy würde die Lücke offen lassen.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'connections' and permissive = 'PERMISSIVE'
  loop
    execute format('drop policy %I on public.connections', p.policyname);
  end loop;
end $$;

alter table public.connections enable row level security;

create policy connections_select on public.connections
  for select to authenticated
  using (owner_user_id = auth.uid() or connected_user_id = auth.uid());

create policy connections_insert on public.connections
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and created_by = 'owner'
    and connected_user_id <> auth.uid()
  );

create policy connections_update on public.connections
  for update to authenticated
  using (owner_user_id = auth.uid() or connected_user_id = auth.uid())
  with check (owner_user_id = auth.uid() or connected_user_id = auth.uid());

create policy connections_delete on public.connections
  for delete to authenticated
  using (owner_user_id = auth.uid() or connected_user_id = auth.uid());

create or replace function public.connections_guard_update()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Nur direkte Zugriffe der App-Rollen werden eingeschränkt. Dashboard,
  -- service_role und SECURITY-DEFINER-Funktionen (current_user = Eigentümer der
  -- Funktion) prüfen ihre Regeln selbst.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.owner_user_id is distinct from old.owner_user_id
     or new.connected_user_id is distinct from old.connected_user_id
     or new.connection_type is distinct from old.connection_type
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'connections: Spalte ist unveränderlich'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status and v_uid is distinct from old.owner_user_id then
    if not (
      new.status in ('declined', 'blocked')
      or (old.status = 'pending' and old.created_by = 'owner' and new.status = 'accepted')
    ) then
      raise exception 'connections: Statuswechsel nicht erlaubt'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.connections_guard_update() from public, anon, authenticated;

drop trigger if exists connections_guard_update on public.connections;
create trigger connections_guard_update
  before update on public.connections
  for each row execute function public.connections_guard_update();

commit;

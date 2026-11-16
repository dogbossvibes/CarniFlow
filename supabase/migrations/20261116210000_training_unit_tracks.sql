-- ANYVO: Training mit Fährte/Absuche verknüpfen (Issue #114, Trainingsdoku Etappe 5).
--
-- Neue Verknüpfungstabelle zwischen einem Training (training_units) und einer
-- Fährte (training_sessions, type 'track'), optional mit einer einzelnen
-- Absuche (track_runs). Mehrere Fährten pro Training und mehrere Trainings
-- (Hunde) pro Fährte sind möglich.
--
-- Datenwirkung: rein additiv (eine neue Tabelle, drei Indizes, eine Funktion,
-- drei Policies). Keine bestehende Tabelle, Funktion oder Policy wird geändert,
-- keine Zeile wird gelöscht oder verändert. Die Fremdschlüssel zeigen von der
-- Verknüpfung auf Training und Fährte, nie umgekehrt: Wird ein Training
-- gelöscht, verschwindet nur die Verknüpfungszeile; die Fährte, ihre Punkte,
-- Marker und Absuchen bleiben unberührt. Ältere App-Versionen kennen die
-- Tabelle nicht und ignorieren sie.
--
-- Sichtbarkeit: nur die Besitzerin. Keine Policy für Trainer:innen, kein
-- Zugriff für anon. Die Tabelle enthält keine Koordinaten.
--
-- Nicht automatisch ausführen: Ausführung nur nach gesonderter Freigabe.

create table if not exists public.training_unit_tracks (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  training_unit_id    uuid not null references public.training_units(id) on delete cascade,
  training_session_id uuid not null references public.training_sessions(id) on delete cascade,
  track_run_id        uuid references public.track_runs(id) on delete cascade,
  created_at          timestamptz not null default now()
);

-- Eindeutig je (Training, Fährte) ohne Absuche und je (Training, Fährte, Absuche).
create unique index if not exists training_unit_tracks_unit_session_key
  on public.training_unit_tracks (training_unit_id, training_session_id)
  where track_run_id is null;
create unique index if not exists training_unit_tracks_unit_session_run_key
  on public.training_unit_tracks (training_unit_id, training_session_id, track_run_id)
  where track_run_id is not null;
create index if not exists training_unit_tracks_session_idx
  on public.training_unit_tracks (training_session_id);

-- Prüft für das Anlegen: Training und Fährte gehören der angemeldeten Person,
-- und eine angegebene Absuche gehört zu genau dieser Fährte. Der Typ der
-- Fährte wird bewusst nicht geprüft, damit auch Fährten in älteren Formaten
-- verknüpfbar bleiben. security invoker: es gelten die Leserechte der
-- aufrufenden Person, die Funktion öffnet keinen zusätzlichen Zugriff.
create or replace function public.training_unit_track_link_allowed(
  p_unit_id uuid, p_session_id uuid, p_run_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
      select 1 from public.training_units u
      where u.id = p_unit_id and u.owner_id = auth.uid())
    and exists (
      select 1 from public.training_sessions s
      where s.id = p_session_id and s.owner_id = auth.uid())
    and (p_run_id is null or exists (
      select 1 from public.track_runs r
      where r.id = p_run_id and r.session_id = p_session_id));
$$;

revoke all on function public.training_unit_track_link_allowed(uuid, uuid, uuid) from public, anon;
grant execute on function public.training_unit_track_link_allowed(uuid, uuid, uuid) to authenticated;

alter table public.training_unit_tracks enable row level security;

-- Supabase vergibt neuen Tabellen standardmässig alle Rechte an anon und
-- authenticated. Zuerst alles entziehen, dann nur Lesen, Anlegen und Lösen geben.
revoke all on table public.training_unit_tracks from public, anon, authenticated;
grant select, insert, delete on table public.training_unit_tracks to authenticated;

drop policy if exists training_unit_tracks_select on public.training_unit_tracks;
create policy training_unit_tracks_select on public.training_unit_tracks
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists training_unit_tracks_insert on public.training_unit_tracks;
create policy training_unit_tracks_insert on public.training_unit_tracks
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and public.training_unit_track_link_allowed(training_unit_id, training_session_id, track_run_id)
  );

-- Kein Update: Ändern heisst Lösen und neu Verknüpfen.
drop policy if exists training_unit_tracks_delete on public.training_unit_tracks;
create policy training_unit_tracks_delete on public.training_unit_tracks
  for delete to authenticated
  using (owner_id = auth.uid());

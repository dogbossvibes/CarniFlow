-- ANYVO: Heimzone bei Trainer-Freigaben (Issue #121).
--
-- Die App der Besitzerin legt zur Freigabe eine gekürzte Kopie der Fährte ab
-- (ohne Koordinaten innerhalb ihrer Heimzone). Hat eine Freigabe eine Kopie,
-- lesen Trainer:innen nur noch diese Kopie und nicht mehr die Originaltabellen.
--
-- Datenwirkung: rein additiv (zwei neue Spalten, eine neue Funktion) plus
-- engere Leseregeln für Trainer:innen. Keine Zeile wird gelöscht oder
-- verändert; Fährten, Punkte, Marker, Absuchen und Feedback bleiben unberührt.
-- Bestehende Freigaben haben keine Kopie (shared_copy is null) und verhalten
-- sich unverändert, bis die Besitzerin die Fährte in der App öffnet.
--
-- Nicht automatisch ausführen: Ausführung nur nach gesonderter Freigabe.

alter table public.track_shares
  add column if not exists shared_copy jsonb,
  add column if not exists shared_copy_digest text;

alter table public.track_shares
  drop constraint if exists track_shares_copy_consistent;
alter table public.track_shares
  add constraint track_shares_copy_consistent check (
    (shared_copy is null and shared_copy_digest is null)
    or (shared_copy is not null and jsonb_typeof(shared_copy) = 'object'
        and shared_copy_digest ~ '^[a-f0-9]{64}$'
        and pg_column_size(shared_copy) <= 6000000)
  );

-- Wie can_view_shared_track, aber nur für Freigaben OHNE gekürzte Kopie.
-- can_view_shared_track selbst bleibt unverändert: es regelt weiterhin den
-- Zugriff auf die Freigabe, das Feedback und die Anzeigenamen.
create or replace function public.can_view_shared_track_original(p_track_id uuid, p_viewer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.track_shares sh
    join public.connections c
      on c.owner_user_id = sh.owner_user_id
     and c.connected_user_id = sh.trainer_user_id
     and c.connection_type = 'trainer_client'
     and c.status = 'accepted'
    where p_viewer_id = auth.uid()
      and sh.track_id = p_track_id
      and sh.trainer_user_id = p_viewer_id
      and sh.revoked_at is null
      and sh.shared_copy is null
  );
$$;

revoke all on function public.can_view_shared_track_original(uuid, uuid) from public, anon;
grant execute on function public.can_view_shared_track_original(uuid, uuid) to authenticated;

-- Originaldaten nur noch für Freigaben ohne Kopie. Die Besitzer-Regeln dieser
-- Tabellen werden nicht angefasst.
alter policy track_sessions_shared_select on public.training_sessions
  using (public.can_view_shared_track_original(id, auth.uid()));
alter policy track_points_shared_select on public.track_points
  using (public.can_view_shared_track_original(session_id, auth.uid()));
alter policy track_markers_shared_select on public.track_markers
  using (public.can_view_shared_track_original(session_id, auth.uid()));
alter policy track_runs_shared_select on public.track_runs
  using (public.can_view_shared_track_original(session_id, auth.uid()));
alter policy track_engine_sessions_shared_select on public.track_engine_sessions
  using (public.can_view_shared_track_original(session_id, auth.uid()));

-- Rückweg (nur zur Dokumentation, nicht Teil dieser Migration):
--   alter policy ... using (public.can_view_shared_track(<id>, auth.uid()));  -- je Tabelle
--   Die Spalten können bestehen bleiben; sie werden dann nicht mehr gelesen.

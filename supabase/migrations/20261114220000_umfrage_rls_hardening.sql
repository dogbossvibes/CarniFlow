-- Terminumfragen: Zugriffsrechte schärfen (Sicherheits-Härtung 2026-11-14).
--
-- Problem (UMFRAGE_SETUP.sql): umfrage_einladungen und umfrage_termine erlaubten
-- jedem angemeldeten Konto Lesen UND Schreiben (using (true)), umfrage_antworten
-- war für alle lesbar. Damit konnte jede Person fremde Umfragen manipulieren,
-- sich selbst einladen oder Antworten Dritter lesen (OWASP A01 Broken Access
-- Control).
--
-- Neu:
--   * Termine:      lesen Trainer:in + Eingeladene; schreiben nur Trainer:in.
--   * Einladungen:  lesen eigene bzw. Trainer:in; anlegen/löschen nur Trainer:in
--                   und nur für akzeptiert verbundene Personen.
--   * Antworten:    lesen Trainer:in + Eingeladene derselben Umfrage (Doodle-
--                   Übersicht bleibt); schreiben nur eigene, nur wenn eingeladen,
--                   und nur für Termine dieser Umfrage.
--
-- Datenwirkung: rein Rechte. Keine Zeile wird gelöscht oder verändert.
-- Rücknahme: Policies dieser Datei droppen und die aus UMFRAGE_SETUP.sql neu
-- anlegen.

begin;

-- Hilfsfunktionen als SECURITY DEFINER, damit sich die Policies von
-- trainer_umfragen und umfrage_einladungen nicht gegenseitig rekursiv auswerten.
create or replace function public.umfrage_is_trainer(p_umfrage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.trainer_umfragen u
    where u.id = p_umfrage_id and u.trainer_id = auth.uid()
  );
$$;

create or replace function public.umfrage_is_invited(p_umfrage_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.umfrage_einladungen e
    where e.umfrage_id = p_umfrage_id and e.user_id = auth.uid()
  );
$$;

create or replace function public.umfrage_can_invite(p_umfrage_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.umfrage_is_trainer(p_umfrage_id)
     and p_user_id is not null
     and p_user_id <> auth.uid()
     and exists (
       select 1 from public.connections c
       where c.status = 'accepted'
         and ((c.owner_user_id = auth.uid() and c.connected_user_id = p_user_id)
           or (c.connected_user_id = auth.uid() and c.owner_user_id = p_user_id))
     );
$$;

revoke all on function public.umfrage_is_trainer(uuid) from public, anon;
revoke all on function public.umfrage_is_invited(uuid) from public, anon;
revoke all on function public.umfrage_can_invite(uuid, uuid) from public, anon;
grant execute on function public.umfrage_is_trainer(uuid) to authenticated;
grant execute on function public.umfrage_is_invited(uuid) to authenticated;
grant execute on function public.umfrage_can_invite(uuid, uuid) to authenticated;

-- ── umfrage_termine ──────────────────────────────────────────────────────────
drop policy if exists "All manage termine" on public.umfrage_termine;
drop policy if exists umfrage_termine_select on public.umfrage_termine;
drop policy if exists umfrage_termine_insert on public.umfrage_termine;
drop policy if exists umfrage_termine_update on public.umfrage_termine;
drop policy if exists umfrage_termine_delete on public.umfrage_termine;

create policy umfrage_termine_select on public.umfrage_termine for select to authenticated
  using (public.umfrage_is_trainer(umfrage_id) or public.umfrage_is_invited(umfrage_id));
create policy umfrage_termine_insert on public.umfrage_termine for insert to authenticated
  with check (public.umfrage_is_trainer(umfrage_id));
create policy umfrage_termine_update on public.umfrage_termine for update to authenticated
  using (public.umfrage_is_trainer(umfrage_id)) with check (public.umfrage_is_trainer(umfrage_id));
create policy umfrage_termine_delete on public.umfrage_termine for delete to authenticated
  using (public.umfrage_is_trainer(umfrage_id));

-- ── umfrage_einladungen ──────────────────────────────────────────────────────
drop policy if exists "All see einladungen" on public.umfrage_einladungen;
drop policy if exists umfrage_einladungen_select on public.umfrage_einladungen;
drop policy if exists umfrage_einladungen_insert on public.umfrage_einladungen;
drop policy if exists umfrage_einladungen_delete on public.umfrage_einladungen;

create policy umfrage_einladungen_select on public.umfrage_einladungen for select to authenticated
  using (user_id = auth.uid() or public.umfrage_is_trainer(umfrage_id));
create policy umfrage_einladungen_insert on public.umfrage_einladungen for insert to authenticated
  with check (public.umfrage_can_invite(umfrage_id, user_id));
create policy umfrage_einladungen_delete on public.umfrage_einladungen for delete to authenticated
  using (public.umfrage_is_trainer(umfrage_id));
-- Bewusst keine UPDATE-Policy: die App ändert Einladungen nicht, und ein
-- Update könnte umfrage_id auf eine fremde Umfrage umbiegen.

-- ── umfrage_antworten ────────────────────────────────────────────────────────
drop policy if exists "All see antworten" on public.umfrage_antworten;
drop policy if exists "Users manage own antworten" on public.umfrage_antworten;
drop policy if exists umfrage_antworten_select on public.umfrage_antworten;
drop policy if exists umfrage_antworten_insert on public.umfrage_antworten;
drop policy if exists umfrage_antworten_update on public.umfrage_antworten;
drop policy if exists umfrage_antworten_delete on public.umfrage_antworten;

create policy umfrage_antworten_select on public.umfrage_antworten for select to authenticated
  using (
    user_id = auth.uid()
    or public.umfrage_is_trainer(umfrage_id)
    or public.umfrage_is_invited(umfrage_id)
  );
create policy umfrage_antworten_insert on public.umfrage_antworten for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.umfrage_is_invited(umfrage_id)
    and exists (select 1 from public.umfrage_termine t where t.id = termin_id and t.umfrage_id = umfrage_antworten.umfrage_id)
  );
create policy umfrage_antworten_update on public.umfrage_antworten for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and public.umfrage_is_invited(umfrage_id)
    and exists (select 1 from public.umfrage_termine t where t.id = termin_id and t.umfrage_id = umfrage_antworten.umfrage_id)
  );
create policy umfrage_antworten_delete on public.umfrage_antworten for delete to authenticated
  using (user_id = auth.uid());

commit;

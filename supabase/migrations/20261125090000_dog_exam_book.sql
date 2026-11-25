-- ANYVO: Prüfungs- und Turnierbuch je Hund (Spec docs/specs/phase2/01-pruefungsbuch.md).
--
-- Drei neue Tabellen:
--   dog_exam_results        Prüfungseinträge (Soft-Delete über deleted_at)
--   dog_exam_links          Verknüpfung Eintrag ↔ Fährte / Training / Dokument
--   dog_exam_access_grants  Lesefreigabe je Hund und Person (nur über bestehende Verbindung)
-- und zwei Hilfsfunktionen (exam_dog_owned, can_view_dog_exams).
--
-- Datenwirkung: rein additiv. Keine bestehende Tabelle, Spalte, Funktion oder
-- Policy wird geändert, keine Zeile verändert oder gelöscht. Fremdschlüssel
-- zeigen nur von den neuen Tabellen weg; wird ein Hund oder ein Konto gelöscht,
-- verschwinden nur dessen eigene Prüfungszeilen (on delete cascade, gleich wie
-- bei Trainingsdokumenten). Verknüpfte Fährten, Trainings und Dokumente bleiben
-- immer unberührt. Es gibt bewusst keine Delete-Policy auf Einträgen:
-- Entfernen heisst deleted_at setzen (wiederherstellbar).
--
-- Sichtbarkeit: Schreiben nur die Besitzerin des Hundes. Lesen zusätzlich
-- Personen mit gültiger, nicht widerrufener Freigabe über eine akzeptierte
-- Verbindung. Anhänge (Dokumentdateien) werden hier nicht freigegeben; die
-- bestehenden Speicher-Regeln bleiben unverändert. Kein Zugriff für anon.
--
-- Nicht automatisch ausführen: zuerst Staging, Production nur nach
-- ausdrücklicher Freigabe der Nutzerin.

create table if not exists public.dog_exam_results (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dog_id           uuid not null references public.dogs(id) on delete cascade,
  client_local_id  text not null,
  exam_date        date not null,
  location         text,
  club             text,
  judge            text,
  exam_type        text not null,
  exam_type_label  text,
  exam_level       text,
  sections         jsonb not null default '[]'::jsonb,
  total_points     numeric(7,2),
  max_points       numeric(7,2),
  rating           text,
  passed           boolean,
  placement        integer,
  notes            text,
  schema_version   smallint not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  constraint dog_exam_results_client_key unique (owner_id, client_local_id),
  constraint dog_exam_results_client_len check (length(client_local_id) between 1 and 80),
  constraint dog_exam_results_type_check check (exam_type ~ '^[a-z0-9_]{1,30}$'),
  constraint dog_exam_results_text_len check (
    coalesce(length(location), 0) <= 120 and coalesce(length(club), 0) <= 120
    and coalesce(length(judge), 0) <= 120 and coalesce(length(exam_type_label), 0) <= 80
    and coalesce(length(exam_level), 0) <= 20 and coalesce(length(rating), 0) <= 30
    and coalesce(length(notes), 0) <= 4000),
  constraint dog_exam_results_sections_check check (
    jsonb_typeof(sections) = 'array' and jsonb_array_length(sections) <= 12),
  constraint dog_exam_results_points_check check (
    (total_points is null or total_points >= 0) and (max_points is null or max_points >= 0)),
  constraint dog_exam_results_placement_check check (placement is null or placement between 1 and 10000),
  constraint dog_exam_results_date_check check (exam_date between date '1970-01-01' and date '2100-12-31')
);

create index if not exists dog_exam_results_dog_idx
  on public.dog_exam_results (dog_id, exam_date desc);
create index if not exists dog_exam_results_owner_updated_idx
  on public.dog_exam_results (owner_id, updated_at);

create table if not exists public.dog_exam_links (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exam_id     uuid not null references public.dog_exam_results(id) on delete cascade,
  kind        text not null,
  target_id   uuid not null,
  created_at  timestamptz not null default now(),
  constraint dog_exam_links_kind_check check (kind in ('training_session', 'training_unit', 'document')),
  constraint dog_exam_links_key unique (exam_id, kind, target_id)
);

create index if not exists dog_exam_links_target_idx
  on public.dog_exam_links (kind, target_id);

create table if not exists public.dog_exam_access_grants (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dog_id           uuid not null references public.dogs(id) on delete cascade,
  grantee_user_id  uuid not null references auth.users(id) on delete cascade,
  connection_id    uuid not null references public.connections(id) on delete cascade,
  -- Anzeigename des Hundes für die lesende Person (sie darf public.dogs nicht
  -- lesen). Von der Besitzerin beim Freigeben gesetzt; kein weiteres Hundedatum.
  dog_name         text not null,
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  constraint dog_exam_access_grants_not_self check (grantee_user_id <> owner_id),
  constraint dog_exam_access_grants_name_len check (length(dog_name) between 1 and 60)
);

-- Höchstens eine aktive Freigabe je Hund und Person.
create unique index if not exists dog_exam_access_grants_active_key
  on public.dog_exam_access_grants (dog_id, grantee_user_id)
  where revoked_at is null;
create index if not exists dog_exam_access_grants_grantee_idx
  on public.dog_exam_access_grants (grantee_user_id)
  where revoked_at is null;

-- Der Hund gehört der angemeldeten Person.
create or replace function public.exam_dog_owned(p_dog_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (select 1 from public.dogs d where d.id = p_dog_id and d.owner_id = auth.uid());
$$;

-- Lesen: Besitzerin oder gültige Freigabe über eine akzeptierte Verbindung
-- (Verbindungen gibt es in beide Richtungen: wer sie angefragt hat, ist egal).
-- Endet die Verbindung, endet die Sicht sofort (ohne dass die Freigabe-Zeile
-- geändert werden muss).
create or replace function public.can_view_dog_exams(p_dog_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.dogs d
    where d.id = p_dog_id
      and (
        d.owner_id = auth.uid()
        or exists (
          select 1
          from public.dog_exam_access_grants g
          join public.connections c on c.id = g.connection_id
          where g.dog_id = d.id
            and g.owner_id = d.owner_id
            and g.grantee_user_id = auth.uid()
            and g.revoked_at is null
            and c.status = 'accepted'
            and ((c.owner_user_id = g.owner_id and c.connected_user_id = g.grantee_user_id)
              or (c.owner_user_id = g.grantee_user_id and c.connected_user_id = g.owner_id))
        )
      )
  );
$$;

-- Verknüpfungsziel gehört der angemeldeten Person. security invoker: es gelten
-- die Leserechte der aufrufenden Person, kein zusätzlicher Zugriff.
create or replace function public.exam_link_target_owned(p_kind text, p_target_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case p_kind
    when 'training_session' then exists (
      select 1 from public.training_sessions s where s.id = p_target_id and s.owner_id = auth.uid())
    when 'training_unit' then exists (
      select 1 from public.training_units u where u.id = p_target_id and u.owner_id = auth.uid())
    when 'document' then exists (
      select 1 from public.dog_documents doc where doc.id = p_target_id and doc.owner_id = auth.uid())
    else false
  end;
$$;

revoke all on function public.exam_dog_owned(uuid) from public, anon;
revoke all on function public.can_view_dog_exams(uuid) from public, anon;
revoke all on function public.exam_link_target_owned(text, uuid) from public, anon;
grant execute on function public.exam_dog_owned(uuid) to authenticated;
grant execute on function public.can_view_dog_exams(uuid) to authenticated;
grant execute on function public.exam_link_target_owned(text, uuid) to authenticated;

alter table public.dog_exam_results enable row level security;
alter table public.dog_exam_links enable row level security;
alter table public.dog_exam_access_grants enable row level security;

-- Supabase vergibt neuen Tabellen standardmässig alle Rechte. Zuerst entziehen,
-- dann nur das Nötige geben. Kein Delete auf Einträgen (Soft-Delete).
revoke all on table public.dog_exam_results, public.dog_exam_links, public.dog_exam_access_grants
  from public, anon, authenticated;
grant select, insert, update on table public.dog_exam_results to authenticated;
grant select, insert, delete on table public.dog_exam_links to authenticated;
grant select, insert on table public.dog_exam_access_grants to authenticated;
grant update (revoked_at) on table public.dog_exam_access_grants to authenticated;

-- ── dog_exam_results ─────────────────────────────────────────
drop policy if exists dog_exam_results_select_owner on public.dog_exam_results;
create policy dog_exam_results_select_owner on public.dog_exam_results
  for select to authenticated
  using (owner_id = auth.uid());

-- Geteilte sehen nur nicht entfernte Einträge.
drop policy if exists dog_exam_results_select_shared on public.dog_exam_results;
create policy dog_exam_results_select_shared on public.dog_exam_results
  for select to authenticated
  using (deleted_at is null and public.can_view_dog_exams(dog_id));

drop policy if exists dog_exam_results_insert on public.dog_exam_results;
create policy dog_exam_results_insert on public.dog_exam_results
  for insert to authenticated
  with check (owner_id = auth.uid() and public.exam_dog_owned(dog_id));

drop policy if exists dog_exam_results_update on public.dog_exam_results;
create policy dog_exam_results_update on public.dog_exam_results
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and public.exam_dog_owned(dog_id));

-- ── dog_exam_links ───────────────────────────────────────────
drop policy if exists dog_exam_links_select on public.dog_exam_links;
create policy dog_exam_links_select on public.dog_exam_links
  for select to authenticated
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.dog_exam_results r
      where r.id = exam_id and r.deleted_at is null and public.can_view_dog_exams(r.dog_id)));

drop policy if exists dog_exam_links_insert on public.dog_exam_links;
create policy dog_exam_links_insert on public.dog_exam_links
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.dog_exam_results r where r.id = exam_id and r.owner_id = auth.uid())
    and public.exam_link_target_owned(kind, target_id));

drop policy if exists dog_exam_links_delete on public.dog_exam_links;
create policy dog_exam_links_delete on public.dog_exam_links
  for delete to authenticated
  using (owner_id = auth.uid());

-- ── dog_exam_access_grants ───────────────────────────────────
drop policy if exists dog_exam_access_grants_select on public.dog_exam_access_grants;
create policy dog_exam_access_grants_select on public.dog_exam_access_grants
  for select to authenticated
  using (owner_id = auth.uid() or grantee_user_id = auth.uid());

drop policy if exists dog_exam_access_grants_insert on public.dog_exam_access_grants;
create policy dog_exam_access_grants_insert on public.dog_exam_access_grants
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and revoked_at is null
    and public.exam_dog_owned(dog_id)
    and exists (
      select 1 from public.connections c
      where c.id = connection_id
        and c.status = 'accepted'
        and ((c.owner_user_id = auth.uid() and c.connected_user_id = grantee_user_id)
          or (c.owner_user_id = grantee_user_id and c.connected_user_id = auth.uid()))));

-- Nur Widerrufen (Spalte revoked_at); ein Widerruf wird nicht zurückgenommen,
-- neu freigeben heisst neue Zeile.
drop policy if exists dog_exam_access_grants_revoke on public.dog_exam_access_grants;
create policy dog_exam_access_grants_revoke on public.dog_exam_access_grants
  for update to authenticated
  using (owner_id = auth.uid() and revoked_at is null)
  with check (owner_id = auth.uid() and revoked_at is not null);

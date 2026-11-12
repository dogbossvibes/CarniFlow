-- Kontaktanfragen: anfragen, annehmen, einzeln freigeben.
--
-- Rein additiv. Bestehende Verbindungen, Freigaben und App-Abläufe bleiben
-- unverändert. Setzt 20261111210000_connections_write_hardening.sql voraus.
--
-- Modell:
--   * Eine Anfrage (contact_requests) geht von A an B. Bis zur Annahme sieht B
--     nur As Anzeigenamen.
--   * Bei Annahme entstehen zwei Verbindungen der Art 'contact' (A→B und B→A),
--     jeweils mit einer Berechtigungszeile, in der alles ausgeschaltet ist.
--     Jede Seite schaltet danach selbst frei, was die andere sehen darf.
--   * Anfragen sind nur möglich über einen Code/Link, den exakten Benutzernamen
--     (abschaltbar) oder an ein Fachprofil (Trainer:in).
--   * Schutz: Blockieren, stilles Ablehnen mit Wartezeit, Tageslimit, keine
--     freie Nachricht in der Anfrage.
--
-- Tabellen haben RLS ohne Schreibrechte für App-Rollen; geschrieben wird nur
-- über die Funktionen unten.

begin;

alter table public.profiles
  add column if not exists contact_requests_by_username boolean not null default true;

alter table public.connection_permissions
  add column if not exists view_documents boolean not null default false;

create table if not exists public.contact_requests (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references auth.users(id) on delete cascade,
  to_user_id    uuid not null references auth.users(id) on delete cascade,
  via           text not null check (via in ('code', 'username', 'professional')),
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (from_user_id <> to_user_id)
);
create unique index if not exists contact_requests_one_pending_idx
  on public.contact_requests (from_user_id, to_user_id) where status = 'pending';
create index if not exists contact_requests_to_idx on public.contact_requests (to_user_id, status);
create index if not exists contact_requests_from_idx on public.contact_requests (from_user_id, created_at);

create table if not exists public.contact_blocks (
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists contact_blocks_blocked_idx on public.contact_blocks (blocked_id);

create table if not exists public.contact_codes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('qr', 'link')),
  code_hash   text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists contact_codes_user_idx on public.contact_codes (user_id, kind);

alter table public.contact_requests enable row level security;
alter table public.contact_blocks enable row level security;
alter table public.contact_codes enable row level security;

revoke all on public.contact_requests, public.contact_blocks, public.contact_codes from anon, authenticated;
grant select on public.contact_requests, public.contact_blocks to authenticated;

-- Die Absenderin darf den wahren Status einer abgelehnten Anfrage nicht direkt
-- aus der Tabelle lesen; contact_requests_list() zeigt sie ihr als «offen».
drop policy if exists contact_requests_select on public.contact_requests;
create policy contact_requests_select on public.contact_requests
  for select to authenticated
  using (
    (from_user_id = auth.uid() and status in ('pending', 'accepted', 'cancelled'))
    or (to_user_id = auth.uid() and status in ('pending', 'accepted'))
  );

drop policy if exists contact_blocks_select on public.contact_blocks;
create policy contact_blocks_select on public.contact_blocks
  for select to authenticated
  using (blocker_id = auth.uid());

-- ── Hilfsfunktionen ─────────────────────────────────────────────────────────

create or replace function public.contact_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.contact_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;
revoke all on function public.contact_is_blocked(uuid, uuid) from public, anon, authenticated;

-- ── Code / Link ─────────────────────────────────────────────────────────────

create or replace function public.contact_code_create(p_kind text)
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_expires timestamptz;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_kind not in ('qr', 'link') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;

  -- Immer nur ein gültiger Code je Art.
  update public.contact_codes c set revoked_at = now()
  where c.user_id = v_uid and c.kind = p_kind and c.revoked_at is null;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_expires := now() + case p_kind when 'qr' then interval '10 minutes' else interval '7 days' end;

  insert into public.contact_codes (user_id, kind, code_hash, expires_at)
  values (v_uid, p_kind, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), v_expires);

  return query select v_code, v_expires;
end;
$$;

create or replace function public.contact_code_revoke(p_kind text)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.contact_codes set revoked_at = now()
  where user_id = auth.uid() and kind = p_kind and revoked_at is null;
$$;

-- ── Anfrage senden ──────────────────────────────────────────────────────────
-- Rückgabe (text): 'sent', 'already_connected', 'incoming_pending',
-- 'blocked_by_you', 'invalid_code', 'not_found', 'self', 'rate_limited'.
-- Blockierung durch die Gegenseite und eine frische Ablehnung liefern bewusst
-- ebenfalls 'sent', ohne dass eine Anfrage entsteht.

create or replace function public.contact_request_send(p_via text, p_value text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_target uuid;
  v_value text := trim(coalesce(p_value, ''));
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Tageslimit: höchstens 20 neue Anfragen in 24 Stunden.
  if (select count(*) from public.contact_requests r
      where r.from_user_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    return 'rate_limited';
  end if;

  if p_via = 'code' then
    select c.user_id into v_target
    from public.contact_codes c
    where c.code_hash = encode(sha256(convert_to(upper(v_value), 'UTF8')), 'hex')
      and c.revoked_at is null and c.expires_at > now();
    if v_target is null then return 'invalid_code'; end if;
  elsif p_via = 'username' then
    select p.id into v_target
    from public.profiles p
    where p.username is not null
      and lower(p.username) = lower(ltrim(v_value, '@'))
      and p.contact_requests_by_username;
    if v_target is null then return 'not_found'; end if;
  elsif p_via = 'professional' then
    begin
      select p.id into v_target from public.profiles p
      where p.id = v_value::uuid and p.role = 'trainer';
    exception when invalid_text_representation then
      v_target := null;
    end;
    if v_target is null then return 'not_found'; end if;
  else
    raise exception 'invalid via' using errcode = '22023';
  end if;

  if v_target = v_uid then return 'self'; end if;

  if exists (select 1 from public.contact_blocks b where b.blocker_id = v_uid and b.blocked_id = v_target) then
    return 'blocked_by_you';
  end if;

  if exists (select 1 from public.connections c
             where c.owner_user_id = v_uid and c.connected_user_id = v_target
               and c.connection_type = 'contact' and c.status = 'accepted') then
    return 'already_connected';
  end if;

  if exists (select 1 from public.contact_requests r
             where r.from_user_id = v_target and r.to_user_id = v_uid and r.status = 'pending') then
    return 'incoming_pending';
  end if;

  -- Still: von der Gegenseite blockiert, oder in den letzten 30 Tagen abgelehnt.
  if exists (select 1 from public.contact_blocks b where b.blocker_id = v_target and b.blocked_id = v_uid)
     or exists (select 1 from public.contact_requests r
                where r.from_user_id = v_uid and r.to_user_id = v_target
                  and r.status = 'declined' and r.responded_at > now() - interval '30 days') then
    return 'sent';
  end if;

  insert into public.contact_requests (from_user_id, to_user_id, via)
  values (v_uid, v_target, p_via)
  on conflict (from_user_id, to_user_id) where status = 'pending' do nothing;

  return 'sent';
end;
$$;

-- ── Anfrage beantworten ─────────────────────────────────────────────────────

create or replace function public.contact_connect_pair(p_a uuid, p_b uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_conn uuid;
  v_pair record;
begin
  for v_pair in select * from (values (p_a, p_b), (p_b, p_a)) as t(owner_id, other_id) loop
    insert into public.connections (owner_user_id, connected_user_id, status, created_by, connection_type)
    values (v_pair.owner_id, v_pair.other_id, 'accepted', 'owner', 'contact')
    on conflict (owner_user_id, connected_user_id, connection_type)
      do update set status = 'accepted'
    returning id into v_conn;

    -- Neue Kontakte starten ohne jede Freigabe. Bestehende Zeilen (z. B. nach
    -- Entblockieren) werden bewusst wieder auf «nichts freigegeben» gesetzt.
    insert into public.connection_permissions
      (connection_id, view_trainings, view_statistics, view_videos, view_dogs,
       view_appointments, view_health, view_private_notes, view_documents)
    values (v_conn, false, false, false, false, false, false, false, false)
    on conflict (connection_id) do update set
      view_trainings = false, view_statistics = false, view_videos = false, view_dogs = false,
      view_appointments = false, view_health = false, view_private_notes = false, view_documents = false;
  end loop;
end;
$$;
revoke all on function public.contact_connect_pair(uuid, uuid) from public, anon, authenticated;

create or replace function public.contact_block(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'invalid user' using errcode = '22023';
  end if;

  insert into public.contact_blocks (blocker_id, blocked_id)
  values (v_uid, p_user_id) on conflict do nothing;

  update public.contact_requests set status = 'declined', responded_at = now()
  where from_user_id = p_user_id and to_user_id = v_uid and status = 'pending';
  update public.contact_requests set status = 'cancelled', responded_at = now()
  where from_user_id = v_uid and to_user_id = p_user_id and status = 'pending';

  -- Kontakt in beide Richtungen stilllegen. Die Zeilen bleiben erhalten;
  -- Freigaben greifen nur bei Status 'accepted'.
  update public.connections set status = 'blocked'
  where connection_type = 'contact'
    and ((owner_user_id = v_uid and connected_user_id = p_user_id)
      or (owner_user_id = p_user_id and connected_user_id = v_uid));
end;
$$;

create or replace function public.contact_remove(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Kontakt in beide Richtungen beenden, ohne zu blockieren. Die Zeilen und
  -- ihre Berechtigungen bleiben erhalten, greifen aber nicht mehr.
  update public.connections set status = 'declined'
  where connection_type = 'contact' and status = 'accepted'
    and ((owner_user_id = v_uid and connected_user_id = p_user_id)
      or (owner_user_id = p_user_id and connected_user_id = v_uid));
end;
$$;

create or replace function public.contact_unblock(p_user_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  -- Hebt nur die Sperre auf. Der Kontakt entsteht erst durch eine neue Anfrage.
  delete from public.contact_blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

create or replace function public.contact_request_respond(p_request_id uuid, p_action text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.contact_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_action not in ('accept', 'decline', 'block') then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  select * into v_req from public.contact_requests r
  where r.id = p_request_id and r.to_user_id = v_uid and r.status = 'pending'
  for update;
  if not found then return 'not_found'; end if;

  if p_action = 'accept' then
    if public.contact_is_blocked(v_req.from_user_id, v_uid) then return 'not_found'; end if;
    update public.contact_requests set status = 'accepted', responded_at = now() where id = v_req.id;
    perform public.contact_connect_pair(v_req.from_user_id, v_uid);
    return 'accepted';
  elsif p_action = 'decline' then
    update public.contact_requests set status = 'declined', responded_at = now() where id = v_req.id;
    return 'declined';
  else
    perform public.contact_block(v_req.from_user_id);
    return 'blocked';
  end if;
end;
$$;

create or replace function public.contact_request_cancel(p_request_id uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.contact_requests set status = 'cancelled', responded_at = now()
  where id = p_request_id and from_user_id = auth.uid() and status = 'pending';
$$;

-- ── Listen mit Anzeigenamen ─────────────────────────────────────────────────
-- profiles ist nur für die eigene Zeile lesbar; diese Funktionen geben genau
-- den Namen der Gegenseite heraus, sonst nichts.

create or replace function public.contact_requests_list()
returns table (id uuid, direction text, other_user_id uuid, other_name text,
               other_username text, via text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select r.id, 'incoming', r.from_user_id, p.full_name, p.username, r.via, r.status, r.created_at
  from public.contact_requests r
  left join public.profiles p on p.id = r.from_user_id
  where r.to_user_id = auth.uid() and r.status = 'pending'
  union all
  -- Für die Absenderin bleibt eine abgelehnte Anfrage «offen».
  select r.id, 'outgoing', r.to_user_id, p.full_name, p.username, r.via,
         case when r.status = 'declined' then 'pending' else r.status end, r.created_at
  from public.contact_requests r
  left join public.profiles p on p.id = r.to_user_id
  where r.from_user_id = auth.uid() and r.status in ('pending', 'declined')
  order by 8 desc;
$$;

create or replace function public.contact_blocks_list()
returns table (user_id uuid, name text, username text, created_at timestamptz)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select b.blocked_id, p.full_name, p.username, b.created_at
  from public.contact_blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- ── Dokumente: Kontakte sehen sie nur mit ausdrücklicher Freigabe ───────────
-- Unverändert für alle bisherigen Verbindungsarten.

create or replace function public.can_view_legacy_dog_document(p_dog_id uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.dogs d
    join public.connections c on c.owner_user_id = d.owner_id
    left join public.connection_permissions p on p.connection_id = c.id
    where d.id = p_dog_id
      and c.connected_user_id = auth.uid()
      and c.status = 'accepted'
      and (c.connection_type <> 'contact' or coalesce(p.view_documents, false))
  );
$$;

revoke all on function
  public.contact_code_create(text), public.contact_code_revoke(text),
  public.contact_request_send(text, text), public.contact_request_respond(uuid, text),
  public.contact_request_cancel(uuid), public.contact_block(uuid), public.contact_unblock(uuid),
  public.contact_remove(uuid),
  public.contact_requests_list(), public.contact_blocks_list()
  from public, anon;
grant execute on function
  public.contact_code_create(text), public.contact_code_revoke(text),
  public.contact_request_send(text, text), public.contact_request_respond(uuid, text),
  public.contact_request_cancel(uuid), public.contact_block(uuid), public.contact_unblock(uuid),
  public.contact_remove(uuid),
  public.contact_requests_list(), public.contact_blocks_list()
  to authenticated;

commit;

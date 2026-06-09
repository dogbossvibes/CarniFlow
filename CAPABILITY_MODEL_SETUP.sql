-- ANYVO — Capability-/Connection-Modell (Fundament, Phase A)
-- Im Supabase-SQL-Editor ausführen. Idempotent.
-- Konvention trainer_client: owner_user_id = Kunde (Dateneigentümer),
-- connected_user_id = Trainer (darf gemäß connection_permissions sehen).

-- ── Capabilities ────────────────────────────────────────────
create table if not exists public.user_capabilities (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  pro_member     boolean not null default false,
  trainer_module boolean not null default false,
  updated_at     timestamptz default now()
);

alter table public.user_capabilities enable row level security;

drop policy if exists "read own capabilities" on public.user_capabilities;
create policy "read own capabilities" on public.user_capabilities for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "upsert own capabilities" on public.user_capabilities;
create policy "upsert own capabilities" on public.user_capabilities for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "update own capabilities" on public.user_capabilities;
create policy "update own capabilities" on public.user_capabilities for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Connections ─────────────────────────────────────────────
create table if not exists public.connections (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  owner_user_id     uuid not null references auth.users(id) on delete cascade,
  connected_user_id uuid not null references auth.users(id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_by        text not null default 'owner' check (created_by in ('owner','connected')),
  connection_type   text not null default 'trainer_client',
  connection_name   text,
  unique (owner_user_id, connected_user_id, connection_type)
);

create index if not exists connections_owner_idx     on public.connections (owner_user_id);
create index if not exists connections_connected_idx on public.connections (connected_user_id);

alter table public.connections enable row level security;

drop policy if exists "read own connections" on public.connections;
create policy "read own connections" on public.connections for select to authenticated
  using (auth.uid() = owner_user_id or auth.uid() = connected_user_id);

drop policy if exists "create connection" on public.connections;
create policy "create connection" on public.connections for insert to authenticated
  with check (auth.uid() = owner_user_id or auth.uid() = connected_user_id);

drop policy if exists "update own connection" on public.connections;
create policy "update own connection" on public.connections for update to authenticated
  using (auth.uid() = owner_user_id or auth.uid() = connected_user_id)
  with check (auth.uid() = owner_user_id or auth.uid() = connected_user_id);

drop policy if exists "delete own connection" on public.connections;
create policy "delete own connection" on public.connections for delete to authenticated
  using (auth.uid() = owner_user_id or auth.uid() = connected_user_id);

-- ── Berechtigungen ──────────────────────────────────────────
create table if not exists public.connection_permissions (
  id                 uuid primary key default gen_random_uuid(),
  connection_id      uuid not null unique references public.connections(id) on delete cascade,
  view_trainings     boolean not null default true,
  view_statistics    boolean not null default true,
  view_videos        boolean not null default true,
  view_dogs          boolean not null default true,
  view_appointments  boolean not null default true,
  view_health        boolean not null default false,
  view_private_notes boolean not null default false
);

alter table public.connection_permissions enable row level security;

drop policy if exists "read connection permissions" on public.connection_permissions;
create policy "read connection permissions" on public.connection_permissions for select to authenticated
  using (exists (
    select 1 from public.connections c
    where c.id = connection_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.connected_user_id)
  ));

-- Nur der Kunde (owner) darf Berechtigungen setzen/ändern.
drop policy if exists "owner manages permissions" on public.connection_permissions;
create policy "owner manages permissions" on public.connection_permissions for all to authenticated
  using (exists (
    select 1 from public.connections c
    where c.id = connection_id and auth.uid() = c.owner_user_id
  ))
  with check (exists (
    select 1 from public.connections c
    where c.id = connection_id and auth.uid() = c.owner_user_id
  ));

-- ── Einladungs-Codes ────────────────────────────────────────
create table if not exists public.connection_invites (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  trainer_id  uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz,
  max_uses    integer,
  uses        integer not null default 0,
  created_at  timestamptz default now()
);

create index if not exists connection_invites_trainer_idx on public.connection_invites (trainer_id);

alter table public.connection_invites enable row level security;

-- Trainer verwaltet eigene Invites. KEIN breites SELECT — Einlösen läuft
-- über die security-definer-Funktion redeem_connection_invite.
drop policy if exists "trainer manages invites" on public.connection_invites;
create policy "trainer manages invites" on public.connection_invites for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ── Funktion: Invite einlösen ───────────────────────────────
-- Kunde (auth.uid()) löst einen Trainer-Code ein → Connection (owner=Kunde,
-- connected=Trainer) + Default-Permissions; zählt uses hoch. Atomar.
create or replace function public.redeem_connection_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite   public.connection_invites%rowtype;
  v_owner    uuid := auth.uid();
  v_conn_id  uuid;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite from public.connection_invites
  where code = upper(trim(p_code))
  limit 1;

  if not found then
    raise exception 'invalid code';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'code expired';
  end if;
  if v_invite.max_uses is not null and v_invite.uses >= v_invite.max_uses then
    raise exception 'code exhausted';
  end if;
  if v_invite.trainer_id = v_owner then
    raise exception 'cannot connect to yourself';
  end if;

  -- Bestehende Connection wiederverwenden, sonst neu anlegen.
  select id into v_conn_id from public.connections
  where owner_user_id = v_owner and connected_user_id = v_invite.trainer_id
    and connection_type = 'trainer_client'
  limit 1;

  if v_conn_id is null then
    insert into public.connections (owner_user_id, connected_user_id, status, created_by, connection_type)
    values (v_owner, v_invite.trainer_id, 'accepted', 'owner', 'trainer_client')
    returning id into v_conn_id;

    insert into public.connection_permissions (connection_id) values (v_conn_id)
    on conflict (connection_id) do nothing;

    update public.connection_invites set uses = uses + 1 where id = v_invite.id;
  end if;

  return v_conn_id;
end;
$$;

grant execute on function public.redeem_connection_invite(text) to authenticated;

-- ── Funktion: Sichtbarkeits-Helper (für Phase C) ────────────
-- true, wenn p_viewer (Trainer) eine akzeptierte Connection zu p_owner (Kunde)
-- hat UND das angefragte Permission-Flag gesetzt ist.
create or replace function public.can_view(p_viewer uuid, p_owner uuid, p_perm text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.connections c
    join public.connection_permissions p on p.connection_id = c.id
    where c.owner_user_id = p_owner
      and c.connected_user_id = p_viewer
      and c.status = 'accepted'
      and case p_perm
        when 'view_trainings'     then p.view_trainings
        when 'view_statistics'    then p.view_statistics
        when 'view_videos'        then p.view_videos
        when 'view_dogs'          then p.view_dogs
        when 'view_appointments'  then p.view_appointments
        when 'view_health'        then p.view_health
        when 'view_private_notes' then p.view_private_notes
        else false
      end
  );
$$;

grant execute on function public.can_view(uuid, uuid, text) to authenticated;

-- ── Subscriptions: Tier-Check auf neues Modell erweitern ────
-- Belegtabelle akzeptiert jetzt 'pro' statt 'customer' (Trainer bleibt).
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='subscriptions') then
    alter table public.subscriptions drop constraint if exists subscriptions_tier_check;
    alter table public.subscriptions add constraint subscriptions_tier_check
      check (tier in ('pro','trainer','customer'));
  end if;
end $$;

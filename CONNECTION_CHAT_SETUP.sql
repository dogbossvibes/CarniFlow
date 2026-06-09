-- ANYVO — Chat an Connections gekoppelt (Phase B)
-- NACH CAPABILITY_MODEL_SETUP.sql ausführen. Idempotent.

create table if not exists public.connection_chats (
  id            uuid primary key default gen_random_uuid(),
  connection_id uuid not null unique references public.connections(id) on delete cascade,
  created_at    timestamptz default now()
);

create table if not exists public.connection_messages (
  id                uuid primary key default gen_random_uuid(),
  chat_id           uuid not null references public.connection_chats(id) on delete cascade,
  sender_id         uuid not null references auth.users(id) on delete cascade,
  message_type      text not null default 'text' check (message_type in ('text','voice','image','video')),
  content           text,
  created_at        timestamptz default now(),
  read_at           timestamptz,
  legacy_message_id uuid   -- für idempotente Migration aus messages
);

create index if not exists connection_messages_chat_idx on public.connection_messages (chat_id, created_at);
create unique index if not exists connection_messages_legacy_idx
  on public.connection_messages (legacy_message_id) where legacy_message_id is not null;

alter table public.connection_chats    enable row level security;
alter table public.connection_messages enable row level security;

-- Hilfsbedingung: bin ich an der Connection des Chats beteiligt?
-- (Inline als EXISTS, da Repo keine zentralen RLS-Helfer nutzt.)

-- ── connection_chats ────────────────────────────────────────
drop policy if exists "read connection chats" on public.connection_chats;
create policy "read connection chats" on public.connection_chats for select to authenticated
  using (exists (
    select 1 from public.connections c
    where c.id = connection_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.connected_user_id)
  ));

drop policy if exists "create connection chats" on public.connection_chats;
create policy "create connection chats" on public.connection_chats for insert to authenticated
  with check (exists (
    select 1 from public.connections c
    where c.id = connection_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.connected_user_id)
  ));

-- ── connection_messages ─────────────────────────────────────
drop policy if exists "read connection messages" on public.connection_messages;
create policy "read connection messages" on public.connection_messages for select to authenticated
  using (exists (
    select 1 from public.connection_chats ch
    join public.connections c on c.id = ch.connection_id
    where ch.id = chat_id
      and (auth.uid() = c.owner_user_id or auth.uid() = c.connected_user_id)
  ));

drop policy if exists "send connection messages" on public.connection_messages;
create policy "send connection messages" on public.connection_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.connection_chats ch
      join public.connections c on c.id = ch.connection_id
      where ch.id = chat_id
        and (auth.uid() = c.owner_user_id or auth.uid() = c.connected_user_id)
    )
  );

-- Empfänger markiert als gelesen (eigene Nachrichten nicht).
drop policy if exists "mark connection messages read" on public.connection_messages;
create policy "mark connection messages read" on public.connection_messages for update to authenticated
  using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.connection_chats ch
      join public.connections c on c.id = ch.connection_id
      where ch.id = chat_id
        and (auth.uid() = c.owner_user_id or auth.uid() = c.connected_user_id)
    )
  )
  with check (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.connection_chats ch
      join public.connections c on c.id = ch.connection_id
      where ch.id = chat_id
        and (auth.uid() = c.owner_user_id or auth.uid() = c.connected_user_id)
    )
  );

-- Realtime aktivieren (ignoriere Fehler, falls bereits hinzugefügt).
do $$ begin
  alter publication supabase_realtime add table public.connection_messages;
exception when duplicate_object then null;
end $$;

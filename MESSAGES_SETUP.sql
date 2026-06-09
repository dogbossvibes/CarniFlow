-- ANYVO — Chat & Sprach-/Video-Feedback (Trainer ↔ Kunde)
-- Im Supabase-SQL-Editor ausführen.

create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references auth.users(id) on delete cascade,
  recipient_id  uuid not null references auth.users(id) on delete cascade,
  body          text,
  audio_url     text,
  video_url     text,
  created_at    timestamptz default now(),
  read_at       timestamptz
);

create index if not exists messages_pair_idx on public.messages (sender_id, recipient_id, created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at desc);

alter table public.messages enable row level security;

-- Lesen: nur Beteiligte.
drop policy if exists "read own messages" on public.messages;
create policy "read own messages" on public.messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Senden: nur als man selbst.
drop policy if exists "send messages" on public.messages;
create policy "send messages" on public.messages for insert to authenticated
  with check (auth.uid() = sender_id);

-- Gelesen markieren: nur Empfänger.
drop policy if exists "mark read" on public.messages;
create policy "mark read" on public.messages for update to authenticated
  using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

-- Realtime aktivieren (ignoriere Fehler, falls bereits hinzugefügt).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
end $$;

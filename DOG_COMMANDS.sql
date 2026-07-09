-- DOG_COMMANDS.sql  ·  OPTIONALER VORSCHLAG — NICHT nötig für die aktuelle App.
-- Die Kommandoliste läuft derzeit LOKAL (AsyncStorage, gerätelokal). Diese Tabelle
-- braucht es nur, wenn Kommandos geräteübergreifend synchronisiert / vom Trainer
-- gelesen werden sollen. Stil wie DOG_HUB_SETUP.sql (public-Schema, owner_id/dog_id,
-- idempotent, RLS). Im Supabase-SQL-Editor ausführen (nach Freigabe).

create table if not exists public.dog_commands (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  dog_id          uuid not null references public.dogs(id) on delete cascade,
  name            text not null,
  category        text not null check (category in ('sport','private')),
  area            text,
  verbal_cue      text,
  hand_signal     text,
  goal            text,
  description     text,
  steps           jsonb not null default '[]'::jsonb,
  tips            jsonb not null default '[]'::jsonb,
  common_mistakes jsonb not null default '[]'::jsonb,
  video_url       text,
  audio_url       text,
  difficulty      text not null default 'easy' check (difficulty in ('easy','medium','hard')),
  is_favorite     boolean not null default false,
  last_used_at    timestamptz,
  usage_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists dog_commands_dog_idx on public.dog_commands (dog_id, is_favorite desc, updated_at desc);

-- RLS: Eigentümer voll, verbundene Trainer (accepted) nur lesend.
do $$
declare t text := 'dog_commands';
begin
  execute format('alter table public.%I enable row level security;', t);
  execute format('drop policy if exists %I_select on public.%I;', t, t);
  execute format($f$create policy %I_select on public.%I for select using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.connections c
      where c.owner_user_id = public.%I.owner_id
        and c.connected_user_id = auth.uid()
        and c.status = 'accepted'
    )
  );$f$, t, t, t);
  execute format('drop policy if exists %I_insert on public.%I;', t, t);
  execute format('create policy %I_insert on public.%I for insert with check (owner_id = auth.uid());', t, t);
  execute format('drop policy if exists %I_update on public.%I;', t, t);
  execute format('create policy %I_update on public.%I for update using (owner_id = auth.uid());', t, t);
  execute format('drop policy if exists %I_delete on public.%I;', t, t);
  execute format('create policy %I_delete on public.%I for delete using (owner_id = auth.uid());', t, t);
end $$;

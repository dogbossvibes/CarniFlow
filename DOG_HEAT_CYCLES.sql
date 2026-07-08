-- DOG_HEAT_CYCLES.sql  ·  VORSCHLAG zur Freigabe — im Supabase-SQL-Editor ausführen.
-- Legt die Tabelle für den Läufigkeitskalender (nur Hündinnen) an.
-- Konventionen wie DOG_HUB_SETUP.sql: public-Schema, owner_id/dog_id mit FK,
-- idempotent. RLS: Eigentümer voll, verbundene Trainer (public.connections,
-- status='accepted') NUR lesend. Bestehende Tabellen werden NICHT verändert.

-- ── Läufigkeits-Zyklen ───────────────────────────────────────────────────────
create table if not exists public.dog_heat_cycles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  dog_id      uuid not null references public.dogs(id) on delete cascade,
  start_date  date not null,                                    -- Beginn der Läufigkeit
  end_date    date,                                             -- optional
  phase       text check (phase in ('Proöstrus','Östrus','Diöstrus','Anöstrus')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dog_heat_dog_start_idx on public.dog_heat_cycles (dog_id, start_date desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- SELECT: Eigentümer ODER verbundener Trainer (accepted). Schreiben eigentümer-only.
do $$
declare t text := 'dog_heat_cycles';
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

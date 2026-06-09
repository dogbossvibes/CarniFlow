-- ANYVO — Trainingspläne (Trainer erstellt, mit Kunden geteilt)
-- Im Supabase-SQL-Editor ausführen.

create table if not exists public.training_plans (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  discipline  text,
  notes       text,
  steps       text[] not null default '{}',
  shared_with uuid[] not null default '{}',   -- Kunden-User-IDs
  created_at  timestamptz default now()
);

create index if not exists training_plans_trainer_idx on public.training_plans (trainer_id);

alter table public.training_plans enable row level security;

-- Trainer verwaltet eigene Pläne.
drop policy if exists "trainer manage plans" on public.training_plans;
create policy "trainer manage plans" on public.training_plans for all to authenticated
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- Geteilte Kunden dürfen lesen.
drop policy if exists "clients read shared plans" on public.training_plans;
create policy "clients read shared plans" on public.training_plans for select to authenticated
  using (auth.uid() = any(shared_with));

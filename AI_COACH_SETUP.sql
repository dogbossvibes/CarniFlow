-- ANYVO — KI-Coach: ai_insights. Idempotent, additiv.
create table if not exists public.ai_insights (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  dog_id        uuid references public.dogs(id) on delete cascade,
  insight_type  text not null,
  severity      text not null,
  title         text not null,
  message       text not null,
  data          jsonb default '{}'::jsonb,
  is_dismissed  boolean default false,
  created_at    timestamptz default now(),
  expires_at    timestamptz
);

create index if not exists ai_insights_user_idx on public.ai_insights (user_id);
create index if not exists ai_insights_dog_idx  on public.ai_insights (dog_id);

alter table public.ai_insights enable row level security;

-- User sieht/erstellt/ändert/löscht nur eigene Insights (Edge Functions laufen
-- mit dem User-JWT → fallen ebenfalls unter diese Policies).
drop policy if exists "own insights select" on public.ai_insights;
create policy "own insights select" on public.ai_insights
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "own insights insert" on public.ai_insights;
create policy "own insights insert" on public.ai_insights
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "own insights update" on public.ai_insights;
create policy "own insights update" on public.ai_insights
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own insights delete" on public.ai_insights;
create policy "own insights delete" on public.ai_insights
  for delete to authenticated using (user_id = auth.uid());

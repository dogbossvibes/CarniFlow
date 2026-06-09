-- ANYVO — Abonnements (Kunde / Trainer) — Beleg-Tabelle
-- Quelle der Wahrheit fürs Gating bleibt profiles.plan/role; diese Tabelle
-- protokolliert den Abo-Stand (z. B. für RevenueCat-Webhook später).
-- Im Supabase-SQL-Editor ausführen.

create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tier        text not null check (tier in ('customer','trainer')),
  product_id  text,
  status      text not null default 'active',
  store       text default 'app_store',
  expires_at  timestamptz,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now(),
  unique(user_id)
);

alter table public.subscriptions enable row level security;

drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription" on public.subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ANYVO — Subscription V2 (4 Pläne + Founder). Idempotent, additiv.
-- Pläne: beginner_trial | founder_active | active | trainer.
-- Founder Active ist ein EIGENER Plan (kein Rabatt), max. 11 Slots (founder_slot_limit()).
-- Runtime-Gating bleibt user_capabilities (pro_member/trainer_module); der Plan
-- steuert diese (siehe features/subscription).

-- ── subscriptions: anlegen, falls fehlend (alte + neue Spalten) ──
create table if not exists public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  tier        text,                       -- Altbestand (customer/trainer/pro)
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

-- ── subscriptions erweitern (bestehende Spalten/Logik bleiben) ──
alter table public.subscriptions add column if not exists plan                     text;
alter table public.subscriptions add column if not exists started_at               timestamptz default now();
alter table public.subscriptions add column if not exists trial_ends_at            timestamptz;
alter table public.subscriptions add column if not exists current_period_ends_at   timestamptz;
alter table public.subscriptions add column if not exists provider                 text;
alter table public.subscriptions add column if not exists provider_product_id      text;
alter table public.subscriptions add column if not exists provider_subscription_id text;

-- Plan-Check (null erlaubt für Altbestand). Idempotent neu setzen.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan is null or plan in ('beginner_trial','founder_active','active','trainer'));

-- Status-Werte erweitern (Altbestand 'active' bleibt gültig).
alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status in ('trialing','active','expired','cancelled','past_due'));

-- ── founder_slots ───────────────────────────────────────────
create table if not exists public.founder_slots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique not null references auth.users(id) on delete cascade,
  claimed_at      timestamptz default now(),
  subscription_id uuid references public.subscriptions(id) on delete set null
);

alter table public.founder_slots enable row level security;
drop policy if exists "own founder slot" on public.founder_slots;
create policy "own founder slot" on public.founder_slots for select to authenticated
  using (user_id = auth.uid());

-- ── Founder-Limit (EINZIGE Quelle der Wahrheit serverseitig) ─
-- Ehemals 77, seit dem Founder-Relaunch auf 11 begrenzt. Bestehende Founder
-- (Zeilen in founder_slots) bleiben unberührt; nur NEUE Claims werden begrenzt.
-- Client (app/premium.tsx → FOUNDER_SLOT_LIMIT) muss denselben Wert spiegeln.
create or replace function public.founder_slot_limit()
returns int language sql immutable as $$ select 11 $$;

-- ── Founder-Slot atomar beanspruchen (max = founder_slot_limit) ─
create or replace function public.claim_founder_slot(p_user_id uuid)
returns table(success boolean, slots_used int, slots_remaining int)
language plpgsql security definer set search_path = public as $$
declare v_count int; v_existing int; v_limit int := founder_slot_limit();
begin
  -- Serialisiert konkurrierende Claims (verhindert Überbuchung bei Race Conditions).
  perform pg_advisory_xact_lock(770077);

  -- Bestehender Founder → behält seinen Slot, unabhängig vom aktuellen Limit.
  select count(*) into v_existing from founder_slots where user_id = p_user_id;
  if v_existing > 0 then
    select count(*) into v_count from founder_slots;
    return query select true, v_count, greatest(0, v_limit - v_count); return;
  end if;

  select count(*) into v_count from founder_slots;
  if v_count >= v_limit then
    return query select false, v_count, 0; return;
  end if;

  insert into founder_slots(user_id) values (p_user_id);
  v_count := v_count + 1;
  return query select true, v_count, greatest(0, v_limit - v_count);
end; $$;
grant execute on function public.claim_founder_slot(uuid) to authenticated;

-- ── Verfügbare Founder-Slots (für die Paywall) ──────────────
create or replace function public.founder_slots_status()
returns table(slots_used int, slots_remaining int)
language sql security definer set search_path = public stable as $$
  select count(*)::int, greatest(0, founder_slot_limit() - count(*))::int from founder_slots;
$$;
grant execute on function public.founder_slots_status() to authenticated;

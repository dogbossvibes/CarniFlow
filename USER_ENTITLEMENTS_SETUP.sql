-- ANYVO — Lifetime / manuelle Entitlements (zusätzlich zur Apple/Google-Abo-Logik).
-- Idempotent & additiv. Im Supabase-SQL-Editor ausführen.
--
-- Zweck: ausgewählten Usern lebenslang (oder befristet) gratis Premium/Trainer
-- geben, unabhängig vom Store-Abo. Setzt NUR Service-Role/Admin; normale User
-- können nur lesen. Die App ODER-verknüpft das mit der bestehenden Abo-Prüfung.

create table if not exists public.user_entitlements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  plan_type      text not null,
  source         text not null default 'manual',
  is_lifetime    boolean not null default false,
  active         boolean not null default true,
  expires_at     timestamptz null,
  granted_by     uuid null,
  granted_reason text null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

-- Erlaubte Werte absichern (idempotent: erst droppen, dann neu).
alter table public.user_entitlements drop constraint if exists user_entitlements_plan_type_chk;
alter table public.user_entitlements add constraint user_entitlements_plan_type_chk
  check (plan_type in ('free', 'active', 'trainer', 'lifetime_active', 'lifetime_trainer'));

alter table public.user_entitlements drop constraint if exists user_entitlements_source_chk;
alter table public.user_entitlements add constraint user_entitlements_source_chk
  check (source in ('apple', 'google', 'manual', 'founder', 'admin'));

create index if not exists user_entitlements_user_idx on public.user_entitlements (user_id) where active;

-- ── RLS ──────────────────────────────────────────────────────
-- User: nur EIGENE Entitlements LESEN. Kein Insert/Update/Delete für User.
-- Verwalten darf nur die Service-Role (umgeht RLS) bzw. der SQL-Editor (Admin).
alter table public.user_entitlements enable row level security;

drop policy if exists "read own entitlements" on public.user_entitlements;
create policy "read own entitlements" on public.user_entitlements
  for select to authenticated
  using (user_id = auth.uid());

-- Bewusst KEINE insert/update/delete-Policies für authenticated → gesperrt.

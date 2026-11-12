-- Läufigkeit (Heat Cycles) — kanonische, reproduzierbare Schema-Beschreibung.
--
-- ZWECK: Repository-Reproduzierbarkeit. Production enthält diese Strukturen bereits
-- (manuell eingespielt: DOG_HEAT_CYCLES.sql vom 2026-07-08 und die nie nach main
-- übernommene Migration 20260825180000_dog_heat_phases_observations.sql aus
-- feat/track-module-rewrite, Commits 3369a00/c4d7301). Diese Datei beschreibt den am
-- 2026-10-06 read-only aus Production gelesenen Stand 1:1 (Spalten, Typen, NULL,
-- Defaults, Checks, FKs, Indizes, RLS, Policies) und ersetzt keine Policy inhaltlich.
--
-- IDEMPOTENT: auf Production ein No-op (gleiche Objekte, gleiche Namen, gleiche
-- Definitionen); auf einer leeren Datenbank legt sie den vollständigen Stand an.
-- Der historische Status-Backfill läuft nur, wenn die Spalte `status` neu entsteht.
--
-- Bekannte, bewusst NICHT geänderte Production-Eigenschaften (eigener Security-Task):
--  • INSERT/UPDATE prüfen nur owner_id = auth.uid(), nicht, ob dog_id/heat_cycle_id
--    demselben Nutzer gehören (neuere Health-Tabellen prüfen das über public.dogs).
--  • SELECT erlaubt jedem akzeptiert verbundenen Nutzer (public.connections) das Lesen
--    aller Läufigkeitsdaten des Eigentümers — nicht über health_access_grants geregelt.

-- ── Zyklen ───────────────────────────────────────────────────────────────────
create table if not exists public.dog_heat_cycles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  dog_id      uuid not null references public.dogs(id) on delete cascade,
  start_date  date not null,
  end_date    date,
  phase       text check (phase in ('Proöstrus','Östrus','Diöstrus','Anöstrus')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dog_heat_dog_start_idx on public.dog_heat_cycles (dog_id, start_date desc);

-- status: aktiver vs. abgeschlossener Zyklus. Backfill nur beim erstmaligen Anlegen.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'dog_heat_cycles' and column_name = 'status'
  ) then
    alter table public.dog_heat_cycles
      add column status text not null default 'active'
      constraint dog_heat_cycles_status_check check (status in ('active', 'completed'));
    update public.dog_heat_cycles set status = 'completed'
      where end_date is not null and status = 'active';
  end if;
end $$;

-- ── Phasen ───────────────────────────────────────────────────────────────────
create table if not exists public.dog_heat_phases (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  dog_id        uuid not null references public.dogs(id) on delete cascade,
  heat_cycle_id uuid not null references public.dog_heat_cycles(id) on delete cascade,
  phase_type    text not null,
  start_date    date not null,
  end_date      date,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_dog_heat_phases_cycle on public.dog_heat_phases (heat_cycle_id, start_date);

-- ── Beobachtungen ────────────────────────────────────────────────────────────
create table if not exists public.dog_heat_observations (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  dog_id        uuid not null references public.dogs(id) on delete cascade,
  heat_cycle_id uuid not null references public.dog_heat_cycles(id) on delete cascade,
  date          date not null,
  type          text not null,
  value         text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_dog_heat_obs_cycle on public.dog_heat_observations (heat_cycle_id, date);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Eigentümer: voller Zugriff. Akzeptiert verbundene Nutzer: nur lesen.
-- Policy-Namen exakt wie in Production (dog_heat_cycles_*, hp_*, ho_*).
alter table public.dog_heat_cycles       enable row level security;
alter table public.dog_heat_phases       enable row level security;
alter table public.dog_heat_observations enable row level security;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('dog_heat_cycles',       'dog_heat_cycles_select', 'dog_heat_cycles_insert', 'dog_heat_cycles_update', 'dog_heat_cycles_delete'),
      ('dog_heat_phases',       'hp_select',              'hp_insert',              'hp_update',              'hp_delete'),
      ('dog_heat_observations', 'ho_select',              'ho_insert',              'ho_update',              'ho_delete')
    ) as v(tbl, p_select, p_insert, p_update, p_delete)
  loop
    execute format('drop policy if exists %I on public.%I', t.p_select, t.tbl);
    execute format($f$create policy %I on public.%I for select using (
      owner_id = auth.uid()
      or exists (
        select 1 from public.connections c
        where c.owner_user_id = %I.owner_id
          and c.connected_user_id = auth.uid()
          and c.status = 'accepted'
      )
    )$f$, t.p_select, t.tbl, t.tbl);
    execute format('drop policy if exists %I on public.%I', t.p_insert, t.tbl);
    execute format('create policy %I on public.%I for insert with check (owner_id = auth.uid())', t.p_insert, t.tbl);
    execute format('drop policy if exists %I on public.%I', t.p_update, t.tbl);
    execute format('create policy %I on public.%I for update using (owner_id = auth.uid())', t.p_update, t.tbl);
    execute format('drop policy if exists %I on public.%I', t.p_delete, t.tbl);
    execute format('create policy %I on public.%I for delete using (owner_id = auth.uid())', t.p_delete, t.tbl);
  end loop;
end $$;

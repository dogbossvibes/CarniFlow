-- ANYVO — Track-Engine-Daten (Precision-Engine-Metriken + optionale Debug-Blobs).
-- Idempotent & additiv. Im Supabase-SQL-Editor ausführen.
--
-- Designentscheidung: SEPARATE 1:1-Tabelle zu training_sessions (type='track'),
-- NICHT neue Spalten auf training_sessions. Grund: getUserTrackSessions lädt mit
-- `select('*')` — große jsonb-Blobs würden jede Listen-Abfrage aufblähen.
-- Alte Fährten ohne Zeile bleiben voll lesbar (Engine-Daten = null).

create table if not exists public.track_engine_sessions (
  session_id               uuid primary key references public.training_sessions(id) on delete cascade,
  engine                   text,                  -- 'native_precision' | 'expo_fallback'
  platform                 text,                  -- 'ios' | 'android' | 'web'
  raw_gnss_available       boolean,
  average_accuracy         numeric(6,2),
  best_accuracy            numeric(6,2),
  worst_accuracy           numeric(6,2),
  distance_raw_meters      numeric(9,1),
  distance_filtered_meters numeric(9,1),
  rejection_rate           numeric(5,4),          -- 0..1
  gps_stats                jsonb,
  objects                  jsonb,
  filtered_track_points    jsonb,
  raw_track_points         jsonb,                 -- optional / nur Dev/Debug
  rejected_points          jsonb,                 -- optional / nur Dev/Debug
  started_at               timestamptz,
  ended_at                 timestamptz,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- Falls die Tabelle bereits existiert: additiv nachziehen (re-runnable).
alter table public.track_engine_sessions add column if not exists engine                   text;
alter table public.track_engine_sessions add column if not exists platform                 text;
alter table public.track_engine_sessions add column if not exists raw_gnss_available       boolean;
alter table public.track_engine_sessions add column if not exists average_accuracy         numeric(6,2);
alter table public.track_engine_sessions add column if not exists best_accuracy            numeric(6,2);
alter table public.track_engine_sessions add column if not exists worst_accuracy           numeric(6,2);
alter table public.track_engine_sessions add column if not exists distance_raw_meters      numeric(9,1);
alter table public.track_engine_sessions add column if not exists distance_filtered_meters numeric(9,1);
alter table public.track_engine_sessions add column if not exists rejection_rate           numeric(5,4);
alter table public.track_engine_sessions add column if not exists gps_stats                jsonb;
alter table public.track_engine_sessions add column if not exists objects                  jsonb;
alter table public.track_engine_sessions add column if not exists filtered_track_points    jsonb;
alter table public.track_engine_sessions add column if not exists raw_track_points         jsonb;
alter table public.track_engine_sessions add column if not exists rejected_points          jsonb;
alter table public.track_engine_sessions add column if not exists started_at               timestamptz;
alter table public.track_engine_sessions add column if not exists ended_at                 timestamptz;
alter table public.track_engine_sessions add column if not exists created_at               timestamptz default now();
alter table public.track_engine_sessions add column if not exists updated_at               timestamptz default now();

-- ── RLS: Zugriff nur über die eigene Parent-Session ─────────
alter table public.track_engine_sessions enable row level security;

drop policy if exists "owner via session" on public.track_engine_sessions;
create policy "owner via session" on public.track_engine_sessions for all to authenticated
  using (exists (select 1 from public.training_sessions s where s.id = session_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.training_sessions s where s.id = session_id and s.owner_id = auth.uid()));

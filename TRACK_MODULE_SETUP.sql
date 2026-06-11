-- ANYVO — Fährtenmodul Datenmodell (Spec). Im Supabase-SQL-Editor ausführen.
-- Idempotent. Behebt "Could not find table public.track_sessions": Fährten
-- werden als training_sessions-Zeile (type='track') gespeichert, Detaildaten in
-- track_points / track_markers / track_runs.

-- ── training_sessions um Track-Spalten erweitern ────────────
alter table public.training_sessions add column if not exists type                     text default 'training';
alter table public.training_sessions add column if not exists status                   text default 'completed';
alter table public.training_sessions add column if not exists title                    text;
alter table public.training_sessions add column if not exists track_data               jsonb;
alter table public.training_sessions add column if not exists surface_types            text[];
alter table public.training_sessions add column if not exists terrain_conditions       text[];
alter table public.training_sessions add column if not exists laying_duration_seconds  integer;
alter table public.training_sessions add column if not exists search_duration_seconds  integer;
alter table public.training_sessions add column if not exists lying_time_minutes       integer;
alter table public.training_sessions add column if not exists distance_meters          numeric(9,1);
alter table public.training_sessions add column if not exists average_deviation_meters numeric(6,2);
alter table public.training_sessions add column if not exists gps_quality_average      numeric(6,2);
alter table public.training_sessions add column if not exists articles_total           integer;
alter table public.training_sessions add column if not exists articles_found           integer;
alter table public.training_sessions add column if not exists corners_total            integer;
alter table public.training_sessions add column if not exists distractions_total       integer;
alter table public.training_sessions add column if not exists location_name            text;
alter table public.training_sessions add column if not exists latitude                 double precision;
alter table public.training_sessions add column if not exists longitude                double precision;
alter table public.training_sessions add column if not exists temperature              numeric(5,1);
alter table public.training_sessions add column if not exists weather_condition        text;
alter table public.training_sessions add column if not exists wind_speed               numeric(5,1);
alter table public.training_sessions add column if not exists humidity                 integer;
alter table public.training_sessions add column if not exists started_at               timestamptz;
alter table public.training_sessions add column if not exists ended_at                 timestamptz;
alter table public.training_sessions add column if not exists duration_seconds         integer;

create index if not exists training_sessions_type_idx on public.training_sessions (type);

-- ── track_points ────────────────────────────────────────────
create table if not exists public.track_points (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.training_sessions(id) on delete cascade,
  latitude    double precision not null,
  longitude   double precision not null,
  accuracy    numeric(6,2),
  altitude    numeric(8,2),
  speed       numeric(6,2),
  heading     numeric(6,2),
  timestamp   timestamptz not null default now(),
  point_type  text not null default 'lay',   -- 'lay' | 'run'
  created_at  timestamptz default now()
);
create index if not exists track_points_session_idx on public.track_points (session_id, timestamp);

-- ── track_markers ───────────────────────────────────────────
create table if not exists public.track_markers (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.training_sessions(id) on delete cascade,
  marker_type         text not null check (marker_type in ('gegenstand','winkel','verleitung','sprachmarker')),
  latitude            double precision,
  longitude           double precision,
  accuracy            numeric(6,2),
  distance_from_start numeric(9,1),
  note                text,
  audio_url           text,
  found               boolean not null default false,
  created_at          timestamptz default now()
);
create index if not exists track_markers_session_idx on public.track_markers (session_id);

-- ── track_runs (Ablauf/Suche) ───────────────────────────────
create table if not exists public.track_runs (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references public.training_sessions(id) on delete cascade,
  started_at               timestamptz,
  ended_at                 timestamptz,
  duration_seconds         integer,
  distance_meters          numeric(9,1),
  average_deviation_meters numeric(6,2),
  articles_found           integer,
  run_points               jsonb,
  created_at               timestamptz default now()
);
create index if not exists track_runs_session_idx on public.track_runs (session_id);

-- ── RLS: Zugriff nur über die eigene Parent-Session ─────────
alter table public.track_points  enable row level security;
alter table public.track_markers enable row level security;
alter table public.track_runs    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['track_points','track_markers','track_runs'] loop
    execute format('drop policy if exists "owner via session" on public.%I', t);
    execute format($p$
      create policy "owner via session" on public.%I for all to authenticated
      using (exists (select 1 from public.training_sessions s where s.id = session_id and s.owner_id = auth.uid()))
      with check (exists (select 1 from public.training_sessions s where s.id = session_id and s.owner_id = auth.uid()))
    $p$, t);
  end loop;
end $$;

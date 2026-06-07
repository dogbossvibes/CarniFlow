-- ANYVO — Fährten-Suche-Flow (Such-Pfad + Such-Statistik)
-- Im Supabase SQL-Editor ausführen. Idempotent.

-- Punkte unterscheiden: gelegte Fährte ('lay') vs. abgelaufener Suchweg ('search')
alter table public.track_points
  add column if not exists phase text not null default 'lay';

-- Such-Statistik an der Session
alter table public.track_sessions
  add column if not exists such_dauer_sec   integer;
alter table public.track_sessions
  add column if not exists such_distanz_m    integer;

comment on column public.track_points.phase is 'lay = gelegte Fährte, search = abgelaufener Suchweg';
comment on column public.track_sessions.such_dauer_sec  is 'Dauer der Suche in Sekunden';
comment on column public.track_sessions.such_distanz_m  is 'gelaufene Suchstrecke in Metern';

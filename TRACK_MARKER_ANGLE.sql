-- ANYVO — Winkel-Marker um Typ erweitern. Idempotent, additiv.
-- Linkswinkel / Rechtswinkel / Spitzwinkel / Absatz.
alter table public.track_markers
  add column if not exists angle_kind text
  check (angle_kind in ('links','rechts','spitz','absatz'));

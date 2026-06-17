-- ANYVO — Fährten-Marker um Material erweitern. Idempotent, additiv.
-- Gegenstände werden als Material gewählt (Stoff/Holz/Leder/Plastik/Diverses).
alter table public.track_markers
  add column if not exists material text
  check (material in ('stoff','holz','leder','plastik','diverses'));

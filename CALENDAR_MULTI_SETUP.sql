-- ANYVO — Termin-Redesign: Mehrfach-Typen + Mehrfach-Hunde
-- Im Supabase SQL-Editor ausführen. Idempotent.
-- (Die Einzelspalten type/dog_id bleiben als „primär" für Anzeige/Farbe.)

alter table public.calendar_events
  add column if not exists types   text[] not null default '{}';
alter table public.calendar_events
  add column if not exists dog_ids  uuid[] not null default '{}';

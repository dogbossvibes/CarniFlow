-- ANYVO — Trainer-Registrierung (Pro-gated)
-- Im Supabase SQL-Editor ausführen.

alter table public.profiles add column if not exists is_trainer    boolean default false;
alter table public.profiles add column if not exists trainer_since timestamptz;
alter table public.profiles add column if not exists trainer_name  text;

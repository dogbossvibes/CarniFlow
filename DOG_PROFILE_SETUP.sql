-- ANYVO — Hundeprofil Redesign (Variante 3)
-- Neue Felder am Hund: Leistungsabzeichen (Titel) + Abstammung.
-- Im Supabase SQL-Editor ausführen. Idempotent (IF NOT EXISTS).

alter table public.dogs add column if not exists titles  text[] not null default '{}';
alter table public.dogs add column if not exists sire    text;   -- Vater
alter table public.dogs add column if not exists dam     text;   -- Mutter
alter table public.dogs add column if not exists kennel  text;   -- Zuchtstätte

comment on column public.dogs.titles is 'Leistungsabzeichen / Titel, z. B. {"IGP 3","IBGH 3","Obedience"}';
comment on column public.dogs.sire   is 'Vater (Abstammung)';
comment on column public.dogs.dam    is 'Mutter (Abstammung)';
comment on column public.dogs.kennel is 'Zuchtstätte (Abstammung)';

-- DOGS_PROFILE_SETUP.sql
-- Erweitert die bestehende `dogs`-Tabelle um die Profil-/Identitäts-/Gesundheits-
-- Felder des neuen Hunde-Bereichs. Idempotent (IF NOT EXISTS) — gefahrlos mehrfach
-- ausführbar. In Supabase → SQL Editor ausführen.

alter table public.dogs add column if not exists is_favorite      boolean not null default false; -- „Herz"
alter table public.dogs add column if not exists color            text;     -- Farbe
alter table public.dogs add column if not exists discipline       text;     -- Sparte (IGP, Mondioring …)
alter table public.dogs add column if not exists level            text;     -- Stufe (1/2/3 …)
alter table public.dogs add column if not exists best_score       text;     -- Bestwert (z. B. 98/96/97)
alter table public.dogs add column if not exists microchip_number text;     -- Mikrochip-Nr.
alter table public.dogs add column if not exists tasso_registered boolean not null default false; -- Tasso-Registrierung
alter table public.dogs add column if not exists vet              text;     -- Tierarzt
alter table public.dogs add column if not exists vaccination      text;     -- Impfung (Datum/Notiz)
alter table public.dogs add column if not exists food             text;     -- Futter

-- Schnellzugriff auf Favoriten je Besitzer.
create index if not exists dogs_owner_favorite_idx on public.dogs (owner_id, is_favorite);

-- ANYVO — Aktive Sparten pro Nutzer (Profil → „Meine Sparten")
-- Im Supabase SQL-Editor ausführen.

alter table public.profiles
  add column if not exists aktive_sparten text[]
  default array['IGP','Unterordnung','Schutzdienst','Fährte','Obedience','Agility','Begleithund'];

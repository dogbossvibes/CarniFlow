-- ─────────────────────────────────────────────────────────────────────────────
-- VORSCHLAG (NICHT automatisch ausgeführt) — Sprache geräteübergreifend speichern
-- ─────────────────────────────────────────────────────────────────────────────
-- Aktuell wird die gewählte App-Sprache nur lokal (AsyncStorage, Key `app_locale`)
-- gespeichert. Wer die Sprache auch auf anderen Geräten synchron haben will,
-- kann sie zusätzlich am Profil ablegen.
--
-- Aktivierung (nur nach Rückfrage / bewusst):
--   1) Dieses SQL im Supabase-SQL-Editor ausführen.
--   2) In services/localeSync.ts LOCALE_SYNC_ENABLED = true setzen.
--   3) Fertig — der i18n-Store lädt/speichert dann zusätzlich über das Profil.
--
-- Werte entsprechen den App-Locale-Codes: 'de-CH' | 'de-DE' | 'gsw-CH'.

alter table public.profiles
  add column if not exists locale text
  check (locale in ('de-CH', 'de-DE', 'gsw-CH'));

comment on column public.profiles.locale is
  'Bevorzugte App-Sprache (i18n). NULL = App-Standard (de-CH).';

-- RLS: profiles hat bereits Policies (Nutzer darf eigene Zeile lesen/ändern).
-- Es ist KEINE neue Policy nötig, solange locale Teil der bestehenden
-- "update own profile"-Policy ist. Prüfen und ggf. bestehende Policy nutzen.

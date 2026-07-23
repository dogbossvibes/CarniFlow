-- ============================================================================
-- SUBSCRIPTION_NEWBIE_MIGRATION.sql
-- Stellt die Abo-Stufe von 'beginner_trial' auf 'newbie' um.
--
-- ADDITIV · IDEMPOTENT · TRANSAKTIONAL. Löscht/benennt KEINE Tabelle um,
-- verändert KEINE RevenueCat-Daten, erstellt KEINE Store-Produkte.
-- NICHT automatisch gegen Produktion ausführen — erst im Staging + Verifikation.
--
-- Basis: bestehender CHECK (SUBSCRIPTION_V2_SETUP.sql):
--   check (plan is null or plan in ('beginner_trial','founder_active','active','trainer'))
-- Endzustand: 'beginner_trial' → 'newbie', übrige Werte + NULL bleiben erhalten.
-- ============================================================================

begin;

-- 1. Alten Plan-CHECK entfernen (falls vorhanden) — sonst scheitert der Backfill.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;

-- 2. Übergangs-CHECK: erlaubt ALT und NEU gleichzeitig (sicher bei erneutem Lauf,
--    egal ob Zeilen noch 'beginner_trial' oder bereits 'newbie' enthalten).
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan is null or plan in ('beginner_trial','newbie','founder_active','active','trainer'));

-- 3. Backfill: bestehende Zeilen migrieren. Idempotent (betrifft nur noch vorhandene
--    'beginner_trial'-Zeilen; bei erneutem Lauf 0 Zeilen). Niemand verliert sein Abo.
update public.subscriptions set plan = 'newbie' where plan = 'beginner_trial';

-- 4. Finalen CHECK setzen (ohne 'beginner_trial'). Erhält NULL + die 3 Bestandswerte.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan is null or plan in ('newbie','founder_active','active','trainer'));

commit;

-- ============================================================================
-- VERIFIKATION (nur Staging — einzeln ausführen, NICHT Teil der Transaktion):
--
--   -- Planwerte VOR Migration (zur Kontrolle vorher ausführen):
--   select plan, count(*) from public.subscriptions group by plan order by plan;
--
--   -- Anzahl beginner_trial VOR / newbie NACH:
--   select count(*) filter (where plan='beginner_trial') as beginner_before,
--          count(*) filter (where plan='newbie')         as newbie_after
--     from public.subscriptions;   -- nach Migration: beginner_before = 0
--
--   -- Constraint-Inhalt NACH Migration:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_plan_check';
--
--   -- Ungültiger Wert wird abgelehnt (muss einen Fehler werfen):
--   -- insert into public.subscriptions (user_id, plan) values ('<uuid>','bogus');
--
--   -- Gültige Werte werden akzeptiert:
--   -- update public.subscriptions set plan='newbie'  where user_id='<uuid>';
--   -- update public.subscriptions set plan='trainer' where user_id='<uuid>';
--
--   -- Bestehende Nutzer bleiben erhalten (Gesamtzahl unverändert):
--   select count(*) from public.subscriptions;
-- ============================================================================

-- ============================================================================
-- ROLLBACK (NUR im Notfall, NICHT automatisch ausführen — nur Staging):
--   begin;
--   alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
--   alter table public.subscriptions add constraint subscriptions_plan_check
--     check (plan is null or plan in ('beginner_trial','newbie','founder_active','active','trainer'));
--   update public.subscriptions set plan='beginner_trial' where plan='newbie';
--   alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
--   alter table public.subscriptions add constraint subscriptions_plan_check
--     check (plan is null or plan in ('beginner_trial','founder_active','active','trainer'));
--   commit;
--   -- Hinweis: Rollback nur sinnvoll, solange die App-Version noch 'beginner_trial' schreibt.
-- ============================================================================

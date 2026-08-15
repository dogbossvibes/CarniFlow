-- ANYVO — ACTIVE 4-Tage-Store-Trial: serverseitige Statusfelder.
--
-- Additiv auf der BESTEHENDEN `subscriptions`-Tabelle (keine neue Trial-Tabelle,
-- NICHT an `profiles` gehängt). Zweck: Trial nicht durch Logout/Reinstall erneut
-- triggern, Conversion messen, iOS/Android unterscheiden. Diese Felder sind NICHT
-- Ersatz für Apple-/Google-/RevenueCat-Eligibility.
--
-- STATUS: NICHT automatisch remote ausgeführt — Freigabe erforderlich (Spec §25).
-- Idempotent (add column if not exists), nullable, keine Datenmigration, keine
-- RLS-Änderung (bestehende subscriptions-Policies gelten weiter).

alter table public.subscriptions
  add column if not exists active_trial_offered_at   timestamptz,
  add column if not exists active_trial_started_at   timestamptz,
  add column if not exists active_trial_platform     text,
  add column if not exists active_trial_offer_count  integer not null default 0;

comment on column public.subscriptions.active_trial_offered_at  is 'Zeitpunkt der letzten proaktiven ACTIVE-Trial-Anzeige (Frequency-Capping/Funnel).';
comment on column public.subscriptions.active_trial_started_at   is 'Zeitpunkt des tatsächlich (Store) gestarteten ACTIVE-Trials. Anti-Abuse-Marker, plattformübergreifend. NICHT Ersatz für Store/RevenueCat-Eligibility.';
comment on column public.subscriptions.active_trial_platform    is 'Plattform des gestarteten Trials: ios | android.';
comment on column public.subscriptions.active_trial_offer_count is 'Anzahl proaktiver ACTIVE-Trial-Anzeigen (Frequency-Capping).';

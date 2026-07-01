-- Trial-Kündigung: Marker "zum Periodenende gekündigt".
-- Der Zugriff bleibt bis subscriptions.trial_ends_at bestehen und läuft dann
-- automatisch aus (Gating via isTrialLapsed, siehe features/subscription/plans.ts).
-- App-verwalteter Beginner-Trial (kein Apple-Kauf) → In-App-Kündigung genügt.

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

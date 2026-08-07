-- ============================================================================
-- 20260808120000_newbie_training_quota_one.sql
-- STEP 2 (additiv): NEWBIE-Trainings-Quota von 2 → 1 pro Kalendermonat.
--
-- Ersetzt AUSSCHLIESSLICH public.newbie_quota_limit(text) via CREATE OR REPLACE.
-- Keine Tabelle, keine Policy, keine RLS-Änderung, keine Datenmigration, kein DROP.
-- Bestehende Grants/Privilegien bleiben erhalten (CREATE OR REPLACE verändert sie
-- nicht). claim_newbie_quota / newbie_quota_status / is_pro_member bleiben unverändert
-- → Premium/Lifetime (is_pro_member) werden weiterhin ausgenommen.
--
-- Signatur/Attribute exakt wie in SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql
-- (language sql immutable; keine Rechte-Eskalation, kein gesetzter search_path,
--  kein zusaetzlicher Grant).
--
-- Finale serverseitige Limits (single source of truth):
--   dog = 1 · training = 1 · track = 0
-- (dog unverändert; training 2→1; track final 0 — konsistent zum Client
--  features/subscription/plans.ts NEWBIE_QUOTA).
-- ============================================================================
create or replace function public.newbie_quota_limit(p_kind text)
returns int language sql immutable as $$
  select case p_kind when 'dog' then 1 when 'training' then 1 when 'track' then 0 else 0 end
$$;

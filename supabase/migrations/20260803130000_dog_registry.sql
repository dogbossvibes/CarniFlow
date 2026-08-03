-- ANYVO: country-specific official dog registration.
--
-- Additive migration for T-37. Adds four nullable columns to public.dogs so a
-- single official registration record per dog can be documented (country, registry
-- type, optional free/official registry name, optional registration number).
--
-- Safety:
--   Additive only. No column is dropped — the legacy public.dogs.tasso_registered
--   column is intentionally KEPT (read for old-data migration, no longer written).
--   RLS is unchanged: the existing public.dogs policies already cover these columns,
--   no new table and no new policy are required.
--   Apply ONLY via the Supabase migration workflow; do NOT run from the mobile
--   client and do NOT run remotely from this environment.

alter table public.dogs
  add column if not exists registry_country_code text,
  add column if not exists registry_type         text,
  add column if not exists registry_name         text,
  add column if not exists registry_number       text;

-- Controlled set of registry types (nullable = no registration documented).
alter table public.dogs
  drop constraint if exists dogs_registry_type_chk;

alter table public.dogs
  add constraint dogs_registry_type_chk
  check (
    registry_type is null
    or registry_type in (
      'amicus', 'tasso', 'findefix',
      'official_dog_register', 'austria_pet_database', 'other'
    )
  );

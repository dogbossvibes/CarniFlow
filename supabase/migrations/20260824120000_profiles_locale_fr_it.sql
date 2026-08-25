-- Add FR/IT app locales to profiles.locale without touching existing profile rows.
-- Existing allowed values are verified in the current schema snapshots as:
-- de-CH, de-DE, gsw-CH.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_locale_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_locale_check
  CHECK (locale = ANY (ARRAY[
    'de-CH'::text,
    'de-DE'::text,
    'gsw-CH'::text,
    'fr-CH'::text,
    'it-CH'::text
  ]));

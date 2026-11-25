-- ANYVO: Fährten-Einstellungen je Hund (Hundeprofil → «Fährten-Einstellungen»).
--
-- Additive migration. Adds one nullable JSON column to public.dogs holding the
-- per-dog tracking defaults (indication at the article, default handler distance,
-- exam template preset, lying-time reminder, haptics/voice guidance). Shape and
-- validation live in the client (features/tracking/dogTrackSettings/model.ts);
-- unknown keys are preserved by the client on save.
--
-- Safety:
--   Additive only, nullable, no default, no backfill — existing dogs stay unchanged.
--   Older app versions select('*') and ignore the extra column.
--   RLS is unchanged: the existing row-level public.dogs policies (dogs_update:
--   using/with check owner_id = auth.uid()) already cover this column; no column-level
--   grants exist on public.dogs. No new table, no new policy.
--   Apply ONLY via the Supabase migration workflow with explicit user approval;
--   do NOT run from the mobile client and do NOT run remotely from this environment.

alter table public.dogs
  add column if not exists track_settings jsonb;

comment on column public.dogs.track_settings is
  'Fährten-Einstellungen dieses Hundes (JSON-Objekt, NULL = Standardverhalten der App).';

alter table public.dogs
  drop constraint if exists dogs_track_settings_object_chk;

alter table public.dogs
  add constraint dogs_track_settings_object_chk
  check (
    track_settings is null
    or (jsonb_typeof(track_settings) = 'object' and pg_column_size(track_settings) <= 4096)
  );

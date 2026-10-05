-- ANYVO: per-dog track overlay color (Multi-Dog track overlays V2).
--
-- Additive migration. Adds one nullable column to public.dogs holding a SEMANTIC
-- color key (never a hex value — the actual colors live in the client design tokens,
-- constants/colors.ts TRACK_OVERLAY_COLORS). NULL = "Automatisch": the client derives
-- a stable color from the dog id.
--
-- Safety:
--   Additive only, nullable, no default, no backfill — existing dogs stay unchanged.
--   RLS is unchanged: the existing row-level public.dogs policies (dogs_update:
--   using/with check owner_id = auth.uid()) already cover this column; no column-level
--   grants exist on public.dogs. No new table, no new policy.
--   Apply ONLY via the Supabase migration workflow; do NOT run from the mobile client
--   and do NOT run remotely from this environment.

alter table public.dogs
  add column if not exists track_overlay_color_key text;

comment on column public.dogs.track_overlay_color_key is
  'Fährtenfarbe dieses Hundes für Referenz-Fährten auf der Karte (semantischer Key, NULL = Automatisch).';

-- Controlled set of keys (must match TRACK_OVERLAY_COLORS in constants/colors.ts).
alter table public.dogs
  drop constraint if exists dogs_track_overlay_color_key_chk;

alter table public.dogs
  add constraint dogs_track_overlay_color_key_chk
  check (
    track_overlay_color_key is null
    or track_overlay_color_key in (
      'orange', 'violet', 'pink', 'yellow', 'blue', 'cyan', 'lime'
    )
  );

-- ============================================================================
-- track_markers_material_check: add the missing 'filz' value.
--
-- 20260913220000 (13.09.2026, 20:19) widened this constraint to the client
-- contract as it existed that day: stoff, holz, duebel, leder, plastik,
-- metall, teppich, diverses. 'filz' was added to the TypeScript contract
-- (features/tracking/store/trackingStore.ts MarkerMaterial) two days later in
-- 7ead9de (15.09.2026, 10:39) and has been a fully first-class, localized
-- "Gegenstand" material ever since — selectable in the quick-picker
-- (app/track/legen.tsx), translated in all 5 locales (track.materialFelt),
-- and displayed in app/track/[id].tsx, SegmentDetailSheet.tsx and
-- MarkerDetailSheet.tsx — but 20260913220000 predates it, so the constraint
-- was never extended to match. Both remote persistence paths
-- (features/sync/services/remoteTrainingSyncService.ts,
-- features/tracking/services/trackService.ts) pass material straight to
-- `track_markers.insert()` unfiltered, so a marker saved with material='filz'
-- fails with a 23514 check-constraint violation wherever this constraint is
-- already live — the existing per-marker fallback insert path limits the
-- damage to that one marker, but it never syncs.
--
-- This migration does not edit 20260913220000. It replaces ONLY
-- track_markers_material_check, exactly as 20260913220000 replaced its
-- predecessor: idempotent (drop if exists + add), no other constraint/
-- column/table touched, no data migration (every existing row's material,
-- if any, already lies within the old — now widened — set).
-- ============================================================================

alter table public.track_markers drop constraint if exists track_markers_material_check;
alter table public.track_markers add constraint track_markers_material_check
  check (material is null or material = any (array[
    'stoff', 'filz', 'holz', 'duebel', 'leder', 'plastik', 'metall', 'teppich', 'diverses'
  ]::text[]));

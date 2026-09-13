-- ============================================================================
-- track_markers: Check-Constraints auf den tatsächlichen Client-Contract heben.
--
-- Befund (Production, read-only, 13.09.2026): die Constraints stammen aus der
-- ersten Marker-Version und erlauben nur
--   angle_kind ∈ {links, rechts, spitz, absatz}
--   material   ∈ {stoff, holz, leder, plastik, diverses}
-- Der Client (features/tracking/store/trackingStore.ts) erzeugt seit der
-- Richtungstrennung/Fachwinkel-Erweiterung zusätzlich
--   angle_kind: spitz_links, spitz_rechts (Auto-Detektion), abriss, gw, ow, bw (manuell)
--   material:   duebel, metall, teppich (Gegenstand-Picker)
-- Folge: createRemoteTrackMarkersBatch (ein INSERT für alle Marker) scheitert
-- mit 23514, sobald EIN solcher Marker dabei ist → 0 track_markers remote,
-- syncTrainingSession bricht ab → track_runs wird nie geschrieben. Remote
-- existierte deshalb bis heute kein einziger spitz_*/gw/ow/bw/abriss-Marker
-- und kein duebel/metall/teppich-Material.
--
-- Änderung: exakt der Client-Contract (TypeScript-Union AngleKind / MarkerMaterial),
-- keine erfundenen Werte. NULL-Semantik unverändert (angle_kind NULL bei
-- Gegenständen, material NULL bei Winkeln). marker_type-Constraint unverändert
-- (entspricht bereits MarkerType). Keine Datenmigration: alle bestehenden Zeilen
-- liegen innerhalb der alten (Teil-)Menge. Idempotent (drop if exists + add).
-- ============================================================================

alter table public.track_markers drop constraint if exists track_markers_angle_kind_check;
alter table public.track_markers add constraint track_markers_angle_kind_check
  check (angle_kind is null or angle_kind = any (array[
    'links', 'rechts',
    'spitz_links', 'spitz_rechts',
    'spitz',
    'absatz', 'abriss',
    'gw', 'ow', 'bw'
  ]::text[]));

alter table public.track_markers drop constraint if exists track_markers_material_check;
alter table public.track_markers add constraint track_markers_material_check
  check (material is null or material = any (array[
    'stoff', 'holz', 'duebel', 'leder', 'plastik', 'metall', 'teppich', 'diverses'
  ]::text[]));

-- Leseregel für Hundedokumente: Besitzerin zuerst direkt prüfen.
-- Production hat diese Regel bereits (dort ohne versionierte Migration gesetzt); Staging hatte noch
-- die alte Fassung aus 20260921120000. Mit der alten Fassung scheitert `insert(...).select()`:
-- can_view_dog_document(id) ist STABLE und sieht die soeben eingefügte Zeile im Snapshot nicht.
-- Nur Regeländerung, keine Daten. Idempotent.
alter policy dog_documents_select on public.dog_documents
  using (
    ((owner_id = auth.uid()) and public.health_dog_owner_matches(dog_id, owner_id))
    or public.can_view_dog_document(id)
  );

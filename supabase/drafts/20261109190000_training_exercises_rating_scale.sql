-- Trainingsdoku neu, Etappe 1 (T-184, GitHub #31)
-- Additive Markierung, ob training_exercises.rating eine Lernstufe (1/2/4/5)
-- oder eine alte Sternebewertung (1–5) ist.
--
--   rating_scale IS NULL      → alte Sternebewertung (alle bestehenden Zeilen und
--                               alle Zeilen älterer App-Versionen, z. B. Build 57)
--   rating_scale = 'lernstufe' → Lernstufe aus dem neuen Erfassen-Screen
--
-- Keine Änderung bestehender Daten, kein Default, keine Umrechnung.
-- Ältere Apps ignorieren die Spalte.
--
-- STATUS: NUR VORBEREITET – NICHT AUSFÜHREN. Liegt bewusst in supabase/drafts/,
-- damit automatische Migrationsläufe diese Datei nicht anfassen. Erst nach
-- Ergänzung der RPC und Freigabe als neue Migration nach supabase/migrations/.
-- Bekanntes Restrisiko (vor Freigabe entscheiden): ältere Apps (z. B. Build 57),
-- die eine Übung mit Lernstufe neu speichern, schreiben die Zeile ohne
-- rating_scale – die RPC sollte ein vorhandenes rating_scale dann erhalten.
-- Ausführung ausschliesslich nach ausdrücklicher Nutzerfreigabe über den MASTER,
-- und zwar VOR der OTA mit dem neuen Erfassen-Screen.
--
-- OFFEN: Die RPC public.training_document_v1 (get/save) ist in keinem Repo
-- versioniert. Sie muss lesend aus der Datenbank geholt werden
--   select pg_get_functiondef(p.oid) from pg_proc p where p.proname = 'training_document_v1';
-- und hier als `create or replace function` so ergänzt werden, dass sie
-- rating_scale beim Speichern übernimmt und beim Laden zurückgibt.
-- Solange das fehlt, bricht diese Datei bewusst ab (Schutz vor Teilausführung).

do $$
begin
  raise exception 'T-184: Migration unvollständig – RPC training_document_v1 noch nicht ergänzt. Nicht ausführen.';
end
$$;

alter table public.training_exercises
  add column if not exists rating_scale text null;

alter table public.training_exercises
  drop constraint if exists training_exercises_rating_scale_check;
alter table public.training_exercises
  add constraint training_exercises_rating_scale_check
  check (rating_scale is null or (rating_scale = 'lernstufe' and rating in (1, 2, 4, 5)));

comment on column public.training_exercises.rating_scale is
  'NULL = alte Sternebewertung 1-5; ''lernstufe'' = Lernstufe 1/2/4/5 (Trainingsdoku neu, T-184).';

-- RPC-Anpassung training_document_v1: folgt nach Erhalt der aktuellen Definition.

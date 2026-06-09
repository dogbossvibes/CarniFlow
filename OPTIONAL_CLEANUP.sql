-- ANYVO — OPTIONAL: alte Tabellen des Rollen-Modells entfernen.
-- ⚠️ ZERSTÖRERISCH & UNUMKEHRBAR. Erst ausführen, wenn ALLE Migrationen
-- erfolgreich liefen UND ein aktueller App-Build im Store ist, der das alte
-- Modell nicht mehr nutzt. Vorher Backup/Export empfohlen.
--
-- Diese Tabellen werden vom neuen Capability-/Connection-Modell nicht mehr
-- gelesen. Erst entfernen, wenn du sicher bist, dass nichts mehr darauf zugreift.

-- Alter Chat (durch connection_messages ersetzt):
-- drop table if exists public.messages cascade;

-- Alte Trainer-Kunden-Beziehungen (durch connections ersetzt):
-- drop table if exists public.coach_relationships cascade;

-- Hinweis: trainer_profiles (Bio/Spezialgebiete/Code) bleibt bestehen — wird
-- weiter für das Trainer-Profil verwendet. NICHT droppen.
--
-- Spalte training_units.shared_with_trainer wird nicht mehr genutzt (Sichtbarkeit
-- läuft über connection_permissions). Optional entfernen:
-- alter table public.training_units drop column if exists shared_with_trainer;

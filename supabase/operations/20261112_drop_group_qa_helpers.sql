-- Production-Schreibaktion: nur nach ausdrücklicher Freigabe der Nutzerin ausführen.
-- Entfernt die QA-Hilfen vom Oktober/November 2026 (Testfenster, Testkonten-Bezug).
-- Kundendaten sind nicht betroffen: Die Tabellen enthalten nur ein Ablaufdatum.
-- Vorher prüfen, dass kein Cron-Job und keine andere Funktion sie nutzt (Abfrage 1).

-- 1) Prüfung (read-only): erwartet 0 Zeilen
select jobname from cron.job where command ilike '%qa_20261021%' or command ilike '%group_distraction_qa%';

-- 2) Entfernen
begin;
drop function if exists public.training_live_qa_20261021(text, text, jsonb);
drop function if exists public.group_distraction_qa_v1(text, jsonb);
drop table if exists public.training_live_qa_window_20261021;
drop table if exists public.group_distraction_qa_window;
commit;

# T115: exakte synthetische PNG bereinigen (Review, keine Ausführung)

## Belegter Zustand

- Supabase Production `axkkhyqrjrtbkumaulta`, Bucket `dog-documents`.
- Exakter Pfad: `68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png`.
- SQL-Nachprüfung 2026-11-02 12:57:57 UTC: 1 Storage-Objekt, 68 Byte, `image/png`, angelegt 12:51:35 UTC. Alle 16 Sections-Test-IDs und die Stage-B-Zeile fehlen; beide Testfreigaben sind widerrufen und inaktiv. Beleg: `T115-POSTSTOP-EXACT-FIXTURE-AUDIT-20261102.json`.
- Download **genau dieses Objekts** über Supabase Storage Dashboard: 68 Byte und SHA-256 `2aa4fa20701cdd6d8d56046069001186b5267e3ee7d0ef618ad2f4a683723e11`, identisch mit der lokalen synthetischen PNG. Beleg: `T115-EXACT-STORAGE-PNG-HASH-READONLY-20261102.json`.
- Die zugehörige synthetische Dokumentzeile `4cf382c6-b315-4dfb-b175-eb6b3ebcfa52` fehlt. Der ursprüngliche Test bereinigte die Zeile trotz unklarem Storage-Löschergebnis. Der ursprüngliche negative Schreibtestfehler ist dadurch nicht belegt; nicht als Sicherheitslücke oder PASS werten.

## Eingrenzung für eine spätere Ausführung durch Chat 01

1. Vorher frischen, exakten Datenbank- und Storage-Zustand lesen. STOP, wenn Pfad, Anzahl, Größe, MIME, SHA-256, Eigentümer oder Hund vom obigen Beleg abweichen. Keine Kundenobjekte oder andere Pfade anfassen.
2. Nur als bestehendes R4-Owner-Konto A mit normalem JWT arbeiten; keine Service-Role, kein neues Grant, keine RLS-/Policy-Änderung. Falls die bestehende Storage-Policy für die Owner-Lesung eine Dokumentzeile voraussetzt: nur die ursprüngliche synthetische Zeile mit exakt gleicher ID, Owner-ID, Dog-ID und `file_url` wieder einsetzen. Vorher ID-Abwesenheit und unveränderte Fixture-Quelle belegen. Kein Upsert.
3. Per Owner-JWT **nur** die exakte Datei lesen und Bytezahl 68 sowie SHA-256 `2aa4fa20…3723e11` bestätigen. Bei anderer Antwort oder unklarem Zustand STOP; gegebenenfalls wiederhergestellte Metadatenzeile für Diagnose erhalten.
4. Die offizielle Supabase Storage API für genau **einen** relativen Pfad verwenden: `storage.from('dog-documents').remove([exactPath])`. Antwort und Fehlercode begrenzt prüfen; keine Präfix-/Ordner-Löschung und kein SQL-DELETE aus `storage.objects`. Das Löschen ist dauerhaft und muss unmittelbar vor Ausführung gemäß Browserregel bestätigt sein, falls über die UI ausgeführt.
5. Unabhängig vom API-Erfolg im Dashboard/SQL nur den exakten Storage-Pfad erneut prüfen: Anzahl `0`; Owner-Download darf keine Datei mehr liefern. Erst danach die exakt wiederhergestellte synthetische Dokumentzeile entfernen und erneut Abwesenheit prüfen. Bei unsicherem Storage-Nachweis die Metadatenzeile **nicht** erneut entfernen; STOP mit knappem Beleg.
6. Ergebnis als eigenes Receipt mit UTC, exaktem Pfad, vorher/nachher Anzahl, Hash-Nachweis und begrenzten Statuscodes ablegen. Keine Tokens, Schlüssel, Signed URLs oder Datei-Inhalte protokollieren. Die vollständige T115-Abnahme bleibt bis zur geklärten ursprünglichen Negative-Write-Ursache und neuer funktionaler Prüfung gesperrt.

Supabase verlangt für echte Dateilöschung die Storage API oder das Storage Dashboard; ein SQL-DELETE aus `storage.objects` würde die Datei verwaisen lassen: https://supabase.com/docs/guides/storage/management/delete-objects . API-Form: https://supabase.com/docs/reference/javascript/file-buckets-remove .

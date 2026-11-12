# Fährten-Dateiaustausch und Gruppenaufgaben — 14.10.2026

Userauftrag: kombinierten Dateiaustausch und Gruppenfährten implementieren; Chat05 Backend, Chat01 einzige OTA-Veröffentlichung; direktes Öffnen für nächsten Build vorbereiten.

## Isolierte Quelle
Basis iOS1.0.4/Verleitungs-Hotfix422c2a9a746f2c8e4800358e929ccbc314f8898b. Eigener Branch feat/track-file-group-exchange. Keine Bearbeitung von main, fremden Releasequellen oder globalen Koordinationsdateien. Dependencies nur vorhandener Symlink, keine Installation. Kein Commit/Push/Merge/DB-Write/Build durch02.

## OTA-fähiger Dateiaustausch
Gemeinsamer Einstieg Training → Fährten → Fährten gemeinsam sowie in der Auswertung. Zweckauswahl trennt bestehende Kontoübergabe zum Absuchen von der neuen Verleitungsaufgabe. Native Dateiauswahl ist vorhanden, empfangene .anyvo-track werden vor jedem Import geprüft und angezeigt. Hinweg: minimale gelegte Hauptreferenz, keine Konto-/Hunde-/Suchdaten, Notizen oder Audio. Gegenstände, Sonderwinkelrichtungen und echte Abschnittsgrenzen bleiben erhalten. Ausgehende neue Freigaben nutzen frische bestehende ACTIVE-Zugriffsauskunft und eigene abgeschlossene Quellen; importierte Suchkopien werden nicht als Original weitergegeben.

Helper übernimmt ausdrücklich; separate lokale Referenz und vorhandener Recorder, kein neuer Trainingsdatensatz, Hund oder Syncjob. Rückgabe enthält nur fertige eigenständige Verleitung samt Aufgabenbindung. Eigentümer sieht Hauptlinie und Rückgabe vor Übernahme. Aktuelle eigene Hauptreferenz wird erneut gelesen; Änderungen/Digest-Konflikte stoppen. Atomare SQLite-Übernahme mit Receipt verhindert doppelte Linien und lehnt abweichende Wiederholungen ab. Die Hauptfährte wird nie aktualisiert. Dateien bestätigen keine Absenderidentität; dies steht vor dem Import in der UI.

Additive lokale Migration12: local_track_exchange, local_track_exchange_receipts, local_track_group_tasks. Scope account+auth epoch, Rollback bei Konto-Wechsel. Keine Production-Supabase-Migration. Bestehende Aufnahme-, GPS-, Winkel-, End-, Score-, Background- und Syncalgorithmen bleiben unverändert. Verleitung bleibt gemäß bestehendem Vertrag foreground-only.

4MB Dateigrenze,20k Punkte/256 Marker pro Referenz, strict versioned keys, Zahlen/Koordinaten/Time-/Continuityprüfung. Kein ZIP, kein URLdownload, kein ausführbarer Inhalt. Dateiversand meldet nur vorbereitet; keine fingierte Empfangsbestätigung. Exportcache wird wegen verzögertem Android-URI-Zugriff nicht sofort gelöscht; Dateien älter24h werden beim nächsten Teilen entfernt. Eingelesene Picker-Kopie wird entfernt. Picker-native Kopierdauer/-platz hängt vom Provider ab; Größenlimit schützt anschließende Verarbeitung. UI DE/EN/FR/IT.

## Gruppenclient vorbereitet, ausdrücklich nicht freigeschaltet
Eigener Client gegen Chat05 training_group_distraction_v1: Gruppen-/Einladungsübersicht, namensgebundene Aufgabe, prepare/create, ausdrückliche Annahme, Recorder, Rückgabe, Prüfung/Übernahme, Widerruf. Bestehende geprüfte Core-RPC-/Modell-/Service-Implementierung als isolierte Gruppe übernommen; kein LiveShare-Provider/Gate aktiviert. Lokale IDs getrennt von Servertask-IDs; opaque Serverdigest wird nie mit Dateidigest verwechselt. Authwechsel/Timeout bricht RPC ab; stable submissionIDs, Ackprüfung.

GROUP_DISTRACTION_RELEASE_READY=false. Aktivierung verlangt Chat05 vollständigen Installer-/RLS-/Autoritäts-/Cron-/API-Nachweis und spezifische DB-Freigabe. Gruppen-UI noch DE, vollständige enabled-UI-/Offline-/Server-Roundtrip-Abnahme offen; deshalb kein produktiver Funktions-PASS und keine aktivierte Gruppen-OTA. Liveshare-Autoritätsinstallation bleibt separater Auftrag.

## Nächster nativer Build
native-preparation/track-file-open enthält nicht aktivierten Expo-Konfigurationsplugin, bounded native-intent Import und Integrationsplan. Exact MIME/UTI, bestehende Handler erhalten, keine zusätzliche Permission. OTA nutzt nur Picker. Native Handler übergibt nach Prüfung einen einmaligen accountgebundenen10-Minuten-Token zur normalen Vorschau. Android ACTION_SEND/STREAM und Provider ohne Custom-MIME benötigen manuellen Import; nicht als unterstützt behauptet. Build/Simulator/Dateiprovider/Device-Abnahme offen.

## Prüfbelege iOS-Featurequelle
39 Suites/318 Tests PASS: Dateivertrag, echteSQLite-Rückgabe/Idempotenz/Scope/Rollback, Dateitransport/URI/Limit, Import-UI, Native-Token, Gruppen-Ack/Authvertrag plus bestehende Verleitungs-/Transfer-/Detailmap-Regressionen. Vollständiges TypeScript PASS. ESLint0Fehler/0Warnungen im Änderungsbereich. git diff --check PASS. Native Plugin-Test: idempotenteRegistrierung, unverändertebestehendeEinträge, exactMIME PASS. Native Kompilierung und Geräte-QA nicht ausgeführt. Plattformrelease und unabhängige Review separat, diese Quelle beweist keine OTA-Veröffentlichung.

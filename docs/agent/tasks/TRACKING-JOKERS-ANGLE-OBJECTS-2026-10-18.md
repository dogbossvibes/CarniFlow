# Tracking: Joker, Gummi und Winkel bei Gegenständen

Stand 2026-10-18: lokal implementiert und geprüft; nicht committed, nicht veröffentlicht. Verantwortlich Chat 02; Server Chat 05, Integration/OTA Chat 01. Eigener Worktree `anyvo-tracking-jokers-angle-objects`, Branch `feat/tracking-jokers-angle-objects`, HEAD `7521d48609c3a5b246bc9e04cd20eade141bccbc` plus eingefrorenes R2-Feldpaket. Das additive Übergabepaket wird gegen dessen inzwischen committed Native-Basis `fe1e383b9f7d13c8ec328e080889f8f1380f9e7d` erstellt. Kein fremder Worktree/main geändert.

## Verhalten und Datenfluss

- Zentrale Materialklassifikation: Dübel und neuer Ball sind optionale Joker. Sie bleiben gespeicherte/kartierte Marker, erhalten keine G-Nummer, keinen Fundzwang und keinen Anteil an Gegenstandsanzahl, Suche oder Bewertung. Gummi ist ein regulärer Gegenstand. Materiallisten für Datei-/Kontoübergabe sind erweitert, unbekannte Werte bleiben abgelehnt.
- Recorder, Suchobjekte, Recovery, lokale Zusammenfassungen, Analyse, Detail, Export und Transfer zählen reguläre Gegenstände. Recovery bewahrt die ursprüngliche Identität auch nach dem Herausfiltern von Jokern. Keine Entfernung historischer Marker, Funde oder Audit-Einträge.
- Historische gemischte Ergebnisse werden lesend projiziert. Ohne eindeutigen Snapshot wird kein Joker-Fund vom alten Gesamtwert geraten. Ein nicht mehr belegbar aufteilbarer alter Score wird nicht automatisch neu gewichtet. Ein Snapshot eines anderen Runs wird nicht übernommen. Gespeicherte alte Listenaggregate werden nicht global migriert.
- Gegenstandskorrekturen nutzen v2-RPCs; der Client prüft die Antwortversion. Alte Cacheantworten bleiben lesbar. Ausgeschlossene Joker-IDs erhalten alte Verlaufseinträge, sind aber nicht mehr korrigierbar. Kein stiller Rückfall auf alte Schreibschnittstellen.
- Kontoübergabe nutzt `track_transfer_v2` und numerisches `markerContractVersion: 2`; bestehende lokale Vorgänge behalten ihre Identität. Die Bestätigung ist ein Protokollvertrag, keine Berechtigung. Server-ACL/Ownership bleiben erforderlich.
- Gegenstände auf Winkeln verändern den Detektor nicht. Reale Recorder-Hook-Regressionen mit Gummi am Scheitel bestätigen L/R/SL/SR. BW/OW/GW bekommen aus vorhandenen bestätigten Detektorabschnitten ihre Geometrie auch während des Legens; manuelle Auswahl hat Vorrang. Bei fehlender Evidenz bleibt die Richtung offen. Automatik ausgeschaltet: die automatische Ergänzung kann erst beim Abschluss erfolgen; manuelle Auswahl bleibt verfügbar.
- Absatz bleibt eine eigene vorhandene Kategorie und ist im Schnellpicker explizit wählbar. Kein automatisches Ableiten eines Absatzes aus GPS; Abriss bleibt davon getrennt. Keine neue kombinierte BW/OW/GW-plus-Absatz-Semantik.

## Abgrenzung zum priorisierten Feldpaket

Die kanonische Distanzreihenfolge sowie G6/Ende-Überlagerung gehören zum bereits an Chat 01 übergebenen R2. Zusätzliche Oct11-Regressionen liegen separat in `outputs/tracking-colleague-followup-2026-10-18`, nicht im Joker-Patch. Nutzer bestätigt bewusst gelegten Linkswinkel nach G2. Aktueller Detektor findet dort auf der gespeicherten Linienapproximation einen Linkswinkel; ursprüngliche Roh-/Detektordaten fehlen. Das ist kein historischer Replay- oder Geräte-PASS. G6 bleibt historisch unbestätigt. Frische synthetische Fixes testen Fundverweilzeit und separate Endbestätigung; keine pauschale Schwellenlockerung.

## Prüfungen

- Gezielter Abschluss: 10 Suites / 157 Tests PASS; zusätzliche Nachprüfung 12 Suites / 76 Tests PASS; letzte Recovery-Nachprüfung 3 Suites / 33 Tests PASS. Mengen überlappen.
- Separates Feldpaket: 2 Suites / 22 Tests PASS, iOS-/Android-Hook-Mocks.
- Breiter Erstlauf: 294 Suites / 3531 Tests bestanden, 10 Suites / 14 Tests zunächst fehlgeschlagen. Betroffene Erwartungen, Fixture-Isolation und neue Test-Timeouts danach korrigiert und gezielt grün nachgeprüft. Kein vollständiger grüner Wiederholungslauf aller 304 Suites behauptet.
- TypeScript PASS. ESLint der geänderten erfassten TS-Dateien: 0 Fehler, 11 bestehende Warnungen. Neue Dateien werden beim Freeze zusätzlich geprüft. `git diff --check` PASS.
- Vier historische ausgelieferte TS-Reader behalten alle neuen Materialien in Detail/Karte unverändert. Recovery dreimal geprüft; im vierten Stand fehlt dieser Helper. Aktuelle echte SQLite-Persistenzprüfung erhält Material und Herkunfts-ID. Kein Altgeräte-/Zweitgeräte-Sync-PASS; alte Clients behandeln Ball noch generisch beziehungsweise zählen ihn, bis sie aktualisiert werden.
- Kein neuer nativer Code. Android-/Legacy-iOS-Integrationen und Bundle-/Runtime-Preflight bleiben Aufgabe von Chat 01. Kein Geräte-PASS.

## Backend-Abhängigkeit und Veröffentlichung

Chat 05 R4: `outputs/marker-materials-05-20261018-r4/candidate.sql`, SHA256 `50a39528f0867bd2df23014e1c046ccf9f570732c3e90f005e1c0a8a47b6dc58`. R1–R3 nicht installieren. R4 bewahrt den per frischem Serverhash belegten Dispatcher inklusive bestehender Verbindungs-, Quota- und Kopieprüfungen; nur Material-/Protokollergänzung. Kein implizites gerichtetes-Abriss-Transferupgrade.

Chat 02 hat R4-Quelle und Clientvertrag gelesen und die 32 C1/Material- sowie 23 Transferprüfungen unabhängig in einer lokalen Kopie erneut bestanden. Synthetisches PGlite, keine Live-JWT-/Mehrverbindungsabnahme. Produktionsinstallation benötigt die getrennte ausdrückliche DB-Freigabe, unmittelbar frischen Preflight, gesicherte Definitionen/Rechte und Postflight. Bestehende Daten werden nicht umgeschrieben. Nach neuen Materialdaten kein blindes Zurücksetzen der alten Materialbeschränkung; kompatibler Forward-Fix bevorzugt.

Joker-Client erst nach bereitgestelltem kompatiblem Backend und unabhängigem Client-/Runtime-Review veröffentlichen. Das R2-Feldpaket darf davon unabhängig ausgerollt werden. Keine DB-, Push-, OTA-, Build- oder Storeaktion durch Chat 02.

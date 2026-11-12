# Gegenstandskorrekturen nach Transfer und Verleitungen — 2026-10-13

Status: lokal integriert; unabhängiger Integrationsreview, echte Zweiaccount-HTTP-Abnahme und Clientparser/JSON/PDF-Prüfung bestanden. Finale Testdelta-Prüfung und Releasepreflight offen. Keine C1-Veröffentlichung.

## Quellen und Umfang

02 ist einziger Clientwriter. Separate Worktrees `anyvo-c1-after-distractions` (iOS, Basis e83eeb8dad894eeb65f4b1cb200a6ccfdd4a8569) und `anyvo-c1-after-distractions-android` (Android, Basis 84fafa8ea1e3dfb2115124d801297907d10a7252). Beide Basen sind die geprüften, durch01 für Verleitungen vorbereiteten Releasecommits. Deren tatsächlicher Veröffentlichungsabschluss wird separat bestätigt. Alte C1-Kandidaten wurden nicht unverändert veröffentlicht; ihre Funktionsänderungen wurden jeweils auf der passenden Plattform integriert.

## Integrationsentscheidungen

- Transfer-Owner-/Auth-Epochenprüfungen, lokale Transferwiederherstellung, Verleitungsdarstellung und Android-Gap-Guard bleiben erhalten.
- C1 verwendet Migration9; Transfer7 und Verleitungen8 bleiben bytegleich. Alte nicht veröffentlichte C1-Migration7 wird nicht als ausgelieferter Bestand behandelt.
- Vorhandene getrennte Korrekturwarteschlange, Verlauf, Offline-Absichten, Konfliktbehandlung und Export bleiben erhalten. Keine Änderung an GPS-Rohdaten oder Aufnahme-/Bewertungsalgorithmus.
- Beim ausdrücklich aufgerufenen vollständigen lokalen Datenbankleeren werden auch C1-Cache und C1-Outbox berücksichtigt. Kein automatisches Löschen und keine tatsächlichen Nutzerdaten gelöscht.
- Plattformabhängige bestehende Export-/Sprachdateien separat integriert, keine blinde iOS-Kopie nachAndroid.

## Prüfung

- iOS:39 bestehende Suites/350Tests PASS, neue Upgrade-Suite5Tests PASS. Zusammen40Suites/355eindeutigeTests. Der erste neue Testlauf scheiterte ausschließlich an einem vom Jest-Setup nicht unterstützten dynamischen Import; Testloader auf jest.requireActual korrigiert, danach5/5PASS. Kein Produktfix aus diesem Testadapterfehler.
- Android:41Suites/360Tests PASS, inklusive zusätzlicher Transfer-Gap-Prüfungen.
- Beide:vollständiger TypeScript-Check PASS, ESLint0Fehler/0Warnungen, git diff --check PASS.
- Neue SQLite-Tests verwenden tatsächliches Node-SQLite mit Expo-Adaptermock:frische Installation und Upgrade6/7/8; bestehende Tabelleninhalte, Transfer-Pending-Payloads und Verleitungsentwürfe exakt erhalten; explizites lokales Leeren umfasst beide C1-Tabellen. Keine native Geräteabnahme daraus ableiten.
- Vorhandene Transfer-/Verleitungs-, C1-Service/Repository/Hook/UI-, Sync- und Exportregressionen mitgeprüft.

## Historischer Zwischenstand vor der HTTP-Abnahme

05 muss frischen ausschließlich lesenden Production-Schema-/Quota-/Fixture-Preflight abschließen. Safari wurde während der Vorbereitung anderweitig genutzt; alter Preflight ist abgelaufen. Danach sichere lokale verdeckte Passworteingabe für beide vorhandenen QA-Konten und tatsächliche normale Zweiaccount-HTTP-Abnahme. Keine neue Testkontenfreigabe erforderlich, keine Credentials in Chat/Dateien.

Echte HTTP-Antworten anschließend mit Clientparser und Export prüfen. Unabhängiger Integrationsreview und01-Releasepreflight auf dann tatsächlich aktiven Quellen bleiben offen. Keine neue Live-DB-/Abo-/Consent-/Stage2-Änderung, kein Commit/Push/Merge/OTA/Build/Store-Schritt durch02. Geräte-QA bleibt ausdrücklich nachgelagert und nicht als bestanden behauptet.

## Abschluss der echten HTTP-/Clientprüfung

Der frische lesende 05-Preflight bestand am 13.10.2026. Der erste manuelle Anmeldeversuch scheiterte mit HTTP400 vor allen Schreibaktionen; 05 prüfte dies unabhängig. Der erfolgreiche Lauf `c1-result-20261013T191200187159Z.json` belegt normale Zweiaccount-Anmeldung, acht Testdatensatz-Inserts, zwei Claims, Rechte-/RLS-Isolation, Revision-/Wiederholungsfälle, unveränderte Originaldaten und Auditverlauf sowie beide Abmeldungen. Kein erneuter Harnessstart; Fixture-IDs sind jetzt belegt. Keine Zugangsdaten in diesem Bericht oder Testfixture.

05: `outputs/C1-05-BACKEND-FINAL-2026-10-13.json` = INDEPENDENT_BACKEND_HTTP_REVIEW_PASS. Der vorherige lokale 35-Dateien-Integrationsreview bestand ebenfalls ohne Findings (`C1-05-INTEGRATION-REVIEW-2026-10-13.json`).

Die zwei echten Serverantworten wurden unverändert als synthetische Testfixtures übernommen. Je Plattform zwei neue Tests PASS: Parser und Gültigkeitsbindung, JSON-Rundlauf, ursprüngliche Gegenstandszustände, korrigierte Anzahlen, getrennter Analysescore, keine exportierten internen IDs, gültiges PDF samt Verlauf und Score/fehlendem Score. Der erste neue Testversuch verwendete irrtümlich ein nur serverseitiges Feld am Clientmodell; auf die öffentliche Funktion `reviewCounts` korrigiert. Keine Produktänderung dafür. Vollständiger Typecheck und ESLint der neuen Testdatei erneut PASS; diff-check PASS.

Gesamt lokal: iOS 41 Suites / 357 eindeutige Tests, Android 42 Suites / 362 eindeutige Tests. Überlappende unabhängige Reviewtests nicht addiert. PDF wurde programmgesteuert geladen und auf gerenderte Textaufrufe geprüft; keine visuelle oder native PDF-Abnahme behauptet. V2 ändert gegenüber dem von05 geprüften V1 ausschließlich diesen Bericht und zwei neue Testdateien.

## Verbleibend

05 prüft das Test-/Evidenzdelta, 01 führt den separaten C1-Releasepreflight durch. Keine C1-Test-OTA oder Build-ID belegt; vorhandene Store-Builds beweisen keinen installierten Entwicklungsclient. Geräteprüfung weiterhin offen; keine neue Testversion durch02 veröffentlicht. Bestehende Verleitungs-OTA enthält C1 nicht. Keine neue Backendmigration, kein Commit/Push/Merge/OTA/Build durch02.

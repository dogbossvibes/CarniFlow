---
title: 'Paket A – GPS-Zeitordnung und getrennte Rohdaten'
type: bugfix
created: '2026-11-02'
status: in-review
route: dispatch
review_loop_iteration: 1
baseline_commit: 982b5461fa1a2979fa33651a17f96a561a198744
context: []
---

# Tracking-Zeiten, Schrittlänge und Fährtendetails – Arbeitsstand

**Aktueller Status (2. November 2026): Paket A lokal umgesetzt, abschließende unabhängige Prüfung und Geräte-/Releaseprüfung offen. Kein Commit, Push oder OTA. Die folgenden frühen Abschnitte dokumentieren den Verlauf; maßgeblich sind die Nachträge zur separaten Archivdatei und die Abschlussverifikation. Pakete B und C sind weiter offen.**

Basis: isolierte Kopie auf 982b5461fa1a2979fa33651a17f96a561a198744; diese ist nicht als aktueller Produktionsstand bestätigt. Keine Änderungen in anderen Arbeitsverzeichnissen, keine Commits oder OTA.

## Paket A – belegte Fehler

Im bestehenden Suchpfad `features/tracking/hooks/useSearchRecorder.ts` wird `setLiveFix` direkt bei jedem Standortcallback aufgerufen, bevor Zeit und Reihenfolge des Fixes geprüft werden. Drei neue Tests im echten Hook reproduzieren: älterer Fix, gleiche Zeit mit abweichender Position, eine Stunde zukünftiger Fix setzen jeweils die Live-Position zurück. Die Tests stehen bewusst rot und sind nicht für eine Freigabe geeignet. Sie beweisen den sichtbaren Positionsfehler; mögliche doppelte Distanzen oder Folgeblockaden werden wegen des jeweils ersten fehlgeschlagenen Assertions noch nicht eigenständig nachgewiesen.

Im Legepfad `layProcessingSession.ts` folgen Glättung und `setCurrentPosition` auf den Empfang, bevor der vollständige Qualitäts-/Bewegungsfilter entschieden hat. `laySessionRuntime.ts` dedupliziert kanalübergreifend anhand Messzeit, lässt aber Vordergrund-Wiederholungen bewusst zu. Über `qaSessionCapture` existiert eine getrennte, zugriffsgeschützte Diagnostik; die dauerhafte Erhaltung verspäteter Rohpunkte für normale Aufnahmen ist damit nicht belegt. Einfaches Ablehnen vor der Persistenz würde die Nutzeranforderung der Datenerhaltung nicht erfüllen. Such- und Legepersistenz (`localTrackRepository.ts`) sind anhand `point_type` getrennt.

## Weitere Pakete

B: `useStepLengthSetting` verwendet eine globale lokale Einstellung; Legen und Suchen frieren diese während des montierten Screens ein. Eine dauerhafte immutable Schrittlänge pro gelegter Fährte ist im untersuchten Pfad nicht nachgewiesen. Bestehendes `payload_json` und dessen Sync-/Recovery-Verhalten müssen vor einer Erweiterung zusammen geprüft werden; ältere Fährten dürfen keinen erfundenen Wert bekommen.

C: `app/track/[id].tsx` enthält vorhandene Analyseabschnitte und Fährtenkarte. Im Screen wurden keine direkten Aufrufe von `useTrackRecorder`, `useSearchRecorder`, `startWarmup` oder `beginRecording` gefunden; indirekte Karten- und Journalpfade sind noch zu prüfen.

## Prüfstatus

Gezielter Jest-Lauf: drei Regressionen absichtlich fehlgeschlagen. `git diff --check` bestanden. Keine Änderungen an Produktionslogik, Glättung, Winkelerkennung, Gegenstandserkennung, Datenbank, Live-Share oder Bestandsdaten. Keine Geräteprüfungen. Vor einem Fix sind Erhaltung und zeitlich kontrollierte Verarbeitung verspäteter Punkte für beide Phasen, Neustart/Recovery, Datenschutz, Replay und eine explizite Abgrenzung gegenüber der gespeicherten Liniengeometrie testbar zu entwerfen. Kein OTA-fähiges Paket; keine Übergabe als geprüft.

## Fortsetzung 2. November

Ein isolierter, derzeit in keinem Recorder eingebundener Baustein `features/tracking/utils/liveFixOrdering.ts` klassifiziert Messzeiten gegenüber Empfangszeit und Live-Wasserstand als live, verspätet, doppelt, Zukunft oder ungültig. Die erlaubte Zeitabweichung ist explizit zu übergeben; es wurde kein produktspezifischer Grenzwert erfunden. Vier Unit-Tests bestanden. Der Baustein speichert selbst keine Rohpunkte und ist keine Fehlerkorrektur in der App. Vor Anbindung muss insbesondere eine getrennte, nach Neustart wiederherstellbare Ablage im erlaubten Datenschutz-/Persistenzpfad nachgewiesen und die reale Source-Reihenfolge getestet werden. Die drei Hook-Regressionstests bleiben rot; keine OTA-Reife.

Chat 01 bestätigte, dass die lokale Basis 982b546 nicht alle ausstehenden T115-Releaseänderungen enthält. Aktiver Produktionsstand ist vor jeglichem Port frisch zu prüfen; ein Bundle aus dieser Kopie darf nicht unverändert veröffentlicht werden. Pakete B und C bleiben offen.

## Wiederherstellungsversuch

Für rein lokale Tests wurden vorhandene Forschungsdateien und Tests aus dem sauberen Backup `anyvo-tracking-raw-tests-backup-20261029` (Commit 16a6a0e8) in diese isolierte Kopie übernommen. Vier Testsuiten mit insgesamt 52 Tests bestanden, einschließlich eines zusätzlichen Versuchs: Live-Zeitordnung und getrennte SQLite-Ablage bewahren verspätete, doppelte und zukünftige Ereignisse über Wiedereröffnung; ein Zukunftsfix verstellt den simulierten Wasserstand nicht. Die Archiv-Komponenten sind weiterhin nicht in den aktiven Recorder, dessen Recovery/Löschung oder den tatsächlichen Datenfluss eingebunden. Die Sicherung verwendet lokale DB-Tabellen, deren Migration, Account-Wechsel, Erhaltungs- und Löschpfade in der aktiven Releasebasis noch gesondert zu prüfen sind. Keine neue Live-Logik aktiviert. Die drei echten Such-Regressionen bleiben rot; B und C bleiben offen.

## Lokaler Such-Recorder-Versuch

Im isolierten Worktree wurde die Zeitordnung probeweise vor der Such-Liveposition angebunden, mit experimentell 1000 ms Zukunftstoleranz. Bei aktivierter QA-/Support-Telemetrie werden finite nicht-chronologische Messungen mit eigenem Ablehnungsgrund beobachtet; ohne Telemetrie fehlen diese weiterhin. Die getrennte dauerhafte Rohdatenablage ist **nicht** angebunden. Dies erfüllt daher die Erhaltungsanforderung noch nicht und ist kein Releasekandidat. 33 Tests zu Fusion/QA bestanden; zusätzlich ein Test für die QA-Speicherung des verspäteten Ereignisses. Die drei vorher roten gezielten Zeitstempeltests sind grün. In der Recovery-Suite bleiben 11 von 28 Tests rot. Deren Testhelfer schiebt Messzeiten synthetisch schneller vor als die Wandzeit; dies kann zur Zukunftsprüfung beitragen, aber die Fehler sind nicht vollständig aufgeklärt und nicht pauschal als Testfehler abgetan. Die Grenze von 1000 ms ist nicht feldvalidiert. Legerecorder, B und C offen. Keine OTA.

Zusatzprüfung: Eine temporäre Kopie der Recovery-Suite mit an die simulierten Fixe angeglichener Systemuhr reduzierte die Fehler von 11 auf 5, beseitigte sie aber nicht. Da die geänderte Uhr auch andere zeitabhängige Auswertungen beeinflusst, beweist dies keine einzelne Ursache. Die temporäre Testkopie wurde wieder entfernt; der originale Recovery-Test blieb unverändert. Der Recorder-Versuch bleibt bis zur Klärung und sicherer Rohdatenanbindung nicht freigabefähig.


## Freigegebener Umsetzungsumfang – Paket A

Die früheren Abschnitte dokumentieren Zwischenstände; maßgeblich für die aktuelle Prüfung ist dieser Nachtrag. Die Nutzerfreigabe lautet „ok bitte umsetzen“ nach dem Vorschlag, Paket A zuerst sicher abzuschließen und B/C separat zu behandeln. Der bestehende Arbeitsstand dient als Spezifikationsdatei für die BMAD-Prüfung.

<frozen-after-approval reason="vom Nutzer vorgegebener Umfang">

## Intent

Messzeit und JS-Empfangszeit trennen. Verspätete, doppelte oder unplausibel zukünftige GPS-Zustellungen dürfen aktuelle Position, Distanz und Hinweise nicht zurücksetzen oder doppelt auslösen. Originalzustellungen separat lokal bewahren, ohne sie als neue Live-Bewegung auszugeben.

## Boundaries & Constraints

Bestehende Kundendaten, Legegeometrie, Gegenstände, Suchgeometrie und Live-Share erhalten. Keine Änderung an Glättung, Winkel- oder Gegenstandserkennung. Replay darf rückwärts laufen. Kein Gesamtbundle dieser alten Basis veröffentlichen. OTA nur nach unabhängiger Prüfung auf frischer Releasebasis durch Chat 01. B (Schrittlänge) und C (Details) sind nachfolgende eigenständige Pakete.

## I/O & Edge-Case Matrix

| Fall | Verhalten |
| --- | --- |
| Reguläre GPS-Fixe | Bestehende Verarbeitung und getrennte Lege-/Suchspur fortführen |
| Verspätet / doppelt / Zukunft | Originale separat speichern; keine neuen Live-Seiteneffekte; gültiger Folgefix bleibt nutzbar |
| Pause / Fortsetzen / Wiederherstellung | Bewusste Pause erhalten, keine nachgelieferten Pausenpunkte als aktuelle Bewegung werten |
| App-Wechsel / Hintergrund-Batch | Geordnete Geometrieverarbeitung, Archive parallel dazu schreiben; Herkunft und Empfang bewahren |
| Fehler / voller Speicher | Keine falsche Vollständigkeitsmeldung, funktionierende Linienpersistenz erhalten |
| Konto / Löschung | Alte Schreibberechtigungen sperren; Daten des anderen Kontos nicht lesen/löschen; Löschung verhindert Wiederauferstehen |
| Journal / Replay | Historische Fährten nicht verändern; Anzeigen startet keine Aufnahme; Replay-Rücklauf bleibt zulässig |

</frozen-after-approval>

## Code Map

- `features/tracking/hooks/useSearchRecorder.ts`, `useTrackRecorder.ts`: Live-Eingang, Pause, Wiederherstellung und Abschluss.
- `features/tracking/engine/layProcessingSession.ts`, `laySessionRuntime.ts`: gemeinsam genutzte Legeverarbeitung und Hintergrundzustellung.
- `features/tracking/storage/`: separate lokale Rohmessungsablage und Konto-/Session-Fencing.
- `features/tracking/storage/gpsCaptureDb.ts`, `lib/localDb/client.ts`, `lib/session-context.tsx`: separate Archivdatei mit eigenem Schema 1, Wipe und Kontowechsel; Hauptmigrationen unverändert.
- `features/tracking/utils/qa*`: Diagnose-Zeitfelder und Archivstatus.

## Tasks & Acceptance

- [x] Zeitordnung vor Live-Seiteneffekten in beiden Aufnahmepfaden.
- [x] Lokale Rohablage unabhängig von der Diagnoseberechtigung; Lege-/Such-/Versuchszuordnung.
- [x] Wiederherstellung, explizite Pause, Konto-/Löschpfade und Fehlerzustände abgesichert.
- [x] Historische Testuhren fair zwischen Original und Kandidat vergleichen.
- [ ] Abschließende automatisierte Gesamtprüfung und unabhängige BMAD-Prüfung.
- [ ] Übergabepaket mit Prüfnachweisen an Chat 01; frische Runtime-/Native-/EAS-Prüfung vor OTA.

Akzeptanz: reguläre Daten behalten bestehende Verarbeitung; nicht-chronologische Zustellungen ändern keine Live-Zähler. Originale bleiben getrennt von der Linie lesbar. Keine Behauptung echter Gerätetests aus Node-SQLite-/Jest-Ergebnissen.

## Implementation Notes

- Die 28 Recovery-Tests bestehen mit identischer, korrekt an die Messungen gekoppelter Empfangsuhr sowohl für den Originalhook als auch für den Kandidaten. Ein Reset der Hilfsuhr auf 0 war beim ersten Versuch übersehen worden.
- Archivzusatz liegt nach Review in einer separaten lokalen Datei und veröffentlicht nichts über Netz/Live-Share. Limits: 256 wartende Zustellungen, 1 Mio. Messungen pro Konto; Überschreitung meldet Fehler statt alte Daten zu verdrängen.
- 1000 ms Zukunftstoleranz ist explizit, aber noch nicht am Gerät validiert.
- Startbereitschaft läuft nach bestehender GPS-Frischefrist ab, auch ohne weitere Callbacks. Ein alter Fix wird dafür nicht künstlich erneut verarbeitet.
- Zwei Baseline-Probleme bleiben gesondert: veraltete statische Kartenaufruf-Erwartung und Build-49-Erwartung im Native-Vertrag. Dateien und Tests sind gegenüber HEAD unverändert; gesonderter Originallauf reproduziert beide. Der alte QA-Export-Arrayfehler ist ebenfalls im Original reproduziert und im berührten Exporter minimal korrigiert.

## Spec Change Log

- Keine Änderung am Nutzerumfang. Nach Review zusätzliche Tests zu Pause-Fixes und blockierten Rohwrites in Hintergrund-Batches; die bereits geforderte Zeit-/Datentrennung gilt auch dort.

## Review Triage Log

- Vorprüfung: Hintergrund-Batch wartete zu früh auf Archiv – high; nachfolgende Batchfixe konnten warten. Minimal zu entkoppeln, ohne die Geometriequeue zu parallelisieren.
- Vorprüfung: Pause→Fortsetzen ohne Zeitfence – high; neuer Timestamp aus der Pause konnte aktuelle Position ändern. Zwei rote Hooktests reproduzieren es, nach Korrektur grün.
- Vorprüfung: `timestamp || Date.now()` in Suche – medium; numerische Null wurde ersetzt. Die bereits validierte Messzeit wird jetzt unverändert weitergereicht.

## Verification

- `npm run typecheck`, `npm run lint`, `npm test -- --runInBand --silent`, `git diff --check`.
- Schwerpunkt: Recorder-Recovery/Fusion, Eingang und Archiv ohne QA, Legeprozessor/Runtime, Migration und Löschrouten, Speicherfehler, Live-Share, Replay und Journal.
- Gerätetest separat offen: iOS 57 + passender Android-Build, Bildschirm sperren/App wechseln, Offline-Aufnahme, Pause/Resume, Neustart/Recovery, gespeicherte Fährte wieder öffnen. Native SQLite und Rückwechsel auf altes OTA auf echtem Binary prüfen.


## Nachtrag nach vollständiger erster BMAD-Reviewrunde

Die ursprüngliche Archiv-Anbindung an Hauptschema 13 wird **nicht** ausgeliefert. Die erste Review hat ein SQLite-Konkurrenzrisiko gegenüber der vorhandenen Linienpersistenz gefunden. Die Implementierung wurde innerhalb derselben Aufgabe auf eine separate lokale Datei `anyvo_gps_arrivals_v1.db` (eigenes Schema 1) geändert. Die produktive `lib/localDb/migrations.ts` entspricht wieder exakt HEAD (Version 12). Hauptdaten bleiben unangetastet; Wipe und Löschrouten sind explizite, nicht datenbankübergreifend atomare Operationen.

Die folgenden Einzelbefunde wurden vor Gruppierung bewertet:

| Befund | Urteil und Evidenz | Behandlung |
| --- | --- | --- |
| Blind 1: konkurrierende Raw- und Linien-Transaktionen | high: Zwei echte SQLite-Verbindungen auf dieselbe Datei reproduzieren `database is locked`. | Neue separate Archivdatei; Test mit gleichzeitig offenem Raw-Writer und erfolgreichen Haupt-DB-Schreibvorgängen. |
| Blind 2: eingereihte Raw-Fixe gehen bei Finalize verloren | high: Statuswechsel erfolgte vor Beobachtung in der Queue. | Beobachtung bei Annahme, Geometrie bleibt wie vorher nach Finalize gesperrt; Runtime-Regression. |
| Blind 3: Recovery-Archiv bleibt nach close(true) offen | medium: Repository verweigert Complete für wiedergeöffnete Archive. | Fallback auf dauerhaft interrupted; Test prüft DB-State und erhält alle Daten. |
| Blind 4: ungültige Messzeiten gehen verloren | medium: JSON und SQLite können NaN nicht als normale Zahl speichern. | Explizite reversible `$nonFinite`-Darstellung; keine erfundene Ersatzzeit; Tests NaN/±Infinity. |
| Blind 5: Verwerfen löscht frühere Suchversuche | high: bisherige Phasenlöschung war breiter als aktueller Versuch. | Exakte `pending.searchStartedAt`-Attempt-ID; unbekannte historische IDs werden nicht geraten; frühere complete/interrupted bleiben erhalten. |
| Blind 6: nach Löschung bereits gelesene Seiten zurückgegeben | high: Accountprüfung allein erkennt Sessionlöschung nicht. | JS-Revision und DB-Generation/Status sowie Parentprüfung pro Seite; Test mit Löschung nach erster Seite. |
| Blind 7: dauerhafte Account-Revoke in zweiter JS-Runtime | maybe-false: JS-Accountwechsel ist mit Provider und Archiv getestet; eine gleichzeitig aktive zweite JS-Runtime mit derselben DB wurde für Binary 57 nicht nachgewiesen. | Offener Geräte-/Runtime-Prüfpunkt; keine Aussage, dass parallele Prozesse bereits vollständig abgedeckt sind. |
| Blind 8: Suche-Finalize wartet vor Originalspeicherung aufs Archiv | high: neu eingeführtes await blockierte primäres Ergebnis. | Entfernt; stop schließt separat, Ergebnis trägt ehrlichen Snapshot. Lege-Finalisierung ebenso entkoppelt und mit blockierter Archiv-DB getestet. |
| Blind 9: veraltete Bereitschaftszeiten nach Ablauf | medium: alte Zeit-Refs blieben sichtbar. | Gemeinsam mit Bereitschaft zurücksetzen, erneute Zeit nach Wiedererreichen testen. |
| Blind 10: Archivfehler für Kunden unsichtbar | medium: Debugfeld allein war nur intern nutzbar. | Nicht blockierender Hinweis in Lege- und Suchaufnahme, fünf vorhandene Sprachen. Roharchiv-Limitfehler löscht keine alte Fährte. |
| Edge 1: Finalize vor Raw-Beobachtung | high: gleiche Ursache wie Blind 2. | Gemeinsame Korrektur; einzeln in Review festgehalten. |
| Edge 2: paginierte Ausgabe nach Löschung | high: gleiche Ursache wie Blind 6. | Gemeinsame Korrektur; einzeln in Review festgehalten. |
| Verification 1: Lege-Hook→Archiv nicht belegt | high: vorherige Tests konnten leeren Observer übersehen. | Echter Hook/Task/SQLite-Test mit Originalzustellungen, QA aus, Phase/Herkunft/Zeiten. |
| Verification 2: Auth→Archiv nicht belegt | high: vorherige Scope-Tests umgingen SessionProvider. | Provider-Tests: Bootstrap, Accountwechsel, Logout, spätes Bootstrap, Refresh, Unmount mit echten Archivoperationen. |

Die Review-Fixes wurden zielgerichtet angebracht, ohne die vorhandene Arbeit zurückzusetzen. Eine zweite unabhängige Prüfung der geänderten Speicherarchitektur ist noch offen: Die beteiligten Prüfer endeten mit einem Nutzungslimit. Dies ist keine Release-Freigabe.

### Bisherige neue Verifikation

- 94 Tests der angepassten Archiv-/Recorder-/Provider-/Hauptschema-Suiten bestanden.
- Separate Zwei-Dateien-SQLite-/Rollback-Prüfung und Archiv-Reviewfälle: 22 Tests bestanden.
- Hauptschema-Upgrades 0–12 behalten vorhandene Zeilen; Zusatzspalten werden bei alten Versionen berücksichtigt. Das neue Raw-Schema wird separat atomar angelegt und nach simuliertem DDL-Abbruch erfolgreich wiederholt.
- Ein vorheriger Gesamtlauf brach mit Exit 139 ohne abschließendes Jest-Ergebnis ab. Ursache nicht nachgewiesen; nicht als bestanden werten.
- Native SQLite, Bildschirm sperren/App-Wechsel, Speicherverbrauch/Akku und Downgrade auf ältere OTA bleiben echte Gerätetests. Ein altes Bundle kennt die neue Archivdatei nicht; insbesondere dessen Lösch-/Wipe-Verhalten ist vor Rollbackfreigabe separat zu prüfen.
- Archivabschluss ist unabhängig von Primär-Sicherung. Ein bereits gestarteter, dauerhaft hängender nativer Archivaufruf hat derzeit keinen Watchdog; Queue-Limits melden Unvollständigkeit, ohne ursprüngliche Linienpersistenz zu blockieren.
- Ende-Snapshot kann `closing` enthalten, während die separate Datei weiter abschließt. `complete` bezeichnet nur erfolgreich archivierte Zustellungen, nicht lückenlosen Satellitenempfang.

### Neuer bestätigter Feldfall qa-c54417c9

Die Nutzerin bestätigte rechts → links → spitz links → spitz rechts, alle vier richtig. JSON und Screenshots stimmen damit überein. Beide verglichenen Läufe (qa-c54417c9 und qa-4db971e3) melden exakt dieselbe OTA `01a19630-adb8-77fb-b2e0-575d6c4c56c3`, denselben Commit `4a13945539c6bc60f623bb8888f3abc3dd95fdec`, iOS 57, Runtime `1.0.6-map49-v1`. Der neue Lauf hat 52 Rohfixe, 30 Detektorpunkte, 14 Linien-/Persistenzpunkte; gemeldete Accuracy median 2,745 m statt zuvor 4,75 m. Messzeiten jeweils geordnet, keine identischen Zeitstempel im exportierten Raw-Strom; keine Empfangszeit je Fix in beiden Exporten. Daraus folgt weder ein Nachweis verzögerter Zustellungen noch deren Ausschluss. Es ist ein positiver Kontrollfall für spätere Winkeländerungen. Paket A ändert die Winkelerkennung weiterhin nicht. Die Originaldatei wurde nicht verändert; Auswertung liegt unter `outputs/field-c54417c9/`.

## Abschlussverifikation des lokalen Prüfstands – 2. November 2026

- Worktree `anyvo-bmad-tracking-timing-20261101`, detached HEAD `982b5461fa1a2979fa33651a17f96a561a198744`; offene Änderungen bleiben uncommittet. Keine fremden Dateien überschrieben, keine Veröffentlichung.
- `npm run typecheck`: bestanden (`verified-typecheck.log`).
- `npm run lint`: Exit 0, **0 Fehler / 87 Warnungen** (`verified-lint.log`).
- Vollständiger erneuter Lauf `npm test -- --runInBand --silent --json`: **536 Suiten, 534 bestanden / 2 fehlgeschlagen; 6.207 Tests, 6.205 bestanden / 2 fehlgeschlagen**. Keine ausgelassenen Tests. Kein vollständiges Grün behauptet.
- Die zwei Fehlschläge betreffen ausschließlich bereits separat auf HEAD reproduzierte, unveränderte Tests: `evaluation-screen-consistency.test.ts` (veraltete genaue Aufrufform) und `productionNativeContract.test.ts` (erwartet Build 49, Ausgangskonfiguration enthält 57). Die Release-Konfiguration darf deshalb nicht ungeprüft aus diesem alten Worktree übernommen werden.
- Die nachträglich angepasste Recovery-Erwartung prüft jetzt die exakte Suchversuchs-ID bei der Löschung; die entsprechende Suite besteht im vollständigen Lauf. Frühere Archivversuche werden separat auf Erhaltung geprüft.
- Die fünf aktuellen Archiv-/Recorder-/Provider-Integrationssuiten bestehen mit **35 Tests**; diese sind in der Gesamtzahl enthalten, nicht zusätzlich zu addieren.
- Frühere abgebrochene Läufe (Exit 139 sowie unter Last gestoppter Lauf mit Zeitüberschreitungen) sind keine Prüferfolge. Der letzte vollständige Lauf enthält diese zusätzlichen Fehler nicht. Die Ursache des früheren Exit 139 ist nicht bewiesen.
- `git diff --check`: bestanden. Hauptmigrationen entsprechen bytegleich HEAD. Keine Änderungen an Winkelalgorithmus, GPS-Glättung, Gegenstandserkennung, Live-Share-Code oder Replay-Zeitsteuerung.
- Automatisierte Tests mit React/Jest/Node-SQLite sind **keine echten iPhone-/Android-Gerätetests**. Der bestätigte Vier-Winkel-Feldlauf prüft die frühere OTA, nicht dieses noch lokale Paket.

### Paketstatus und nächste Abnahme

**IN REVIEW – NICHT OTA-FREIGABEFÄHIG.** Ein Prüfpatch mit Datei- und Evidenzhashes wird unter `outputs/package-a-review/` erzeugt. Kein Git-Schreibvorgang nötig. Übertragung nur auf eine frisch verifizierte Release-Basis, nicht als Veröffentlichung dieser gesamten Kopie. Der Patch wird vor Übergabe gegen unveränderte Dateien seines Basiscommits mit `git apply --check` geprüft.

Erforderlich: erneute unabhängige Prüfung der getrennten Archivdatei und Lösch-/Accountgrenzen; Integrationstest auf dem aktuellen Release-Stand; tatsächlicher Native-/Runtime-Abgleich; Geräteprüfung von Lifecycle, Recovery, Speicherverbrauch und Rückwechsel auf ältere OTA (insbesondere Löschung/Wipe der neuen Datei). Datenbankübergreifende Löschung ist nicht atomar, parallele JS-Runtimes und ein dauerhaft hängender nativer Archivaufruf bleiben ausdrücklich offene Prüf-/Risikopunkte. Die erste BMAD-Reviewrunde liegt vor; die zweite konnte wegen Nutzungslimits der unabhängigen Prüfer nicht abgeschlossen werden.

Pakete B (dauerhafte persönliche Schrittlänge je neuer Fährte) und C (gegliederte Detailansicht ohne Aufnahmestart) bleiben separate offene Aufgaben.

### Gerätetest nach Freigabe eines geeigneten Teststands

1. Diagnose mit Native-Build, Runtime, OTA-ID und Commit vor Beginn exportieren; dieselben Werte nach App-Neustart kontrollieren.
2. Bekannte Gerade und rechts → links → spitz links → spitz rechts gehen, jeden tatsächlichen Winkel zeitlich markieren. Zusätzlich einen kurzen Schenkel mit 5–10 Schritten dokumentieren. Keine Winkel allein aus einer Handy-Drehung ableiten.
3. Eine bewusste Pause, Fortsetzen, Bildschirmsperre und App-Wechsel durchführen. Nach Rückkehr darf der Live-Punkt nicht auf alte Zustellungen springen; Strecke und Hinweise nicht doppelt zählen.
4. Drei Gegenstände setzen, darunter einen auf einem Winkel und einen vor dem Ende. Legung speichern, erneut im Journal öffnen, anschließend absuchen. Gelegte Linie, alle Gegenstände, Suchspur und Endkarte kontrollieren.
5. Separat einen Suchversuch verwerfen und neu beginnen: gelegte Fährte und Gegenstände erhalten; nur der aktuelle Suchversuch verworfen. Lokale Daten mit schlechter Netzverbindung und Neustart wieder öffnen.
6. QA-Export, Uhrzeiten der Auffälligkeiten, Sollwinkel und Screenshots beilegen. Empfangszeit und Messzeit gemeinsam prüfen; fehlende Daten oder Unterbrechungen nicht durch erfundene Linien schließen.

Zukunftszeitstempel und gezielte Duplikate werden automatisiert injiziert; hierfür am Kundengerät keine Systemuhr manipulieren. Tests mit Abbruch/Wiederherstellung und Löschung ausschließlich auf eigenen Testfährten ausführen. Ein Downgrade bleibt ein eigener kontrollierter QA-Schritt.

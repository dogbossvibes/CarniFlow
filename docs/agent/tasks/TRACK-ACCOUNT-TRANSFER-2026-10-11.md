# Konto-zu-Konto-Fährtenübergabe · Client Cloud V5 · 2026-10-11

## Ergebnis und Scope

Empfänger übernehmen eine fertig gelegte Originalfährte für einen eigenen Hund. Die Annahme erstellt serverseitig genau eine eigene Aufnahme mit stabilen IDs und normaler Quote. Der Client importiert diese bestätigte Kopie atomar in SQLite. Originalpunkte, Gegenstands-IDs, Zeitstempel, Winkel und Lücken bleiben erhalten. Absendernotizen, Medien, Suchergebnisse und Live-Standorte gehören nicht zur Übergabe.

Aktuelle eigene Kopien werden über `list_own`/`restore` auch ohne Absender, Angebot oder lokales Annahmejournal gefunden. Ein vorhandener lokaler Datensatz wird nicht durch eine ursprüngliche Referenz überschrieben. Eigene Absuche, Notizen, Bewertung und Liegezeit verwenden `save_own`; Löschen verwendet `delete_own`. Jede Mutation trägt eine dauerhaft gespeicherte Operations-ID und erwartete Revision. Verlorene Antworten wiederholen denselben Auftrag. Neuere lokale Änderungen erhalten erst nach bestätigtem Vorauftrag eine neue ID. Versionskonflikte halten die Synchronisation an und erhalten lokale Änderungen. Eine automatische Konfliktauflösung ist nicht enthalten.

SQLite-Migration 7 ergänzt eine eigene Bindungs-/Auftragstabelle. Laufende Aufzeichnungs-Payloads können dadurch keine ausstehende Serverbestätigung überschreiben. Alte lokale Datensätze bleiben erhalten. Bestehende gewöhnliche Trainings verwenden ihre bisherigen Synchronisationswege; gebundene Übergaben werden dort zusätzlich abgefangen. Direktes Speichern, Liegezeit, Löschen und Queue-Verarbeitung sind angebunden. Lokale Detailansichten und spätere Antworten werden bei Kontowechsel gesperrt. Übernommene Fährten können selbst nicht weitergereicht werden.

## Abgrenzung

Keine Aktivierung von Gruppen oder Live-Share. Der frühere 38-Dateien-Gruppenkern bleibt unverändert. Das Transferpaket benötigt daraus ausschließlich `features/training-groups/useConnectedInviteTargets.ts` und `features/training-groups/registerResources.ts`; beide werden als reine Abhängigkeiten mitgeliefert. Keine Root-Layout-/Trainings-Tab-Änderungen aus dem Gruppenkern übernehmen.

Kein Commit, Push, Merge, Production-DB-Schritt, Build oder OTA durch Chat 02. Chat 05 ist alleiniger Backend-Writer, Chat 01 alleiniger Integrator/Publisher. Alte Transferpakete und der reine Sync-Schutz-Freeze sind ersetzt und nicht veröffentlichbar.

## Vertrag

`cloudContract.ts` ist die unveränderte Kopie von Chat05 `21-cloud-copy-contract.ts`. Die Testfixture `backend-cloud-v1.json` stammt aus dessen lokalem PostgreSQL-Test (`20-cloud-copy-examples.json`). Keine echten Nutzerdaten. Client-SQLite-Tests verwenden eine echte In-Memory-SQLite und eine kontrollierte Netzwerkgegenstelle; sie sind kein normaler JWT-/HTTP-Nachweis.

## Prüfung

Aktueller kombinierter Lauf: **62 Suites / 635 Tests PASS** (Transfer, vorhandene Sync-/Repository-/Tracking-Service-/Store-Regressionen, lokale Detail-/Run-Payloads, Recovery). Jest meldete einen verzögerten Abschluss; der Prozess beendete sich danach selbstständig mit Exit0. TypeScript und gezielter ESLint-Lauf vor neuen Tests PASS. Der abschließende Typecheck fand einen zu breit inferierten Fixture-Typ im neuen Test; dieser wurde durch den vorhandenen Receipt-Parser korrigiert. Endgültige Nachprüfung im Manifest.

Abgedeckt: reale Backend-DTOs, SQLite-Upgrade6→7, atomarer Import/Rollback, originale IDs, keine gewöhnliche Create-Queue nach Import, eigener vollständiger Recorder-Payload, Suchlücken/Replay, direkte Mutationsweiterleitung, Kontotrennung, verlorene ACKs, Prozessneustart, gleichzeitige lokale Änderungen, alte ACKs, Versionskonflikte und dauerhafte Löschaufträge ohne Wiederauferstehung.

V4: **18 Suites / 181 Tests PASS**, überlappend mit obigem breiten Lauf. Der unabhängige Review-Befund zur Bewertung ist behoben: No-op nach Restore sendet nichts, reine Notizänderung erhält Rating/Evaluation/Run unverändert. Vorschau und Replay reichen die Kontozuordnung weiter und verwerfen verspätete Antworten.

Zusätzliche V4-Korrekturen: Direkter Logbuch-Aufruf auf einem neuen Gerät stellt zuerst die aktuelle eigene Kopie lokal wieder her. Detailmarker behalten die Original-ID passend zur eigenen Gegenstandsdiagnose. Wiederherstellung prüft den vollständigen Receipt. Löschen benötigt keine gültige noch ungesendete Run-Nutzlast. Gezielte Regressionen und Checks stehen im V4-Manifest.

Offen bis bestätigter Übergabe: unabhängiges Client-Review durch01, tatsächliche Production-API-/Betriebsabnahme durch05, Integration und getrennte OTA-Prüfung/-Veröffentlichung iOS/Android Runtime1.0.4 durch01. Geräteprüfung ist auf ausdrücklichen Nutzerwunsch zurückgestellt; keine Feld-/Gerätebestätigung behauptet. DE/EN-Texte, Schweizerdeutsch mit deutschem Fallback; weitere Sprachen erhalten englischen Fallback und sind nicht als vollständig übersetzt abgenommen.


## V5 · Unabhängiger Recovery-Befund geschlossen

Native Dialoge behalten ihren Erstellungs-Token. Für übernommene Fährten invalidieren synchron erfasste Auth-Ereignisse (auch A→B→A) und Unmount diesen Token. Recovery-Laden, Beginn, Fortsetzen, Beenden und Verwerfen prüfen Receipt, User, Session, Hund und Run. Nach asynchronem Punktladen und vor lokalen Schreib-/Lösch-/Resetaktionen wird erneut geprüft. Der optionale Guard reicht bis in SQLite-Finalisierung/Löschen sowie Suchpuffer-Verwerfen; gewöhnliche Aufnahmen behalten ihre bisherigen Pfade.

**49 Suites / 446 Tests PASS**, überlappend mit den früheren Läufen. Enthalten sind 11 Tests mit tatsächlich aus `run.tsx` geladenen Dialogcallback-Funktionen, Auth-Hook-ABA-/Unmount-Prüfung, Serviceprüfung auf unveränderte Punkte/Pending/Registry nach Kontowechsel während Snapshot-Ladung und zwei Repositorytests unmittelbar vor SQL-Schreiben. Voller Typecheck und gezielter ESLint zuvor PASS, finaler Status und Hashes im V5-Manifest.

Chat05 meldet Production-Installation und Monitoringabnahme bestanden. Normale Zweiaccount-JWT-/API-Abnahme wartet auf die separat angefragten Testkonten. Keine OTA ohne diesen Nachweis und unabhängige Client-/Integrationsabnahme durch01. V3/V4 sind superseded und dürfen nicht veröffentlicht werden.

# Gegenstandskorrekturen V1 – Client, Offline-Speicherung und Export

09.10.2026 · Chat 02 · lokal implementiert und geprüft, uncommitted · **keine Veröffentlichung des vollständigen Pakets, keine Live-DB-Änderung**.

## Arbeitsplatz und Zuständigkeiten

Worktree `anyvo-tracking-object-review-v1`, Branch `feat/tracking-object-review-v1`, Basis/HEAD unverändert `87d5e2b3b3ed931b655464eec971b95225dcf0ff` (bereits veröffentlichter iOS-1.0.4-FN-/Motion-Stand). Neu sauber angelegt; früheren Snapshot-Freeze angewandt und anschließend lokal weiterentwickelt. Der frühere Worktree `anyvo-tracking-object-corrections` und sein 08.10.-Freeze bleiben unverändert. Keine fremden WIPs, `sources/`, main oder globalen Statusdateien verändert.

01 bleibt einziger Integrator/OTA-Publisher. 05 besitzt SQL/Backendprüfungen, 07 den freien Hundefarbclient, MASTER die DB-Freigabekoordination. Keine automatische DB-Freigabe aus der fortlaufenden OTA-Freigabe ableiten.

## Implementiert

- Neue abgeschlossene Suchläufe bewahren Original-IDs, Zustände, Material und ursprüngliche Scorebestandteile in einem additiven Aufzeichnungssnapshot. GPS-Roh-/Replaydaten, Winkel-/Enderkennung, Recorder-Gewichte, Distanz, Fusion und manuelle Schenkelbewertung werden nicht verändert.
- Die Detailansicht bietet Korrekturen auf **gefunden / nicht gefunden / nicht beobachtet**, ursprünglichen Zustand und bestätigten Änderungsverlauf. Unbekannte Altzustände werden nicht aus einer Gesamtfundzahl geraten. Automatische Erkennung bleibt als Originalquelle erkennbar.
- Die Zuordnung folgt ausschließlich der vom Server einmal gesicherten Referenzkohorte. Remote-Marker erhalten beim bisherigen Replace-Sync neue IDs; deshalb kein nachträgliches Mapping auf aktuelle Kartenmarker. Bekannte neue Referenzen nutzen G-Nummern ohne Dübel; Dübel D-Nummern. Unklare/alte Reihenfolgen erscheinen neutral als #Index.
- Eigene additive **SQLite-Migration 7** für ownergebundenen Cache und unveränderte Outbox-Anfragen. Genau eine offene Änderung pro Konto/Run, SQL-Revisionsprüfung und Unique-Index. Ältere Clients können diese Einträge nicht als unbekannten `sync_queue`-Typ löschen. Integration muss mögliche Migrationsnummernkollisionen frisch prüfen.
- Änderungen werden zuerst dauerhaft lokal vorgemerkt. Sie überschreiben weder Originalaufnahme noch bestehende Parent-/Run-/Markerzeilen. Eine unbestätigte Änderung wird sichtbar separat angezeigt. Sync-Zähler berücksichtigen die eigene Outbox.
- RPC-Schreibzugriff mit erwarteter Revision und UUID; gleiche UUID bei Retry nach verlorener Bestätigung. Cache-Versionen fallen nicht zurück. Cache vor ACK; unterbrochener ACK kann idempotent wiederholt werden. Kontowechsel und verspätete Antworten dürfen keine fremden Resultate anzeigen. Aufeinanderfolgende Läufe sowie schnelle doppelte Eingaben sind abgesichert.
- Bei Revisions-/Operationskonflikten kein automatisches Überschreiben oder Neubasieren. Die eigene Änderung bleibt sichtbar. Ein bewusst zurückgezogener Konflikt bleibt als lokaler Datensatz erhalten; bestätigte Serverhistorie bleibt unverändert. Getrennte Original-/Reviewdaten schützen auch vor späteren alten Parent-Upserts.
- Auth-/RPC-Aufrufe sind zeitlich begrenzt; ein Verbindungsabbruch löscht keine vorgemerkte Änderung. Explizites Anlegen einer Serverbaseline nur über den entsprechenden Button. Offline-Korrektur nur mit zuvor bestätigter Baseline. Fehlendes Backend erzeugt keine Erfolgsmeldung.
- Bestätigte korrigierte Fundzahlen erscheinen im Detail und PDF/JSON. JSON exportiert keine internen Konto-/Session-/Run-/Operations-/Marker-IDs. PDF zeigt Original-/Endzustände und Vorher-/Nachher-Verlauf, mit Pagination. Maximal 50 neueste Serverereignisse; Kürzung wird klar angezeigt. Ältere Ereignisse bleiben auf dem Server. GPX-Messgeometrie bleibt unverändert.
- Eine menschliche Gegenstandskorrektur ersetzt keine V3-Sensoranalyse oder manuelle Schenkelbewertung. Der korrigierte Aufnahmescore wird separat ausgewiesen. Ohne verlässliche Basis oder bei Lücken/unbekannten/unbeobachteten Zuständen kein korrigierter Gesamtscore.

## Belegter Backend-Reviewbefund und R2-Vertrag

Der erste Backendentwurf konnte bei altem Replace-Sync eine vorübergehend leere/teilweise vorhandene Marker-Liste dauerhaft einfrieren. 02 belegte den Datenfluss; 05 reproduzierte den Fehler gegen die ursprüngliche SQL und ergänzte das Gate: bestehendes `articles_total` muss bekannt, nichtnegativ und gleich der gesicherten Markerzahl **inklusive Dübeln** sein. Gesicherte Legacy-Marker werden in derselben Abfrage gesperrt. Sonst `REVIEW_REFERENCE_INCOMPLETE`, ohne teilweise Baseline; Client zeigt den Synchronisierungshinweis.

Verbindlich ist Backend **R2**, SQL SHA256 `ff6d0792c6bea6b5c8352b00baa2da54e83c530e1dc847d778862cc7d1c6b11d`, Manifest `outputs/ANYVO-05-OBJECT-REVIEW-V1-R2-2026-10-09.json`. Der erste SQL-Freeze `5bb943...` ist überholt. R2 umfasst separate Baseline/State/append-only Operations und initialize/get/apply-RPC, ownergebunden, ohne neue Trainer-/Sharingrechte. Originalzeilen bleiben bei Korrekturen unverändert.

05: **92 PostgreSQL-17.10-Prüfungen PASS**, inklusive echter konkurrierender Updates/Initialisierung/Deletes, Revision, Idempotenz, RLS/Entzug, Altformate, Teilaufzeichnungen, Material und unvollständigem Sync. Synthetische DB, kein kompletter Productionklon (Production 17.6). R2-Dateihashes von 02 geprüft. Tatsächliche synthetische PostgreSQL-Antworten wurden im Clientparser und JSON-Reload geprüft.

Der enge R2-Deploymentpreflight liegt separat unter `outputs/ANYVO-05-OBJECT-REVIEW-V1-R2-DEPLOYMENT-PREFLIGHT-2026-10-09.json`. 05 meldet Schema/ACL/RLS/Namens-/Lock-/Backupprüfungen bestanden. Keine Ausführung; konkrete DB-Freigabe und unmittelbar frischer Ausführungspreflight bleiben erforderlich. Farb-DB-Anpassung ist ein anderes Paket und bleibt separat freigabepflichtig.

## Clientprüfungen

- **16 Suites / 186 Tests PASS**: Originalerhalt, echte SQLite-Ausführung mit Node SQLite, Owner/Hund/Session/Run-Isolation, eindeutige offene Operation, veraltete Revision, verlorener ACK/Retry, Timeout, konkurrierende Aufrufe, App-Kontextwechsel, Offline-UI, Abbrechen/Fehler/Bestätigung, Legacy-/Dübelanzeige, RPC-Fixtures, Export-Identitätsfilter und bestehende Recorder-/Sync-/Replaypfade.
- Zusätzlich **5 PDF-Tests PASS**, inklusive Textbegrenzungen, langer Historie und unveränderter Sensorbewertung. Vier synthetische PDF-Seiten mit echtem Logo/Font gerendert und visuell geprüft; fehlendes Pfeil-Glyph durch lesbare ASCII-Darstellung ersetzt.
- Snapshotteil separat **7 Suites / 87 Tests PASS**; diese Zahlen überlappen mit der Clientprüfung und werden nicht addiert.
- Vollständiger TypeScript-Check PASS, Exit 0. ESLint 0 Fehler, vier bestehende Warnungen (drei in run.tsx, eine require-Testwarnung). `git diff --check` PASS. Freeze-Patches per Reverse-Apply geprüft.
- Keine Dependencyinstallation. Bestehende Dependencies nur lesend verknüpft; Node-SQLite nur im Test, keine neue native App-Abhängigkeit.

Logs und synthetisches PDF/PNG unter `outputs/object-review-qa/`. Kein neuer Feld-/Geräte-/Production-RPC-Schreibtest oder Locked-screen-PASS behauptet.

## Releasegrenzen und offene Abnahme

1. **Separater DB-unabhängiger Snapshotteil:** Manifest `TRACKING-OBJECT-SNAPSHOT-READY-2026-10-09.json`, Patch SHA `59805a8403c4bf32c52e3bafa3cea4036ea87f439620111c341993543b6f1fce`, exakt neun Dateien. An 01 zur unabhängigen Prüfung, frischem Preflight und freigegebener OTA übergeben. Der Übertrag bedeutet noch keine Veröffentlichung.
2. **Vollständiger Reviewclient:** enthält UI, SQLite7, eigene Outbox/RPC und Export. Erst nach unabhängigem Review, ausdrücklicher R2-DB-Freigabe, verifiziert kompatiblem Backend sowie plattformbezogenem Release-Preflight ausliefern. Er ersetzt den bisherigen unsicheren Detail-Auto-Dwell-Entfernenpfad; deshalb nicht einfach ohne Backend freigeben. Full-Patch enthält Snapshot, Delta-Patch setzt ihn voraus. Tatsächliche native Geräteintegration und Bedienabnahme offen.
3. Keine automatische lokale Datenlöschung oder Reparatur durch Reset. Einträge für später gelöschte/nicht mehr zugängliche Ziele werden nicht still verworfen. Zentraler Sync zeigt Statuszahlen; fachliche Konfliktauflösung findet in der jeweiligen Fährtendetailansicht statt. Ein dedizierter Verwaltungs-/Wiederherstellungsdialog für verwaiste oder zurückgezogene lokale Entwürfe ist nicht Bestandteil V1.
4. Native Geräte-QA: Aufnahme/Sync/Review auf iOS und Android; Offline-Vormerken/App-Neustart/Netzrückkehr; zwei Geräte mit derselben Basisrevision; Konto-/Hund-/Runwechsel; klare Legacy-/Teilaufzeichnungsanzeige; Abnahme von Originalerhalt und PDF/JSON. Die SQLite-/Hookprüfungen ersetzen diese Abnahme nicht.
5. Winkel-Feldzuverlässigkeit FN1/FN2 bleibt offen. GPS-/Shelly-Praxis ohne vorhandenen Shelly/GNSS-Empfänger nicht erfolgt. Planer/Verleitungen, eigene Watch-/Wear-Apps und gemeinsames Training wurden in diesem Paket nicht implementiert.

Kein Commit, Push, Merge, OTA, nativer Build, Prebuild, Store-Schritt oder Live-DB-Write durch Chat 02. Der 08.10.-Bericht im Arbeitsverzeichnis bleibt historische Referenz und wird nicht nochmals in den neuen Freeze aufgenommen. `node_modules`-Symlink ist ausschließlich lokale Prüfinfrastruktur und ausgeschlossen.

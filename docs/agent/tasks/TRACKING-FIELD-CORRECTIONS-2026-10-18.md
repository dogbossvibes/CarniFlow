# Tracking field corrections — 2026-10-18

## Auftrag und Arbeitsplatz

Aktueller Nutzerauftrag: Distanzzuordnung und Doppelwinkel prüfen/beheben, anschließend überlagerte Marker verbessern und G7/Enderkennung prüfen; mit Chat 01 abstimmen und geprüfte Korrekturen per OTA veröffentlichen. Chat 01 bleibt alleiniger Publisher, Chat 00 alleiniger GitHub-Backup-Writer. Kein DB-, Native-, Build- oder Store-Auftrag in diesem Paket.

Isolierter Worktree: `anyvo-tracking-field-corrections`, Branch `fix/tracking-field-corrections`, Ausgangs-HEAD `71632a680115475dc84d2d1a968a71699245d4a5`. Ausgangszustand sauber. Main und fremde Worktrees nicht verändert. Abhängigkeiten nur über temporären, eigenen Symlink lesend wiederverwendet; keine Installation.

## Belegte Befunde und Korrekturen

1. **Distanzzuordnung:** Detailkarte/-liste las bisher `distance_from_start` unverändert, obwohl automatische Winkel auf Detektormetern und manuelle Marker auf Linienmetern liegen. Die Absuche verwendet bereits `buildSearchEventArcs`. Das Detailmodell verwendet jetzt dieselbe vorhandene Referenz inklusive Marker-/Linienzeitachse und Continuity-Unterbrechungen. Ohne verwertbare Geometrie bleibt der ausdrücklich vorhandene gespeicherte Fallback. Unbekannte Winkelpositionen erzeugen keine künstliche Schenkelgrenze bei 0 m. Geometrie, Klassifikation, gespeicherte Daten und Score werden nicht geändert.
2. **Doppelwinkel:** Der bestehende 2-m-Mindestabstand galt zwischen Auswertungsdurchläufen nur nach `gps_split_apex`. Er gilt jetzt auch für reguläre GPS-Winkel. Reproduktion mit nacheinander gelieferten Scheiteln 10 m, 11,3 m und 14 m: vorher drei, jetzt zwei Meldungen. Der zulässige spätere Winkel bleibt erhalten. Kein allgemeines Retuning und keine Löschung historischer Doppelmarker. Die ursprünglichen Rohdaten der zwei Feldaufnahmen fehlen; das ist eine belegte Code-Lücke mit passendem Reproduktionsmuster, kein behaupteter vollständiger Rohdaten-Replay dieser Aufnahmen.
3. **Überlagerte Marker:** Nahe Marker werden abhängig vom Kartenzoom gemeinsam beschriftet, z. B. `G5 · L` oder `G7 · Ende`. Antippen öffnet die einzelnen Beschreibungen und Meterwerte aller enthaltenen Einträge. Hineinzoomen trennt sie wieder. Kein Datensatz wird gelöscht/zusammengeführt, keine gespeicherte Koordinate verschoben. Die zusammengesetzte Anzeige sitzt auf der ursprünglichen Koordinate ihres ersten Eintrags. Start/Ende werden berücksichtigt, der gespeicherte Gesamtweg wird für die Endbeschreibung explizit übergeben. Live-Gegenstandsnummern bleiben auch vor Speicherung im Detail erhalten. Gruppenabstand nutzt die vorhandene Kartenregion/Ansichtshöhe; kein behaupteter geräteverifizierter pixelgenauer Kollisionsschutz bei jeder Perspektive.
4. **G7:** Nähe von 0,88 m allein beweist keine Gegenstandsanzeige. Bestehende Bedingungen (u. a. sechs Sekunden Verweilen, langsame Bewegung, ausreichende Genauigkeit und begrenzte Drift) bleiben erhalten. Zusätzlicher iOS-/Android-Hooktest: Vorbeilaufen nahe am letzten Gegenstand bestätigt ihn nicht. Bestehende Tests bestätigen korrektes Verweilen auch am Ende, manuelle Freigabe der Wartephase und einmalige Endansage bei fortlaufender Aufnahme. Der genaue historische Grund für G7 in Aufnahme A bleibt mangels Verweil-/Bewegungsdaten offen.
5. **Enddiagnose:** Acht Produkt-/Testdateien aus geprüftem Support-Enddiagnose-Commit `2ee256448fa8abbb6dbd5d2861813790be051dfd` übernommen. Tatsächliches `onFired` wird unabhängig vom internen QA-Modus erfasst. Beobachtung ist `complete`, `partial` oder `unknown`; nur vollständig beobachtetes Ausbleiben wird als Ereigniszähler 0 ausgegeben, unbekannt als null. Neue Suche setzt die Evidenz zurück; Resume beginnt teilweise beobachtet. Alte Exporte werden lesend auf unbekannt normalisiert. Schema 2.12 bleibt beim Service-/Hintergrundexport erhalten. `voiceFired` dokumentiert weiterhin Ansageabsicht, keinen bewiesenen Lautsprecherton.

## Datenbasis und Aussagegrenzen

Anonymisierte Feldexporte vom 12.10.2026: A SHA-256 `7765849a140bbddc29adba8c48b4d30e471ea100d8ee1afa483eb6a72bf33748`, B `8e8d8327b9b8094767b7bd5be415a7db35febeaef0efd80d903e2c0e01edeb11`. Testfixtures übernehmen nur relative x/y/tMs, Marker und Quellhash, keine echten Geokoordinaten oder Kontodaten. A/B belegen gemischte Meterwerte und nahe Marker; der letzte rechte Winkel differiert jeweils um mehr als 12 m. Der doppelte rechte Winkel in A liegt etwa 1,31 m auseinander. G5 liegt nahe einem Winkel (A ca. 0,81 m; B ca. 0,08 m). Keine gesicherte App-/OTA-ID, kein vollständiger Rohdetektor-/IMU-Mitschnitt. Keine Feld-, Geräte-, Audio- oder Haptik-Abnahme behauptet.

## Prüfung

Vor Korrektur gezielt: vier reproduzierte Fehler bei 54 bestandenen Tests. Nach erster Korrektur 58/58. Integriert vor letzter UI-Ergänzung: 10 Suites / 224 Tests PASS. Breite zusätzliche Prüfung fand zwei veraltete Quelltext-Assertions in `turnFusionQa`: eingeschränkter alter Doppelwinkelguard und bereits vorher geänderte Export-Schreibweise mit `apexIndex`. Beide Assertions an die tatsächlich geprüfte Verdrahtung angepasst; keine Produktänderung am Export dafür.

Abschließender kombinierter Lauf und Belegdateien siehe eingefrorenes Releasepaket/Manifest. TypeScript nach finalen funktionalen Änderungen PASS. ESLint aller geänderten TS-/TSX-Dateien: 0 Fehler, 3 bestehende Warnungen (Recovery-Effect und nicht mehr benötigte Disable-Kommentare); abschließende Test-/Kommentarergänzungen nochmals separat geprüft. `git diff --check` erforderlich beim Freeze und erneut auf jedem Integrationsziel.

## Release-Vertrag

- Neue Feldkorrekturen, Locale-Ergänzungen und Support-Diagnose getrennt als Patches; keine ganzen Release-/Konfigurationsdateien ersetzen.
- Chat 01 meldete Support-Commit 2ee2564 bereits live auf `1.0.5-motion-v2`, Gruppe `301e4fe5-b447-4c17-8bb6-d717b64a586c`, Update `01a14c3f-0a96-7373-8c39-9a6622ab406f`. Auf dieser aktuellen Linie Support-Patch überspringen. Dortigen Release-Guard unverändert erhalten.
- Für ältere iOS-/Android-Ziele Support-Kompatibilität separat prüfen. Frische tatsächlich aktive Heads/Runtime/Production-Umgebung sind Autorität; zwischenzeitliche UI-Releases erhalten. Alte vorbereitete Kandidaten sind keine Freigabe zum Rücksetzen.
- Chat 01: unabhängige Review, gezielte Integrationstests/Typecheck/Lint/diff-check/Bundle und Runtime-Abgleich; isolierte Releasecommits durch Chat 00 GitHub-sichern, dann offizieller Production-Wrapper mit Lock/Ancestry-Prüfung. Veröffentlichung und Live-Readback je Ziel dokumentieren.
- Keine neue native Funktion oder DB-Migration erforderlich. Keine neue Store-Veröffentlichung. Dieser Arbeitsbericht allein behauptet keine OTA-Veröffentlichung.

## Kurze spätere Geräteprüfung

Im Logbuch die beiden Feldfährten öffnen: Winkel-/Gegenstands-Meterwerte vergleichen; `G5 · L` bzw. `G7 · Ende` antippen und alle Einträge lesen; hinein-/herauszoomen. Bei der nächsten echten Aufnahme eine einzelne enge Ecke ohne Doppelmarker, echten letzten Gegenstand im Stand bestätigen und Ende genau einmal melden lassen. Danach normaler Diagnoseexport mit eindeutiger Endbeobachtung. Altaufnahmen behalten ihre ursprünglichen Marker/Funddaten.

## R2 — Referenzcache und verzögerte Markerladung

Die zusätzliche Android-Verleitungsregression deckte zwei reale Paritätsfehler auf: Grenzen aus Punkt-Payload bzw. Session-Zeitstempeln wurden erst nach der Marker-Meterzuordnung restauriert. Android normalisiert die vorhandenen Grenzen nun vor dem Detailmodell; unvermessbare Eventmeter bleiben initial und nach Cache-Reload gleichermassen unbekannt.

Für beide Plattformen bleiben die vorhandenen Punkt- und Markerzeitstempel im Detail-/Referenzcache erhalten. Ein neuer Regressionstest zeigt, dass ein Marker auf dem zurücklaufenden Schenkel vor und nach Reload bei etwa 19 m bleibt statt an den früheren Durchgang bei etwa 1 m zu springen. Alte Caches ohne Zeitachse behalten den vorhandenen Nearest-Fallback; es werden keine historischen Zeiten erfunden. Keine Datenbankmigration.

Die Kartenhöhe wird nun schon vor der asynchronen Markerladung gemessen. Neuer UI-Test: Marker nach Mount laden, ohne zweites Layout hineinzoomen, zusammengesetzte Beschriftung trennt sich wieder.

R2 gezielt: iOS 4 Suites / 56 Tests PASS; Android 4 Suites / 62 Tests PASS. Die vorherigen umfangreicheren Läufe bleiben Beleg für unveränderte Bereiche; Zahlen überlappen. Frischer R2-Typecheck/Lint und zusätzliche Referenz-Regression sind im separaten R2-Manifest gebunden. R1-Pakete sind durch R2 ersetzt und dürfen nicht veröffentlicht werden.

# Yam: zwei kurze Gegenwinkel – lokaler Kandidat, 23.10.2026

## Ergebnis und Grenze

Zwei der drei offenen Yam-Winkel sind im lokalen Kandidaten reproduzierbar ergänzt: unten links (Detektorindex 22) und rechts (31). Die bisher akzeptierten SL81/R99/SR125 bleiben erhalten. Keine neuen Winkel in den geprüften negativen Vergleichsverläufen. Kein allgemeiner Nachweis, dass niemals ein Fehlwinkel auftreten kann.

Der obere Rechtswinkel bleibt offen. Im gespeicherten Detektor liegen nahe der handschriftlichen Markierung nur rund 33–41 Grad Richtungsänderung vor. Die erneute Offline-Prüfung der exportierten Rohpunkte zwischen 260–290 Sekunden ergibt ebenfalls keinen klassifizierten Winkel; im Bereich 250–310 Sekunden wird kein entsprechender Rohdaten-Winkel akzeptiert. Diese Untersuchung umgeht nur diagnostisch die Produktionsfilter und ist kein Ersatzpfad. Die Annotation bestätigt die Absicht des Nutzers, liefert aber weder einen exakten Scheitelzeitpunkt noch eine unabhängige Sensorrekonstruktion. Kein Erzwingen eines rechten Winkels oder pauschales Absenken der Schwellen.

## Basis und Isolation

- Worktree: `anyvo-yam-paired-corners-ios55-20261023`
- Branch: `fix/yam-paired-corners-ios55-20261023`
- HEAD: `0d9634240346d37a5c43ae6c343fc8e5d83bb7ff` (veröffentlichter GPS55-Stand inklusive Live-Share).
- Produktdelta ausschließlich `shortLegCornerDetection.ts` und `turnFusion.ts`.
- Neue relative, anonymisierte Geometrie-Fixture und sechs Regressionstests; dieser eigene Bericht.
- Alle Änderungen uncommitted. Kein Push, OTA, Build, Store- oder Datenbankeingriff. Build49 und veröffentlichter Build55 unverändert durch diesen Auftrag.
- Keine Änderung an GPS-Zulassung, Start, Distanz, Recorder-Ownership, Gegenständen, Ende, Speicherung, Live-Share oder nativen Sensoren.

## Ursache und Lösung

Sehr kurze GPS-Rückbewegungen in dicht gespeicherten Schenkeln lassen die Streuung einzelner Segmentrichtungen stark ansteigen. Dadurch fehlen vor/nach einem tatsächlichen Winkel gültige Fenster, obwohl die robuste Schenkelausrichtung stabil ist.

Die reguläre Erkennung bleibt unverändert. Nur bereits wegen fehlender Schenkelfenster verworfene Kandidaten dürfen zusätzlich geprüft werden:

1. Zwei Sehnenlängen (0,75 und 1 Meter) müssen denselben Scheitel und dieselbe normale Winkelklasse bestätigen. Das sind zwei geometrische Ansichten derselben Messung, keine unabhängigen Sensoren.
2. Beide Schenkel müssen jeweils mindestens zwei verschiedene Fenster mit stabiler Regressionsrichtung besitzen.
3. Zwei bisher nicht akzeptierte, entgegengesetzte Winkel müssen zusammen innerhalb des vorhandenen maximalen Schenkelfensters bestätigt sein. Ein einzelner zusätzlicher Knick wird nicht übernommen.
4. Vorhandene Winkel, Mindestabstand, Gegenbelege aus Motion und ausgeschaltete Rescue-Option bleiben geschützt. Neue Kandidaten dürfen keine bereits verwendete Motion-Episode eines vorhandenen Winkels übernehmen. Fehlende Sehnen sind fehlende Evidenz und niemals Streuung null.
5. Diagnosen und Ergebnisliste werden gemeinsam ergänzt; Kennzeichnung `paired_short_leg_rescue`.

Die beiden unteren Winkel werden im aufgezeichneten Yam-Replay gemeinsam nach rund 87,2 Sekunden bestätigt. Der erste liegt bei rund 56 Sekunden, der zweite bei 77 Sekunden. Dies ist bewusst spätere Bestätigung, keine sofortige Erkennung am Scheitel.

## Prüfungen

- RED auf unverändertem Basismodul: zwei erwartete Fehlschläge (Yam und Spiegelung), drei Schutztests bereits grün.
- Breiter Kandidat: 244 Suites / 3.173 Tests PASS, keine Skips. Danach letzte konservative Null-Sehnen-Absicherung und zusätzlicher Motion-Gegenbelegtest.
- Abschließender Stand: 5 Suites / 174 Tests PASS; sechs neue Regressionstests enthalten. Zahlen überlappen.
- Abschließendes chronologisches Rohdaten-Replay mit erhaltenem Motion-Kontext durch den Build55-Aufnahmeprozessor: 1 Test PASS. Winkel 3 → 5; 56 Linienpunkte und 96,5732735885691 Meter in beiden Varianten exakt gleich. Historische Live-Anzeige 97,4 m ist keine behauptete exakte Replay-Reproduktion.
- 11 ältere Feldaufnahmen an jedem Detektor-Präfix: keine zusätzlichen Winkel.
- 196 synthetische Kurven-/Geraden-/Driftverläufe, jeweils an jedem Präfix: keine zusätzlichen Winkel. Zusätzlich 100 stationäre Driftverläufe als Gesamtspuren: keine zusätzlichen Winkel. Diese umfangreichen Gegenproben liefen vor der letzten ausschließlich verschärfenden Null-Sehnen-Absicherung; der abschließende Zieltest und Rohdaten-Replay liefen danach.
- Spiegelung und 90/180-Grad-Drehung behalten die Winkelorte bei und ändern die Richtung korrekt (Offline-Modell).
- TypeScript PASS; ESLint ohne Ausgabe/Fehler; git diff --check PASS.
- Kein iPhone-, Hermes-, Haptik-, Sprach- oder Feld-PASS behauptet. Yam-Motion-Export ist gekürzt; fehlende Samples wurden nicht erfunden.

## Rechenaufwand und offene Prüfung

Desktop-Node-Mikrobenchmark an der Yam-Geometrie: Median ca. 26 ms vorher / 49 ms Kandidat; parallele Prüfprozesse beeinflussen diese Werte. Kein Smartphone-Leistungsnachweis. Zusätzliche Geometrieprüfung kostet Rechenzeit und muss vor Veröffentlichung unabhängig bewertet werden, insbesondere bei langen Fährten.

Offen: unabhängige Implementierungsprüfung, Geräte-/Langfährten-Performance und der obere Rechtswinkel. Für letzteren ist zeitlich genauer zugeordnete reale Mess-/Bewegungsevidenz nötig, bevor eine Erkennung behauptet wird. Keine Veröffentlichungsfreigabe aus diesem Bericht ableiten.

## Reproduktionsbelege

Alle Skripte, Eingangsbindungen, Test-JSONs und Hashes: `outputs/yam-paired-angle-research-02-20261023/` im Projekt-Mirror. `SOURCE-FREEZE.json` bindet die Quellen. `BASELINE-BINDING.json` bestätigt die relevanten geladenen Detektorabhängigkeiten gegen den veröffentlichten Commit. `FINAL-RAW-REPLAY.json` verwendet aus dem ursprünglichen Harness noch das boolesche Feld `baseline`: false = unverändertes Basismodul, true = Kandidat; diese Bezeichnung ist historisch, die Winkel-/Callback-Ergebnisse unterscheiden beide eindeutig.

Für Jest dient `candidate-jest.config.json` mit dem vorhandenen, lesend genutzten Dependency-Verzeichnis als Konfiguration. Keine Installation. Originale Vergleichstests und deren Erwartungen wurden nicht geändert.

## R2 – PAIR_ORPHAN_AFTER_MOTION_DEDUP

Chat01 fand im synthetischen zeitkomprimierten Gegenbeispiel einen nach der finalen Motion-Zuordnung allein verbleibenden neuen Winkel. Eng korrigiert: ursprüngliche Diagnosen der Paarergänzungen sichern, nach dem letzten Motion-Filter die überlebenden neuen Winkel erneut auf Gegenpartner prüfen, verwaiste Ergänzungen entfernen und für alle ausgeschiedenen Paarergänzungen Diagnosen/Zähler zurücksetzen. Bestehende Winkel und der bestehende Motion-Filter bleiben erhalten.

Die exakt unveränderte Chat01-Regression (SHA256 e55b1692cbfb0c732fb5784dd02abd3dabd5c7ee74c411e2e28d0a6cd9cd837f) wurde auf dem alten Kandidaten RED (1/2) und auf R2 GREEN (2/2) ausgeführt. Zusätzlicher Deep-Equal-Vergleich bestätigt im Konfliktfall unveränderte bestehende Turns, Corners, Diagnosewerte für22/31 und Rescue-Zähler gegenüber dem veröffentlichten Basismodul.

175 gezielte Tests PASS, abschließend sieben Paartests PASS (überlappend). TypeScript final PASS, ESLint PASS, diff-check PASS. Der zunächst aus dem JavaScript-Reviewprobe übernommene Testwert step_counter wurde im typisierten zusätzlichen Jest-Test auf den erlaubten Wert steps korrigiert; das originale Reviewtest-Skript blieb unverändert. Keine erneute breite Doppelanalyse.

Belege und neuer Source-Freeze: outputs/yam-paired-corners-r2-02-20261023/. Erneute unabhängige Prüfung angefordert. Oberer Rechtswinkel, Geräte-/Langfährten-Performance bleiben offen; keine Veröffentlichung.

## R3 – notwendige Voraussetzungen vor zusätzlichen Vollscans

Nur turnFusion.ts fachlich geändert: Vor den zwei zusätzlichen Geometriescans müssen mindestens zwei bisher wegen fehlender Fenster verworfene Kandidaten beidseits überhaupt die bestehenden Mindestwerte MIN_LEG_M und MIN_SAMPLES_SHORT erreichen können. Reine Randfehler lösen keine vollständige Zusatzanalyse mehr aus. Kein neuer Klassifikationswert; R2-Paaratomizität und Originaldetektor unverändert.

538 vollständige Ergebnisvergleiche gegen eingefrorenes R2 (Yam, zeitkomprimiertes Yam, alle Präfixe einschließlich leer, elf historische Feldaufnahmen und R2-Motion-Konflikt) PASS. Unveränderte originale Review-Gegenprobe PASS. 175 gezielte Tests PASS und anschließend zwölf Paartests einschließlich Scan-Zählung bei 0/1/3/1000 Punkten und positivem Yam-Fall PASS; Zahlen überlappen. TS/Lint/Diff PASS.

Interleaved Desktop-Node-Messung, drei Samples nach Warmup: R2→R3 Median Yam29,91→30,77ms; Gerade1000P203,71→138,39ms; Gerade3000P613,20→412,42ms; leicht schwankende Gerade1000P256,63→175,88ms. Somit ca31–33Prozent weniger Zeit auf diesen langen Kontrollspuren. Keine allgemeine Performancegarantie: Bei mindestens zwei plausiblen Innenkandidaten bleiben die beiden Zusatzvollscans bestehen; Originaldetektor weiterhin vollpufferbasiert. Kein iPhone/Hermes-/Echtzeit-PASS.

Oberer Winkel weiterhin nicht belegbar. Originalvideo-Pfad fehlt. Frühere VIDEO-STATUS.json belegt nur Metadaten, keine dekodierten Frames. Drei von Chat01 gefundene andere MP4-Dateien gelesen/gehasht: keine stimmt mit dem Originalhash überein. Unterschiedliche Hashes schließen eine bearbeitete Kopie nicht aus, liefern jedoch keine zeitliche Zuordnung. Spotlight-Metadaten nicht verfügbar; keine Codecinstallation oder Umgehung. Für den oberen Winkel fehlt eine lesbare, zeitlich zuordenbare Aufnahme des tatsächlichen Richtungswechsels bzw. eine neue markierte Messung. Kein vollständiger Release-PASS.

R3-Belege, Hashes und Freeze: outputs/yam-r3-performance-02-20261023/. Kein Commit/Push/Integration/OTA; Build49 und Live-Share unverändert.

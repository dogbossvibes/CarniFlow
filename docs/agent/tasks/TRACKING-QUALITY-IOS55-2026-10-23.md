# Tracking-Qualität: begrenzte iOS-55-Korrektur nach Studienprüfung

Owner: Chat 02. Direkter Humanauftrag: alle sechs Forschungsbereiche für iOS Build 55 prüfen und geprüfte OTA-fähige Teile dort veröffentlichen; iOS Build 49 als Vergleich erhalten. Chat 01 ist Integrator/Publisher.

## Basis und Umfang

Isolierter Worktree `anyvo-tracking-quality-ios55-20261023`, Branch `fix/tracking-quality-ios55-20261023`, Basis `67ae3548ad956d235c0110b36b702093cbf40a9d`. Die Release-Worktrees von Chat 01 bleiben unangetastet. Vor Veröffentlichung muss der Kandidat auf dessen dann aktuelle iOS-55-Quelle integriert und erneut geprüft werden.

Zielruntime `1.0.5-motion-v4`, im EAS-Inventar vom 23.10.2026 ausschließlich iOS 1.0.5 (55). OTA adressiert eine Runtime, keine Buildnummer; unbekannte anderweitig erzeugte Binaries mit identischer Runtime sind durch das Inventar nicht ausgeschlossen. Keine Änderung der Runtime `1.0.4` (Build 49), keine Android-Veröffentlichung aus diesem Auftrag. Interner `build40`-Auditmodus ist NICHT das Binary Build 49.

Build-49-Vergleich: Die gleiche problematische Reihenfolge (EMA-Zustandsänderung vor Accuracy-/Speed-Verwerfung) ist statisch sowohl in der eingebetteten Build-49-Quelle `3f7c2e746fd064d1b103aa67f926c514a52eed44` als auch in der zum Prüfzeitpunkt aktiven Runtime-1.0.4-Quelle `601edfdd57e5d306075b480a51d469e5ee64840c` vorhanden. Dies ist somit KEIN Nachweis einer neu eingeführten Build-55-Regression und keine Erklärung aller Yam-/Empfangsprobleme. Beleg: `BASELINE-COMPARISON.json`.

## Nachgewiesener Fehler und Korrektur

Bereits vom vorhandenen Accuracy-/Speed-Gate abgelehnte Rohfixes wurden vorher in die Messwert-EMAs aufgenommen. Der nächste zugelassene Fix konnte dadurch eine verschobene Linie, zusätzliche Distanz, veränderten Fortschritt oder verschobene Endpositions-Evidenz erzeugen.

Fünf Red-Gegenproben treiben den echten Legeprozessor bzw. Such-Hook: identische zulässige Fixfolge einmal mit und einmal ohne eingeschobenen abgelehnten Fix. Lay: fehlende Accuracy, Accuracy 80 m, unrealistischer Sprung mit Accuracy 5 m. Search: Accuracy 80 m und unrealistischer Sprung mit Accuracy 5 m. Beide Search-Proben vergleichen zusätzlich Analytics, Score, Replay, Fortschritt und Endpositions-Evidenz.

Korrektur ausschließlich in `layProcessingSession.ts` und `useSearchRecorder.ts`: CURRENT stellt bei diesen bestehenden Verwerfungen die zuvor gültigen Messwert-EMAs wieder her. Live-Puck und Rohdatenmitschnitt bleiben getrennt. Keine neuen Schwellen oder Filterparameter, keine zusätzlichen Annahmeverzögerungen, kein neuer Sensorvertrag. BUILD40 behält sein altes Verhalten. Lege-Start-Lock/Warmup/Pause und alle bestehenden Unterbrechungsregeln bleiben unverändert.

Ein bisheriger CURRENT-Golden für den synthetischen Reject-Mix enthielt die kontaminierte Linie/Distanz. Der ursprüngliche Golden bleibt unverändert und prüft weiterhin die historische BUILD40-Geometrie/Distanz. Für CURRENT wird stattdessen die exakt gleiche beobachtete Fixfolge ohne die drei bekannten Fehler-Injektionen verglichen; die bisher erwartete Winkelanzahl bleibt explizit geprüft. Die historischen CURRENT-Winkel dürfen nicht mit BUILD40-Winkeln gleichgesetzt werden.

## Prüfung der gesamten Fährtenarbeit

| Bereich | Bestehender Schutz / geprüfter Pfad | Ergebnis und Grenze |
|---|---|---|
| GPS-Start und Ansatz | Warmup-Freshness, Action-Time-Guards, mehrfach bestätigter Ansatz | Regressionstests; echte Empfangs-/Wartezeiten benötigen Gerätebelege. Keine Startschwellen geändert. |
| Legen | getrennte Live-/Linien-/Detektorgeometrie und kanonische Distanz | Nachgewiesene EMA-Kontamination korrigiert. Detektorlogik und Qualitätsschwellen bleiben gleich. |
| Absuche/Wiederaufnahme | First-stage-Gates, Motion-Plausibilität, explizite Abschnitte, Recovery | Nachgewiesene EMA-Kontamination korrigiert. Keine neue Reacquisition-Gewichtung. |
| Distanz/Bewertung | unbekannte Lücken ausgeschlossen, Reliable/Uncertain/Excluded, Referenzqualität | Formeln unverändert. Abgelehnte Messungen sollen zukünftige Metriken nicht indirekt verändern. |
| Gegenstände/Ende | Dwell, frische eindeutige Fixes, Grace, Run-/Pause-Isolation, Joker-Ausschluss | Regression; keine großzügigeren Funde oder Endschwellen. |
| Karte/Speicherung/Replay | getrennte Such-/Legepfade, Eigentümer-/Run-Bindung, Abschnittsgrenzen | Datenpfade durch Regression abgedeckt; keine neue visuelle Geräteabnahme. |

## Einordnung der Studie

[arXiv 2610.21503 v1](https://arxiv.org/html/2610.21503v1): verifizierter Preprint vom 15.10.2026, spezielles Brust-Tag mit Dualband-GNSS, IMU, Barometer und map-aware Particle Filter. Qualitäts-/Geschwindigkeitskonsistenz gewichtet dort Partikel; dies ist kein direkt übernehmbarer Smartphone-Koordinatenfilter. Der isolierte Outdoor-Mittelwertgewinn der Geschwindigkeitsgewichtung beträgt im Ablationsvergleich 3,35 auf 3,30 m. Kein ANYVO-Genauigkeitsnachweis.

Ausstehende Forschung: qualitätsgewichtete Wiederaufnahme offline gegen Wartezeit, Fehlpositionen, Distanz, Gegenstände und Ende vergleichen; tatsächliche Geräte-/Körperbewegung unterscheiden; unvollständige Motion-Mitschnitte ergänzen. FGO bleibt getrennt/offline. Die drei ungeklärten Yam-Winkel und reale Feldtests bleiben offen. Diese Korrektur ist nicht als Behebung ihrer Ursache belegt.

## Nachweise und Release

Belege im Projektmirror `outputs/tracking-quality-ios55-02-20261023/`: Red/Green-Ergebnisse, vollständige 323-Suiten-Regressionsauswahl, Typecheck, Lint, Source-/Patch-Hashes und abschließender RESULT-Bericht. Testergebnisse sind im RESULT maßgeblich; diese Datei behauptet keine noch laufende Suite als PASS.

Release erst nach unabhängiger Review durch Chat 01, frischer EAS-Basis-/Ancestry-/Environment-/Runtime-Prüfung, Build-49-Routenvergleich sowie Source-/Bundle-/Asset-/Manifest-/CDN-Abnahme. Kein neuer nativer Build, keine Datenbankänderung. Nachweis der Auslieferung ist kein Nachweis der Installation auf dem iPhone oder eines Feld-PASS.

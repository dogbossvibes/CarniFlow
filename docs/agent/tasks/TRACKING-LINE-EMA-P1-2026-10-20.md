# P1 – Linienglättung ohne Verzögerung um einen Fix

## Auftrag und Quelle

- Direkte Werkstatt-Freigabe `01a158ff-81f2-7492-ab40-ff288e226f0f` zur Umsetzung des Analyseberichts; GitHub-Sicherung gemäß `01a15901-4893-7472-8ceb-50015b376910`. Originalnachrichten gelesen.
- Writer: Chat 02, isolierter Worktree `anyvo-tracking-line-ema-p1`, Branch `fix/tracking-line-ema-p1`.
- Basis: `49a578453a7bf6c7d8d5f41a88dc6c21f9d378fa`, der abgeschlossene kumulative iOS52-Joker-/Gummi-Quellstand einschließlich Hilfe/Sharing. Kein Rückgriff auf den überholten Analyse-Stand d8bc.
- Einzige Produktdatei: `features/tracking/engine/layProcessingSession.ts`.
- Zwei Testdateien: `layProcessingSession.test.ts`, `laySessionRuntime.test.ts` im selben Engine-Testordner.
- Native P0-Kartenkorrektur gehört Chat 03; Journal gehört Chat 07. Fremde Worktrees, main und globale Statusdateien unverändert.

## Belegter Fehler und Korrektur

Der Processor wählte die Linien-EMA mit der Kurvenzone des vorherigen Fixes.
Danach wurde der aktuelle Fix in den Detektor aufgenommen und das Linien-Gate
bereits mit der aktuellen Zone ausgewertet. So reagierte die Punktdichte sofort,
die Glättung aber erst beim nächsten Fix.

Neue Processor-Regressionen für Links- und Rechtskurve scheiterten vor dem Fix
an genau diesem Übergang; BUILD40 bestand die Kontrollprüfung. Nach dem Fix
verwenden Gate und Glättung dieselbe aktuelle Detektorevidenz. Beim Zonenwechsel
wird die Linienposition vom EMA-Zustand **vor** dem aktuellen Fix neu berechnet.
Der Rohfix geht somit nicht zweimal in die Glättung ein.

Warmup, Start-Lock, Pause und Accuracy-/Sprung-Ablehnungen behalten ihren
bisherigen EMA-Verlauf. Nur ein zugelassener Detektor-Fix kann die Zone neu
bestimmen. BUILD40 bleibt unverändert. Keine neuen GPS-Punkte, keine
Scheitelrekonstruktion und keine nachträgliche Änderung gespeicherter Aufnahmen.

Unverändert: kanonische Distanz (EMA 0,4 / Gate 2 m), Detektor (EMA 0,7 /
Gate 0,5 m), Linien-Gates (2 / 0,8 m), Zonenparameter, Qualitätsprüfung,
2-m-Winkelausschluss, Startfilter, Fusion, Score, Gegenstände/Joker,
Persistenzvertrag, Continuity, Ownership, native Konfiguration und Abhängigkeiten.

## Nachgewiesene Auswirkungen

- Synthetische CURRENT-Kurven haben erwartungsgemäß andere Linienpunkte.
  Die bisherigen BUILD40- und Geraden-Goldens bleiben erhalten.
- Ein synthetischer rechter Spitzwinkel wird durch den veränderten Zeitpunkt
  des bestehenden Winkelaufrufs nun `spitz_rechts` statt `rechts`.
  Diese Änderung ist explizit getestet; keine Schwelle wurde gelockert.
- Hintergrundtests vergleichen die vollständige aktuelle Punktfolge,
  Distanzaufrufe und Winkel direkt mit dem Vordergrundpfad, statt für neue
  CURRENT-Geometrie die alten Punkt-Hashes zu verlangen. BUILD40-/Geraden-
  Hashes und die historischen Distanzreferenzen bleiben geprüft.
- Elf vorhandene relative Feld-Rohfixströme wurden durch den tatsächlichen
  alten Processor aus 49a5784 und den neuen Processor wiedergegeben.
  Für alle elf sind Distanzfolge, Detektordaten und Ablehnungszähler identisch.
  Anzahl, Klassifikation, Koordinaten und Distanzposition der Winkelmarker
  bleiben gleich. Auch Abschnittsgrenzen bleiben gleich.
- Linienpunktzahlen vorher → nachher:
  F1T 12→12, FT2 15→13, Lauf1 6→7, Lauf10 7→7, Lauf2 8→8,
  Lauf3 7→6, Lauf7 9→8, Lauf8 7→7, Lauf9 7→7, R1 9→9, Spitz 14→15.
  Punktzahl allein ist kein Maß für räumliche Genauigkeit.

## Prüfungen

In getrennten, nachvollziehbaren Läufen insgesamt **23 relevante Suites /
463 Tests bestanden**:

- Processor: 70 Tests; nach Ergänzung der festen Feld-Klassifikationsreferenzen
  die 16 betroffenen P1-Tests erneut bestanden (nicht zusätzlich zählen).
- Session-Runtime: 59 Tests einschließlich Vorder-/Hintergrundvergleich,
  Doppelzustellung, Persistenz, Isolation und Lifecycle.
- Weitere 21 Suites / 334 Tests: reale Gate-/Fusion-Fixtures, Short-Leg,
  Qualitätsprüfung, kanonische Distanz, Continuity, Startbewegung, Recovery,
  Replay, Gegenstandsprojektion/Joker, Score, Distanzzuordnung und Kartenebenen.
- Separater Vergleichslauf des alten und neuen Processors: 1 Audit-Test
  bestanden, nicht in obiger Summe.
- TypeScript bestanden. ESLint: 0 Fehler, 2 bestehende `require()`-Warnungen
  im Runtime-Test. `git diff --check` bestanden.
- Der zuerst ausgeführte breitere Lauf enthielt 15 Fehlschläge ausschließlich
  gegen alte CURRENT-Geometrie-Goldens im Runtime-Test. Der anschließende
  direkte Paritätsvergleich bestand vollständig; diese Erstbefunde bleiben
  in den Logs erhalten.
- `qualityPipeline.test.ts` ist in der gewählten Basis bereits korrekt
  isoliert und besteht unverändert. Kein Eingriff in Diagnosefreigaben.

Lokale Belege im Projektordner:
`outputs/tracking-line-ema-p1-2026-10-20/`
mit `baseline-regression.log`, `processor.log`, `p1-final.log`,
`regressions.log`, `runtime-and-comparison.log`,
`real-comparison-final.log`, `real-processor-comparison.json`,
`typecheck-final.log`, `eslint-final.log` und gebundenem Abschlussmanifest.
Der temporäre Vergleichs-Processor und dessen Audit-Test liegen nur dort;
sie sind kein Produktcode und werden nicht eingecheckt.

## Grenzen und Übergabe

Keine neuen Geräte- oder Feldtests. Die elf vorhandenen Streams sind
Wiedergaben; ihre beobachteten Klassifikationen sind keine neue Ground Truth.
Für die Kundenaufnahme vom 19.10. fehlen weiterhin Lay-Rohfixe und
Detektormitschnitt. Deshalb kein Nachweis, dass die konkret gemeldeten zwei
Kundenwinkel mit diesem Fix korrekt erkannt würden.

Scheitelerhalt mit beobachteten Punkten, FGO und P2-Startfilter bleiben
separate Themen. Keine automatische historische Neuberechnung.

Isolierter Commit und normaler GitHub-Push sind beauftragt; die exakte
Commit-/Remote-Bestätigung folgt im Abschlussbeleg nach Sicherung durch
den zuständigen MASTER. **Keine neue P1-OTA, kein Build, TestFlight-, Store-,
main-Merge- oder DB-Schritt in diesem Auftrag.** Die fünf bereits
abgeschlossenen Joker-/Gummi-OTAs werden nicht wiederholt.

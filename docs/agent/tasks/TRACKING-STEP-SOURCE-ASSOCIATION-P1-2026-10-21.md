# Tracking P1: kumulative Schritte ihrem Quellfenster zuordnen

## Unabhängiger RED-Befund

Der native Sicherungscommit `422f321` erhält frische Schrittchargen über leere
Motion-Takte hinweg. Für sich allein bleibt er ein nicht freigegebener Kandidat:
Chat 01 hat mit beiden exakt kompilierten Swift-Kernen einen P1 reproduziert.
Zwei zuvor gegangene Schritte mit Quellintervall 8..10,1 s wurden nach einem
leeren Takt erst bei einer späteren Standdrehung ab 12 s gesendet. Der bisherige
Lay-Adapter verwarf die Quellzeit; die Turn-Evidenz zählte sie im späteren
Fenster 11,25..13,25 s als aktuelle Fortbewegung. Trotz Beschleunigung 0 stieg
die Evidenz von 0 auf 1. Damit könnte eine unveränderte Fusion einen anderen
GPS-Winkel zu Unrecht widerlegen.

Der verstärkte synthetische Reviewverlauf enthält echte 20-Hz-Sampleabstände
mit physikalisch konsistenter Yaw-/Gyro-Rate. Er ist kein Geräte-/Feldbeleg.
Die native JSON-Nachricht wurde als Regression übernommen, ausschließlich die
zufällige Laufkennung entfernt. Original-SHA:
`9d30766fbd6fc0e24d2acacadf80c2c7e00da0994651c61c11025b16baf697ee`;
Fixture-SHA:
`97336b8ac64da738f5d55661ec23e25d019b3acce854db5796d26747b60c14bb`.
Keine Kundenkoordinaten/-konten/-aufnahmen im Fixture.

## Korrigierter Datenfluss

- `nativeStepInterval()` liest nur den bekannten v3-Vertrag. Fehlende,
  verkehrte, leere, zukünftige oder nicht endliche Intervalle und ungültige
  Schrittzahlen werden nicht als aktuelle Schrittunterstützung behandelt.
- Die typisierte zentrale Prüfung `stepIntervalWithin()` verlangt vollständige
  Abdeckung im angefragten Fenster. Keine anteilige Aufteilung kumulativer
  Schritte und keine erfundenen Einzelschrittzeitpunkte.
- `nativeMotionWindowSample()` erhält Rohdelta und absolute Quellabdeckung im
  flüchtigen RAM, unabhängig von QA. Die vorhandene Turn-Evidenz zählt nur
  vollständig in ihr Kandidatenfenster fallende v3-Chargen. Beschleunigungs-
  und Rotationsberechnung, Geometrie und sämtliche Gates bleiben unverändert.
- `confirmLayMovement()` zählt nur vollständige Intervalle ab dem aktuellen
  Aufnahmestart. Warm-up-Schritte werden nicht durch spätere Zustellung neu.
- `nativeMotionFusionSample()` erhält dieselbe Provenienz für die Absuche und
  trennt Start/Resume. `motionForFix()` bewertet die Quellabdeckung bei jedem
  GPS-Fix erneut im bestehenden 2-s-Mess-/Empfangsfrischehorizont. Außerhalb
  liegende oder unbekannte Schritte werden `null`; bekannte 0 bleibt 0.
  Die im RAM gehaltene ursprüngliche Nachricht wird dabei nicht verändert.
- Legacy/fehlende Qualität und v2 behalten die bisherigen Messwerte und
  Evidenzberechnung. Unbekannte spätere Qualitätsversionen werden nicht
  stillschweigend als Legacy behandelt.
- Der begrenzte RAM-Puffer kopiert auch die Quellintervalle defensiv.
  QA exportiert weiter ausschließlich die explizite relative Allowlist;
  `stepInterval` ist im Export zusätzlich ausdrücklich verboten.

Die Swift-Lieferkorrektur, Zähler und nativen Tests bleiben bytegleich zum
Commit `422f321`. GPS-/Start-/Endkonstanten, Fusion-Gewichte und Winkelgeometrie
werden nicht geändert. Der getrennte Startanker-Uhrenfix gehört nicht zu
diesem P1-Produktumfang und wird gesondert gebunden.

## Regression und Prüfung

Eigener RED-Lauf vor der Verbraucherumstellung: 11 FAIL / 4 PASS im neuen
Intervall-Test. Gezielte GREEN-Läufe umfassen den realen synthetischen
Swift-Nachrichtenstrom, ein vollständig gültiges Intervall, Teilüberlappung,
fehlende/ungültige Daten, unbekannte Versionen, Legacy/v2, Sessiongrenzen und
RAM-/Exportisolation. Zusätzliche echte Search-Hook-Tests prüfen den Neustart,
Resume und Verfall bei aufeinanderfolgenden GPS-Fixes ohne neues Motion-Sample.

Vor dem abschließenden Uhrennachtrag: 44 relevante Suiten / 707 Tests PASS.
Nach allen Korrekturen gezielt 2 Suiten / 66 Tests PASS. Finaler gemeinsamer
Matrixlauf: **44 Suiten / 716 Tests PASS**, die 13 betroffenen Codedateien
während des gesamten Laufs hashgleich. TypeScript PASS; ESLint 0 Fehler,
2 bestehende Warnungen; `git diff --check` PASS. Zahlen überlappen mit den
Vorläufen und dem getrennten Startanker-Paket, nicht addieren.

Zwei begrenzte Original-Replays mit ausschließlich diesem P1-Nachtrag und
voriger Startuhr bleiben vollständig bitgleich zur vorherigen geprüften Basis.
Im vollständigen Gesamtstand bleiben Winkelarten, Confidence, Scheitel-/
Ansagezeiten/-koordinaten, Linienkoordinaten/-anzahl, kanonische Gesamtdistanz
und Continuity gleich. Der getrennte Clock-Fix gibt bei Yam den Startfix ca.
1 s früher frei: interner Detektorpuffer 158 statt 157 Punkte, Indizes +1 und
einheitlich +0,3870718567 m Detektor-Ursprungsoffset. Kein P1-Legacy-Effekt.
Die abweichenden ersten Zeitwerte/Detektordaten werden nicht als bitgleich
ausgewiesen. Ein neues unabhängiges Review des endgültigen Kandidaten bleibt
erforderlich.

## Grenzen und nächster Release-Schritt

Dieser Fix belegt korrekte zeitliche Schrittzuordnung im synthetischen
Fehlerfall. Er beweist nicht die Ursache der drei fehlenden Yam-Winkel,
langsamen realen GPS-Acquisition, Ansatz-Probleme oder nativen historischen
Kartenanzeige. Kein neuer Feld-, iOS-SDK-/XCTest- oder Hardware-PASS.

Die native v3-Lieferung erfordert einen passenden neuen iOS-Build samt
Verbraucherkorrektur. Native SDK-/Expo-Link-/XCTest-Prüfung bleibt OPEN, da
auf diesem Host nur CommandLineTools ohne XCTest vorliegen. Geräteabnahme
folgt später. Chat 01 führt den unabhängigen Review und danach den separaten
aktuellen Build-/Runtime-Preflight. Keine automatische Store-Freigabe,
kein Build/OTA/DB-Eingriff durch diesen Implementierungsschritt.

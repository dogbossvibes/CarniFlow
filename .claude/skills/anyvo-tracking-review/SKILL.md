---
name: anyvo-tracking-review
description: Prüft ANYVO-GPS, Fährtenaufzeichnung, Sensorfusion und abgeleitete Analysen auf Datenverlust, Lifecycle-Fehler und Regressionen. Für Tracking-Reviews und trackingkritische Änderungen.
---

# ANYVO Tracking-Review

Standardmäßig lesend prüfen. Fixes nur im Rahmen eines Änderungsauftrags.
Gemeinsame Projektregeln beachten. Keine Schwellen oder Algorithmen beiläufig ändern.

## Datenfluss belegen
Prüfe aktuellen Branch/HEAD/Status und untersuche tatsächliche Einstiegspunkte,
Aufrufer und Tests. Zeichne den relevanten Pfad mit Datei-/Funktionsbelegen nach:
GPS-/Sensorquelle → Zeitstempel/Koordinatensystem → Filter/Fusion → Recorder/
State → Persistenz/Sync → Marker/Analyse → Karte/Guidance.
Nicht vorhandene Stufen als solche markieren, nicht erfinden.
Rohdaten, geglättete Punkte, Darstellung und abgeleitete Metriken unterscheiden.

## Relevante Fehlerfälle
- Start, Pause, Fortsetzung, Ende und wiederholtes Tippen: keine doppelten
  Recorder, Listener, Hintergrundtasks oder mehrfach gespeicherten Abschlüsse.
- Hintergrund, Sperrbildschirm, Unterbrechungen, Prozessende und Neustart:
  belegtes Wiederherstellungsverhalten und Persistenzgrenzen benennen.
- Permission verweigert/entzogen, präzise oder ungefähre Position, deaktiviertes
  GPS, lange Fix-Pause, schlechte Genauigkeit und Batterieeinschränkungen.
- Fehlende, doppelte, verspätete oder nicht monotone Zeitstempel; Sprünge,
  Stillstand, unplausible Geschwindigkeiten, Sensor-/GPS-Quellenwechsel.
- Offline, Schreibfehler, Wiederholung und Sync-Konflikt: Rohdaten erhalten,
  keine Duplikate und kein stiller Verlust; Session- und Accountzuordnung prüfen.
- Corner Detection, Gegenstände, Enderkennung, Suche und Guidance nur anhand
  tatsächlich geteilter Datenwege bewerten. UI-Linie ist kein Genauigkeitsbeleg.

## Belege und Regressionen
Für relevante Befunde Trigger, erwartetes Verhalten, tatsächlichen Codepfad,
Auswirkung und genaue Fundstelle angeben. Falls verfügbar reproduzierbare,
anonymisierte Replay-Daten und bestehende Tests nutzen. Fehlende Sensorwerte
nicht als gemessen erfinden. Unsichere Hypothesen von bestätigten Fehlern trennen.
Kleinsten Fix und passende Regression vorschlagen; funktionierende Logik erhalten.

## Geräteabnahme und STOP
Unit-/Replay-Tests belegen keine reale Hintergrundzuverlässigkeit. Falls nötig
Testplan für echte iOS-/Android-Geräte nennen: Gerät/OS/App-Version, Umgebung,
Berechtigungen, Bildschirmzustand, Route, Referenz und Abnahmekriterium.
Bei fehlendem belastbarem Datenfluss oder widersprüchlichen Feldbelegen keine
Algorithmusänderung auf Verdacht vornehmen. Sichere Analyse fortsetzen.
Ergebnis: priorisierte Befunde mit Belegen, kleinster Lösungsansatz, durchgeführte
Prüfungen und offene Feldtests. Keine pauschale Tracking-Freigabe.

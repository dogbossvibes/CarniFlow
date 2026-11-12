# Persönliche Schrittlängen-Kalibrierung — 2026-10-09

Status: lokal umgesetzt und geprüft; eigenständiger Kandidat, noch kein Commit oder OTA. Owner 02, unabhängiger UX-Review 07 angefragt, Integration/Release ausschließlich 01. Basis fe68e1290161f12838bde6480d7868147b295995, Branch fix/tracking-step-calibration. C1-Gegenstandskorrektur und R2-Datenbank bleiben getrennt.

## Belegte Ausgangsprobleme

Die alte Route summierte GPS-Punktdistanzen schon ab dem ersten zugelassenen Punkt. Der gemeinsame GPS-Filter akzeptiert den ersten Fix ungeprüft; kumulierte Drift kann damit wie eine Gehstrecke aussehen. Der erst nach asynchronem Start abgelegte Stop-Handle konnte nach Abbruch/Unmount eintreffen. Permissionfehler waren nicht im Fehlerpfad erfasst, App-Wechsel/fehlende Fixes nicht als ungültige Messung behandelt. Die gemeinsam benutzte Positionsquelle stoppt den nativen Client beziehungsweise setzt den externen Recorderpuffer zurück.

Der bisherige Setter behandelte ungültige Zahlen wie einen Reset und verschluckte Schreibfehler. Test STEP-CALIBRATION-STORAGE-BEFORE-2026-10-09.log reproduziert das als FAIL; derselbe Test besteht mit dem Fix. Kein behaupteter Kundendatenverlust aus dieser synthetischen Reproduktion.

## Verhalten und Messvertrag

Die Kalibrierung verwendet eine eigene foreground-only expo-location-Subscription. Sie startet/stoppt ausschließlich ihren eigenen Handle, verändert weder den nativen gemeinsamen Recorder noch den externen BLE-Puffer. Aktives Legen/Suchen sperrt Messstart und Speichern; ein Beginn während der Kalibrierung invalidiert diese. Keine neue native Funktion, Permission oder Dependency.

1. Startpunkt im Stand stabilisieren; erst nach Bereitschaft ausdrücklich starten.
2. Weiterhin 50 eigene normale Fährtenschritte selbst zählen, geradeaus ohne Umkehr. Kein Pedometer und keine Messung der Hundeschritte.
3. Nach dem letzten Schritt im Stand Fertig tippen. Neue Endpunkt-Fixes nach diesem Tipp sind nötig.
4. Distanz zwischen den stabilisierten Endpunkten statt summierter GPS-Zickzackstrecke; Ergebnis bleibt sichtbar als Schätzung. Speichern nur mit ausdrücklich gewählter Übernahme eines akzeptablen Ergebnisses.

Konservative, kalibrierungsspezifische Heuristiken: gemeldete Accuracy höchstens 5 m, Fixalter höchstens 3 s, monotone Fixzeiten, drei stabile Fixes über mindestens 2 s, keine künstliche Verbesserung der Accuracy durch Mittelung korrelierter Proben. Start-/Endfenster höchstens 5 s/5 Fixes, räumlicher Abstand im Fenster höchstens 3 m. Mindestens 15 s Gehzeit, maximal 5 min; Lücken über 10 s und Hintergrund/Blur/Unmount invalidieren. Acquisition höchstens 30 s, rückwärts springende Systemzeit invalidiert. Grobe Sprünge und klar gekrümmte Wege werden verworfen. Summe gemeldeter Endpunktradien höchstens 20 % der Endpunktdistanz. Die bestehende Plausibilität 0,40–1,20 m/Schritt bleibt erhalten.

Diese Schwellen sind Sicherheitsheuristiken, keine wissenschaftlich validierte Fehlergrenze und keine Feldabnahme. GNSS kann korrelierte/systematische Fehler trotz guter gemeldeter Accuracy haben. Auch Schritte werden vom Menschen gezählt. Die UI verspricht keine Zentimeter- oder garantierte 20-%-Genauigkeit. Für ein unbrauchbares Ergebnis gibt es nur erneut messen/abbrechen, keine Übernahme.

## Daten und Lifecycle

- AsyncStorage-Schlüssel track_step_length_m und vorhandenes skalares Format bleiben erhalten. Kein Backfill, kein automatischer Reset oder Neuschreiben beim Lesen; gültige Altwerte bleiben ungerundet erhalten.
- Explizit null ist der einzige Reset, weiterhin nach destruktiver Bestätigung. Ungültige Eingaben werfen Fehler. Schreibvorgänge werden serialisiert, Zustand erst nach erfolgreichem Speichern publiziert. Ladefehler erlauben Wiederholung und verhindern blindes Überschreiben.
- Profil und Kalibrierung sehen den erfolgreich gespeicherten Wert. Bereits montierte Legen-/Suchrouten behalten durch freezeWhileMounted ihren anfangs geladenen Umrechnungswert; keine nachträgliche Änderung von Schritten/Ansagen durch eine späte Speicherung. In diesen beiden Dateien ausschließlich diese Hook-Option geändert.
- Generation-Guards schließen auch verspätet auflösende GPS-Handles, verhindern Doppelstarts und ignorieren alte Callbacks. Kein automatisches Fortsetzen nach Unterbrechung. Save-Fehler zeigen keine Erfolgsmeldung; spätes Save nach Unmount navigiert nicht.
- Keine Änderung von GPS-Zulassung/Fusion/Winkeln/Continuity/Score, Rohdaten, historischen Aufnahmen, DB, Accountmodell oder den bestehenden Geräte-Recoverypfaden.

## UI und Lokalisierung

Header ohne doppeltes Safe-Area-Inset; Titel kann auf großer Schrift umbrechen. Aktionen mindestens 48 Punkte, beschriftete Buttons, Disabled-/Busy-Zustände, Fehler und expliziter Wiederholungsweg. GPS-Ergebnis als Schätzung und gerundete Zentimeteranzeige; gespeicherter Wert bleibt ungerundet. DE/GSW/EN/FR/IT vollständig; bestehender HelpSheet-Mechanismus bleibt unangetastet, sein veralteter Kalibrierungstext wurde an den neuen Ablauf angepasst.

## Prüfungen

- 10 Suiten / 123 Tests PASS (inklusive Bestandsarithmetik, HelpSheet und Lokalisierung).
- Explizites jest-expo/android: 5 Suiten / 46 Tests PASS, überschneidet sich mit obigem Lauf.
- Vollständiger Typecheck PASS, ESLint 0 Fehler / 8 bestehende Warnungen in unveränderten Bereichen von legen/run, git diff --check PASS.
- Abgedeckt: Standjitter, schlechte/fehlende Accuracy, zu kurze/zu lange Strecke, Kurve, Lücke, fehlender Endpunkt, veraltete/doppelte Fixes, Zeitrücksprung, Permissionfehler, Pending-Start/Unmount/Abbruch, App-Wechsel, Doppelstart, konkurrierende Aufnahme, Save-/Reset-/Loadfehler, Retries, bestehende Werte, doppelte Übernahme und verspätete Navigation.
- Kein realer Geräte-, GPS-Feld-, Simulator-Layout- oder OTA-Empfangs-PASS behauptet. Neue Messheuristiken benötigen Praxisvergleich gegen eine tatsächlich vermessene gerade Strecke.

## Quellen, am 09.10.2026 geprüft

- https://docs.expo.dev/versions/v54.0.0/sdk/location/ — vorhandene SDK54-API, eigene foreground Subscription/Removal, Fixzeit und gemeldeter Unsicherheitsradius; timeInterval nur auf Android maßgeblich. Keine garantierte Aktualisierungsfrequenz vorausgesetzt.
- https://docs.expo.dev/versions/v54.0.0/sdk/pedometer/ — Sensorzählung ist ein separater API-/Permissionpfad. Wird hier ausdrücklich nicht neu eingeführt.
- https://developer.android.com/reference/android/location/Location#getAccuracy() — gemeldete horizontale Accuracy ist eine Schätzung, kein absoluter Fehlerdeckel.

## Release-Handoff

Freeze/Dateihashes/Patch/Runtime-Applychecks werden unter outputs/TRACKING-STEP-CALIBRATION-READY-2026-10-09.json dokumentiert. Native Dependencies/App-Konfiguration unverändert; prinzipiell JS-/OTA-fähig. 01 muss aktuelle Production-Basen frisch abfragen und die vier Laufzeiten getrennt integrieren/prüfen. Dieser Arbeitsstand ist kein Publish-Beleg. Unabhängiger Review und tatsächliche Geräte-/Feldprüfung sind getrennt offen.

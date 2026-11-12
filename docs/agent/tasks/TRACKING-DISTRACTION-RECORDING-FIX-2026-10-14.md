# Verleitung: native Zeitstempel und sichtbare Aufzeichnung — 2026-10-14

## Scope und Basis
Chat02; ios 1.0.4, Basis 9e2060217ab5b3fba3e861d9441a5d506e476909. Isolierter Worktree; kein main/globaler Status geändert. Kein eigener Commit, Push, Build, DB-Eingriff oder OTA. Chat01 übernimmt Release nach unabhängigem Review und frischem Preflight. LiveShare-Pakete bleiben separat eingefroren und gesperrt.

## Nutzerbefund und Reproduktion
49,99-s-Nutzervideo mit AVFoundation lokal ausgewertet: Standortpunkt bewegt sich; Verleitung zeigt Aufnahme läuft und 0 m, keine violette Linie. Sichtbarkeit ist zeitweise deaktiviert; am Anfang/Ende pausiert. Name zeigt literal `Verleitung {{number}}`. Video enthält keine Rohfix-Diagnose oder verifizierte Update-ID; eindeutiger Nachweis des konkreten Gerätedatenstroms bleibt offen.

Codebefund: sowohl ANYVO PrecisionLocation Swift (CLLocation.timestamp.timeIntervalSince1970 * 1000) als auch installiertes Expo Location LocationUtils.swift liefern Double-Millisekunden. PositionSource erhält diese unverändert. Sampler verlangte Number.isSafeInteger, verwarf damit gültige Nachkommastellen still. Ohne zwei akzeptierte Punkte keine Linie, Distanz oder Speichermöglichkeit. Getrennt: i18n App-Konfiguration verwendet einfache Klammern, Verleitungs-defaultName doppelte.

Vor Fix: gezielte Regressionen 3 Suites, 8 FAIL/24 PASS. Failures: Sampler positive/Guardsequenz, Recorder finish mit nativen Zeitstempeln und 5 echte i18n-Sprachen. Vorher-Log in outputs.

## Änderung
Nur vier Produktdateien im Modul tracking-distractions:
- model.ts akzeptiert valide fractional source time; persistiert Math.floor(t) als Integer. Raw time bleibt für Frische/Zukunft/Gap-Prüfung; gleicher gespeicherter Millisekundenwert wird nicht doppelt zugelassen. Quellobjekt unverändert.
- i18n.ts: korrekte Interpolation aller Defaultnamen; display-only Ersatz exakt bekannter alter Platzhalternamen. Keine Umbenennung gespeicherter Daten. Verständliche GPS-Warte- und Ausblendtexte.
- DistractionScreen.tsx: bei null akzeptierten Punkten GPS-Wartestatus; ausgeblendete Linie ausdrücklich erklärt; bekannte kaputte Namen nur für Anzeige korrigiert. Sichtbarkeit bleibt bewusst bedienbar.
- DistractionLayer.tsx: bekannte kaputte Marker-Titel ebenfalls nur für Anzeige korrigiert. Liniengeometrie/-stil unverändert.

## Validierung
ios: 13 Suites / 93 Tests PASS (gesamtes Verleitungsmodul). Full TypeScript PASS. ESLint geänderte Produkt-/Testdateien 0 Fehler / 0 Warnungen. git diff --check PASS.
Tests decken frische fractional native Fixes → Sampler → validierter Speichervertrag → Finish/Reload sowie Screen draft → sichtbare gestrichelte Renderlinie ab; auch stale/future/duplicate/low-quality/jumps/gaps, Pause/Resume, Kontoisolation, Speicherfehler und Main-Fährtenunabhängigkeit. Keine physische Geräteabnahme behauptet.
Android-Basis einschließlich separater ParentReferenceLines und Gap-Adapter bleibt erhalten. Keine Änderung am Hauptrecorder, Fusion, Winkeln, Bewertungslogik, Native-Modulen, DB-Schema, Auth oder LiveShare.

## Grenzen / Release
Reale Feldabnahme OPEN. Die bereits bestehende Verleitungsaufnahme ist weiterhin foreground-only: App-Wechsel/Sperre pausieren; Resume startet neuen Abschnitt. Keine fehlenden historischen GPS-Punkte rekonstruierbar. Dieser JS/TS-Fix benötigt keine neue native Funktion; Runtime/Production-Quellkontinuität separat durch Chat01 frisch prüfen. Keine Freigabe für andere Runtimes ableiten.

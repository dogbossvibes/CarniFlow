---
name: anyvo-mobile-test
description: Plant und führt ANYVO-Tests auf iOS-Simulator, Android-Emulator und echten Geräten durch — Umgebungscheck, Dev-Client, Smoke-Flows, Tracking-Feldtest-Protokoll und ehrliche Ergebnisdokumentation. Ohne EAS-Builds oder Releases.
---

# ANYVO Mobile-Testabläufe (iOS und Android)

Kein EAS-Build, keine OTA, kein Store-Schritt. Lokale native Builds
(`expo run:ios|android`) nur nach ausdrücklicher Freigabe, weil sie `ios/`/
`android/` verändern können.

## 1. Umgebung feststellen
`node scripts/claude/mobile-env-check.mjs` → welche Wege tatsächlich verfügbar sind.
Fehlende Werkzeuge nicht automatisch installieren; Lücke benennen.

## 2. Testebenen (immer von unten nach oben)
1. **Unit/Komponenten:** `npx jest --ci --findRelatedTests <dateien>`; vor Release `--full`
   über `node scripts/claude/quality-check.mjs --full`.
2. **Simulator/Emulator mit Dev-Client:**
   - Android: Emulator starten
     (`~/Library/Android/sdk/emulator/emulator -avd Anyvo_Phone_QA_20261021`),
     Dev-Client-APK muss installiert sein; dann `npx expo start --dev-client`.
   - iOS: benötigt Xcode + Simulator; Dev-Client-Build (development-simulator)
     muss installiert sein; dann `npx expo start --dev-client`. In der
     Claude-Desktop-App den iOS-Simulator-Bereich zum Zuschauen öffnen.
   - Netzwerk aus, App in Hintergrund/Vordergrund, Berechtigung verweigern,
     Dark Mode, grosse Schrift, VoiceOver/TalkBack-Labels prüfen.
3. **Echtes Gerät:** Pflicht für GPS, Hintergrund-Tracking, Live Activity,
   Widgets, Kamera/Audio, Käufe (Sandbox) und Performance.

## 3. Smoke-Flows (Auswahl nach Scope)
Anmeldung/Abmeldung · Hund anlegen/wechseln · Training starten/dokumentieren ·
Fährte legen + suchen (Start, Marker, Gegenstand, Ende, Auswertung) · Gesundheit/
Medikamente · Termine/Kalender · Dokumente/Medien hochladen · Trainer Connect ·
Abo-Paywall/Restore (Sandbox) · Offline-Erfassung → Sync nach Online.
Bestehende Kundendaten: Altformate laden/bearbeiten, keine Datenverluste.

## 4. Tracking-Feldtest-Protokoll
Gerät/OS, App-Build/OTA-ID, Datum, Ort/Untergrund, Wetter, GPS-Genauigkeit,
Dauer/Distanz, Hintergrund/Sperrbildschirm-Anteil, Unterbrechungen, Ergebnis
der Enderkennung/Analyse, Abweichungen mit Screenshot. Rohdaten nicht in Git.

## 5. Ergebnis
Tabelle Flow × Plattform × PASS/FAIL/NICHT AUSGEFÜHRT mit Beleg (Pfad,
Screenshot, Log-Auszug ohne personenbezogene Daten). Simulator-PASS nie als
Geräteabnahme ausgeben.

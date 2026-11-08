---
name: anyvo-feature
description: Implementiert abgegrenzte ANYVO-Features und Fehlerbehebungen nach Analyse des bestehenden React-Native-/Expo-Codes. Für konkrete Änderungsaufträge, nicht für reine Reviews.
---

# ANYVO Feature-Arbeit

Bearbeite den Nutzerauftrag im bestehenden Produkt. Beachte AGENTS.md.

## Analyse und Plan
Prüfe zuerst Git-Root, Branch, HEAD und vollständigen Status. Lies die
betroffenen Screens, Komponenten, Hooks, Services, Typen und Tests sowie
relevante Projektentscheidungen. Belege den Datenfluss von UI über State und
Persistenz bis Backend, soweit betroffen. Prüfe Paketversionen und passende
offizielle Dokumentation, bevor du APIs empfiehlst oder änderst.

Formuliere Ziel, erlaubten Scope, Nicht-Ziele und beobachtbare Akzeptanzkriterien.
Bei klarer kleiner Aufgabe genügt ein kurzer Plan; bei größerer Unsicherheit
zuerst eine kleine Spezifikation. Bereits beantwortete Fragen nicht wiederholen.
Routinemäßige lokale Änderungen im Auftrag direkt ausführen.

## Umsetzung
Vorhandene Architektur, Design-Tokens und UI-Komponenten wiederverwenden.
Keine parallele Datenquelle oder doppelte Geschäftslogik einführen.
Asynchrone Antworten dürfen nach Account-/Hundwechsel oder Unmount keinen
falschen Zustand überschreiben. Lade-, Leer-, Fehler- und Offline-Zustände
sowie erneute Versuche passend zum betroffenen Ablauf behandeln.
Bei Persistenzänderungen vorhandene Daten und Sync-Verhalten erhalten.
Bei UI Safe Areas, Tastatur, Android-Zurück, iOS-Gesten, Dark Mode und
Accessibility berücksichtigen. Nutzertexte in vorhandene Lokalisierung einfügen.

Kritische GPS-/Security-Aspekte anhand der passenden ANYVO-Review-Checkliste
prüfen, wenn der Scope sie betrifft; keine unnötige Vollprüfung der ganzen App.

## Verifikation
Verhaltensbezogene Tests für die konkrete Regression oder neue Logik ergänzen,
wenn sinnvoll. Vorhandene Typecheck-, Lint- und Testbefehle prüfen und passende
Checks ausführen. Abschließend Diff und git diff --check prüfen.
Benötigte native Geräte-/Feldtests konkret nennen, wenn nicht durchführbar.

## STOP und Ergebnis
Bei unvermeidbarer Überschreibung fremder Arbeit, unklarem Backend-Ziel oder
fehlender Freigabe für Remote-/Release-Aktionen den betroffenen Schritt stoppen.
Kein eigenständiges Commit, Push, Merge, Build oder Release.
Berichte Änderung und Nutzen, betroffene Dateien, ausgeführte Checks und offene
Abnahmepunkte. Historische Testergebnisse gelten nicht als neue Prüfung.

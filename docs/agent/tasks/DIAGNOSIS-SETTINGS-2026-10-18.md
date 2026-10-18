# Fährten-Diagnose: Standard und Vergleichstests

## Auftrag und Ausgangslage

Folgeauftrag der Nutzerin: Fährten-Diagnose anpassen und updaten; klären, ob Expo oder
Precision gewählt werden muss, nicht mehr benötigte Auswahl entfernen.
Fortführung im sauberen Worktree `anyvo-support-end-diagnostics`, Branch
`fix/support-end-diagnostics-ios105-motion`, Ausgangs-HEAD
`2ee256448fa8abbb6dbd5d2861813790be051dfd`.

Belegt in `qaPreferences.ts`: Standard ist current + precision, QA aus. Persistierte
Vergleichseinstellungen persönlich freigeschalteter Accounts können davon abweichen.
`positionSource.ts::startPositionSource` benötigt beide Pfade: Precision bevorzugt,
Expo als Fallback oder expliziter Vergleich. Daher kein Provider entfernt.

## Umsetzung

- Standard oder gespeicherter Vergleichstest im oberen Bereich klar benannt.
- Expo/Precision und Build-40/Current-Auswahl standardmäßig zugeklappt unter
  „Erweiterte Vergleichstests“; bewusst weiter verfügbar für Fehleranalyse.
- Bestehende Testauswahl wird beim Öffnen nicht geändert. Explizite Rückkehr zu
  current + precision über vorhandene, geschützte Setter; QA-Schalter bleibt erhalten.
- Laufende Lay- und Search-Streams blockieren den Wechsel weiterhin. Die Oberfläche
  bestätigt verweigerte Wechsel nicht fälschlich als für später vorgemerkt.
- Präferenzänderungen werden über vorhandene Subscription dargestellt; Cleanup bei
  Unmount, kein nachträgliches State-Update aus der Präferenz-Hydrierung.
- Veraltete Motion-/QA-Texte korrigiert: Motion startet in der aktuellen Engine auch
  ohne QA. Zusätzliche verfügbare Diagnosen werden lokal gespeichert.
- Keine Änderung an GPS, Filtern, Motion-Fusion, Winkel-/Gegenstands-/Enderkennung,
  nativen Modulen, Berechtigungen, Exportformat oder Zugangsregeln.

## Verifikation

41 verschiedene Tests in fünf Suites PASS: 5 gerenderte Screen-Tests,
4 Export-Verdrahtungstests und 32 vorhandene Tests zu Präferenzpersistenz,
aktiver Quellenanzeige und Expo-Vergleichspfad.

Initiale Testprobleme: Der erste Screen-Test überschritt beim kalten Transformieren
auf dem gemeinsam genutzten Rechner 5 Sekunden. Begrenztes Limit auf 20 Sekunden
angepasst. Fixture-Schreibqueue vor den Mount-Assertions vollständig geleert; kein
Produktionscode zur Testreparatur geändert. Finaler Screen-Lauf: 5/5, 3,486 Sekunden.
Ein vorbestehender Export-Test verlangte den Variablennamen `exported`; der Builder
liefert mittlerweile `base` vor der Anreicherung. Assertion prüft weiterhin die
exakte Builder-Funktion und dieselben Parameter, ohne lokalen Variablennamen.

TypeScript PASS. ESLint geänderte Dateien PASS (keine Fehler/Warnungen).
`git diff --check` PASS. Kein physischer Gerätetest; Interaktionen im RN-Test-Renderer.

Versionierte Expo-SDK-54-Dokumentation gelesen über den offiziellen sdk-54-Branch,
da docs.expo.dev/versions/v54.0.0 derzeit auf latest umleitet:
https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/location.mdx

## Release-Vorbereitung

Die Nutzerin hatte lokale Commits und die iOS-OTA für TestFlight Build 52 ausdrücklich
freigegeben und verlangt mit diesem Folgeauftrag das Anpassen und Updaten der Diagnose.
Keine Freigabe für Push, Merge, nativen Build oder Android-OTA.

Frischer lesender Preflight: production / iOS / Runtime 1.0.5-motion-v2, aktive Group
301e4fe5-b447-4c17-8bb6-d717b64a586c mit Commit 2ee2564. Ancestry PASS,
Production-Environment vorhanden, Lock frei. Vor Commit erwartungsgemäß wegen
Dirty-Worktree gesperrt. Veröffentlichung nur über unveränderten Production-Wrapper
mit erneutem Live-Check, Lock und Nachkontrolle.

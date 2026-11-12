# ANYVO – dezentes Feedback beim Antippen und Speichern

Stand: 1. November 2026, Europe/Zurich.
Auftrag: dezentes Feedback implementieren, bestehendes Design erhalten; danach
GitHub-Sicherung und Übergabe an „01 – RELEASES – iOS / Android / OTA / Stores“
für den bevorstehenden Wechsel zu Claude. Keine Veröffentlichung in diesem Chat.

## Quelle und Integration

- Repository: `dogbossvibes/CarniFlow`, App-Paket `anyvo` im verschachtelten Checkout.
- Lokaler Arbeitszweig: `feat/track-module-rewrite`.
- Geprüfte Ausgangsbasis: `67d400610469e48c6e94b467167fc74a5d642b48`.
- GitHub-Sicherungszweig: `codex/subtle-feedback-20261101-01a198ec`.
- Der Commit mit diesem Bericht enthält ausschließlich diesen Auftrag.
- Ausgangszweig war bereits fünf Commits vor seinem Remote-Tracking-Stand; der
  Sicherungszweig enthält diese Historie. Für aktuelle Release-Linien nur den
  einzelnen Feedback-Commit gezielt übernehmen/reviewen, nicht den alten
  Arbeitszweig pauschal zusammenführen. Kein Source-of-truth-Wechsel.
- Vorbestehende fremde Änderungen, Regeln, BMAD-Installation, Statusberichte,
  Website-Dateien und Bilder wurden nicht in diesen Commit aufgenommen.

## Umsetzung und Grenzen

- `AnimatedPressable`: dezente Standardskalierung auf 0,98 beim Drücken;
  Rückkehr ohne Überschwingen. Keine Bewegung bei disabled oder aktivierter
  Bewegungsreduktion, auch wenn dies während des Drückens umgeschaltet wird.
- `AnyvoButton` verwendet dieselbe vorhandene Komponente. Farben, Abmessungen,
  Schriften, Verläufe, Labels, Navigation und Speicherlogik bleiben erhalten.
- `Button` und `AnyvoButton`: Screenreader erhalten Label, Rolle, disabled/busy;
  vorhandene Ladeindikatoren und einmalige leichte Klick-Haptik bleiben erhalten.
- Neuer Hook `useReduceMotion`: bewegt sich erst nach bekannter Systemeinstellung,
  folgt Änderungen live, verwirft überholte Antworten und entfernt Listener.
- Dokument-Editor: Erfolgs-Haptik erst nach erfolgreichem Datei-Upload UND
  gespeichertem Dokumentdatensatz, vor bestehender Rücknavigation. Keine
  Erfolgs-Haptik bei Validierungs-/Upload-/Datenbankfehlern. Andere vorhandene
  Speicherbestätigungen bleiben erhalten; kein neues globales Erfolgssystem.
- Keine neuen Wischgesten, Vorschauen, Toast-Designs oder Draußen-Modi eingebaut.
- Keine Abhängigkeiten, Paket-/Runtime-Versionen, GPS-, Auth-, DB- oder
  Sync-Logik verändert. Testtypdeklarationen um tatsächlich verwendete
  Test-Renderer-Methoden ergänzt; keine neue Abhängigkeit.

## BMAD und Dokumentation

`AGENTS.md`, `docs/agent/BMAD.md`, relevante Status-/Entscheidungsdokumente,
`anyvo-feature` und `anyvo-abschluss` gelesen; kleinster direkter Feature-Ablauf,
kein neues PRD und keine erfundene Task-ID. React-Komponenten zusätzlich anhand
der React-Prüfliste geprüft. Keine Delegation und kein automatischer Release.
Versionen im Lockfile: Expo 54.0.36, React Native 0.81.5, Reanimated 4.1.7.
Die v54-Expo-URLs leiteten auf latest um; zur Versionsprüfung wurden zusätzlich
die offiziellen Expo-Quellen auf dem `sdk-54`-Zweig und die RN-0.81-API gelesen.

## Frisch ausgeführte Prüfungen

Alle folgenden Abschlussprüfungen erfolgreich:

- `npm run typecheck`.
- Gezieltes ESLint ohne Fehler oder Warnungen auf allen zehn geänderten/neuen
  Code-/Test-/Typdateien (Komponenten, Hook, Dokument-Editor, zugehörige Tests,
  `react-test-renderer.d.ts`).
- `npm test -- --runInBand components/ui/__tests__/AnyvoButton.test.tsx components/ui/__tests__/AnimatedPressable.test.tsx hooks/__tests__/useReduceMotion.test.tsx app/dog-document/__tests__/save-feedback.test.tsx lib/__tests__/haptics.test.ts`:
  fünf Suites, 25 Tests bestanden. Native Animation/Haptik sind gemockt.
- `git diff --check` und Whitespace-Prüfung der neuen Dateien.

## Noch vor Veröffentlichung prüfen

Keine iPhone-/Android-Geräteabnahme, kein nativer Build und kein Release erfolgt.
Auf beiden Plattformen Standard-/Sekundärtasten kurz/lange antippen, Finger
herausziehen, während des Drückens loading/disabled aktivieren und Systemoption
„Bewegung reduzieren“ live wechseln. Keine hängenbleibende Skalierung oder
Doppelauslösung. Dokument-Upload erfolgreich sowie offline/fehlgeschlagen prüfen;
bei Fehler keine Erfolgs-Haptik. Screenreader: Name und Lade-/Sperrzustand.

Die Änderung ist eine lokale UI-/JS-Anpassung; die tatsächliche OTA-Eignung
muss Release-Chat 01 auf jeder aktuellen Plattformlinie samt Runtime, Source-Diff,
Checks und bestehender Release-Freigabe frisch bestimmen. Keine Freigabe für
DB-Migrationen, OTA, Stores oder native Builds aus diesem Bericht ableiten.

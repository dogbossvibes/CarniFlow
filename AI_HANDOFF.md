# AI HANDOFF

## Projekt

ANYVO Mobile App

## Aktueller Arbeitsstand

Die bestehende Fährtenfunktion wurde additiv um Teilstrecken erweitert. Es wurde keine parallele Fährtenarchitektur und keine KI-/AI-Komponente ergänzt. Die neuen Daten hängen an der bestehenden Fährten-Session, am bestehenden Zustand und am dog_id-gekeyten Pending-Puffer.

## Zuletzt erledigt

- Abriss-Erkennung angepasst:
  - Abriss wird nicht mehr automatisch aus Halt-/Weiterlaufmustern erkannt.
  - Automatische Erkennung bleibt nur für Winkel und Spitzwinkel aktiv.
  - Im Legen-Screen gibt es einen manuellen Button `Abriss`.
  - Der manuelle Abriss setzt einen `winkel`-Marker mit `angleKind: 'abriss'` an der aktuellen Position.
  - Startanker und Start-Fähnchen bleiben unverändert automatisch.
- Zentrales Teilstrecken-Modell ergänzt: `features/tracking/utils/trackSegments.ts`.
- Unterstützte Typen:
  - `no_food` = Ohne Futter
  - `low_food` = Wenig Futter
  - `intensive_food` = Intensiv gefüttert
  - `distraction` = Verleitung
  - `surface_change` = Untergrundwechsel
  - `custom` = Eigene Teilstrecke
- Legen-Screen erweitert:
  - Button `Teilstrecke`
  - Bottom Sheet `Teilstrecke hinzufügen`
  - Schrittlänge Default 10, Minimum 1, Maximum 500
  - Custom-Label trimmt und validiert
  - Status `planned` mit 3-Schritte-Vorankündigung
  - automatischer Übergang `planned` -> `active`
  - automatisches Ende bei geplanter Schrittzahl
  - manuelles Beenden und Abbrechen
  - maximal eine `planned` oder `active` Teilstrecke pro Fährte
  - feste deutsche Sprachansagen über vorhandenes `expo-speech`
  - Haptik über vorhandene Haptik-Helfer
- Store/Persistenz erweitert:
  - `useTrackingStore` enthält `segments`
  - `PendingTrack` enthält optionale `segments`
  - alte Pending-Daten ohne `segments` funktionieren weiter (`[]` beim Restore)
  - dog_id-gekeyter Pending-Puffer bleibt die Quelle für offene Fährten
- Remote-Persistenz:
  - Teilstrecken werden in `training_sessions.track_data.segments` gespeichert
  - `saveTrackEvaluation` merged vorhandenes `track_data`, damit Segmente nicht durch Bewertung überschrieben werden
  - keine neue Tabelle und keine Migration erstellt
- Karte:
  - `TrackingMap` akzeptiert `segments`
  - gelegte Route wird in normale Abschnitte und abgeschlossene Teilstrecken geschnitten
  - Farben kommen aus bestehenden ANYVO Track-Theme-Tokens
- Liegezeit/Übersicht vor der Absuche:
  - Sektion `Teilstrecken`
  - sortiert nach `startStep`
  - kompakte Legende nur für verwendete Typen
- Absuche:
  - Snapshot enthält `segments`
  - Karte zeigt Teilstrecken weiter an
  - Suchansagen nutzen den vorhandenen Fortschritt entlang der gelegten Polyline (`progressM`)
  - lokale Flags verhindern doppelte Approach-/Start-/Endansagen pro Suchlauf
- Logbuch/Detail:
  - Logbuch zeigt `Teilstrecken: n`
  - Detailansicht zeigt Teilstrecken mit geplant/tatsächlich/status
  - neue regelbasierte Smart-Analyse-Hinweise ohne KI-Begriffe
- Tests ergänzt:
  - `features/tracking/utils/__tests__/trackSegments.test.ts`

## Aktuelle Aufgabe

Manuelle Simulatorprüfung mit realer App-Interaktion. Statusänderung gegenüber vorheriger Session:

- iOS: Blocker aufgelöst. Es ist jetzt ein gebooteter Simulator vorhanden (iPhone 16e, iOS 26.3). Die installierte App `com.anyvo.app` ist ein **Dev-Client** (EXDevLauncher/EXDevMenu vorhanden, kein eingebettetes Bundle), lädt also den aktuellen, uncommitteten JS-Code aus dem laufenden Metro (Port 8081).
- Android: Weiterhin blockiert. `adb` ist nicht installiert, kein Emulator erreichbar.

### iOS: real geprüft (App lief mit aktuellem Code)

App per `anyvo://expo-development-client/?url=http://localhost:8081` gestartet und per App-Scheme in die Fährten-Routen navigiert:

- Boot/Home rendert sauber → `artifacts/faehrten-teilstrecken/ios/01_boot_home.png`
- Fährten-Index (`anyvo://track`) rendert: aktive Fährte, Verlauf mit Winkel-Zählung, „Fährte lege", Logbuch, Insights → `02_faehrten_index.png`
- Legen-Screen (`anyvo://track/legen`) rendert die **neue Teilstrecken-UI live**: Bottom-Action-Leiste zeigt `Teilstrecke`, `Gegenstand`, `Abriss` (manueller Abriss aus dieser Aufgabe), `Pause`, `Stoppe & Liegeplatz`; GPS-Warmup/Precision-Debug funktioniert → `03_legen_teilstrecke_abriss_buttons.png`

Alle Screenshots sind echt aus dem laufenden Simulator (`xcrun simctl io ... screenshot`), nichts erfunden.

### iOS: nicht headless prüfbar

Koordinatengenaue Taps sind nicht möglich — `idb`/`fb-idb` ist nicht installiert, `simctl` hat kein Tap-Kommando. Damit nicht automatisiert prüfbar:

- Bottom-Sheet „Teilstrecke hinzufügen" öffnen und Schrittlänge/Custom-Label bedienen.
- Vollständiger GPS-Fahrt-Flow (planned→active→Ende), Sprachansagen, Haptik, Übergang zu Liegezeit/Absuche.

Diese Teile brauchen manuelle Interaktion mit GPS-Simulation am Simulator oder installiertes Tap-Tooling (`idb`).

## Noch offen

- iOS: Interaktiven Teilstrecken-Flow manuell durchspielen (Sheet öffnen, Schritte, Sprachansagen, Absuche) und ergänzende echte Screenshots ablegen. Optional `idb` installieren, um das zu automatisieren.
- Android: Emulator mit installiertem `adb` starten und denselben Flow prüfen, danach echte Screenshots in `artifacts/faehrten-teilstrecken/android/` ablegen.
- Bestehende ESLint-Warnungen in bereits geänderten Dateien können separat bereinigt werden; aktuell gibt es keine ESLint-Errors in den geprüften Dateien.

## Regeln

- Keine KI-/AI-Komponenten, Prompts, Texte, Services oder Abhängigkeiten ergänzen.
- Keine Änderungen an ANYVO Connect, RevenueCat, Trainer, Abos oder Hundearchitektur für diese Aufgabe.
- Keine parallele Fährtenarchitektur erstellen.
- Android und iOS gemeinsam berücksichtigen.
- Keine Datenbankänderung blind erstellen.
- Kein Commit.
- Kein Push.
- Keine Remote-Migration.

## Verifikation

- Expo SDK 54 Dokumentation vor Codeänderungen geprüft: `https://docs.expo.dev/versions/v54.0.0/`
- `npx tsc --noEmit` erfolgreich
- `npm test -- --runInBand` erfolgreich: 32 Suites, 322 Tests
- `npx eslint ...geänderte Fährten-Dateien...` erfolgreich ohne Errors, 19 bestehende Warnings
- `npx expo export --platform ios` erfolgreich, Export nach `dist`
- `npx expo export --platform android` erfolgreich, Export nach `dist`
- Nachgeprüft in dieser Session: `npx tsc --noEmit` Exit 0; `trackSegments.test.ts` 6/6 grün.
- iOS Simulatorprüfung teilweise erfolgt: App (Dev-Client) mit aktuellem Code gestartet, Fährten-Index und Legen-Screen mit neuer Teilstrecken-/Abriss-UI live bestätigt (3 echte Screenshots). Interaktiver GPS-Flow offen (kein Tap-Tooling).
- Android Emulatorprüfung weiterhin blockiert: `adb` nicht installiert

## Geänderte Dateien dieser Aufgabe

- `AI_HANDOFF.md`
- `app/track/[id].tsx`
- `app/track/historie.tsx`
- `app/track/legen.tsx`
- `app/track/liegen.tsx`
- `app/track/run.tsx`
- `features/tracking/components/TrackingMap.tsx`
- `features/tracking/hooks/useSearchRecorder.ts`
- `features/tracking/hooks/useTrackRecorder.ts`
- `features/tracking/services/trackService.ts`
- `features/tracking/store/trackPersist.ts`
- `features/tracking/store/trackingStore.ts`
- `features/tracking/utils/trackSegments.ts`
- `features/tracking/utils/__tests__/trackSegments.test.ts`

## Datenbank / RLS

- Keine Migration erstellt.
- Keine RLS geändert.
- Begründung: `training_sessions.track_data` existiert bereits als JSON-/Metadatenfeld und ist fachlich passend für Teilstrecken einer Fährten-Session. Die Änderung ist additiv (`track_data.segments`), alte Fährten ohne dieses Feld bleiben kompatibel.

## Wichtige Hinweise

- Gegenstände G1, G2 usw. und Winkel bleiben separat bestehen.
- Teilstrecken verändern keine Gegenstandsmaterialien.
- Abgebrochene Teilstrecken werden nicht in Karten-Segmente und Smart Analyse aufgenommen.
- Smart-Analyse-Texte wurden deterministisch implementiert und enthalten keine KI-/AI-Begriffe.

# ANYVO – Active Work

## Canonical
- Branch `main`
- Worktree `/Users/moyo/canisflow-worktrees/anyvo-main`
- Produktintegration `d807964e05ef26ddc807dc6664a06410d8c98778` (Tracking Phase 1, T-65, geprüft am 2026-10-08; T-64 enthalten); nachfolgende Doku-Commits separat, HEAD frisch per Git abfragen
- `main` = kanonische Code-/Production-Linie.
- EAS `production` != Git `main`; der tatsächlich live veröffentlichte Stand wird in EAS geprüft.
- Produkt-/Release-Gesamtstatus: `docs/agent/ANYVO_MASTER_STATUS.md`.

## Main rule
- Auf `main` wird nicht regulär entwickelt.
- `main` nur für Integration getesteter Arbeit, Release-Preflight, Production-/Release-Ausgangspunkt und abschließende Tests.
- Neue Features/Fixes in eigenen Worktrees.
- Single-writer-Regel: Nur ein Writer gleichzeitig darf `main` verändern.
- Bei unerwartetem Drift: HARD STOP. Nicht zurücksetzen; Zustand prüfen und dokumentieren.

## Current active worktrees
Konservativ aktuell nur im täglichen Workspace:

### 00 MAIN – Production Line
- Branch `main`
- Worktree `/Users/moyo/canisflow-worktrees/anyvo-main`
- Status `Canonical / Integration only`

### TRACKING – End Detection
- Branch: `fix/tracking-end-detection`
- Worktree: `/Users/moyo/canisflow-worktrees/anyvo-fix-tracking-end-detection`
- Status: `Phase 1 committed/integrated/published; device QA OPEN`
- ChatGPT: `02 – TRACKING`
- Codex terminal/session name: `TRACKING-END`

### TRACKING — GPS quality / Shelly diagnostics (separater Feature-Worktree)
- Branch: `feat/tracking-gps-quality-shelly-diagnostics`
- Worktree: `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-gps-quality-shelly`
- Basis: `d807964`; aktuell Feature-HEAD `7ed2962`, zusätzliche fremde Kotlin-Änderung uncommitted (2026-10-08 geprüft).
- Status: Feature nicht in main integriert; getrennte Shared-OTA-Auslieferung im neueren Release-Bericht dokumentiert, Geräte-/Hardware-QA OPEN. Siehe Status-Drift unten.
- Continuity bleibt unbeschlossene Produktvorlage. Keine neuen Distanz-/Score-/End-/Gap-Regeln.
- Separate Phase-1-Release-Snapshots sauber erhalten: `release/tracking-end-ios-104-2026-10-08@9453d5b` und `release/tracking-end-android-103-2026-10-08@122aee5`. Nicht nach main mergen.

## Planned next work
PLAN – keine angelegten oder freigegebenen Branches/Worktrees:
- Tracking UI: Marker Collision Winkel/Gegenstand/Ende
- Tracking Continuity/Gaps: BLOCKED bis explizite Continuity-Semantik beschlossen
- Android: T-64 Native-Vorbereitung 1.0.4 (45) in main integriert; nativer Build und interner Play-Test separat freizugeben, Geräte-QA OPEN

## Worktree naming
- Feature: `anyvo-feature-<topic>` / `feat/<topic>`
- Fix: `anyvo-fix-<topic>` / `fix/<topic>`
- Native iOS nur wenn wirklich iOS-spezifisch: `anyvo-ios-<topic>` / `fix/ios-<topic>`
- Native Android nur wenn wirklich Android-spezifisch: `anyvo-android-<topic>` / `fix/android-<topic>`
- Release temporär: `anyvo-release-ios-<version>` / `release/ios-<version>` bzw. `anyvo-release-android-<version>` / `release/android-<version>`

## Tatsächliche Chat-Zuordnung (geprüft 2026-10-08)

Alle folgenden Fachchats sind bestehende lokale Codex-Chats. Ihr gemeldetes cwd ist
`/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47`,
**nicht** automatisch der Code-Worktree. Keine synced Dateien unter `sources/` ändern.
Host `local`; Status vor jedem Auftrag frisch prüfen. Beim Abgleich war nur der
MASTER aktiv, die Fachchats idle/notLoaded; das ist kein Nachweis, dass jeder
Terminal-Writer beendet ist. Code-Worktree und Single-writer-Zuständigkeit gesondert prüfen.

| Bestehender Chat (exakter Titel) | Chat-ID | Zuständigkeit |
|---|---|---|
| 00 – ANYVO MAIN MASTER – Status & Entscheidungen | `01a117fa-04b7-7992-a485-cfdeca7fcfa6` | Koordination, Gesamtstatus, Entscheidungen |
| 01 – RELEASES – iOS / Android / OTA / Stores | `01a117fa-4be0-7c43-b1b5-01701e7c7626` | Release-/Paritäts-Preflight, EAS, Stores |
| 02 – TRACKING – GPS / Fährten / Analyse | `01a117fa-855c-7071-a85d-b4202d6711f6` | Tracking, End Detection, GPS/Shelly |
| 03 – iOS NATIVE | `01a117fb-998d-70e1-a886-e1b50b1c325d` | Swift, Widgets, Live Activity, App Intents |
| 04 – ANDROID NATIVE | `01a117fc-01e4-7f80-a24f-b2598e108f77` | Android-Config, Services, GNSS, Widget |
| 05 – BACKEND / DB / SECURITY | `01a117fc-8d37-7e13-9c5d-c83e1e1e3eaf` | Supabase, RLS, Auth, Migrationen |
| 06 – ABO / MEMBERSHIP / MONETARISIERUNG | `01a117fc-d132-7632-ba53-9b9a60d19391` | Abos, RevenueCat, Trial, Quotas |
| 07 – UI / UX / APP-STRUKTUR | `01a117fd-6000-78f0-ba54-7d944ee29fb5` | Screens, Navigation, Accessibility |
| 08 – PRODUKT / ROADMAP | `01a117fd-e20b-7c20-ac9e-9ba1ab30001e` | Produktentscheidungen, Prioritäten |
| 09 – WEBSITE / MARKETING | `01a117fe-356b-7fa2-b1f3-1263894547d1` | Website, Store-Material, Marketing |

### Verifizierte Code-Worktree-Zuordnungen

- MASTER: `/Users/moyo/canisflow-worktrees/anyvo-main`, `main`,
  Ausgangs-HEAD dieses Doku-Auftrags `153c0aa35c10b485ba584419f5c5e3fa57af2457`, sauber.
- TRACKING End Detection: `/Users/moyo/canisflow-worktrees/anyvo-fix-tracking-end-detection`,
  `fix/tracking-end-detection@9a926a7`, sauber, Feature in main enthalten.
  Ausführungs-Chat `Prüfe Enderkennung und Gegenstand`, ID
  `01a1182d-ca98-7601-9300-09afd06a4804`; keine zweite Umsetzung starten.
- TRACKING GPS/Shelly: `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-gps-quality-shelly`,
  `feat/tracking-gps-quality-shelly-diagnostics@7ed2962`, nicht in main enthalten;
  zusätzliche fremde Kotlin-Änderung vorhanden und geschützt.
- ANDROID Native-Vorbereitung: Projektspiegel-Unterordner `anyvo-android-native-1.0.4`,
  `fix/android-native-build-preparation-1.0.4@2316e7c`, sauber, in main enthalten.
- ANDROID Widget: Projektspiegel-Unterordner `anyvo-android-widget`,
  `feat/android-quick-start-widget@bd94ff2`, fremde uncommittete Config-/Plugin-/Test-/
  Report-Dateien. Abschlussbericht im Chat 04 vorhanden; Umsetzung nicht neu beauftragen.
- RELEASES: `/Users/moyo/canisflow-worktrees/anyvo-release-tracking-end-ios-104-2026-10-08`
  (`release/tracking-end-ios-104-2026-10-08@9453d5b`) und
  `/Users/moyo/canisflow-worktrees/anyvo-release-tracking-end-android-103-2026-10-08`
  (`release/tracking-end-android-103-2026-10-08@122aee5`), beide sauber.
  Runtime-spezifische Snapshots, nicht nach main mergen.
- Für Chats 03 und 05–09 ist hier kein aktueller exklusiver Code-Worktree belegt.
  Vor einer Schreibaufgabe ermitteln; keinen Pfad aus dem Chattitel ableiten.

### Aktive Aufgaben: Scope, Nachweise und nächste Phase (2026-10-08)

Die folgenden Koordinationskennungen sind eindeutige Referenzen **innerhalb dieser
bestehenden Übersicht**, keine neu vergebenen T-IDs. T-65-Kollisionen bleiben in
fremden Berichten erhalten. Alle Arbeitsorte wurden frisch per Git geprüft.
Nutzerfreigaben für frühere Umsetzung/Auslieferung sind in Berichten dokumentiert;
vor einem neuen schreibenden Auftrag direkte Nutzeranweisung im jeweiligen Chat
lesen. Keine frühere Freigabe als pauschale Fortsetzungs-/Release-Erlaubnis auslegen.
Der aktuelle Einrichtungsauftrag autorisiert nur Dokumentation und read-only Probelauf.

- **TRACKING-PHASE1 / T-65 (main):** verantwortlich Chat 02,
  `01a117fa-855c-7071-a85d-b4202d6711f6`; ausführender End-Detection-Chat/Worktree oben.
  Ziel/Scope: End-/Gegenstandsübergänge, Grace, Run-/Voice-Isolation; Abnahme nach
  [T-65](tasks/T-65.md), einschließlich echter Geräteprüfung. Implementiert/geprüft/
  integriert (`d807964`); getrennte OTAs im Bericht belegt, Geräte-/Feld-QA OPEN.
  Berichtet: 213 Suites/2611 Tests auf integriertem main, je Release 8/103;
  keine erneute Testausführung hier. Nächste Phase: Geräteprüfung am exakten Binary/OTA.
  Frühere Phase-1-Integration/OTAs dokumentiert freigegeben und erledigt; keine neue
  Veröffentlichung oder Build-Aktion durch diesen Auftrag freigegeben.
- **TRACKING-GPS-SHELLY:** verantwortlich Chat 02 (ID oben), Release-Zuständigkeit
  Chat 01 `01a117fa-4be0-7c43-b1b5-01701e7c7626`. Feature-Worktree `7ed2962` oben,
  zusätzliche fremde Kotlin-Änderung; Scope: Qualitätserhaltung und interne
  Shelly-Vordergrunddiagnose, keine Markersteuerung oder neue Continuity-Regeln.
  Abnahme: bestehender Feature-/Releasebericht und Geräte-/Hardwarebeleg; Releasebeleg
  im Abschnitt unten. Shared-OTAs dokumentiert, Feature nicht in main integriert,
  neue Android-native Felder nicht durch OTA ausgeliefert. Nächste Phase: getrennte
  Review/Integrationsentscheidung und passendes Binary/Hardware-QA. Keine zusätzliche
  Schreib-/Build-Freigabe aus der abgeschlossenen OTA-Aktion ableiten.
- **ANDROID-NATIVE / T-64:** verantwortlich Chat 04,
  `01a117fc-01e4-7f80-a24f-b2598e108f77`; Worktree/Commit `2316e7c` oben, in main.
  Scope: 1.0.4 (45), optionales BLE, Patch-Verifikation; Abnahme und 4 Suites/32 Tests
  im [T-64-Bericht](tasks/T-64.md). Umsetzung/Prüfung/Integration belegt, Build und
  Geräte-QA OPEN. Nächste Phase: frischer Versions-/Environment-Preflight; nativer
  Build benötigt eigene Freigabe. Widget/GPS-native Kandidaten vor gemeinsamem
  Build-Scope prüfen, keine stillschweigende Integration.
- **ANDROID-WIDGET / T-65 (Widget-Worktree):** verantwortlich Chat 04 (ID oben).
  Worktree `anyvo-android-widget`, Branch `feat/android-quick-start-widget`,
  Ausgangs-HEAD `bd94ff2`; Änderungen uncommitted, fremd. Scope: Quick-Start-Widget
  mit kleinen/großen Ansichten, vier Sprachen, bestehende Routenziele. Abnahme im
  [Widget-Bericht](/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-android-widget/docs/agent/tasks/T-65.md).
  Bericht: 31 Tests, Typecheck/Lint, isolierte native Kompilierung/Emulator PASS;
  vollständiges Binary-/Launcher-Geräte-QA OPEN. Umsetzung beauftragt und berichtet
  abgeschlossen; keine Freigabe für Commit/Integration/Build/Release übernommen.
  Nächste Phase: ID-Kollision klären, Review/Integration separat abstimmen; neuer
  nativer Build erforderlich. Überschneidung app.json mit Native-/Release-Arbeit.
- **IOS-QA / T-65 (QA-Worktree):** verantwortlich Chat 01,
  `01a117fa-4be0-7c43-b1b5-01701e7c7626`. Arbeitsort
  `/Users/moyo/canisflow-worktrees/anyvo-ios-qa-104`, Branch `release/ios-qa-104`,
  HEAD `bd94ff2e7e1f849eaccdfb33c3800f84fc50ff0f`;
  app.json/eas.json und eigener Bericht uncommitted, fremd.
  [Bericht](/Users/moyo/canisflow-worktrees/anyvo-ios-qa-104/docs/agent/tasks/T-65.md):
  separater QA-Channel, Kandidat Build 50, Config strukturell geprüft; kein Build/Upload.
  Abnahme: konkrete Binary-/Channel-Identität und Geräte-/Feldtests. Vor Fortsetzung
  ältere Basis mit inzwischen veröffentlichten Features abgleichen und höchste
  Buildnummer frisch prüfen. QA-Build/TestFlight-Upload weiterhin separat freizugeben.
  Keine Production-Channel-Umbiegung. Überschneidung app.json/eas.json mit Release-Arbeit.

Gemeinsame DB-Abhängigkeit für diese Koordinationsprüfung: keine DB-Aktion erforderlich.
Automatisierte Tests in Berichten sind historische Belege, keine Geräte-/Feldabnahme.
Geplante Marker-/Continuity-Ideen bleiben geplant beziehungsweise entscheidungsblockiert.
Read-only Probelauf: Chat 01, Turn `01a11b6d-2e1b-7363-b288-da3eca905645`,
08.10.2026 14:11 Europe/Zurich; Weiterleitung/Ergebnisabholung PASS, Regeln/Beleg in README.

### Offene Koordinationsvoraussetzungen

- Task-ID-Kollision: main `tasks/T-65.md` = Tracking Phase 1; Android-Widget-Worktree
  `tasks/T-65.md` = Widget; iOS-QA-Worktree `tasks/T-65.md` = QA-Auslieferungsweg. Vor neuer ID-Vergabe Ledger und alle betroffenen Berichte
  abstimmen. Bis dahin Scope + Chat-ID + absoluter Berichtspfad zur Unterscheidung;
  keine fremde Umbenennung und keine pauschale Integration.
- Status-Drift abgeglichen: ältere main-Master-/Plattformabschnitte beschreiben
  GPS/Shelly noch als lokal/nicht veröffentlicht. Der neuere datierte Beleg wurde
  in beiden bestehenden Dateien als DOKUMENTIERT ergänzt. Quelle: Chat 01 und
  `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/outputs/GPS-SHELLY-OTA-RELEASE-2026-10-08.txt`
  dokumentiert getrennte OTAs. Das ist ein datierter belegter Bericht, keine frische
  EAS-Abfrage in diesem Doku-Auftrag. Vor nächster Release-Aktion live read-only
  abgleichen; weitere Statuspflege nur durch den abgestimmten Writer.
- Hauptablauf: `README.md`, Abschnitt „Zentrale Koordination“. Für jeden Auftrag
  Verantwortlichen, Scope/Abhängigkeiten und nächste fehlende Phase im bestehenden
  Task-Bericht festhalten; keine zusätzliche Statusliste erstellen.

## Important
- `feat/track-module-rewrite` ist keine Production Source of Truth.
- Historische Worktrees nicht löschen, solange sie nicht separat geprüft und freigegeben wurden.


### WEBSITE-SCREENSHOTS-PLAY — 2026-10-08

- Nutzerauftrag: zehn neue iOS-App-Store-Screenshots auf der Website ergänzen,
  Google-Play-Link und Android-Verfügbarkeit anzeigen.
- Bestehender ausführender Chat: `Bearbeite statische ANYVO-Website`,
  `01a0bd5a-0d05-7e52-b0b8-d24fc3354a36`, Host `local`; keine zweite Umsetzung
  in Chat 09. Quelle `/Users/moyo/canisflow/canisflow/legal-web`, Branch
  `feat/track-module-rewrite@67d400610469e48c6e94b467167fc74a5d642b48`.
  Website-WIP liegt außerhalb main und ist nicht automatisch integriert.
- Umsetzung lokal abgeschlossen: Galerie mit zehn vollständig dargestellten,
  als iOS gekennzeichneten Motiven; Android-Verfügbarkeitstext; fünf aktive Links
  auf `https://play.google.com/store/apps/details?id=com.anyvo.app`.
  Vier bestehende Website-Dateien angepasst und zehn PNGs hinzugefügt.
  `auth/confirmed.html` war bereits korrekt und wurde nicht neu geändert.
- Belege: Abschluss-Turn `01a11b7f-04b6-7030-89db-9b636009c902` und read-only
  Nachweis-Turn `01a11b85-f25c-7e72-97ae-5252460a9ac2` im ausführenden Chat.
  Berichtet: zehn Originalkopien byte-identisch, zehn lokale Asset-URLs HTTP 200,
  Desktop/Mobile ohne horizontalen Overflow; Play-Seite HTTP 200 mit Titel
  `ANYVO - Apps on Google Play` und Paket `com.anyvo.app`.
  MASTER hat Dateien, Galeriezuordnung, Android-Text, Working Tree und
  `git diff --check -- legal-web` unabhängig geprüft. Bestehendes favicon-404
  außerhalb Scope; keine App-/Native-/DB-Auswirkung.
- Offen: main-Integration/Versionierung und Veröffentlichung separat.
  Öffentliche Website laut frischem Fachchat-Beleg weiterhin alter Stand
  mit „Bald verfügbar“, keine neuen Motive. Bestehendes Vercel-Projekt
  `anyvo-website`, ID `prj_eQeOKTALP8BPGQbQBgEwNlLQgqJq`, vom Fachchat bestätigt.
- Nächster Schritt: gezielte Website-Deploy-Freigabe für den reviewten Inhalt;
  vor Deploy Projekt/Quelle/Domain und protected Website-WIP frisch abgleichen,
  anschließend Live-QA. Kein Commit, Push, Merge oder Deploy freigegeben/ausgeführt.

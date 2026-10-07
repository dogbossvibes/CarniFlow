# ANYVO – Platform Status

Stand: **2026-10-07 (Europe/Zurich)**. Kanonische Übersicht für Code-, Native- und Release-Parität; Produkt-/Arbeitsgesamtstatus bleibt [ANYVO_MASTER_STATUS.md](ANYVO_MASTER_STATUS.md).

- Git `main` ist die kanonische Code-Linie für die gesamte ANYVO-App (Hundeverwaltung und Alltag, Training/Tracking, Gesundheit, Dokumente, Termine, Medien und Trainer Connect).
- Native Store-Builds und OTA-Bundles können zeitweise hinter `main` liegen.
- EAS Branch/Channel `production` != Git `main`. EAS belegt veröffentlichte OTA-Bundles; Store-Konsolen belegen Store-Freigabe und Rollout; Device QA belegt tatsächliches Geräteverhalten.
- Code-, Native- und Release-Parität werden getrennt dokumentiert. Plattformbezogene Funktionen müssen nicht identisch aussehen.

**Verifikationsgrenze:** In dieser Prüfung wurden nur lokales Git, Config und Repo-Dokumentation gelesen. Kein frischer Remote-, EAS-, Store- oder Geräteabruf. `LOKAL VERIFIZIERT` = hier direkt geprüft; `DOKUMENTIERT` = lokaler Bericht mit Datum, hier nicht unabhängig erneut geprüft; `UNKNOWN` = kein ausreichender aktueller Beleg; `OPEN` = ausstehende Prüfung/Arbeit; `BLOCKED` = explizite Voraussetzung fehlt. Dokumentierte Releases sind immer **nicht frisch verifiziert**.

## Canonical Git

| Feld | Stand / Beleg |
|---|---|
| Branch | `main` — LOKAL VERIFIZIERT |
| Worktree | `/Users/moyo/canisflow-worktrees/anyvo-main` — LOKAL VERIFIZIERT |
| HEAD | `41e51734053fbc9c04c5de527edd6bf464cce66e` — LOKAL VERIFIZIERT |
| Working tree vor Erstellung | Nur `?? docs/agent/ACTIVE_WORK.md`; vorhandene fremde Doku, unverändert erhalten |
| Lokaler Remote-Tracking-Ref | `origin/main` = obiger HEAD, lokal 0 ahead / 0 behind |
| Tatsächlicher Remote-Stand | **UNKNOWN / nicht frisch verifiziert**; kein Fetch oder Remote-Abruf. Der lokale Ref beweist keinen aktuellen Serverstand |
| Doku-Drift | Master-Status nennt einige Integrationen noch als ausstehend und `main` noch als ungepusht. Tatsächliches lokales Git enthält Search-, Maßstab-, Heat- und Hygiene-Integration; der Remote-Tracking-Ref ist gleichauf. Ältere Doku ersetzt diesen Git-Beleg nicht |

## iOS

### App / Native

| Feld | Stand / Beleg |
|---|---|
| Aktuelle Repo-Config | App-Version `1.0.4`, buildNumber `49`, Bundle ID `com.anyvo.app` — [app.json](../../app.json), LOKAL VERIFIZIERT |
| Runtime-Config | `runtimeVersion.policy = appVersion`; Ziel gemäß App-Version `1.0.4` |
| Letzter dokumentierter nativer Build | `1.0.4 (49)`, Runtime `1.0.4`; EAS Build `994f04ba-0e1e-4cba-9888-79059a225213`, SUCCESS — Master-Status, 2026-10-06 |
| Native Source-Commit | `3f7c2e746fd064d1b103aa67f926c514a52eed44` — Build-Zuordnung DOKUMENTIERT; Commit lokal vorhanden |
| App Store Connect | Upload SUCCESS, Submission `02ea21d2-1804-4dcd-97a0-7b5c42dc7a92` — DOKUMENTIERT, 2026-10-06 |
| Aktueller App-Store-Status | **UNKNOWN / nicht frisch verifiziert**. Master-Status dokumentiert Build 49 als noch nicht veröffentlicht; Auftrag nennt Veröffentlichung nur als zu prüfenden Hinweis. Kein lokaler neuerer Freigabebeleg gefunden |
| Älterer Store-Stand | `1.0.3 (48)` mit Runtime `1.0.3` — Master-Status; heute nicht erneut geprüft |
| Native Funktionen Build 49 | Live Activity V2, Dynamic Island, Multi-Dog-Ruheaktivitäten, Schnellstart-Widget, App Intents/App Shortcuts (de/fr/it), Prebuild-Härtung — DOKUMENTIERT |

### OTA

Alle folgenden Stände: EAS Branch/Channel `production`; hier nicht frisch abgefragt.

| Runtime | Zuletzt dokumentierte Group / Commit | Beleg / Inhalt |
|---|---|---|
| `1.0.4` | `79175057-4da7-4314-bf7f-ae7f0ccd738b` / `fd0c727a4d252e531dc95ad9592040265cf12418` | Master-Status + TASKS, 2026-10-07: Guard/Post-check PASS dokumentiert; Background Lay bei ausgeschaltetem Bildschirm, sessiongebundene Verarbeitung/Persistenz |
| `1.0.4`, vorherige OTA | `fcd879d9-b307-4cac-87e8-2a90f3d7f727` / `04cad8da58c7b86ee0b808d0e01964e3341cca2a` | Master-Status, 2026-10-06: adaptiver Fährtenmaßstab, Live-Distanz, Distanz zum nächsten Gegenstand; in obiger OTA enthalten |
| `1.0.3` | `455dc249-fb4f-4868-a646-67d88c1ae7cb` / `968884f712544f45b35ebf8900ab64332b45ff7d` | Veröffentlichung 2026-10-05, EAS-Prüfung 2026-10-06 / unverändert laut Snapshot 2026-10-07; Recovery, Ruhe-UX, Hold-to-abort, Multi-Dog-Overlays/Farben; Live Activity V2 JS mit V1-Fallback im älteren Binary |

**OPEN:** Frischer EAS-Abgleich und Geräte-Update-ID. Die dokumentierte 1.0.4-OTA liegt vor den neuen `main`-Commits für Subscription-Matching (`3979246`), Accuracy-aware Search (`6b103c1`) und zuverlässige Maßstabdarstellung (`f74ec87`). Deren iOS-Auslieferung ist hier nicht belegt.

### QA

- **DOKUMENTIERT PASS, 2026-10-06:** Owner-Gerät mit 1.0.4 (49) + Maßstab-OTA: Widget, Live Activity V2, Dynamic Island, Fährtenmaßstab.
- **DOKUMENTIERT PASS, 2026-10-07:** Background Lay, Screen-off/Hosentasche auf Hotfix-Stand vor Integration.
- **OPEN:** Post-OTA-Smoke auf Build 49 (Screen-off, Session-Zuordnung, Persistenz, Resume); Geräteprüfung der späteren Shared-Code-Integrationen. Kein frischer QA-Lauf in dieser Aufgabe.

## Android

### App / Native

| Feld | Stand / Beleg |
|---|---|
| Aktuelle Repo-Config | App-Version `1.0.4`, versionCode **`40`**, Package `com.anyvo.app` — app.json, LOKAL VERIFIZIERT; kein Beleg für ein veröffentlichtes 1.0.4-Binary |
| Runtime-Config | Policy `appVersion`; Repo-Ziel `1.0.4`, dokumentierte installierte Production-Linie `1.0.3` |
| Letzter bekannter nativer Play-Build | **44**, Runtime `1.0.3` — [DEVELOPMENT_WORKFLOW.md §8](../DEVELOPMENT_WORKFLOW.md); aktueller Store-versionCode laut T-63 nicht unabhängig geprüft |
| Native Source-Commit | `5a0610b6afc40625c768e5930e6c67fa4e25c6f2` — Workflow nennt Build 44 / Build-ID-Präfix `c2b7ef45` / `5a0610b`; voller Commit lokal aufgelöst. Zuordnung nicht frisch aus EAS geprüft |
| Historische Source-Config | `5a0610b:app.json` nennt Version `1.0.3`, versionCode `40`; dies ist **kein** Nachweis des tatsächlichen Binary-versionCode. Abweichung zur dokumentierten 44 muss im Build-Preflight geklärt werden |
| Aktueller Play-Status | **UNKNOWN / nicht frisch verifiziert**. T-63 vom 2026-10-07: Veröffentlichung owner-reported; genaue Version, Rollout, Länder und Policy-Status nicht unabhängig geprüft (Console-Login blockiert) |
| Native Config auf main | Background Location + Location-Foreground-Service aktiviert; BLE-Plugin, Motion/Sensor-Abhängigkeiten und Manifest-Cleanup vorhanden. Config/Paketbestand belegt nicht deren Funktion im installierten Binary |
| Native Parität | **OPEN**: älterer dokumentierter Binary-Source-Stand; kein neuer nativer Build durch T-63. Aktuelle native Abhängigkeiten, Permissions, Services und Verhalten gegenüber Build 44 separat abgleichen; iOS-Widget/Live-Activity-Funktionen nicht als Android-Funktion voraussetzen |

EAS-Config: `appVersionSource = local`, Production `autoIncrement = false` — [eas.json](../../eas.json). Vor einem später ausdrücklich beauftragten Build muss versionCode über dem dann frisch geprüften höchsten relevanten Play-/Build-Wert liegen; bei bestätigter 44 also **> 44**. Config hier nicht geändert.

### OTA

| Feld | Zuletzt dokumentierter Stand |
|---|---|
| Plattform / Runtime | Android / `1.0.3` |
| Channel / EAS Branch / Environment | `production` / `production` / `production` |
| Group | `168ae23f-676f-455c-8f15-bb475910d83e` |
| Commit | `e88371dc49233853162e87d8114c9f9d38a112d9` |
| Android Update ID | `01a117b7-e024-7a59-9d60-ade29e2b6b01` |
| Inhalt | Subscription-/Base-Plan-ID-Matching in Paywall, Membership, Trial und Restore; veralteten CHF9-Preisfallback entfernt |
| Verifikation | **DOKUMENTIERT, 2026-10-07**, [T-63](tasks/T-63.md): Guard-Publish/Post-check und Bundle-Prüfung PASS; hier nicht unabhängig erneut geprüft |
| Vorherige OTA | Group `917f8312-8085-4d9a-ba64-d3f8972a9d21`, Commit `68b23f186ca0f527dc04cf7426d80736d74a7ff2` — T-63 |

T-63 bewahrt den bestehenden Android-1.0.3-Bundle-/Config-Stand und übernimmt gezielt den Subscription-Fix. Das ist **keine vollständige Auslieferung des aktuellen main**. Der releasebezogene Runtime-Snapshot darf laut T-63 nicht in main integriert werden. Historischer Parity-Commit `1d473a4fbea723dfc272cd1bd8de0e7267f071a1` ist lokal vorhanden; sein Name beweist keine heutige Parität.

### QA

- **DOKUMENTIERT, T-63 / 2026-10-07:** automatisierte Release-Prüfungen, Android-Export und Bundle-/Publish-Prüfung bestanden. Kein Ersatz für Geräteabnahme.
- **OPEN:** Store-Preise, aktive Kaufbuttons, Google-Kaufsheet, Lizenz-Testkauf/Restore und tatsächlicher Active-/Trainer-Zugang.
- Letzter belastbarer Geräte-QA-Beleg für den oben dokumentierten Android-Release: **UNKNOWN**. Tracking mit Screen-off, Resume, schlechter Verbindung und Permissions auf Android gesondert prüfen.

## Shared Code Parity

| Bereich | Code auf main | Auslieferung / Paritätsstatus |
|---|---|---|
| Shared JS/TS | Gemeinsame kanonische Linie; Background Lay `fd0c727`, Accuracy-aware Search `6b103c1`, Maßstab-Fix `f74ec87`, Subscription-Matching `3979246` lokal enthalten | **OPEN**: unterschiedliche dokumentierte OTA-Commits; aktueller main nicht als auf beiden Plattformen ausgeliefert belegt |
| iOS native parity | Native iOS-Erweiterungen im Repo; Build 49 dokumentiert | Widget/Live Activity/Shortcuts Device PASS dokumentiert; Store-Rollout UNKNOWN |
| Android native parity | Aktuelle Config vorhanden | **OPEN**: dokumentiertes älteres Binary; vollständiger Native-Diff und neuer Build-Preflight nötig |
| Subscription parity | Matching-Fix auf main | Android OTA dokumentiert, Geräteabnahme OPEN; iOS-Auslieferung des Fixes nicht belegt |
| Tracking parity | Background-Lay- und Search-/Scale-Fixes auf main | iOS Background-Lay-OTA dokumentiert; aktuelle gemeinsame Feld-/Geräteparität **OPEN** |
| Runtime parity | Repo-Ziel `1.0.4` für beide | Dokumentiert: iOS `1.0.3` + `1.0.4`, Android `1.0.3`; Runtime-Parität nicht hergestellt |
| Release parity | Release-Ausgangspunkt main | Native-/OTA-/Store-Stände getrennt; gleiche Source-Version und gleichwertiger QA-Stand nicht belegt |

## Known Gaps

- **Android Native — OPEN:** Build-44-Linie hinter aktuellem main; neuer Build-Preflight und versionCode-Korrektur erforderlich. Kein einzelnes fehlendes natives Modul ohne Binary-Abgleich behauptet.
- **Runtimes — OPEN:** unterschiedliche dokumentierte installierte Runtimes; Repo-1.0.4 darf nicht mit Android-Store-1.0.3 verwechselt werden.
- **Release-Belege — OPEN:** iOS Build-49-Storestatus widersprüchlich zum Auftragshinweis; Android Store-versionCode/Rollout unbekannt; alle Live-Stände frisch prüfen.
- **Heat schema restore — DB-Thema:** Migration und Test auf main in `9417ec04d60bfdae1f34e5a0319779a1d9c6b993`; Commit dokumentiert Schema-Leseprüfung vom 2026-10-06 und keine Ausführung der Migration. Keine Plattformparitätslücke und keine DB-Write-Freigabe; aktueller DB-Zustand hier nicht geprüft.
- **End Detection — OPEN:** [ACTIVE_WORK.md](ACTIVE_WORK.md) nennt `fix/tracking-end-detection`, Analyse/Implementierung ausstehend; bestehende V6.2-Endkorrekturen ersetzen die offene Feldverifikation nicht.
- **Marker Collision — OPEN / geplant:** Winkel/Gegenstand/Ende gemäß ACTIVE_WORK.md; kein Abschlussbeleg.
- **Continuity/Gaps — BLOCKED:** ACTIVE_WORK.md und Master-Status Phase 3: zuerst explizite Continuity-Semantik; kein automatisches Schließen/Verbinden von Lücken. Getrennt von der früheren Production-Bundle-Continuity-Wiederherstellung.
- **Accuracy propagation audit — OPEN (Statusprüfung):** Auftrag nennt möglichen Folgeaudit; in den geprüften lokalen Dokumenten kein eigenständiger aktueller Abschluss-/Scope-Beleg gefunden. Accuracy-aware Search ist bereits integriert; daraus folgt kein vollständiger Propagation-Audit-PASS.

## Next Parity Actions

Diese Reihenfolge ist Planung, keine Freigabe für Push, OTA, Build, Store-Release oder DB-Aktion.

1. Remote-main sowie EAS-Groups je Plattform/Runtime und Store-Builds **read-only frisch verifizieren**; Doku-Widersprüche anhand dieser Belege auflösen. Ein Push ist nur bei belegtem Bedarf und ausdrücklichem Auftrag zulässig.
2. iOS-1.0.4-OTA-Preflight von aktuellem main für die späteren Shared-JS/TS-Änderungen: frische Runtime-Baseline, vollständige Feature-Erhaltung, Ancestry, Environment und Native-Kompatibilität prüfen. Veröffentlichung separat freigeben.
3. Android Native-Preflight von aktuellem main: tatsächlichen Play-/EAS-versionCode feststellen, höhere Buildnummer vorbereiten, Native-Diff/Permissions/Services und Runtime-Wechsel prüfen; aktuelle Android-Production-Funktionen erhalten. Build/Release separat beauftragen.
4. Geräte-QA auf beiden Plattformen: Subscription-Kauf/Restore, Tracking/Lay/Search, Screen-off, App-Wechsel/Resume, Offline/Persistenz sowie zentrale Hunde-/Alltagsfunktionen. Ergebnisse an konkrete Binary-/OTA-IDs und Source-Commits binden.

## Update Rule

Diese Übersicht bei neuem nativen iOS-/Android-Build, OTA, Store-Release, Runtime-Wechsel, plattformspezifischer nativer Änderung und relevanter Shared-Code-Integration aktualisieren.

Immer Datum, Plattform/Runtime, Source-Commit, Build-/Group-ID, Belegquelle und Verifikationsart erfassen. Repo-Config, gebauten Binary-Stand, veröffentlichtes Bundle, Store-Rollout und Device QA getrennt halten. Unverifizierte Werte bleiben UNKNOWN/OPEN; ältere belegte Stände bleiben datierte Snapshots. EAS/Stores vor Release-Entscheidungen frisch lesen. Diese Datei darf fremde WIP-Dokumente oder den Master-Gesamtstatus nicht stillschweigend überschreiben.

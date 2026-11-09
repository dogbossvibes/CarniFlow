# Abschlussbericht — Vollständigkeitsprüfung und Einrichtung der Claude-Umgebung (2026-11-09)

Auftrag: „MASTER-AUFTRAG: ANYVO – Vollständigkeitsprüfung und finale Einrichtung“ der
Nutzerin vom 09.11. Alles wurde lesend geprüft. Es gab keinen Commit, keinen Push, keinen
Build, kein OTA und keine Änderung an Production, RevenueCat, Kundenkonten oder fremden
Worktrees. Die elf lokalen Änderungen in `anyvo-sdk58-ios-20261103` sind unangetastet.
Die Sicherung von `bf0725d7` wurde nicht ausgeführt, sie ist ein separater Auftrag.

Kennzeichnung: **BESTÄTIGT** · **HISTORISCH** · **VERMUTUNG** · **NICHT GEPRÜFT** · **OFFEN**

Arbeitsort: `~/canisflow-worktrees/anyvo-claude-dev-environment`, Branch
`chore/claude-dev-environment-20261108` @ `41b5b82c` (Draft-PR #17). Fremd und unangetastet:
`docs/agent/SESSION_HANDOFF.md` (uncommittet).

## 1. Was bereits vollständig eingerichtet ist

- BESTÄTIGT: `AGENTS.md`, `CLAUDE.md` mit Production-OTA-Pflicht, Rollen und Freigaberegeln.
- BESTÄTIGT: 8 ANYVO-Skills, 6 Agents und 29 BMAD-Skills. Frontmatter und referenzierte
  Skripte sind vorhanden.
- BESTÄTIGT: Projekt-Hooks.
  - Sitzungskontext beim Start.
  - Guard gegen Release-, Datenbank-, Secret- und Datenverlust-Befehle sowie gegen
    Schreiben in fremde Worktrees.
  - ESLint nach jedem Edit.
  - Zusätzlich gibt es den globalen Release-Guard auf Nutzerebene.
- BESTÄTIGT: Prüfskripte `quality-check`, `release-preflight` und `mobile-env-check`. Der
  Preflight blockiert korrekt bei Ancestry-Bruch, nativen Änderungen und schmutzigem
  Worktree.
- BESTÄTIGT: Rechte gehärtet (08.11.), Gesamtsicherung `~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/`.

## 2. Erstellte oder ergänzte Dokumente (alle in `docs/agent/`, uncommittet)

| Dokument | Änderung |
|---|---|
| `ANYVO_MASTER_CONTEXT.md` | neu gefasst: Projektziele, Architektur in Kürze, Produktion, Kundenprobleme, Prioritäten P0/P1/P2 (maschinenlesbar für den Hook), vollständige Dokumentenlandkarte |
| `ANYVO_PRODUCT_CONTEXT.md` | ergänzt: Positionierung, Zielgruppe, Ziele, Design, Disziplinen, Sprachen, Rechte-Matrix je Plan, Monetarisierung, Trainer Connect, Smart Coach, Gesundheit, Zukunftsideen; NEWBIE-Fährte auf Production bestätigt |
| `ANYVO_RELEASE_HISTORY.md` | neu gefasst: Begriffe, alle iOS- und Android-Builds, Abstammungsbaum, Vergleich 59 und 60, 16 Runtimes, Erklärung `3d21d664`/`d11fcb37`, Backend-Drift, Sicherungsbedarf |
| `ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md` | aus dem Code erweitert: GPS/IMU, RLS, Abo, Trainer Connect, Auth, Edge Functions, Offline, Resume, Datenschutz (siehe Abschnitt 4a) |
| `ANYVO_CUSTOMER_ISSUE_HISTORY.md` | **neu**: 12 Einträge mit Ursache, Fix, Teststatus und Risiko, ohne Personendaten |
| `ANYVO_COLLABORATION_RULES.md` | ergänzt: Abschnitt 2a „Wo welche Information gepflegt wird“ und Dokumentationspflicht |
| `CLAUDE_ENVIRONMENT.md` | ergänzt: Abschnitt 7a mit Systemen, Toolchain, `node_modules`-Isolation und Testergebnissen |
| `ANYVO_DIRECTORY_MAP.md` | bereits am 09.11. erstellt (Commit `41b5b82c`), unverändert |
| `.claude/hooks/anyvo-session-context.mjs` | zeigt jetzt die offenen P0-Aufgaben aus dem Master-Kontext, ACTIVE_WORK und die Pflicht zur Branch-, HEAD- und Status-Prüfung |
| `scripts/__tests__/claudeHooks.node.test.mjs` | neuer Test für den Sitzungskontext (P0-Anzeige, Verweise) |

## 3. Erreichbare Systeme

| System | Status |
|---|---|
| GitHub (`gh`) | BESTÄTIGT: verbunden und geprüft |
| EAS | BESTÄTIGT: verbunden und geprüft (Konto `dog.boss.vibes`) |
| Supabase Production | BESTÄTIGT: verbunden und geprüft, nur lesend |
| Supabase Staging | BESTÄTIGT: verbunden und geprüft (keine Functions) |
| Vercel | verbunden, aber NICHT GEPRÜFT (PR-Check läuft, MCP gesperrt, keine CLI) |
| RevenueCat, App Store Connect, Google Play Console, Sentry | nicht verbunden; Zugang bewusst nicht eingerichtet |
| Expo-MCP | nicht erreichbar (persönlicher Token abgelehnt) |
| GitHub-MCP | nicht erreichbar (Plugin deaktiviert, `gh` ist der Standardweg) |

## 4. Eindeutig zugeordnete Builds und Runtimes

- BESTÄTIGT: iOS 49 (`3f7c2e74`, Runtime `1.0.4`) → 56 (`e8a754f3`) → 57 (`17443616`,
  `1.0.6-map49-v1`) → 59 (`00376126`) und 60 (`3858c0ff`) als getrennte Linien ab `c4afb5a8`.
- BESTÄTIGT: Die iOS-Builds 50–55 sind eine Seitenlinie und keine Vorfahren von 57.
- BESTÄTIGT: Android 49 (`f2ed8d78`, `greeting-v1`) und 50 (`c4649ad5`, `gnss-v1`).
- BESTÄTIGT: 16 Runtimes mit Production-OTAs samt letztem OTA und Quell-Commit (Release-Historie, Abschnitt 4).
- BESTÄTIGT: Der Widerspruch `3d21d664`/`d11fcb37` ist aufgelöst. Beides war Production,
  nacheinander (03.11. und 07.11.).
- BESTÄTIGT: Der Linie 59 fehlen die 57-OTAs `708f3d65` und `3d21d664`. Sie hat ein eigenes
  Training (Unit-Karten). Linie 60 hat den Timer-Trainings-Tab.
- BESTÄTIGT: Nicht auf GitHub sind `bf0725d7` und `00376126`. Kein Production-Quell-Commit liegt in `main`.

## 4a. Architektur-Befunde aus dem Code

Grundlage ist der Code von Build 57 (`d11fcb37`), dazu Abweichungen von Build 60 und der
deployte Abo-Code. Details: Architektur-Dokument, Abschnitte 8–18.

- BESTÄTIGT: Fährte.
  - Die Hintergrund-Aufnahme läuft über den Task `anyvo-faehrte-bg` und das native Modul
    `anyvo-precision-location`.
  - Gefiltert wird live in `layProcessingSession.ts`.
  - Winkel kommen aus `legacyCornerDetection`, `cornerConfirmation` und `turnFusion` (GPS plus IMU).
  - Das Roharchiv bleibt lokal pro Konto und wird nicht hochgeladen.
- BESTÄTIGT: Build 60 ändert neben SDK 58 fachlich nur den Verlassen-Schutz in `liegen.tsx`.
  Abo-, Sync- und Trainer-Code sind gleich wie in 57.
- BESTÄTIGT: Der Webhook in Git übernimmt Plan und Ablauf direkt aus dem Event. Der deployte
  Webhook liest RevenueCat selbst und schaltet im Zweifel nicht frei. **Ein Deploy aus Git
  würde die Production-Logik zurückdrehen.**
- BESTÄTIGT, **P0 Sicherheit**: Ein offener Befund zu den Live-Schreibrechten auf Abo- und
  Berechtigungstabellen, nur lesend erhoben. Weitere Edge Functions mit offener
  Sicherheitsprüfung. Die Details stehen bewusst **nur lokal** in
  `~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/t181-lokal/SICHERHEITSBEFUND_RLS_2026-11-09_PRIVAT.md`,
  weil das Repository öffentlich ist.
- BESTÄTIGT: Trainer Connect. Halter können auf Client und Server **ohne Plan-Prüfung**
  einen Trainer hinzufügen (`redeem_trainer_code`). Nur die Trainerseite verlangt
  `trainer_module`. Die Meldung „ACTIVE kann keinen Trainer hinzufügen“ lässt sich im Code
  nicht nachvollziehen [OFFEN: Geräteprüfung, Produktregel für NEWBIE].
- VERMUTUNG, braucht Feldtest: Der Abo-Cache wird nicht persistiert. Offline beim Kaltstart
  könnte die Quotenprüfung auch zahlende Nutzer beim Start einer neuen Fährte blockieren.
- BESTÄTIGT: Sync-Queue ohne Versuchslimit und ohne Backoff. Punkte werden per Delete und
  Insert in Blöcken ersetzt: idempotent, aber nicht transaktional.
- BESTÄTIGT: `wipeLocalData()` wird nur im Entwickler-Screen aufgerufen. Nach Logout bzw.
  Kontolöschung bleiben lokale Daten (SQLite, GPS-Archiv) auf dem Gerät [Datenschutz-Risiko].
- OFFEN: `app.json` enthält einen Google-Maps-Key. Ob er auf die App eingeschränkt ist, ist
  ungeprüft.

## 5. Weiterhin bestehende Widersprüche und Lücken

1. OFFEN: Wen die 503-Fehler `INVALID_PROVIDER_DATE` des iOS-Webhooks vom 04.11. betreffen.
   Möglicherweise eine zahlende Person ohne Freischaltung.
2. BESTÄTIGT als Lücke: Der deployte Abo-Code (`subscription-sync` v5, Webhooks v9/v8) und
   die DB-Funktionen `subscription_*_v1` stehen in keinem Git-Stand.
3. BESTÄTIGT: Migrations-Drift.
   - `20261008190000` ist in den Live-Clients, aber nicht auf Production angewendet.
   - `20261006180000` ist in `main`, aber nicht angewendet.
   - `20260825180000` und `20261005150000` sind angewendet, liegen aber nur auf Seitenbranches.
4. OFFEN: Store-Stände und Geräteverteilung je Runtime.
5. OFFEN: OTA-Aktivierung auf iOS 60 (`launch=embedded`).
6. OFFEN: Bedeutung von „Build 49“ (iOS oder Android). VERMUTUNG: iOS.
7. OFFEN: Ob das Auslassen der iOS-1.0.5-Sensorlinie (50–55) beim Weg 49 → 56/57 gewollt war.
8. NICHT GEPRÜFT: iOS-Deployment-Target unter SDK 58.
9. HISTORISCH/OFFEN: Absturz von Build 59 beim Fährtenabschluss.
10. NICHT GEPRÜFT: Praktischer Test einer frischen Claude-Sitzung. Die CLI-Anmeldung war
    abgelaufen.

## 6. Was von Moyo benötigt wird

1. RevenueCat: Ereignisse vom 04.11., etwa 07:30–09:10 Ortszeit, mit Typ, Store und App
   User ID, ohne Personendaten.
2. Bestätigung: „Build 49“ meint iOS 49 (1.0.4)?
3. Store-Stände: Welche Builds sind im App Store bzw. in Google Play öffentlich, welche nur
   in TestFlight oder intern?
4. Wenn möglich, die Geräteverteilung je Runtime aus EAS Insights. Alternativ eine
   Freigabe, sie selbst zu lesen.
5. Eine frische Testsitzung: Claude Code im Ordner
   `~/canisflow-worktrees/anyvo-claude-dev-environment` neu öffnen und `/anyvo-start`
   aufrufen. Alternativ die CLI mit `claude login` erneut anmelden.
6. Entscheidungen zu den P0-Sicherungen (Abo-Code in Git, Linie 59 auf GitHub,
   Migrations-Drift).
7. Optional: Xcode installieren, damit lokal iOS-Tests möglich sind.

## 7. Tests

| Prüfung | Ergebnis |
|---|---|
| TypeScript (`npm run typecheck`) | BESTÄTIGT: bestanden |
| ESLint (Hooks, Hook-Tests, `scripts/claude`) | BESTÄTIGT: 0 Befunde |
| Jest gesamt | BESTÄTIGT: 340 Suites, 4201 Tests bestanden |
| Hook-Tests (`node --test`) | BESTÄTIGT: 12/12 bestanden (vorher 11, ein neuer Test) |
| Skill- und Agent-Struktur, referenzierte Skripte | BESTÄTIGT: gültig |
| `release-preflight.mjs`, `mobile-env-check.mjs` | BESTÄTIGT: laufen, Blocker korrekt erkannt |
| Dokumentationslinks | BESTÄTIGT: alle relativen Links auflösbar |
| `git diff --check`, Scope | BESTÄTIGT: sauber. Geändert sind nur Dateien im Claude-Worktree; dazu kommen private Dateien im lokalen Backup-Ordner. Die fremde `SESSION_HANDOFF.md` ist unangetastet |
| Live-Production (nur lesend) | BESTÄTIGT: NEWBIE-Quote, Migrationsliste, RLS-Status, Policies und Rechte gelesen. Kein Schreibtest |
| BMAD-Python-Tests | NICHT GEPRÜFT: `pytest` ist nicht installiert |
| Frische Claude-Sitzung | NICHT GEPRÜFT: CLI-Login abgelaufen |

## 8. Risiken

- **P0 Sicherheit:** offener Befund zu den Live-Schreibrechten (Details lokal). Er betrifft
  Abo-Einnahmen und Berechtigungen. Behebung nur per Production-Migration mit Freigabe und
  nach Prüfung aller Live-Clients.
- Öffentliches Repository: Sicherheitsdetails werden erst nach der Behebung veröffentlicht.
- Ein zahlender Nutzer ist möglicherweise ohne Freischaltung (04.11.), solange das nicht
  geklärt ist.
- Der Abo-Code in Production ist nicht reproduzierbar. Ein versehentliches Deploy aus Git
  würde ihn durch den älteren Git-Stand ersetzen.
- Die Migrations-Drift kann zu Funktionen führen, die im Client da sind, deren Backend aber
  fehlt (Diagnosezugriff).
- Viele alte Runtimes laufen ohne bekannte Gerätezahl weiter. Backend-Änderungen können sie
  brechen.
- Lokal gibt es keine iOS-Tests (Xcode fehlt). Feldtests der Fährte sind nur auf Geräten möglich.
- `node_modules` ist mit `anyvo-main` geteilt. Eine Installation im Claude-Worktree würde
  `main` verändern.

## 9. Sinnvolle nächste Aufgaben (jeweils mit eigener Freigabe)

0. P0 Sicherheit: Den lokalen Befund bewerten und eine Migration vorschlagen (Staging
   zuerst, Kompatibilität mit allen Live-Clients). Keine Anwendung ohne Freigabe.
1. P0: Den Webhook-Fall vom 04.11. mit den RevenueCat-Daten klären.
2. P0: Deployten Abo-Code und SQL in einen eigenen Branch sichern, ohne Deploy.
3. P0: Migrations-Drift bewerten und einen Vorschlag machen, ohne Anwendung.
4. P0: Linie 59 auf GitHub sichern (bereits geplant, separater Auftrag).
5. P1: OTA-Aktivierung auf Build 60 diagnostizieren (Diagnose-Export vom Gerät).
6. P1: Commit und Push dieser Dokumentation auf PR #17, danach Review durch ChatGPT und Merge.

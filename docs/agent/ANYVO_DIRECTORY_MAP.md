# ANYVO — Verzeichniskarte (öffentliche Fassung, Pfade relativ zu `~`)

Stand: **2026-11-09**. Die Daten wurden lesend aus Git erhoben (`git worktree list`, `branch`,
`rev-parse`, `status --porcelain`) und mit der Vollinventur vom 08.11. abgeglichen
(476 registrierte Worktrees, 7 eigenständige Klone, 1 alter Starter = 484). Nichts wurde
verändert. Private Evidenzdateien wurden nicht geöffnet.

Verwandt: [Master-Kontext](ANYVO_MASTER_CONTEXT.md) ·
[Repository-Inventur](REPOSITORY_INVENTORY.md) ·
[Production-Quellen-Audit](PRODUCTION_SOURCE_AUDIT_2026-11-08.md).

**Abkürzung:** `CODEX/` steht für den Codex-Projektordner
`~/.codex/.chatgpt-projects/<Projekt-ID>/`. 331 der 476 Worktrees liegen dort.
Die Projekt-ID und die Vollfassung mit allen absoluten Pfaden stehen nur lokal in
`~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/t181-lokal/ANYVO_DIRECTORY_MAP_vollstaendig_2026-11-09.md`.

**Spalten:**
- *Lesen*: Ob Claude den Ordner lesen kann. „ja“ heißt technisch lesbar und geprüft.
- *Status*: aktiv, historisch oder nur Referenz.
- *Ändern*: ob Änderungen erlaubt sind.
  - „eigen“: Claudes eigene Arbeitsumgebung. Commit, Push und jede weitere Veröffentlichung
    nur mit Einzelfreigabe.
  - „Freigabe“: vorher ausdrückliche Freigabe der Nutzerin nötig.
  - „nein“: nicht verändern.

„dirty“ ist die Anzahl uncommitteter Einträge am 09.11. Sie ist **nicht** Claudes Arbeit.

---

## 1. Zentrale ANYVO-Codebasis

### 1.1 Repository

| Pfad | Zweck | Branch @ HEAD | Lesen | Status | Ändern |
|---|---|---|---|---|---|
| `~/canisflow/canisflow` | **Haupt-Checkout und Git-Verzeichnis** (`.git`) aller 476 Worktrees. Remote `github.com/dogbossvibes/CarniFlow` (öffentlich) | `feat/track-module-rewrite` @ `d678fd14`, dirty 59 (fremd), Basis 186 Commits hinter `main` | ja | aktiv als Git-Speicher, **nicht** als Arbeitsordner | **nein**. Nie dort arbeiten, nie `checkout`, `reset` oder `clean`. Nur lesen und `git worktree list` |
| `~/canisflow` | alter Expo-Starter (Vorläufer), eigener Klon, **nicht** das App-Repo | `main` @ `74588b50`, dirty 379 | ja | historisch | nein |
| `github.com/dogbossvibes/anyvo-web` | ältere Website (index, privacy, loeschen). **Kein lokaler Klon vorhanden** | – | nur über GitHub | Referenz | Freigabe |

### 1.2 Projektbereiche im Repository

Die Bereiche gelten in jedem Worktree relativ zu dessen Wurzel. Der Beispielpfad ist
Claudes Worktree, Stand `origin/main` plus T-181:
`~/canisflow-worktrees/anyvo-claude-dev-environment/…`

| Bereich | tatsächlicher Pfad | Inhalt |
|---|---|---|
| App-Screens (expo-router) | `app/` | Routen und Screens |
| UI-Komponenten | `components/` | |
| Fach-Features | `features/` | u. a. `features/subscription/plans.ts` |
| Hooks | `hooks/` | u. a. Tracking-Recorder |
| Gemeinsame Grundlagen | `lib/` | Supabase-Client, RevenueCat (`lib/purchases.ts`) |
| Services | `services/` | u. a. Abo-Dienste |
| Native Module, Config-Plugins | `modules/`, `plugins/` | u. a. Präzisions-Standort |
| Konstanten | `constants/` | |
| Übersetzungen | `i18n/` (`de-CH.ts`, `de-DE.ts`, `gsw-CH.ts`, `locales/{de,en,fr,gsw,it}.ts`) | **kein** Ordner `locales/` im Wurzelverzeichnis |
| Bilder, Icons, Medien | `assets/` | |
| Supabase gesamt | `supabase/` (`config.toml`) | |
| Edge Functions | `supabase/functions/` (14 Funktionen + `_shared`, `__tests__`) | **Achtung:** Die deployten Abo-Funktionen (`subscription-sync`, Webhooks) weichen ab. Ihr Code liegt in keinem Git-Stand |
| DB-Migrationen | `supabase/migrations/` (31 Dateien) | |
| Tests | **verteilt** in 53 `__tests__/`-Ordnern neben dem Code. Es gibt keinen zentralen Ordner `tests/` | Jest |
| Dokumentation | `docs/`, Agenten-Doku `docs/agent/` | |
| CI/CD | `.github/workflows/anyvo-quality-gate.yml` | Quality Gate |
| Prüf-, Build- und Release-Skripte | `scripts/` (u. a. `update-production.mjs`, `guard-prod-supabase.mjs`), `scripts/claude/` | |
| Expo- und EAS-Konfiguration | `app.json`, `eas.json`, `package.json` | |
| Rechtsseiten (Web) | `legal-web/` | vermutlich Nachfolger von `anyvo-web` [O] |
| Claude-Konfiguration | `.claude/` (Settings, Hooks, Agents, Skills) | |

### 1.3 Exakte Quellstände der Production-OTAs (lokal ausgecheckt)

| Pfad | Production-Runtime | Branch @ HEAD | dirty | Lesen | Status | Ändern |
|---|---|---|---|---|---|---|
| `~/canisflow-worktrees/anyvo-release-ios57-faehrten-label-20261107` | iOS 57 `1.0.6-map49-v1` | `release/ios57-faehrten-label-20261107` @ `d11fcb37` | 0 | ja | Referenz (Live-Quelle) | nein |
| `~/canisflow-worktrees/anyvo-release-ios60-faehrten-label-20261107` | iOS 60 `1.0.8-sdk58-v1` | `release/ios60-faehrten-label-20261107` @ `3bb78943` | 0 | ja | Referenz (Live-Quelle) | nein |
| `CODEX/anyvo-sdk58-ios-20261103` | iOS 59 `sdk58-customer-ios-v1` | `upgrade/sdk58-ios-20261103` @ `bf0725d7` (**nicht auf GitHub**) | 11 (fremd) | ja | Referenz (Live-Quelle) | nein |
| `CODEX/anyvo-shared-recipient-android50-20261101` | Android 50 `1.0.5-gnss-v1` | `release/t177-android50-20261103` @ `21c04eee` | 0 | ja | Referenz (Live-Quelle) | nein |
| `CODEX/anyvo-shared-recipient-android49-20261101` | Android 49 `1.0.5-greeting-v1` | `release/t177-android49-20261103` @ `da715fc7` | 0 | ja | Referenz (Live-Quelle) | nein |

## 2. Aktuelle Entwicklungsumgebungen

| Pfad | Zweck | Branch @ HEAD | dirty | Lesen | Status | Ändern |
|---|---|---|---|---|---|---|
| `~/canisflow-worktrees/anyvo-claude-dev-environment` | **Claudes Entwicklungs-Worktree** (T-181, Draft-PR #17) | `chore/claude-dev-environment-20261108` @ `3590783a` | 1 (`SESSION_HANDOFF.md`, fremd) | ja | aktiv | eigen. Achtung: Eine weitere Claude-Sitzung hat am 09.11. ebenfalls dort committet |
| `~/canisflow-worktrees/anyvo-sdk58-ios60-from57-20261105` | SDK-58-Migration auf Basis Build 57 (Build 60, T-179) | `upgrade/sdk58-ios60-from57-20261105` @ `1dcdf213` | 0 | ja | aktiv / Referenz Build 60 | Freigabe. Vorher Branch, HEAD und Status prüfen |
| `CODEX/anyvo-sdk58-ios-20261103` | Kundenstand SDK 58 / Build 59 | `upgrade/sdk58-ios-20261103` @ `bf0725d7` | 11 (Trainings-Hub-Paket, nicht live) | ja | Referenz | Freigabe. Vorher Branch, HEAD und Status prüfen. Liegt **nicht** unter `canisflow-worktrees` |
| `CODEX/anyvo-sdk58-android-20261103` | SDK-58-QA Android (Build 51) | `upgrade/sdk58-android-20261103` @ `5e9cd10a` | 0 | ja | Referenz | Freigabe |
| `~/canisflow-worktrees/anyvo-release-ios60-training-ui-20261106` | Trainingsübersicht iOS 60 (OTA 07.11., PR #16) | `release/ios60-training-ui-20261106` @ `50548db0` | 3 (OpenCode, T-180) | ja | aktiv (fremd) | nein |
| `~/canisflow-worktrees/anyvo-ios57-complete` | Build-57-Stand | detached @ `17443616` | 26 (fremd) | ja | Referenz | nein |

Neue Claude-Aufgaben bekommen jeweils einen eigenen Task-Worktree unter
`~/canisflow-worktrees/` (`npm run agent:wt:create`). Anlegen nur mit Freigabe.

## 3. Projektsteuerung und Dokumentation

**Wichtig:** Die *aktuellen* Fassungen von `ANYVO_MASTER_STATUS.md` und `ACTIVE_WORK.md`
liegen **uncommittet** im main-Worktree (Stand 01.11.). Die Fassungen in Git sind älter.

| Pfad | Zweck | Lesen | Status | Ändern |
|---|---|---|---|---|
| `~/canisflow-worktrees/anyvo-main` | kanonischer `main`-Worktree, `main` @ `1a574212`, dirty 34, 8 hinter / 7 vor `origin/main` | ja | aktiv (Koordination) | Freigabe. Nicht dort entwickeln |
| `~/canisflow-worktrees/anyvo-main/docs/agent/ANYVO_MASTER_STATUS.md` | kanonischer Production- und Koordinationsstatus (925 KB, uncommittet) | ja | aktiv, letzter Eintrag 01.11. | Freigabe |
| `~/canisflow-worktrees/anyvo-main/docs/agent/ACTIVE_WORK.md` | laufende Aufgaben (uncommittet) | ja | aktiv | Freigabe |
| `~/canisflow-worktrees/anyvo-main/AGENTS.md` | gemeinsame Agentenregeln (main-Fassung) | ja | aktiv | Freigabe |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/AGENTS.md` | Agentenregeln inkl. Rollenwechsel 08./09.11. (PR #17) | ja | aktiv | eigen |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/CLAUDE.md` | Claude-Regeln, Production-OTA-Pflicht | ja | aktiv | eigen |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/docs/agent/ANYVO_MASTER_CONTEXT.md` | Einstiegsseite | ja | aktiv | eigen |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/docs/agent/REPOSITORY_INVENTORY.md` | öffentliche Kurzfassung der Inventur | ja | aktiv | eigen |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/docs/agent/PRODUCTION_SOURCE_AUDIT_2026-11-08.md` | Production-Quellen und Sicherung | ja | aktiv | eigen |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/docs/agent/ANYVO_RELEASE_HISTORY.md` | Builds, Runtimes, OTA-Herkunft | ja | aktiv | eigen |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/docs/agent/ANYVO_ARCHITECTURE_AND_CRITICAL_AREAS.md` | Architektur, kritische Bereiche | ja | aktiv | eigen |
| `~/canisflow-worktrees/anyvo-claude-dev-environment/docs/agent/audits/2026-11-09-verstaendnisbericht.md` | Verständnisbericht und Widersprüche | ja | aktiv | eigen |
| `~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/t181-lokal/` | **Vollfassungen** der Inventur und des Audits mit allen Pfaden (nicht öffentlich) | ja | Referenz | nein |

## 4. Sicherungen und Referenzstände

### 4.1 Lokale Backups

| Pfad | Inhalt | Lesen | Status | Ändern |
|---|---|---|---|---|
| `~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/` | Vollsicherung 08.11.: Git-Bundle aller 1286 Refs, Patches und unversionierte Dateien von 236 Worktrees, `SHA256SUMS` (146 MB) | ja | Referenz | nein |
| `~/ANYVO_BACKUPS/2026-10-07-193306-codex-migration/` | Codex-Migrationssicherung (3,7 GB), enthält private Konfiguration | **Inhalt bewusst nicht geöffnet** | historisch | nein |
| `~/anyvo-backups/2026-11-08/` | Production-Quell-Bundle `bf0725d7` (Build 59) mit Manifest | ja | Referenz | nein |
| `~/.claude/backups/anyvo-permissions-20261108/`, `~/.claude/backups/anyvo-mcp-20261108/` | Sicherungen der Claude-Rechte- und MCP-Konfiguration vor der Härtung | ja | Referenz | nein |

### 4.2 Codex-Verzeichnisse

| Pfad | Inhalt | Lesen | Status | Ändern |
|---|---|---|---|---|
| `CODEX/` | 331 registrierte ANYVO-Worktrees der Codex/ChatGPT-Arbeit, dazu 6 eigenständige Klone und Evidenzordner | ja | gemischt, überwiegend historisch | **nein**. Nicht bereinigen |
| zweites ChatGPT-Projekt unter `~/.codex/.chatgpt-projects/` | laut Inventur vermutlich nicht ANYVO | nicht geprüft | unklar | nein |
| `~/.codex/` (übrige Dateien) | Codex-App-Daten (Konfiguration, Anmeldedaten, Logs) | **bewusst nicht gelesen** | – | nein |

Eigenständige Klone (nicht registriert; Commits dort sind im Haupt-Repo nicht sichtbar):
`CODEX/anyvo-audit-account-deletion-05`, `CODEX/anyvo-audit12-backend-client-05`,
`CODEX/anyvo-bmad-tracking-timing-20261101`, `CODEX/anyvo-fullscreen-line-research-20261101`,
`CODEX/anyvo-gps-rollback-audit-20261102`, `CODEX/anyvo-tracklab-isolated-20261101`.

Den `subscription-sync`-Vorläufer enthält **nur unversioniert**:
`CODEX/anyvo-group-live-share-db/supabase/functions/subscription-sync/`. Er weicht vom
deployten Stand ab.

### 4.3 Historische Release-Worktrees (Auswahl der Linien 49 bis 57)

Alle haben den Status „Referenz“ und dürfen nicht verändert werden:

| Pfad | Branch @ HEAD |
|---|---|
| `CODEX/anyvo-ios49-map-repair-build56-20261026` | `release/ios49-map-repair-build56` @ `e8a754f3` (Build 56) |
| `CODEX/anyvo-dog-actions-ios56-release-20261029` | `release/dog-actions-ios56-20261029` @ `17443616` (= Build 57) |
| `CODEX/anyvo-ios49-airmap-repair-20261026`, `CODEX/anyvo-ios49-map-fullscreen-20261026`, `CODEX/anyvo-ios49-solid-no-scale-release-20261026` | Kartenreparatur-Versuche der 49er-Linie |
| `CODEX/anyvo-diagnostics-access-final-ios55-20261029` | `release/diagnostics-access-final-ios55-20261029` @ `0e16001d` (letztes OTA iOS 55) |
| `CODEX/anyvo-android50-satellite-aab-20261028` | `release/android50-satellite-aab-20261028` @ `c4649ad5` (Build Android 50) |
| `CODEX/anyvo-android49-startup-guard-release-20261028` | `release/android49-startup-guard-20261028` @ `22ec5f5c` |
| `~/canisflow/anyvo-*` (24 Worktrees, z. B. `anyvo-production-consolidated-2026-08-31`, `anyvo-prod-hotfix`) | ältere Produktions- und Hotfix-Stände bis Okt. 2026 |

Die vollständige Liste aller 484 Einträge mit Branch, HEAD und Änderungen steht in der
lokalen Vollinventur (`~/ANYVO_BACKUPS/2026-11-08-claude-uebernahme/t181-lokal/`).

### 4.4 Evidenz- und Diagnoseordner (keine Git-Repos, Inhalte nicht geöffnet)

| Pfad | Hinweis |
|---|---|
| `~/canisflow-worktrees/anyvo-subscription-p0-20261028` | Abo-P0-Evidenz (205 Dateien). Kann Kundendaten enthalten |
| `~/canisflow-worktrees/anyvo-manual-active-audit-20261029` | Abo-Audit |
| `~/canisflow-worktrees/anyvo-audit12-20261024`, `…/anyvo-one-approval-recheck-20261104`, `…/anyvo-t70-integration-20261104-evidence`, `…/anyvo-integration-preparation-20261101`, `…/anyvo-google-branding-20261029` | Audits, Patch-Pakete, Branding |
| `CODEX/output`, `CODEX/outputs`, `CODEX/anyvo-phase{1,2-maps,3}-local-20261028`, `CODEX/anyvo-warmup-map-fix-20261028` | Codex-Ausgaben |
| alle `*-PRIVATE.json` | **niemals öffnen oder committen** (personenbezogen) |

### 4.5 Vorläufer (nicht sicher ANYVO)

`~/Desktop/dogsuptodate-app`, `~/Desktop/dogsuptodate-native`:
Status historisch, Lesen ja, nicht verändern.

## 5. Offene Punkte

- Ob die sechs eigenständigen Codex-Klone Commits enthalten, die nirgends sonst liegen, ist ungeprüft.
- Welche Website live ist (`legal-web/` oder `anyvo-web`), ist offen.
- Öffentliche Fassung: Pfade sind mit `~` gekürzt (`~` = Home-Verzeichnis der Nutzerin), die
  Codex-Projekt-ID ist ersetzt. Entscheidung der Nutzerin vom 2026-11-09.

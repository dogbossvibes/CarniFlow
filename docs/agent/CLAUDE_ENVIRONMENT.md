# ANYVO — Claude-Entwicklungsumgebung

Stand der Bestandsaufnahme: 2026-11-08 (T-181). Datierte Werte sind Belege dieses
Tages und vor aktuellen Aussagen erneut zu prüfen. Die Regeln stehen in
`AGENTS.md` und `CLAUDE.md`; dieses Dokument beschreibt Werkzeuge und Bedienung.

## 1. Bausteine

| Baustein | Ort | Zweck |
|---|---|---|
| Projektregeln | `AGENTS.md` (gemeinsam mit Codex), `CLAUDE.md` (Claude-spezifisch) | verbindliche Regeln, Freigaben, OTA-Regel |
| Projektgedächtnis | `docs/agent/` (MASTER_STATUS, ACTIVE_WORK, DECISIONS, Task-Reports) | geteilt mit Codex, versioniert |
| Persönliches Gedächtnis | `~/.claude/projects/<pfad>/memory/` | Claude-Notizen je Arbeitsverzeichnis, nicht versioniert |
| BMAD | `_bmad/` (v6.12.4), `.claude/skills/bmad-*`, `docs/agent/BMAD.md` | Workflow nach Komplexität/Risiko |
| ANYVO-Skills | `.claude/skills/anyvo-*` | Arbeitsabläufe (siehe 2) |
| Agents | `.claude/agents/anyvo-*.md` | spezialisierte Reviewer/QA/Preflight/Implementer |
| Hooks | `.claude/settings.json` → `.claude/hooks/*.mjs` | Kontext, Guard, Lint |
| Prüfskripte | `scripts/claude/*.mjs` | Qualität, Release-Preflight, Mobile-Umgebung |
| CI | `.github/workflows/anyvo-quality-gate.yml` | Quality Gate auf PR/Push nach main |

## 2. Skills (Aufruf mit `/name`)

| Skill | Wann |
|---|---|
| `/anyvo-start` | Beginn jeder Code-Aufgabe: Ort, fremde Änderungen, frischer GitHub-Stand, Owner, ggf. eigener Worktree |
| `/anyvo-feature` | Feature oder Fehlerbehebung umsetzen |
| `/anyvo-quality` | Qualitätsprüfung und Regressionen vor Bericht/Commit |
| `/anyvo-tracking-review` | GPS/Fährte/Sensor/IMU/Analyse prüfen |
| `/anyvo-security-review` | Auth, RLS, Storage, RevenueCat, Datenschutz |
| `/anyvo-mobile-test` | iOS-/Android-Testabläufe und Feldtest-Protokoll |
| `/anyvo-release-preflight` | Release lesend vorbereiten und dokumentieren |
| `/anyvo-abschluss` | Abschluss mit Diff, Checks und offenen Abnahmen |

## 3. Agents (nur bei ausdrücklichem Delegationsauftrag)

`AGENTS.md` erlaubt Delegation nur auf ausdrücklichen Auftrag. Beispiele:
„Lass den Tracking-Reviewer den Diff gegen origin/main prüfen.“

| Agent | Rechte | Aufgabe |
|---|---|---|
| `anyvo-code-reviewer` | lesend | Korrektheit, Regressionen, Testqualität |
| `anyvo-tracking-reviewer` | lesend | Fährten-/GPS-/IMU-Datenfluss |
| `anyvo-security-reviewer` | lesend | RLS, Auth, Storage, RevenueCat |
| `anyvo-release-preflight` | lesend | Preflight-Bericht, nie Veröffentlichung |
| `anyvo-mobile-qa` | lesend + Testläufe | Simulator/Emulator-Flows, Ergebnisprotokoll |
| `anyvo-implementer` | schreibend im zugewiesenen Worktree | abgegrenzte Teilaufgabe ohne Commit |

## 4. Hooks und Schutzschichten

1. **SessionStart** (`anyvo-session-context.mjs`): zeigt Worktree, Branch@HEAD,
   Anzahl fremder Änderungen, Abstand zu origin/main (lokaler Stand, kein fetch),
   offene Task-Reports. Lesend.
2. **PreToolUse** (`anyvo-guard.mjs`), für Bash/Edit/Write/Read:
   - *deny*: EAS update/build/submit und Channel-/Env-Änderungen, Release-Wrapper,
     npm-Build/Update-Skripte, Store-Uploads, Supabase-Remote-Änderungen,
     direkter DB-Zugriff, `gh pr merge`, GitHub-API-Schreibzugriffe,
     `git reset --hard`, `git clean`, `git checkout -- …`, `git restore`
     (ohne `--staged`), Stash-/Branch-Zwangslöschung, Force-/Delete-Push,
     Push auf main, Historien-Umschreibung, rekursives Löschen von `.git`/Worktrees,
     Lesen/Ausgeben von Secret-Dateien (`.env*` ausser Vorlagen, Service-Accounts,
     Schlüssel), `printenv`/`env`, Schlüsselbund.
   - *ask*: commit, push, merge, rebase, switch/checkout, stash, worktree add/remove,
     Paketinstallation, PR/Issue erstellen; Schreiben ausserhalb des aktuellen
     Worktrees in andere ANYVO-Worktrees; globale Koordinationsdateien;
     Supabase-Migrationen.
3. **PostToolUse** (`anyvo-post-edit-lint.mjs`): ESLint nur mit Fehlern
   (`--quiet`) für die bearbeitete Datei; meldet Fehler an Claude (Exit 2).
4. **Projekt-Permissions** in `.claude/settings.json`: zusätzliche deny/ask-Liste,
   inklusive der schreibenden Expo-MCP-Werkzeuge (Build starten/einreichen/abbrechen,
   Workflow starten, Store-Review-Antworten, Budget anlegen). Lesende Expo-MCP-
   Werkzeuge (Build-Liste, Logs, Observe, Crashes, Doku) bleiben nutzbar.
5. **Nutzer-Ebene** (nicht versioniert): `~/.claude/hooks/anyvo-release-guard.py`
   und `.claude/settings.local.json` bleiben als zweite Schicht bestehen; die
   strengere Entscheidung gilt.

Freigegebene Veröffentlichungen führt die Nutzerin selbst im eigenen Terminal aus.
Die Sperren gelten nur für Werkzeugaufrufe von Claude.

## 5. Prüfskripte (alle lesend, ohne Remote-Schreibzugriff)

```
node scripts/claude/quality-check.mjs [--base <ref>] [--full] [--skip-tsc]
node scripts/claude/release-preflight.mjs --base <letzter-release-commit> --platform ios|android
node scripts/claude/mobile-env-check.mjs
node --test scripts/__tests__/claudeHooks.node.test.mjs
```

## 6. Standardablauf einer Aufgabe

1. `/anyvo-start` → eigener Task-Worktree über `node scripts/agent-worktree.mjs create …`
   mit atomarer Task-ID (keine erfundenen IDs), Basis explizit.
2. Analyse und Vorschlag; BMAD-Umfang nennen (`docs/agent/BMAD.md`).
3. Umsetzung mit `/anyvo-feature`; kritische Bereiche mit Fach-Review.
4. `/anyvo-quality` (vor Commit `--full`), Mobile-Abnahme nach `/anyvo-mobile-test`.
5. Task-Report pflegen; `/anyvo-abschluss`.
6. Commit/Push/PR nur nach der jeweils geltenden ausdrücklichen Freigabe;
   Release nur über `/anyvo-release-preflight` + Freigabe.

## 7. Bestandsaufnahme 2026-11-08 (Belege)

**Repository:** `dogbossvibes/CarniFlow`, Paket `anyvo`. `origin/main` =
`92ec7340` (2026-11-05, „guarded ANYVO GitHub task-branch autosync (#13)“);
letzte drei Quality-Gate-Läufe auf main erfolgreich. Offene PRs: #16 (Draft iOS60
Trainings-Tab), #9 (CI-Setup iOS55 EAS dry-run), #8 (Review iOS55 Diagnostics).

**Stack (main):** Expo ~54.0.36, React Native 0.81.5, React 19.1.0, TypeScript ~5.9,
Jest 29 + jest-expo, Supabase JS 2.x, RevenueCat (`react-native-purchases` 10.x),
Sentry RN 7.2, expo-router 6, NativeWind 4. app.json 1.0.4 (iOS 49 / Android 40,
runtime `appVersion`); package.json-Version 1.0.1 (Abweichung bekannt, nicht geändert).

**Architektur:** `app/` (expo-router), `components/`, `features/` (grösster Bereich,
u. a. Fährten/Tracking), `lib/`, `services/`, `hooks/`, `stores/`,
`supabase/migrations` + `supabase/functions`, native `modules/` und `plugins/`;
zahlreiche historische `*_SETUP.sql` im Root (nicht als Migrationen behandeln).

**Worktrees:** 476 registrierte Worktrees (331 unter `~/.codex`, 120 unter
`~/canisflow-worktrees`, 25 unter `~/canisflow`).
Kanonisch: `~/canisflow-worktrees/anyvo-main` (lokales main 8 Commits hinter
origin/main, mit fremden uncommitteten Regel-/Skriptänderungen).
`~/canisflow/canisflow` steht auf `feat/track-module-rewrite`,
186 Commits hinter und 31 vor origin/main, mit vielen fremden uncommitteten
Änderungen (u. a. vereinfachte AGENTS/CLAUDE-Fassung, eigene CI-Datei
`quality.yml`, QA-Skripte). Diese Stände wurden nicht verändert.

**Werkzeuge lokal:** Node 24.15 (CI nutzt 22), npm 11.12, gh 2.103 (angemeldet),
eas-cli 19.1.0 (neuere Version verfügbar, nicht aktualisiert), Supabase CLI 3.0.0,
uv 0.13.6, CocoaPods 1.16.2, JDK 17. **Xcode fehlt** (nur CommandLineTools) →
kein iOS-Simulator, kein lokaler iOS-Build. Android SDK vorhanden, `adb`/`emulator`
nicht im PATH, 8 AVDs. Maestro und watchman nicht installiert.

**Claude-Konfiguration vorher:** Projekt-`settings.json` nur mit Expo-Plugin;
`/handoff`-Command; 29 BMAD-Skills; die vier ANYVO-Skills existierten nur
unversioniert im Haupt-Checkout; keine Agents, keine Projekt-Hooks, kein
`.mcp.json`. Nutzer-Ebene: Release-Guard-Hook, Notifier-Hooks, umfangreiche
lokale deny/ask-Listen.

**MCP:** Expo-Plugin-Server im Laufe der Sitzung verbunden (Build-, Observe-,
Store-Review- und Simulator-Werkzeuge); Vercel-Plugin-Server benötigt Anmeldung über `/mcp`;
GitHub-Plugin-Server verbindet nicht (Authentifizierungs-Header) — `gh` CLI
funktioniert und ist der Standardweg.

## 8. Offene Punkte / Empfehlungen

- Xcode installieren und auswählen, damit iOS-Simulator-Tests möglich sind.
- Android-Tools in den PATH aufnehmen (`$HOME/Library/Android/sdk/platform-tools`,
  `…/emulator`), optional Maestro für wiederholbare UI-Flows.
- GitHub-MCP neu verbinden oder bewusst bei `gh` bleiben.
- Die vereinfachte Regel-Fassung im Haupt-Checkout weicht von main ab (u. a.
  fehlt dort die Production-OTA-Regel) — vor einer Übernahme mit main abgleichen.
- Persönliches Claude-Gedächtnis ist pro Arbeitsverzeichnis getrennt; verbindliches
  Wissen gehört in `docs/agent/`.

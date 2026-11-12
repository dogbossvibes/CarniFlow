# ANYVO — Paralleles Arbeiten mit Git Worktrees

> Ziel: mehrere unabhängige Aufgaben gleichzeitig bearbeiten, ohne dass sich Agenten
> im selben Working Tree oder in denselben globalen Handoff-Dateien in die Quere kommen.
>
> Priorität bei Widerspruch:
> **Repository state > Git state > Handoff documentation > Agent assumptions.**

## Grundregel

```
1 unabhängige Aufgabe
= 1 Task-ID (T-XX)
= 1 Branch
= 1 Git Worktree
= 1 verantwortlicher Primary Agent
```

- Mehrere Primary Agents dürfen **gleichzeitig** arbeiten — aber **nie im selben Working Tree**.
- Innerhalb seines Worktrees darf ein Primary Agent geeignete **Subagenten** einsetzen.
- Jeder Task führt seinen eigenen Report unter `docs/agent/tasks/<TASK-ID>.md`
  (Vorlage: `docs/agent/tasks/_TEMPLATE.md`). Dieser Report lebt **im Task-Branch**.

## Verzeichnis-Konvention

Worktrees sind **Geschwister-Ordner** des Haupt-Repos:

```
/Users/moyo/canisflow-worktrees/anyvo-main → kanonischer main-Worktree
/Users/moyo/canisflow-worktrees/anyvo-<slug> → Task-Worktree (oder --branch)
```

Beispiele: `../anyvo-track-fix`, `../anyvo-health-weight`, `../anyvo-review`.

## Warum Worktrees hier sicher sind

- Worktrees teilen dieselbe Git-Historie (Commits), aber **jeder hat seinen eigenen Working Tree**.
- **Uncommittete** Änderungen des Haupt-Trees wandern **nicht** in einen neuen Worktree.
- **Untracked** Dateien wandern ebenfalls **nicht** mit. Historische, versionierte
  OpenCode-Konfiguration kann in Worktrees vorhanden sein; sie ist nicht der
  aktuelle Primary-Workflow.
- Zwei Worktrees können **nicht denselben Branch** auschecken. Jeder Task braucht einen eigenen Branch.

## Rollen (tool-neutral)

| Rolle | Aufgabe | Umsetzung |
|---|---|---|
| **Primary Agent** | verantwortlich für **einen** Task/Worktree | ChatGPT + Codex |
| **Implementation Agent** | schreibt Code im Task-Scope | Primary selbst oder delegierter Subagent |
| **Review Agent** | prüft einen abgeschlossenen Task | separater Codex-Review oder menschliches Review |
| **QA Agent** | Tests/Device-QA | Subagent / Codex |
| **Integrations-Agent** | merged Task-Branch, pflegt **globale** Doku | ein dafür bestimmter Primary Agent |

## Ablauf pro Task

1. **Task definieren** (User/ChatGPT): Ziel, Scope, Tabu-Dateien.
2. **Worktree + Branch anlegen**: `npm run agent:wt:create -- <slug> --base <integrationsbranch>`
   (siehe „Basis (`--base`)" unten). Legt Branch `<slug>`, Worktree `../anyvo-<slug>`
   und `docs/agent/tasks/<TASK-ID>.md` an.
3. **Primary Agent** startet **im Worktree** (ChatGPT + Codex), liest
   `AGENTS.md` + `docs/agent/` + den eigenen Task-Report.
4. **Implementieren** (ggf. mit Subagenten), **Tests** ausführen, Report pflegen.
5. **Task-Commit** (nur nach Freigabe): committe **nur** die Dateien im Task-Scope.
6. **Review** durch einen separaten Reviewer gegen den Task-Report.
7. **Fix** falls nötig.
8. **Integration nur nach ausdrücklicher Freigabe**: Integrations-Agent merged den Branch
   und aktualisiert **erst dann** die
   globalen Dateien (`TASKS.md`, `SESSION_HANDOFF.md`, `WORK_LOG.md`, ggf. `CURRENT_STATE.md`).

## Was parallel Konflikte vermeidet

- Jeder Task ändert **nur** seinen eigenen `docs/agent/tasks/<TASK-ID>.md` → keine Kollision.
- **Globale** Handoff-Dateien werden **nicht** parallel editiert, sondern nur bei Integration.
- Zwei Tasks sollten sich **keine Produktdateien** teilen. Überschneidungen vorab im Scope klären.

## Sicherheitsregeln (verbindlich, zusätzlich zu `AGENTS.md`)

Ein Parallel-Agent darf **niemals**:

- fremde uncommittete Änderungen oder Stashes löschen/überschreiben,
- `git reset --hard` / `git checkout --` / `git clean` gegen fremde Arbeit ausführen,
- andere Worktrees eigenmächtig bereinigen oder entfernen,
- unrelated Änderungen stagen/committen,
- Production/DB verändern, sofern der Task es nicht ausdrücklich erlaubt,
- automatisch OTA/Release/Deploy ausführen,
- ungeprüft auf den Haupt-/Integrationsbranch mergen,
- **ohne ausdrückliche Freigabe pushen**.

**Dirty Trees werden respektiert.** Ein Worktree wird nur entfernt, wenn er **sauber** ist.

## Helfer-Kommandos

```
npm run agent:wt:create -- <slug> --base <ref> [--branch <name>] [--task T-XX]
npm run agent:wt:list                 # alle Worktrees + clean/dirty
npm run agent:wt:finish -- <slug>     # read-only Abschluss-Checkliste (löscht nichts)
npm run agent:wt:remove -- <slug>     # entfernt Worktree NUR wenn clean (nie --force)
```

### Basis (`--base`)
`--base` ist **Pflicht** und muss **explizit** angegeben werden — es gibt bewusst **keinen**
stillen Default (kein automatisches `HEAD`). So entsteht keine versteckte oder falsche
Ausgangsbasis. Regel:

- **Normalfall (verbindlich seit 2026-10-06):** `--base main`. `main` ist die kanonische
  ANYVO Production-/Release-Linie (siehe `docs/agent/ANYVO_MASTER_STATUS.md`,
  „Canonical Git line"). Neue Production-/Release-Branches zweigen von `main` ab; nach
  erfolgreichem Device-/Release-Test kommen legitime Änderungen zurück nach `main`.
- **`feat/track-module-rewrite` ist NICHT mehr der Integrationsbranch** (bis 2026-08-18 so
  dokumentiert). Er ist seit `3de67c0` von Production getrennt; seine 30 eigenen Commits
  werden nur über einen eigenen Audit-/Integrationsauftrag übernommen.
- **Hotfix für eine ältere Runtime** (z. B. 1.0.3): vom zuletzt produktiven Commit dieser
  Runtime abzweigen **und** den runtime-isolierten Guard (`23e5df6` + `54a74c4`) enthalten;
  ältere Worktrees/Branches gelten nie automatisch als Release-Source-of-Truth.
- **Android:** Paritätsarbeit von `main` bzw. einem explizit darauf basierenden Branch.
- Der EAS-Branch/-Channel `production` ist nicht Git `main`.

- `create` schreibt den Task-Report **in den neuen Worktree** (Task-Branch), nicht in den Haupt-Tree.
- `remove` verweigert das Entfernen bei uncommitteten/untracked Änderungen.

## Session-Start im Worktree

Aus jedem Worktree funktionieren die bestehenden, rein lesenden Skripte:

```
npm run agent:start       # kompakte Übersicht
npm run agent:status      # voller Status + Stale-Warnung
```

`npm run agent:handoff -- --agent=<opencode|codex>` aktualisiert **nur** den AUTO-GENERATED-Block
der `SESSION_HANDOFF.md` **des jeweiligen Worktrees** — kein Commit/Push.

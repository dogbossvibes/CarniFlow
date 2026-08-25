# ANYVO — Agent Handoff (OpenCode ↔ OpenAI Codex)

Kurzanleitung für den täglichen Wechsel zwischen den Agenten. Das **Repository**
ist die gemeinsame technische Wahrheit.

## Dateien
| Datei | Zweck |
|---|---|
| `CURRENT_STATE.md` | Länger gültiger technischer Zustand (Verified/Assumed/Unknown). |
| `SESSION_HANDOFF.md` | Aktuellster Handoff: manuelle Abschnitte + automatischer Git-Snapshot. |
| `TASKS.md` | **Verpflichtend zum Start.** Task-IDs, Status und die **nächste TASK-ID**. |
| `DECISIONS.md` | Relevante technische Entscheidungen (mit Begründung). |
| `WORK_LOG.md` | Kurzer chronologischer Verlauf. |
| `../../AI_HANDOFF.md` | **Legacy** (2026-07-23). Durch `SESSION_HANDOFF.md` abgelöst; nur noch historische Quelle (in `docs/handbook-source/*` zitiert). Nicht als aktueller Handoff nutzen. |
| `../../scripts/agent-handoff.mjs` | Aktualisiert nur den AUTO-GENERATED-Block. |
| `../../scripts/agent-status.mjs` | Read-only Statusübersicht + Stale-Warnung. |
| `../../scripts/agent-start.mjs` | Read-only Kompaktübersicht beim Session-Start. |

## OpenCode → OpenAI Codex
1. In OpenCode: `/handoff` _(oder manuell:)_ `npm run agent:handoff -- --agent=opencode`.
   - Vorher die **manuellen** Abschnitte in `SESSION_HANDOFF.md` pflegen (Current task, Work completed, …).
2. OpenCode schliessen.
3. Im gleichen Projektordner starten: `codex`.
4. Codex folgt `AGENTS.md`, liest die verbindlichen `docs/agent/`-Dateien und vergleicht sie mit `git status`.

## OpenAI Codex → OpenCode
1. In Codex die manuellen Handoff-Abschnitte aktualisieren.
2. `npm run agent:handoff -- --agent=codex`
3. Codex schliessen.
4. Im gleichen Projektordner: `opencode`.

## Legacy Claude Code
`CLAUDE.md` und `.claude/` bleiben bis zur verifizierten OpenCode-/Codex-Übernahme als Legacy erhalten.
Sie können erst in einem separaten Cleanup entfernt werden; sie sind nicht Teil des aktiven Handoff-Workflows.

## Status prüfen
```
npm run agent:status      # voller Status + Stale-Warnung
npm run agent:start       # kompakte Session-Start-Übersicht
```

## Prioritätsregel (bei Widerspruch)
```
Repository state  >  Git state  >  Handoff documentation  >  Agent assumptions
```
Der tatsächliche Repository-Zustand hat immer Vorrang vor der Handoff-Doku.
Ein Agent darf uncommittete Änderungen **nie** automatisch als eigenen Stand
interpretieren oder überschreiben.

## Grenzen des Scripts
`agent-handoff.mjs` schreibt ausschliesslich zwischen
`<!-- AUTO-GENERATED:START -->` und `<!-- AUTO-GENERATED:END -->`.
Es macht **kein** commit / push / reset / checkout / clean, löscht nichts,
wechselt keinen Branch, startet keine Tests und stellt keine Remote-/DB-Verbindung her.
Manuelle Abschnitte bleiben immer erhalten.

## Paralleler Betrieb (Worktrees)
Für mehrere gleichzeitige, unabhängige Tasks siehe **`WORKTREES.md`**. Kurz:

- `1 Task = 1 Task-ID = 1 Branch = 1 Worktree = 1 Primary Agent` (Ordner `../anyvo-<slug>`).
- Jeder Task hat einen eigenen Report unter **`tasks/<TASK-ID>.md`** (Vorlage `tasks/_TEMPLATE.md`).
  Nur diese Datei wird im Task-Branch gepflegt — **globale** Dateien (`TASKS.md`,
  `SESSION_HANDOFF.md`, `CURRENT_STATE.md`, `WORK_LOG.md`) erst bei der **Integration**.
- Helfer: `npm run agent:wt:create|list|finish|remove` (`remove` nur wenn der Worktree clean ist).

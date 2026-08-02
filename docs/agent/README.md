# ANYVO — Agent Handoff (Claude Code ↔ Codex)

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

## CLAUDE → CODEX
1. In Claude: `/handoff`  _(oder ohne Slash-Command:)_ `npm run agent:handoff -- --agent=claude`
   - Vorher die **manuellen** Abschnitte in `SESSION_HANDOFF.md` pflegen (Current task, Work completed, …).
2. Claude schliessen.
3. Im gleichen Projektordner starten: `codex`
4. Codex liest `AGENTS.md` → `docs/agent/CURRENT_STATE.md` → `SESSION_HANDOFF.md` → `TASKS.md` und vergleicht mit `git status`.

## CODEX → CLAUDE
1. In Codex die manuellen Handoff-Abschnitte aktualisieren.
2. `npm run agent:handoff -- --agent=codex`
3. Codex schliessen.
4. Im gleichen Projektordner: `claude`

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

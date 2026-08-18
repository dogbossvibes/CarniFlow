# <TASK-ID> — <Kurztitel>

> Per-Task-Report für **einen** unabhängigen Task in **einem** Worktree.
> Kopiere diese Vorlage nach `docs/agent/tasks/<TASK-ID>.md` (die Helfer tun das automatisch).
> Diese Datei wird **nur im eigenen Task-Branch** gepflegt. Globale Dateien
> (`TASKS.md`, `SESSION_HANDOFF.md`, `CURRENT_STATE.md`, `WORK_LOG.md`) werden **erst bei der
> Integration** durch den dafür verantwortlichen Agenten aktualisiert — nicht parallel.
>
> Priorität bei Widerspruch:
> **Repository state > Git state > Handoff documentation > Agent assumptions.**

| Feld | Wert |
|---|---|
| **Task-ID** | `<TASK-ID>` |
| **Ziel** | <ein Satz: was ist erledigt, wenn der Task fertig ist> |
| **Worktree** | `../anyvo-<slug>` |
| **Branch** | `<branch>` |
| **Basis (base)** | `<explizit, z. B. feat/track-module-rewrite>` |
| **Verantwortlicher Agent** | `<opencode-primary \| engineering-lead \| codex \| …>` |
| **Status** | `OPEN` \| `IN_PROGRESS` \| `DONE(committed)` \| `BLOCKED` |
| **Review-Status** | `NONE` \| `REQUESTED` \| `PASS` \| `CHANGES_REQUESTED` |
| **Commit(s)** | `<sha …>` (kein Push/Merge ohne Freigabe) |

## Scope
_Was gehört zu diesem Task — und was ausdrücklich **nicht** (Non-Goals)._

## Tabu-Dateien / Do not touch
_Pfade, die dieser Task nicht anfassen darf (fremde parallele Tasks, dirty Bereiche, Production-Config)._

## Geänderte Dateien
_Wird während der Arbeit gepflegt (Pfad + kurze Notiz)._

## Tests / Verifikation
_Konkrete Befehle + Ergebnis (PASS/FAIL). Keine erfundenen Ergebnisse. „Nicht ausgeführt" ist eine gültige Angabe._

## Ergebnisse
_Was tatsächlich implementiert/verifiziert wurde (Fakten, keine Vorschläge)._

## Bekannte Risiken / offene Punkte
_Regressionsrisiken, ausstehende QA, Migrationen, Rollback-Hinweise._

## Integrations-Notiz (für den Integrations-Agenten)
_Welche globalen Dateien beim Merge aktualisiert werden müssen (TASKS.md-Eintrag, WORK_LOG-Zeile, …)._

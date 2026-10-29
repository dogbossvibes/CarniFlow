# <TASK-ID> — <Kurztitel>

> Per-Task-Report für **einen** unabhängigen Task in **einem** Worktree.
> Task-ID zuerst atomar in der gemeinsamen git-common-dir-Registry mit Owner,
> Zweck und exakter Basis reservieren; historische NextID-Angaben reservieren nichts.
> Danach diese Vorlage nach `docs/agent/tasks/<TASK-ID>.md` übernehmen (der Helfer tut das automatisch).
> Diese Datei wird **nur im eigenen Task-Branch** gepflegt. Globale Dateien
> (`TASKS.md`, `SESSION_HANDOFF.md`, `CURRENT_STATE.md`, `WORK_LOG.md`) werden **erst bei der
> Integration** durch den dafür verantwortlichen Agenten aktualisiert — nicht parallel.
>
> Priorität bei Widerspruch:
> **Repository/Git facts > current canonical MASTER_STATUS/ACTIVE_WORK > historical handoff/task files > agent assumptions.**

| Feld | Wert |
|---|---|
| **Task-ID** | `<TASK-ID>` |
| **Ziel** | <ein Satz: was ist erledigt, wenn der Task fertig ist> |
| **Worktree** | `../anyvo-<slug>` |
| **Branch** | `<branch>` |
| **Basis (base)** | `<explizit: main@SHA; ältere Runtime nur mit belegter Release-Basis>` |
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


## Koordinationsnachweise

- Verantwortlicher bestehender Fachchat: `<exakter Titel, Chat-ID, Host>`
- Eindeutige Referenz bei kollidierenden T-IDs: `<Scope + Chat-ID + absoluter Berichtspfad>`
- Abnahmekriterien: `<konkret; geforderte Geräte-/Feldprüfung separat>`
- Nutzerauftrag / erteilter Scope / Weiterleitung: `<Quelle und Datum>`
- Abhängigkeiten / fremde Writer / geschützte Änderungen: `<Beleg>`
- Geltende und fehlende Nutzerfreigaben: `<direkte Anweisung/Quelle; keine pauschale Freigabekette>`
- Umsetzung: `<OPEN/PASS/FAIL/BLOCKED/UNKNOWN/N/A + Dateien/Commit>`
- Tests und Review: `<Ergebnis, Datum, exakter geprüfter Stand; nicht ausgeführt benennen>`
- Integration in main: `<Status + main-SHA/Ancestry-Beleg; Commit allein genügt nicht>`
- Geräte-/Hardware-QA: `<Plattform, Binary-/OTA-ID, Datum, Beleg; separat offen halten>`
- Veröffentlichung: `<Runtime, Group-/Update-/Build-ID, Store-Track/Rollout; Quelle/Datum>`
- Betroffen: `<Dokumentation / Shared Code / native Funktionen / DB>`
- iOS-/Android-Folgeschritte und nächste benötigte Freigabe: `<konkrete Aktion>`

Der MASTER holt diesen Bericht ab. Fachchats führen keine konkurrierende globale
Übersicht und aktualisieren fremde Statusdateien nicht parallel. Freigabe einer
Phase autorisiert keine nachfolgenden Commit-/Push-/Merge-/Build-/Release-/DB-Aktionen.

---
name: anyvo-start
description: Startet eine ANYVO-Aufgabe sicher — prüft Worktree, Branch, HEAD, fremde Änderungen, frischen GitHub-Stand, kanonischen Status und Zuständigkeit und legt bei Bedarf einen eigenen Task-Worktree an. Zu Beginn jeder neuen Code-Aufgabe verwenden.
---

# ANYVO Aufgabenstart

Ziel: vor jeder Änderung sicher wissen, *wo* gearbeitet wird und *wem* die
vorhandenen Änderungen gehören. Dieser Skill erteilt keine Commit-/Push-/
Release-Freigabe.

## 1. Ort und Zustand (lesend)
- `git rev-parse --show-toplevel`, `git branch --show-current`, `git rev-parse --short HEAD`,
  `git status --short` (inkl. unversionierter Dateien), `git worktree list | wc -l`.
- Der SessionStart-Hook zeigt diese Werte bereits; bei Abweichung erneut prüfen.
- Uncommittete Änderungen nie als eigene annehmen. Für die neue Aufgabe nicht
  in einem fremden, schmutzigen Worktree arbeiten.

## 2. Frischer Stand
- `git fetch origin --prune` (nur lesend für den Working Tree), danach
  `git rev-list --left-right --count origin/main...HEAD`.
- `gh pr list --state open --limit 20` für offene PRs, die den Scope berühren.
- Liegt der Branch deutlich hinter `origin/main`, Basis mit der Nutzerin klären,
  bevor Code geändert wird.

## 3. Kanonischer Kontext
- `~/canisflow-worktrees/anyvo-main/docs/agent/ANYVO_MASTER_STATUS.md`
  und `ACTIVE_WORK.md` lesen: Production-Baseline, Owner, Stopps.
- Vorhandenen Task-Report im Ziel-Worktree weiterführen; keine Task-ID erfinden.
- BMAD-Umfang nach `docs/agent/BMAD.md` wählen und in einem Satz nennen.

## 4. Eigener Worktree (nur wenn nötig und im Auftrag)
Neue, unabhängige Aufgabe → eigener Worktree mit atomar reservierter Task-ID:
```
node scripts/agent-worktree.mjs create <slug> --base origin/main \
  --owner "claude-code-desktop" --purpose "<begrenzter Zweck>" --branch <typ>/<slug>
```
Vorher prüfen, dass Ordner und Branch frei sind. `node_modules` ggf. als Symlink
auf einen Worktree mit identischem `package-lock.json` (Lockfile vergleichen),
sonst `npm ci` nach Freigabe. Danach die Sitzung im neuen Worktree fortsetzen.

## Ausgabe
Kurz: Worktree, Branch@HEAD, fremde Änderungen (Anzahl, nicht angefasst),
Abstand zu origin/main, offene relevante PRs, Owner/Stopps, gewählter BMAD-Umfang,
nächster Schritt.

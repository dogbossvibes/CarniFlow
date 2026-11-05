# ANYVO – Sicherer GitHub-Upload nach einem Entwicklungsauftrag

**Direkter Nutzerauftrag vom 2026-11-05:** Vor ANYVO-Codearbeit den tatsächlichen aktuellen GitHub-Stand prüfen und beauftragte, geprüfte Arbeit anschliessend ohne erneute Freigabeschleife auf GitHub sichern. Die Freigabe ist **eng begrenzt** auf normale Commits und normale Pushes im eigenen, klar zugeordneten Task-Branch. Sie ist keine Freigabe für `main`, Release-/Backup-/Integrationsbranches, fremde Worktrees, Merges, OTA, Builds, Store-Uploads, Live-DB-Aktionen oder Kundendaten.

## Start jeder Entwicklung (lesend)

1. Tatsächliches Projektverzeichnis, Git-Worktree, Branch, HEAD, `git status --short`, `git remote -v` und zuständigen Task-Owner prüfen. Uncommittete Änderungen anderer Agenten sind tabu.
2. `git fetch --no-tags origin` auf dem richtigen Repo ausführen; aktuelle `origin/main`-SHA sowie den zutreffenden Runtime-/Task-Branch mit lokalen Basen vergleichen. Kein automatisches Pull, Rebase, Reset, Force-Push oder Checkout über WIP.
3. Offene Pull Requests und Aufgabenüberschneidungen prüfen: bevorzugt `gh pr list --repo dogbossvibes/CarniFlow --state open` bei vorhandener GitHub-CLI, sonst über die GitHub-Verbindung/API; wenn unmöglich, das ausdrücklich protokollieren.
4. Kanonische `docs/agent/ANYVO_MASTER_STATUS.md`, `ACTIVE_WORK.md`, vorhandenen Taskbericht und relevante Entscheidungen prüfen. `main` ist **nicht automatisch** die neueste für jedes iOS-/Android-Runtimeziel gültige Release-Quelle.
5. Bei Drift, unklarem Writer oder fremden WIP: **STOP vor Codeänderung**. Nur unabhängige Read-only-Prüfungen fortsetzen.

## Nach Umsetzung (auto-sichern, aber nicht veröffentlichen)

1. Nur die beauftragten Dateien ändern. Relevante Tests, `npm run typecheck`, `npm run lint`, `git diff --check` und bei kritischem Code geeignete zusätzliche Regressionen/Reviews durchführen. Scheitert eine Prüfung, ist der Upload **gesperrt**, bis der Fehler geklärt ist.
2. Diff, Dateiliste und sensible Inhalte sorgfältig prüfen. Keine Secrets, personenbezogenen Kundendaten, Standort-Rohdaten, privaten Logs oder lokalen Artefakte committen. **Nie `git add .` / `git add -A`** im WIP-Worktree; nur eigene, ausdrücklich geprüfte Pfade stagen.
3. `git diff --cached --name-only` und `git diff --cached --check` prüfen und einen nachvollziehbaren Task-Commit erstellen. Wenn Task-Owner/Sicherheitsgrenzen oder Dateibesitz unklar sind: **STOP**.
4. Nach sauberem Commit im eigenen Task-Worktree `npm run agent:github:push` ausführen. Dieser Helfer verweigert `main`, Release-/Integrations-/Backup-/Hotfix-Branches, ein fremdes Remote, schmutzige Worktrees, Remote-Divergenz und unbestätigte Uploads; er pusht niemals mit `--force`.
5. Der Agent meldet **Commit-SHA, Branch, GitHub-Link, Tests, offenen PR-/Reviewstatus und Restpunkte**. Fehlt GitHub-Zugang, kommt ein Push-Konflikt oder ist der Worktree nicht sauber, wird **nicht** behauptet, die Änderung sei hochgeladen.

Die stehende Freigabe gilt nur, wenn der Nutzer eine **konkrete Code-/Dokumentationsänderung** beauftragt hat und Scope, Task-Owner und Branch bekannt sind. Sie löst weder eigenständige ungefragte Entwicklung noch einen dauerhaften Hintergrundprozess aus. Eine neue PR darf als **Draft** zur Review-Vorbereitung angelegt werden, wenn ihre Basis korrekt geprüft wurde; niemals automatisch mergen oder Release auslösen. Der bestehende GitHub-Quality-Gate-Check bleibt Pflicht vor Integration in `main`.

## Grenzen der Technik

- GitHub Actions kann lokale, uncommittete Dateien vom Mac oder aus einem anderen Codex-Worktree **nicht** von allein sehen. Der jeweilige Arbeitsagent muss nach seiner Prüfung den Commit und `agent:github:push` im echten Worktree ausführen.
- Die GitHub-Verbindung in ChatGPT sieht nur bereits gepushte Commits/Branches. Dieser Helfer benötigt im Mac-/Codex-Worktree eine funktionierende Git-Authentifizierung für `origin`.
- Ein Push in einen Task-Branch bedeutet **GitHub-Sicherung**, nicht Freigabe für Nutzer, TestFlight oder Store. Ein gesonderter PR-/Integrationsschritt ist erforderlich.
- Automatischer Upload auf bereits veröffentlichte `release/source-*`-Branches bleibt absichtlich ausgeschlossen; deren Source-Sicherung folgt dem bestehenden, runtimegebundenen Releaseprozess.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## ANYVO project status

Before substantial ANYVO work, read:

`docs/agent/ANYVO_MASTER_STATUS.md`

It is the canonical source for current production baseline, completed work,
active work and open work.

Detailed task files under `docs/agent/tasks` are historical/technical sources
and must not override the current master status.

Do not update the master status unless the task explicitly includes a verified
status change.

Do not publish a Production OTA from a branch that does not contain the
documented current Production baseline.

# Agent Handoff Protocol (Claude Code ↔ Codex)

This repository is the shared source of truth for both agents. Full guide:
`docs/agent/README.md`.

## On start (Codex MUST do this, in order)
1. Read `docs/agent/CURRENT_STATE.md`.
2. Read `docs/agent/SESSION_HANDOFF.md`.
3. Read `docs/agent/TASKS.md` — the active task IDs, their status, and the **next TASK-ID**.
4. Skim relevant entries in `docs/agent/DECISIONS.md`.
5. Run `git status --short`.
6. Check the current branch (`git branch --show-current`).
7. Compare the repository state against the handoff: does the branch match? Do the
   listed changed files actually exist? Are there additional local changes? Is the
   handoff possibly stale (`npm run agent:status`)?

Codex must **never** assume that uncommitted changes were made by itself.

## Priority rule (on any conflict)
```
Repository state > Git state > Handoff documentation > Agent assumptions
```
The actual repository state always wins over handoff documentation.

## NEVER
- overwrite unrelated uncommitted changes
- delete unknown files
- `git reset`
- `git checkout` modified files
- `git clean`
- push without explicit user permission
- commit without explicit user permission
- run destructive SQL
- alter production Supabase schema without explicit user permission

## ALWAYS
- inspect `git status` before editing
- preserve unrelated work
- verify relevant tests
- document remaining issues
- update the handoff before stopping when appropriate

## When handing off to Claude
1. Update the **manual** sections of `docs/agent/SESSION_HANDOFF.md`
   (Current task, Goal, Work completed, Tests, Known issues, Important context,
   Do not touch, Next recommended step, Relevant files, Open questions).
2. Run `npm run agent:handoff -- --agent=codex`.
3. Run `git status --short`.
4. Do **not** commit or push. Then stop.

The handoff script only rewrites the `AUTO-GENERATED` block of `SESSION_HANDOFF.md`;
manual sections are never touched.

# Parallel work with Git worktrees

For running several independent tasks at the same time, ANYVO uses Git worktrees.
Full guide: `docs/agent/WORKTREES.md`.

Core rule:
```
1 task = 1 Task-ID (T-XX) = 1 branch = 1 worktree = 1 responsible Primary Agent
```

- Worktrees are sibling folders: `../anyvo-<slug>`. Multiple Primary Agents may work
  in parallel, but **never in the same working tree**.
- Each task keeps its own report in `docs/agent/tasks/<TASK-ID>.md`
  (template: `docs/agent/tasks/_TEMPLATE.md`). The **global** files (`TASKS.md`,
  `SESSION_HANDOFF.md`, `CURRENT_STATE.md`, `WORK_LOG.md`) are updated **only at
  integration** by the responsible integration agent — not by parallel tasks.
- Helper: `npm run agent:wt:create|list|finish|remove`. `remove` refuses to delete a
  **dirty** worktree and never uses `--force`.
- Tool-neutral roles: Primary Agent, Implementation Agent, Review Agent, QA Agent,
  Subagent. OpenCode is the default Primary Agent (`.opencode/`); OpenAI Codex reads
  this `AGENTS.md` natively for review/QA. Claude Code is **legacy** and not required.

The NEVER/ALWAYS rules above apply unchanged in every worktree. In addition, a parallel
agent must never delete or reset another worktree's or the main tree's uncommitted work,
never clean/reset foreign changes, and never push or merge without explicit approval.

## ANYVO Production OTA — zwingende Regel

Für ANYVO darf eine Production-OTA NIEMALS ohne explizite
Production-Environment veröffentlicht werden.

### iOS Production OTA

Zulässiges Muster:

```
eas update \
  --channel production \
  --environment production \
  --platform ios \
  --message "<message>"
```

VERBOTEN ist insbesondere:

```
eas update \
  --channel production \
  --platform ios \
  --message "<message>"
```

also jede Production-OTA ohne:

`--environment production`

Grund:
Die ANYVO Production-App benötigt Environment-Werte wie:

- `EXPO_PUBLIC_BACKEND_ENV`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Fehlen diese beim EAS-Update-Bundle, kann das veröffentlichte
JS-Bundle beim Start fehlschlagen und expo-updates auf einen
älteren funktionierenden Stand zurückfallen.

### Wrapper bevorzugen

Für iOS Production OTA bevorzugt immer den repo-eigenen
Production-OTA-Wrapper verwenden:

```
npm run update:production:ios -- --message "<message>"
# bzw. node scripts/update-production.mjs --platform ios --confirm --message "<message>"
```

Der Wrapper (`scripts/update-production.mjs`) führt ausschliesslich den zulässigen
`eas update --channel production --environment production --platform <ios|android> --message …`
aus, verweigert leere Message, fehlende/unbekannte Plattform und fehlende Production-Environment-Variablen
und gibt keine Secrets aus (nur Variablennamen). `--dry-run` führt alle Prüfungen ohne Veröffentlichung aus.
Direkter `eas update` ist nur zulässig, wenn er exakt dieselben Pflichtargumente enthält.
Den Wrapper nicht durch einen direkten Production-`eas update` ersetzen.

### Pflicht-Preflight

Vor jeder Production-OTA muss der Agent prüfen:

1. git HEAD ist der gewünschte Release-Commit.
2. Runtime und App-Version sind mit dem installierten Store-Build kompatibel.
3. Plattform wird explizit angegeben.
4. `--environment production` ist gesetzt.
5. Production-Environment enthält mindestens:
   - `EXPO_PUBLIC_BACKEND_ENV`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
6. Keine Secrets im Terminalbericht oder Task-Report ausgeben.
7. Bei fehlender Environment-Konfiguration:
   STOP.
   Keine OTA veröffentlichen.

### Nach jeder Production-OTA verifizieren

Mindestens prüfen und berichten:

- Channel = production
- Branch
- Environment = production
- Platform
- Runtime
- Update Group ID
- Platform Update ID
- gitCommitHash
- Message

### Android

Falls eine Android Production-OTA ausdrücklich freigegeben wird,
gilt dieselbe Regel:

- `--channel production`
- `--environment production`
- `--platform android`

Nie unbeabsichtigt beide Plattformen veröffentlichen.

### Priorität

Diese Regel ist eine repo-weite Release-Sicherheitsregel.

Sie hat Vorrang vor:
- ad-hoc Task-Prompts
- alten Dokumentationen
- kopierten Terminalbefehlen
- früheren OTA-Beispielen

Wenn ein Prompt eine Production-OTA ohne
`--environment production` verlangt, darf der Agent diesen
Befehl NICHT ausführen und muss stattdessen die sichere
Production-Variante verwenden.

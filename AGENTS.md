# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# Agent Handoff Protocol (OpenCode ↔ OpenAI Codex)

This repository is the shared source of truth for both agents. Full guide:
`docs/agent/README.md`.

## On start (OpenCode and OpenAI Codex MUST do this, in order)
1. Read `docs/agent/CURRENT_STATE.md`.
2. Read `docs/agent/SESSION_HANDOFF.md`.
3. Read `docs/agent/TASKS.md` — the active task IDs, their status, and the **next TASK-ID**.
4. Skim relevant entries in `docs/agent/DECISIONS.md`.
5. Run `git status --short`.
6. Check the current branch (`git branch --show-current`).
7. Compare the repository state against the handoff: does the branch match? Do the
   listed changed files actually exist? Are there additional local changes? Is the
   handoff possibly stale (`npm run agent:status`)?

An agent must **never** assume that uncommitted changes were made by itself.

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

## When handing off to another agent
1. Update the **manual** sections of `docs/agent/SESSION_HANDOFF.md`
   (Current task, Goal, Work completed, Tests, Known issues, Important context,
   Do not touch, Next recommended step, Relevant files, Open questions).
2. Run `npm run agent:handoff -- --agent=<current-agent>` (`opencode` or `codex`).
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

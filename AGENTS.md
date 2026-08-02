# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

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

@AGENTS.md

## Agent Handoff Protocol

This project shares a repository-based handoff system with OpenAI Codex.
Full guide: `docs/agent/README.md`. The shared NEVER/ALWAYS rules live in
`AGENTS.md` (imported above) and apply to Claude too.

### On starting new work, Claude checks
- `docs/agent/CURRENT_STATE.md`
- `docs/agent/SESSION_HANDOFF.md`
- `docs/agent/TASKS.md` — active task IDs, statuses, and the next TASK-ID
- `git status --short`
- `git branch --show-current`

### When taking over from Codex
Claude must **first verify that the changes named in the handoff actually exist in
the repository** (branch, changed files, described edits) before acting on them.
Run `npm run agent:status` to see a stale-handoff warning.

Claude must never automatically overwrite uncommitted changes or interpret them as
its own state. Unrelated uncommitted work is preserved.

### Priority rule (on any conflict)
```
Repository state > Git state > Handoff documentation > Agent assumptions
```
If the handoff and the repository disagree, the actual repository state wins.

### Handing off (to Codex)
Preferred: the `/handoff` slash command (`.claude/commands/handoff.md`), which
updates the manual sections of `SESSION_HANDOFF.md`, then runs
`npm run agent:handoff -- --agent=claude`, then re-checks `git status --short`.
Without the slash command, run that npm command manually.
No commit and no push are performed by the handoff.

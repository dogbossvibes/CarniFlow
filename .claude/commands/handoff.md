---
description: Update the agent handoff (manual sections + auto Git snapshot) for Claude → Codex. No commit, no push.
allowed-tools: Bash(git status:*), Bash(git branch:*), Bash(npm run agent:handoff:*), Bash(npm run agent:status:*), Read, Edit
---

You are preparing a handoff so **OpenAI Codex** can continue in this repository.
Follow the ANYVO Agent Handoff Protocol (`docs/agent/README.md`, `AGENTS.md`, `CLAUDE.md`).
Priority on any conflict: **Repository state > Git state > Handoff documentation > Agent assumptions.**

Do all of the following, in order:

1. Run `git status --short` and `git branch --show-current`. Note uncommitted and
   untracked work — treat unrelated changes as important and list them under
   "Do not touch". Never assume uncommitted changes are yours.

2. Read `docs/agent/SESSION_HANDOFF.md`.

3. Update ONLY the **manual** sections of `docs/agent/SESSION_HANDOFF.md` (everything
   outside the `AUTO-GENERATED` markers), based on what you actually did this session:
   - Current task
   - Goal
   - Work completed
   - Tests / verification
   - Known issues
   - Important context
   - Do not touch
   - Next recommended step
   - Relevant files
   - Open questions

   Be factual. Do not invent results. Do not edit anything between
   `<!-- AUTO-GENERATED:START -->` and `<!-- AUTO-GENERATED:END -->`.

4. Run: `npm run agent:handoff -- --agent=claude`
   (this regenerates only the AUTO-GENERATED Git snapshot block).

5. Run `git status --short` again.

6. Explicitly confirm to the user that **no commit and no push** were performed, and
   that only `docs/agent/SESSION_HANDOFF.md` (manual + auto block) was updated.

Do NOT commit, push, reset, checkout, clean, switch branches, run tests, or touch
any product code. This command only maintains the handoff document.

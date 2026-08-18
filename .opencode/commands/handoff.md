---
description: Update the OpenCode-to-Codex agent handoff without committing or pushing.
---

Prepare a repository-based handoff from **OpenCode** to **OpenAI Codex**. Follow
`AGENTS.md` and `docs/agent/README.md`. On any conflict, apply:
**Repository state > Git state > Handoff documentation > Agent assumptions.**

Do the following in order:

1. Run `git status --short` and `git branch --show-current`. Treat all uncommitted and
   untracked work as potentially unrelated; never assume it is yours.
2. Read `docs/agent/SESSION_HANDOFF.md`.
3. Update only these manual sections outside the AUTO-GENERATED markers, using only
   facts from the current session: Current task, Goal, Work completed, Tests / verification,
   Known issues, Important context, Do not touch, Next recommended step, Relevant files,
   and Open questions.
4. Never manually edit content between `<!-- AUTO-GENERATED:START -->` and
   `<!-- AUTO-GENERATED:END -->`.
5. Run `npm run agent:handoff -- --agent=opencode`.
6. Run `git status --short` again.
7. Confirm to the user: no commit, no push, no product-code changes, and that
   `docs/agent/SESSION_HANDOFF.md` was updated.

Do not commit, push, reset, checkout, clean, switch branches, start tests, or modify
product code. This command only maintains the handoff document.

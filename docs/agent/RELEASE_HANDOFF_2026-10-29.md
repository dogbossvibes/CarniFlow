# ANYVO — GitHub-only release and WIP handoff, 2026-10-29

**BACKUP / HANDOFF BRANCH. Not main integration or release approval.** Open source backup was explicitly requested by the human to continue with Chat and GitHub while quota is low. No force push, reset, main merge, new native/store/DB action from that request.

## Start with these sources

All26 completed release sources and freshly verified normal GitHub refs, full SHA/group/update/runtime/test metadata: [RELEASE-MANIFEST.json](release-evidence/2026-10-29/RELEASE-MANIFEST.json). Latest cumulative modern runtime sources at the end of the completed batch:

| Target | Runtime | Source | Update ID |
|---|---|---|---|
| android104 | 1.0.4 | [e0198c71bf0f](https://github.com/dogbossvibes/CarniFlow/tree/release/source-e0198c71bf0f) | 01a1859b-730b-7a62-b85a-12536a7fbae5 |
| android48 | 1.0.5 | [e2957bd836d6](https://github.com/dogbossvibes/CarniFlow/tree/release/source-e2957bd836d6) | 01a1859f-24f2-788b-b2ba-3338009d5539 |
| android49 | 1.0.5-greeting-v1 | [3bb2f4606e16](https://github.com/dogbossvibes/CarniFlow/tree/release/source-3bb2f4606e16) | 01a185aa-a7d6-75cd-897f-8c079c2f269f |
| ios105 | 1.0.5 | [6789598121a6](https://github.com/dogbossvibes/CarniFlow/tree/release/source-6789598121a6) | 01a18590-e361-7931-8f4b-2c24485c5fc6 |
| ios49 | 1.0.4 | [936131a1dd0c](https://github.com/dogbossvibes/CarniFlow/tree/release/source-936131a1dd0c) | 01a1858d-0e56-7060-b7ee-88cacee39a69 |
| ios52 | 1.0.5-motion-v2 | [6c3049482aec](https://github.com/dogbossvibes/CarniFlow/tree/release/source-6c3049482aec) | 01a18597-e13a-7801-a861-247941f2a2c8 |
| ios53 | 1.0.5-motion-v3 | [a4eb7ffeab4e](https://github.com/dogbossvibes/CarniFlow/tree/release/source-a4eb7ffeab4e) | 01a18594-3fbb-7c3e-a40b-07f4b93368d8 |
| ios55 | 1.0.5-motion-v4 | [005999f2ab2c](https://github.com/dogbossvibes/CarniFlow/tree/release/source-005999f2ab2c) | 01a185a3-106e-7a65-a4c5-4ead59ed938a |
| ios56 | 1.0.5-map49-v1 | [17443616b5ba](https://github.com/dogbossvibes/CarniFlow/tree/release/source-17443616b5ba) | 01a185a6-bfe2-7485-accc-2fabbe4e0e19 |
| android50 | 1.0.5-gnss-v1 | [3e1c2ae32765](https://github.com/dogbossvibes/CarniFlow/tree/release/source-3e1c2ae32765) | 01a185ae-7638-790c-b8fb-bcd26f7c9248 |

T93 subscription9modern runtimes; T109 keyboard10modern runtimes; saved field map/bounded diagnostics iOS55/56; T110 dashboard/calendar4current runtimes completed with source/native/DB/environment/wrapper/full-bundle/CDN checks. Device installation/field QA was explicitly deferred. Use exact runtime source, never latest main or another runtime wholesale. OTA is a complete bundle: preserve all previous functions, original persisted data and LiveShare. Older1.0.3security prerequisites remain OPEN; no support end or blind compatibility assumption.

## Open work and owner backups

- Personal diagnosis-access recovery: author [4aace9b7bf2602f10fed40cc433d0f3119779a7c](https://github.com/dogbossvibes/CarniFlow/tree/fix/diagnostics-access-retry-20261029), own iOS55 WIP integration [2020060368fe6a548495a4a1e3c93daae5e056bc](https://github.com/dogbossvibes/CarniFlow/tree/wip/chat01-diagnostics-access-ios55-20261029). Explicit renewed human OTA55 request exists, but this WIP snapshot is not deployment-ready. Author29tests/TS/lintPASS and independent static source review; personal server grant verified read-only by author with exclusive target1/others0. No rights changes. A separate final iOS55 candidate is being checked on005999f2; see follow-up release receipt if added. No SQLite/offline helper/angle changes.
- T115 backend [d096342fc979ec592d2bc5b744ff0b5f2a19b861](https://github.com/dogbossvibes/CarniFlow/tree/feat/health-shared-recipient-db-20261029), client [b1f18c57c6af233d7c6926ed7e22bd4a3302b357](https://github.com/dogbossvibes/CarniFlow/tree/feat/shared-dogs-inbox-20261029). Exact migration installed after separate human approval; static review, local synthetic RLS/rollback and Production catalog/ACL postflight PASS. Real normal-auth A/B reported **STOP_INACTIVE_GRANT_RETURNED**, so NO HTTP/API PASS and NO T115 OTA. Later offline investigation reproduced a Python3.9 ISO fractional-second parsing problem in the test runner; original HTTP cause is still to be confirmed from new evidence, not assumed solved. Test grant auto-expires; do not extend/recreate it or add account/DB writes without concrete approval. Fix/test the harness, then a separately approved test window + normal JWT A/B, expiry/revocation/data-isolation, client runtime integrations and full release gates. Device QA remains separate. Backend migration is already installed: do NOT blindly run it again.
- UI author backups: T109 fix/training-keyboard-scroll-20261029 at62f749d737f524d2d4e5273910afc9f5d7949918; T110 fix/dog-today-actions-20261029 at0e76110ee705615651893779f04c64c64b2e7b62. These author sources are not substitutes for current cumulative runtime branches.
- SQLite raw archive and offline motion-arrival audit belong to02, remain unactivated/unreleased and need separate safety review and integration. No confidence-replay or missing-acute-corner fix claim. New field export with released timeline is required for further causal analysis. Owner backup refs must be added from actual owner receipts, not inferred.
- Signed Android50 AAB was delivered for the user's manual Play upload; no agent Play upload. Native base sourcec4649ad59e92708db9ee51301812051aff92f33f, EAS build13d80093-f910-4df2-8bb7-b97d3901222d, runtime1.0.5-gnss-v1. AAB SHA256ee94554bced363d940e3397b4696f5a7179b668a9cf14978fa6db0da4b371b18. No build artifact committed here.

## Canonical source snapshot and limitations

Source base1a574212f6b7c1827bc03048f2eb5b5d662cd7a1. [CANONICAL-WIP-SNAPSHOT.json](release-evidence/2026-10-29/CANONICAL-WIP-SNAPSHOT.json) binds exact frozen input hashes and all24 listed paths. **23copied,1omitted**: ANYVO_MASTER_STATUS.md contains a new personal account identifier and is deliberately not exported; original main file unchanged. The copy retains the base's older status file; THIS sanitized handoff and release manifest are authoritative for this backup's status. Tooling historical authorship is unknown. Source snapshot is explicitly WIP, NOT independently QA-approved or suitable to merge/deploy wholesale.

Original canonical main and its24WIPs are unchanged. Read-only remote snapshot showed main divergence: local1a574212f6b7c1827bc03048f2eb5b5d662cd7a1 versus origin84ba7782ad4afa0ef65aa12a76ef246c29f22d1c,7local/2remote commits. No main synchronization was performed. Review/reconcile independently after protecting WIP; never force push. Existing copied coordination docs may contain historical stale lower sections.

The [historical open-source inventory](release-evidence/2026-10-29/HISTORICAL-OPEN-SOURCE-INVENTORY.json) is a sanitized read-only index, not ownership, backup, release or secret-scan PASS. Other scopes are **UNVERIFIED_OWNER_OR_SUCCESSOR** and may already exist in later release sources. This branch does not claim all historical worktrees are backed up, and did not modify150foreign worktrees. Current owner refs above overlay that inventory.

## Continue safely with Chat and GitHub

Read AGENTS and relevant docs/agent/tasks first. Choose the correct exact source/branch/runtime, inspect actual HEAD/status and preserve WIP. Read current server/OTA evidence before changes; old status is not fresh verification. No customer-data deletion, reset, destructive migration or reinstall-as-repair. Use synthetic fixtures locally; never execute local test fixtures against Production. Never paste keys/passwords/codes into chat or repository. No grant expansion from a UI issue.

Before an OTA: explicit scoped authorization, independent review and source-bound relevant tests/typecheck/lint/diff, native compatibility beyond equal runtime, DB prerequisites, current channel/runtime/ancestry and Production environment, exact source backup, repo wrapper with explicit platform/environment, once-only publish then actual manifest/bundle/all-asset verification. Stop on drift, incompatible source, failed check or data-loss risk. No automatic retry after an uncertain publish.

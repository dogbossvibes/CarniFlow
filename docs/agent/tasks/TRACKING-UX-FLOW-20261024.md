# Tracking UX flow — 2026-10-24

## Source and scope
Branch feat/tracking-ux-flow-20261023, base HEAD 0eadfd078ecd9639accc23a626aeb956cdfa93d8. Isolated worktree; local uncommitted implementation. No commit, push, merge, OTA or native build by 02.

Approved flow: Training → Meine Fährten → existing detail → Gemeinsam. Original user photograph included byte-for-byte as assets/images/tracking-field-hero.jpg. No paw/footprint icons added. Existing global navigation retained. This is an integration with existing recording, recovery, sharing and group flows, not replacement of tracking logic.

## Changes
- Module tabs, training photo and primary actions, actual active recordings, planner and recent history.
- Scoped searchable history with filters, bounded preview reads and stale/account response guards. Existing completed history selection retained; live recordings stay in recovery cards. Deletion blocked until hydration and for active entries, including a second check after confirmation.
- Existing detail map moved above analysis with unchanged TrackingMap props and both traces. Existing recovery/completion guards, analysis, correction, export and feedback retained. No completed search hero is asserted for a lay-only record.
- Together navigation retains exact sourceId for transfer/distraction and dog context only for returning to the hub. No unrelated dog selector can relabel the selected source.
- Group list has compact navigation and group cards. Group creation fields appear only when requested; invitation acceptance and all existing server contracts remain unchanged.

## Validation
Final combined run: 9 suites / 79 tests PASS. Includes overview/context, two traces, completion guard, detail interactions/recovery, sharing and group lifecycle protections. TypeScript PASS. ESLint 0 errors / 1 require-style warning in overview test mock. git diff --check PASS. Earlier counts overlap; do not add them.
First final invocation had three incorrect test filename extensions and a test-only renderer type import error; corrected and final checks rerun successfully.

Actual RN-Web components rendered with isolated fixture services into training/tracks/together HTML and visually inspected at 390px content width. Screenshot artifacts live in outputs/tracking-ux-flow-02-20261024 outside the worktree. Preview icons are diamond substitutes; native icons, live satellite map, keyboard, safe areas, VoiceOver and real device operation are NOT validated by this harness. Detail validated by regression tests, not a native screenshot. No device PASS claimed.

## Preservation and release
No changes to GPS admission, motion fusion, corner detection, distances, object/end decisions, persistence, resume engine, native sources, database or release configuration. Existing Live-Share gate and backend remain in place. Build49 and Android not published or modified remotely. Chat01 must independently review exact frozen sources and perform fresh bundle/runtime/release preflight before any separately authorized iOS55 OTA. No claim of visual pixel identity with conceptual mockups.

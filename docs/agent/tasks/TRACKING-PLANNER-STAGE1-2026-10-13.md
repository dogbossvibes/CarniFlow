# Tracking planner, stage 1 — 2026-10-13

User: implement planner and Live-Share, coordinate 05, publish verified OTA-ready portions via 01 to iOS/Android 1.0.4. Device QA expressly deferred.

## Ownership and source

02 owns this isolated feature worktree, branch `feat/tracking-planner-live`, base `9b5290dfbc9ea83085d0585bf8ff8af2a74f93a0` (released C1 iOS). Android released base is `6b875ba165b945187de1bda318094e914e0dbd5a`. 01 owns independent review, platform integration and publication. Canonical main and foreign status docs untouched. Dependencies reused by read-only symlink, no install.

## Implemented stage

Training → Fährten → Fährte auf der Karte planen opens a dedicated planner. Tap adds a waypoint, drag moves it, select toggles a planned object. Undo/remove point, fit route and explicit one-time location centering. Name/save/reopen/edit/copy/delete local templates. All six current locales have namespace resources. Touch targets ≥48 pt. Errors retain edits, navigation/deletion require deliberate confirmation. Duplicate save is synchronously blocked.

Coordinates and distances are explicitly **planned**, never raw GPS, measured distance, a completed track, found objects or a score. Plans are independent of dog/session recordings. Stage 1 does not overlay a template while recording, bind it to a dog/session, export/cloud-sync it, route on paths, auto-plan rulebook shapes or modify existing angle detection. Those are subsequent planner stages, not claimed complete.

## Storage, isolation and migration

Additive local SQLite migration 10 creates `local_track_plans`, keyed by owner and ID with compare-and-swap revisions. Reuses installed expo-sqlite; no cloud schema/native changes. Versions 1–9 unchanged. Exclusive transactions recheck auth identity/epoch before/after awaits, rolling back late writes. Local bounded storage: 100 templates/account, 200 waypoints/template, 80-character name. Parsing rejects invalid/nonfinite coordinates, degenerate <1 m geometry and mismatched persisted IDs. Explicit full local-data erase includes templates.

Repeated SIGNED_IN for the same account preserves unsaved drafts. Real sign-out and identity changes invalidate stale work, including batched A→B→A. A stale React auth render cannot restore the previous identity after the auth event.

## Verification

Feature + real SQLite upgrade tests: 7 suites / 44 tests PASS. Includes CRUD, owner isolation, conflicts, transactional rollback, restart/repository reopening, A→B→A, repeated same-user sign-in, late responses, duplicate save, failure retention and confirm-to-discard/delete. Migration tests start at versions 0/6/7/8/9, preserve transfer state, distraction drafts, original recordings, C1 cache/outbox and pending sync queue, and test explicit erase.

Earlier scoped regression: planner + distractions + local DB 11 suites / 63 tests PASS (overlaps above, before four added auth tests). Broader tracking regression and final type/lint results are recorded in the frozen handoff manifest. Device/native-map gesture QA is OPEN by explicit user deferral. No field/GPS accuracy improvement claimed.

01 independently reproduced the original same-user SIGNED_IN data-loss edge case and is reviewing the corrected candidate. Release only after independent review and fresh platform/runtime/export/native/source/asset/CDN checks. No publication by 02.

## Live-Share kept separate

Client continuation lives in `anyvo-tracking-live104`, not this patch. 05 freshly confirmed group/session RPCs available, live RPC EXECUTE withheld. Live activation additionally requires reviewed verified ACTIVE authority, compatible purchase/restore client, provider alignment and normal multi-account/retention acceptance. No new DB grant or activation inferred from this OTA request. Backend/server-account gates are separate from the user's deferred device testing.

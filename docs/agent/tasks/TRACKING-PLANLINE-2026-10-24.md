# Tracking safeguards and planned route — 2026-10-24

Base: 86c3d1e2a09952148bfd35a84642ca69be820b78. Branch: feat/tracking-planline-20261024. Owner: Chat 02. Local, uncommitted; no release.

Upper Yam right corner remains OPEN: user has no additional timestamped evidence. No detector thresholds changed or intended corners invented.

Unmodified cumulative base: 16 suites / 216 tests PASS across paired corners, lay startup, search acquisition, approach freshness, continuity, GPS admission, object/end confirmation and persisted dual traces. Results: ../outputs/tracking-integrated-baseline-02-20261024/results.json. This is automated regression evidence, not field validation.

Implemented: in laying map, choose an existing local account-owned plan; yellow dashed route is display-only. Measured traces, markers and camera inputs remain separate. No recorder, angle, distance, scoring, persistence or Live-Share logic changed. Selection is screen-local and dog/account/epoch-scoped, not restored after screen reopening. Existing saved templates are read only. Stale asynchronous responses are ignored; refresh failure preserves an already selected snapshot. Pocket lock disables selection. Plan objects do not become recorded objects.

Changed product files: app/track/legen.tsx; features/tracking/components/TrackingMap.tsx; features/tracking-planner/{i18n.ts,useLayPlan.ts,LayPlanControl.tsx}. Tests: layPlan.test.tsx and TrackingMap.referenceOverlays.test.tsx.

Validation: 5 suites / 30 tests PASS. Initial unchanged planner-screen test timed out during cold run; repeat passed without timeout/config/source change. Initial readonly-array type issue corrected by mapping to map coordinates. ESLint no errors; new hook warning corrected, existing warnings remain in legen/TrackingMap. diff-check PASS. TypeScript --noEmit PASS.

Still required: independent review, actual native map visual check including dashed route, small screens and accessibility. No device PASS. Android transfer/release and watches remain subsequent work. Build49 untouched. No commit, push, OTA, native build or backend action.

## V2 review correction
Dog A→B→A resurrected the previous selection in V1; a new regression test failed before the fix. Monotone scope generation now invalidates both selection and late requests across return to the same dog. 5 suites / 31 tests PASS, then 7 hook tests PASS including an additional late-response ABA case (overlapping counts). V2 ESLint 0 errors / 5 pre-existing warnings; diff-check PASS. V2 TypeScript still running at freeze; V1 TypeScript PASS must not be represented as V2 result. No algorithm or recorder changes.

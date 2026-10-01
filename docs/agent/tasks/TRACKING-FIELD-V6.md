# Tracking Field V6 — reported real-field baseline

Source: the original F1.1.10 and F2.1.10 QA exports in `/Users/moyo/Downloads/ANYVO-V6-field/`, read directly on 2026-10-01. The originals remain outside the repository. Minimal relative-coordinate regression fixtures are in `features/tracking/utils/__tests__/fixtures/fieldV6/`.

| Measure | F1.1.10 | F2.1.10 |
| --- | --- | --- |
| schemaMinor | 5 | 5 |
| Ground-truth turns | R → L | SR → SL → R → L |
| Current fused turns | R → L | R (sharpness unresolved) → SR → R → L |
| recordingSessionStarted | ~3.809 s | ~4.046 s |
| geometryStarted | ~16.822 s | ~16.757 s |
| startupUiDelay | ~772 ms | ~954 ms |
| geometryLockDelay | ~13.013 s | ~12.711 s |
| movementConfirmed / fallbackUsed | null / true | null / true |
| Approach start distance | — | ~8.49 m |
| departedStart / searchStarted | — | ~2.491 s / ~12.114 s |
| Search end | handler ~0.98 m; no end event | handler ~0.58 m; progress ~98.6%; blocker `open_objects`; no end event |
| Geometry / canonical length | 18.55 m / 17.01 m | 35.16 m / 30.28 m |
| Geometry delta | +9.03% | +16.12% |
| Replay max spatial gap | 5.48 m | 7.64 m |

F2 apex 15: a GPS turn exists; GPS direction is right, sharpness acute, geometry quality low (~0.355), and accuracy-to-leg ratio ~2.31. Candidate motion exists (motionAvailable true, netYawDeg ~102.68, monotonicity 1, yawShare ~0.758, turnEvidence 1, walking), but production turnFusion for the same apex reports motion.available false. Directly summing the original candidate window gives signed yaw ~+102.69°, which maps to left under the iOS sign convention. The ring lifetime/stop association gap is documented below.

The original exports contain relative x/y and times. The V6 regression fixtures retain only relevant relative sensor/search data and contain no session ID, absolute coordinates, absolute time, or personal metadata. Do not copy the full original exports into this repository.

## Recovery worktree handoff — 2026-10-01

- Branch `fix/tracking-field-v6-1.0.3`, base HEAD `5a0610b6afc40625c768e5930e6c67fa4e25c6f2`. All V6 edits remain uncommitted. `node_modules` is untracked and must never be staged.
- Existing V6 work covers start confirmation, approach/reached/departure, physical voice gating, handler end hysteresis, reference-object states, auto-dwell context, replay gap insertion, and additive QA schemaMinor 6. The recovery pass tightened motion+GPS start confirmation to two accepted displaced fixes and made voice fail closed when the physical position is missing.
- Apex association root cause: candidate motion was observed live, while finish reconstructed turns after the bounded Motion ring could lose the evidence; the previous fallback only matched already accepted live turns. Evidence is now retained by apex timestamp and used in the finish sweep. Low-quality GPS direction may be corrected only by strong, directed walking evidence; GPS still creates turns and determines sharpness. QA candidate snapshots update when later evidence is stronger.
- Verification: `git diff --check` PASS; `npx tsc --noEmit` PASS; ESLint on all modified TypeScript/TSX and new utilities/tests 0 errors, 5 warnings; `npx jest features/tracking app/track --runInBand --silent` 159 suites / 1825 tests PASS.
- Original-export replay update: F1 remains R→L (V6 confidence 0.717/0.788, geometryQuality 0.699/0.641; production confidence 0.728/0.788). F2 apex 15 has signed yaw about +102.69° from its original sample window, which maps to left; V6 yields R→SL→R→L (the first R remains unresolved because GPS sharpness is unresolved). Production `turnFusion` reported Motion unavailable at apex 15 despite the live candidate. The original apex Motion window ends at ~35.899 s; later exported Motion samples reach ~59.899 s, so the 20-s stop ring begins after the entire apex window. The bounded ring/stop lookup is the reproduced cause. Search replay from original accepted/display samples improves F1 spatial gap 5.48→2.11 m (temporal 18→9 s; 13→15 points) and F2 7.64→2.13 m (17→8 s; 16→26 points). Remaining temporal gaps have no observed intermediate sample and are marked `replayUnfillableGaps`.
- Start replay from recorded GPS fixes still uses fallback for both: F1 at ~16.226 s, F2 at ~16.096 s relative to startup origin; displacement is ~0.219 m and ~0.045 m. The v5 exports contain no pre-geometry pedometer/Motion samples, so an earlier sensor confirmation cannot be proven. Approach v5 diagnostics contain only aggregate timestamps/distance and no approach fix stream; exact near/reached timing cannot be replayed. Search end replay uses accepted/display x/y and end telemetry, but individual fix accuracy is absent; model eligibility begins about 43.5 s (F1) / 58.2 s (F2) and produces one end transition each, not verified native voice/haptic playback. No device field test was run.

## Final QA hardening decision

F2 ground truth is **SR → SL → R → L**. V6 sensor-derived is **R (sharpness unresolved) → SL → R → L**. Turn 1 has a detected GPS turn and right direction, but its GPS geometry cannot resolve sharpness reliably. `unresolved` is the intentional conservative result; Motion cannot supply sharpness and no threshold or ground-truth-specific rule is added. The regression asserts right direction, unresolved sharpness, and no false confidence. Better sensor geometry and a real field check are required to evaluate acute-turn sharpness. This uncertainty is **not a commit blocker**.

V6 schemaMinor remains **6**. Additive `startupMovementDiagnostics` captures up to 100 relative pre-geometry samples with accepted fix, displacement, steps, gait, acceleration, candidate source, confirmation, and rejection context. `approachFixDiagnostics` captures up to 100 relative fix samples and near/reached/departure/search transitions. `endConfirmationDiagnostics` records candidate time, stable-fix count, effective radius, handler distance, active dwell, confirmation time and rejection reason. Turn fusion exports direction source, signed yaw, Motion direction/evidence/association source, and geometry-only sharpness source. Unfillable replay gaps export source indices, measured spatial/temporal gaps, and `no_observed_intermediate_sample`. These diagnostics contain no absolute positions or times. Legacy schemas 0–5 remain readable.

The original V5 exports cannot retrospectively provide the missing startup Motion/pedometer stream, approach fix stream, or per-fix end accuracy. The V6 diagnostics will capture those on the next field run. **FIELD VERIFICATION REQUIRED: YES.**

Final validation: `git diff --check` passed; `npx tsc --noEmit` passed; ESLint of all 36 modified/new TS/TSX files reported 0 errors and 5 warnings; `npx jest features/tracking app/track --runInBand --silent` passed 159 suites and 1829 tests. F1 remains R→L. F2 remains R(unresolved)→SL→R→L, with apex 15 left direction sourced from strong Motion on a low-quality GPS turn, and sharpness sourced from geometry. The moving dwell is rejected, the stationary dwell accepted; end models fire once on accepted handler fixes; replay spatial gaps are ~2.11 m (F1) and ~2.13 m (F2), while unfillable temporal gaps remain reported. No Native or database change was made. **READY TO COMMIT: YES** under the agreed criterion; no commit, OTA, build, push or merge was performed.

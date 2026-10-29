# Android tracking diagnostics — 2026-10-08

Status: implementation and native verification PASS; uncommitted reviewable patch; release blocked on integrated candidate and live access.

## Authorization and ownership

- Direct user instruction in Chat04: “änderung und release durchführen”, turn `01a11bd1-e62c-7a81-8a24-98bca0f5347e`; earlier commit/main integration authorization remains applicable. MASTER verified the direct instruction.
- Own worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-android-diagnostics`.
- Branch: `feat/android-tracking-diagnostics`; base `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`.
- Chat01 is the sole Android EAS build/internal Play executor. No EAS build, submission, OTA or store rollout was performed here.
- Main/global status files are owned by MASTER; shared recorder/export by Chat03; personal authorization by Chat05. Their WIP is preserved.
- Chat02 released its isolated Kotlin WIP for review and transfer. Source delta independently verified: 26 added/0 removed lines; SHA1 `71e0e5065718e783f29a206a418fa0f9a703f297`. Only this Kotlin delta was incorporated. Original Kotlin and help/i18n WIP remain untouched.

## Implemented behavior

1. Read-only native `getAndroidTrackingDiagnostics`: explicit schema/scope, location permission observations, screen-interactive, power-save, device-idle, battery-optimization exception and own Expo location foreground-service observation. No permission request, battery exemption request, service start or recovery.
2. Coordinate-free synchronized Precision listener counters: start generation, fix/callback counts and relative reception offsets; monotonic fix age at receipt distinguished from callback age at snapshot. Invalid fix time remains null with a separate counter. Old/stopped listener callbacks cannot contaminate the new diagnostic generation; original position event delivery is unchanged.
3. Optional JS adapter with allow-listed fields; preserves zero/false/null; older binaries, iOS and native failures return unavailable. Raw native messages, coordinates and unapproved extensions are excluded.
4. Android-only card inside the existing `DiagnosticsRouteGate`: manual refresh, no polling/timer, no automatic location query, double-tap and unmount protection. Snapshot explicitly refers to the current application, not a saved track. Precision counters explicitly exclude the Expo location path.
5. Reviewed Kotlin WIP: GNSS status-only observation independent of raw measurement capability, and finite/nonnegative altitude/speed/bearing uncertainty metadata guarded at API26. Raw measurements remain opt-in. The productive GPS/Shelly JS source is required to supply `enableGnssStatusAndroid`; this branch alone does not include that separate product baseline.

Existing coordinates, timestamps, speed, bearing, filtering, track geometry, session recovery and business persistence are unchanged. New counters keep constant memory and perform no disk/network writes. GNSS status uses the existing handler/callback lifecycle. Added JUnit is a test-only dependency.

## Limits that must stay explicit

- Application snapshot is not native service ownership or task/session delivery acknowledgement. `serviceLifecycleAvailable=false`, `taskAcknowledgementAvailable=false`.
- No OEM kill attribution, continuity proof or background process-restart recovery is inferred. These remain open native instrumentation/field evidence needs.
- Fix ages refer to this boot/process stream, not cross-boot history. Precision observation is independent of Expo background batch diagnostics.
- Native data is displayed live only; it is not attached to a historical QA export as if captured during that session. Chat03’s recording evidence/export remains a separate change.
- Personal access correction is a release dependency: existing internal-tester route gating alone is not the final personal account gate. No gate, account or DB implementation was changed here.

## Validation

- Versioned Expo54 documentation and official Android Location/LocationManager/ActivityManager API references reviewed.
- Expo Android prebuild PASS; minSdk24/compileSdk36/targetSdk36. Generated manifest retains location/background/foreground-service permissions and optional BLE hardware (`required=false`); no new manifest permissions or features introduced.
- JavaScript: seven relevant suites, 31 tests PASS across adapter/card, Precision throttle, legacy location mode, session selection, Lay background recorder and background diagnostics.
- TypeScript final rerun after dependency isolation PASS. ESLint changed TS/TSX files PASS, zero warnings/errors.
- Diff whitespace PASS.
- Native counter sources/tests compile with the bundled Kotlin compiler. Standalone JUnit4.13.2 runner PASS: four tests (fix versus callback age, invalid time/zero, concurrent callbacks and stopped/old generations). Initial runner lacked Hamcrest; required test-only artifact fetched from Maven Central to the temporary folder and rerun PASS.
- First Gradle offline attempt stopped before module compilation because junit4.13.2 was not cached. Online targeted retry PASS: `:anyvo-precision-location:compileDebugKotlin :anyvo-precision-location:testDebugUnitTest`, BUILD SUCCESSFUL (15m24s), four native tests, zero failures/errors. Bundled Android Studio JDK, SDK36, max-workers2 and in-process Kotlin compiler; actual SDK54 Expo core/module compilation, not a stub. Existing GNSS status/Expo/Gradle deprecation warnings and local daemon metaspace warning remain; no source/config changes made to silence them. This is module debug compilation, not a production AAB/signing/whole-app/device acceptance.
- Initial UI test attempt timed out on heavily loaded host; synchronous mount and 30s test timeout rerun PASS. Initial dependency isolation omitted the package JS `build/` entrypoint; restored the unchanged JS entrypoint locally and background suites rerun PASS.
- Existing TaskManager14.0.9 install patch applied to an isolated dependency copy, then `node scripts/patch-expo-task-manager.cjs --check` PASS. Shared canonical TaskManager source was not repaired. Install/EAS verification hooks in package.json are retained; final combined EAS installation must run and verify them again.
- ADB device inventory succeeded: no attached Android device. No screen-off, Doze, resume, offline/persistence, permission, purchase/restore or GPS/GNSS hardware acceptance claimed.

## Release dependencies

Chat01 fresh read-only preflight (2026-10-08, 16:08–16:13 Zurich): highest read finished production EAS build 1.0.3(44), ID `c2b7ef45-6d0a-4340-91d4-6f4fefb03418`. Active Android OTA/runtime1.0.3 group `8e92eccb-ac1e-40c4-a140-182921760954`, source `60ae4d5ea77d8c7c93c36eb61c9e8c3d349d96ec`. Prepared config 1.0.4(45), production environment present, submit target internal. These observations are not store/installed-device verification.

Before native build, integrate the productive GPS/Shelly and distance-scale behavior with Chat03 evidence and Chat05 personal authorization, review conflicts, rerun combined tests/TaskManager patchcheck and fresh version/runtime/signing/environment preflight. `main@1a57421` alone lacks productive GPS/Shelly files; do not replace the release candidate with a runtime snapshot or discard those features.

Play Console currently requires login; used Play versionCodes and submission/signing access remain unknown. User was asked to log in, without sending credentials. No production store rollout before actual device acceptance. This native change requires a new binary; it cannot be delivered to installed runtime1.0.3 binaries by OTA alone.

## Files

- `app/dev/precision-location-test.tsx` — minimal import/mount inside the gate.
- `features/tracking/components/AndroidTrackingDiagnosticsCard.tsx` and its test.
- `features/tracking/native/androidTrackingDiagnostics.ts` and its test.
- `modules/anyvo-precision-location/android/build.gradle` — test-only JUnit.
- `modules/anyvo-precision-location/android/src/main/java/expo/modules/anyvoprecisionlocation/AnyvoPrecisionLocationModule.kt`.
- `modules/anyvo-precision-location/android/src/main/java/expo/modules/anyvoprecisionlocation/AndroidDiagnosticCounters.kt`.
- `modules/anyvo-precision-location/android/src/main/java/expo/modules/anyvoprecisionlocation/AndroidPlatformDiagnostics.kt`.
- `modules/anyvo-precision-location/android/src/test/java/expo/modules/anyvoprecisionlocation/AndroidDiagnosticCountersTest.kt`.
- `modules/anyvo-precision-location/src/AnyvoPrecisionLocation.types.ts` — availability comment only.
- This report.

Delivery is a complete patch including untracked new files and this report. Read-only `git apply --check --whitespace=error-all` on canonical main PASS; integration must repeat against then-current combined candidate. No commit, push, merge or main product modification performed here.

Official references: https://docs.expo.dev/versions/v54.0.0/ ; https://developer.android.com/reference/android/location/Location ; https://developer.android.com/reference/android/location/LocationManager ; https://developer.android.com/reference/android/app/ActivityManager#getRunningServices(int).

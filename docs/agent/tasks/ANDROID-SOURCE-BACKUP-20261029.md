# Android source backup — 2026-10-29

Owner: Chat 04, Android Native. **WIP SOURCE BACKUP — not an integration or release candidate.**

Direct human backup instruction verified in workshop turn `01a1869b-1c8e-7361-96ef-771d95ae3171`. It authorizes isolated commits and normal GitHub backup pushes. No merge, main push, app build, OTA, store, account, DB or device action is included.

## Source identity and continuation

- Original worktree basename: `anyvo-android-diagnostics`.
- Original branch: `feat/android-tracking-diagnostics`; exact base/previous HEAD: `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`.
- Backup branch: `backup/android-diagnostics-20261029` in `dogbossvibes/CarniFlow`.
- GitHub: https://github.com/dogbossvibes/CarniFlow/tree/backup/android-diagnostics-20261029
- Obtain this backup's full commit with `git rev-parse HEAD` after checking out this branch. No absolute Mac path is required to recover the sources.
- Historical native diagnostics implementation. Existing task report contains the original host checks and integration/access dependencies. No new build/device acceptance.
- Read the original task/report included in this backup. Its old 'uncommitted' labels and dated test results describe the historical candidate, not the backup operation or current production state.
- Before implementation or integration, compare with the then-current canonical product/runtime baseline and coordinate the existing owner. Do not blindly replay these older candidates onto main or publish them.

## Backup validation and limits

Explicit source list and SHA-256 freeze below; all existing staged entries were empty before staging. File types, secret/token patterns and synthetic fixtures reviewed; no known customer data, credentials, raw GPS exports, personal documents/media, logs, build products, dependencies or IDE state included. Source bytes preserved. Staged whitespace and blob scan are checked by the backup operator. No redundant full tests/builds/device checks were run for this archival commit; historical checks remain as documented, not rerun PASS claims. GitHub push and exact remote binding are reported separately after success.

## Exact original source-file freeze

| Path | SHA-256 |
| --- | --- |
| `app/dev/precision-location-test.tsx` | `0066fd67e9bbe941db55a9815105b6c7bf9fc27da7006935c2d31b64f0c62cd8` |
| `modules/anyvo-precision-location/android/build.gradle` | `bca1d938b4fbbfe2dfd770b0f494cbeeb2922dd1ff51ab536df83bbb43a00e44` |
| `modules/anyvo-precision-location/android/src/main/java/expo/modules/anyvoprecisionlocation/AnyvoPrecisionLocationModule.kt` | `2465d7567f7e287cd20664b4c5a953bc3b6aae797a9470ac05669ca917f5e766` |
| `modules/anyvo-precision-location/src/AnyvoPrecisionLocation.types.ts` | `20e3f28484d7be6a201c57f1a80dedcb65140b9e04c8291a3790348fa61ab8b1` |
| `docs/agent/tasks/ANDROID-TRACKING-DIAGNOSTICS-2026-10-08.md` | `5216bdedb49abae06cd98c8dcc7037a80d120f24a1662b356a2e760c90c5e1c0` |
| `features/tracking/components/AndroidTrackingDiagnosticsCard.tsx` | `dff870e3cfaad918c0cf82eebcff77368e0c82e8f9fb132c96f35f73056a1495` |
| `features/tracking/components/__tests__/AndroidTrackingDiagnosticsCard.test.tsx` | `0ccd1f73fe8e8d39afd05d14763d979f81ddc33c0b7e2f514d856144769c3630` |
| `features/tracking/native/__tests__/androidTrackingDiagnostics.test.ts` | `3d2e6144534f106b909ffb8dc9c65d333dc0eabb7571998734f2fb0c3c3fa0bf` |
| `features/tracking/native/androidTrackingDiagnostics.ts` | `3ad809937d45424f8d1a6b8a724c35285515f0d01ab7d0f97b2714cff3682033` |
| `modules/anyvo-precision-location/android/src/main/java/expo/modules/anyvoprecisionlocation/AndroidDiagnosticCounters.kt` | `ce32bbb6c499ef43cb0def9427b2b411b17234de7b8d4175da820f8434f945d9` |
| `modules/anyvo-precision-location/android/src/main/java/expo/modules/anyvoprecisionlocation/AndroidPlatformDiagnostics.kt` | `2219cea06dc266eebe412526f9aad1afe6156755726fc63130d3a91c36b217b6` |
| `modules/anyvo-precision-location/android/src/test/java/expo/modules/anyvoprecisionlocation/AndroidDiagnosticCountersTest.kt` | `f93868731d5f098fada3f8043e9e0e70589863675477c946f3a363f37bbbb2b4` |

## Sanitized 16-KB follow-up context (historical 2026-10-24)

Isolated Android 15/API35 ARM64 emulator reported PAGE_SIZE=16384. Existing locally derived build49 test APKs with embedded JavaScript exercised authenticated UI/map, synthetic GPS warmup, foreground-permission deny/retry/grant, screen-off/resume and offline process restart with retained sign-in. No linker/alignment/fatal errors were found in the exercised paths. Full recording, location FGS/background delivery and new-point SQLite persistence were NOT accepted: the dedicated test account's existing monthly quota blocked recording. This is a partial historical result, not current account/OTA/device/Play status. No account identifiers, credentials, screenshot, real coordinates or raw runtime logs are published in this backup. Re-check current stop/authorization/runtime conditions before any remaining tests; this backup does not lift them.

## Explicitly excluded ownership / sensitive gaps

- Android tracking-P0 and field-port WIPs are owned by Chat02; left unchanged.
- Mixed store-native integration and remaining Wear activity/color edits have no sufficiently established current writer/freeze in this backup; left unchanged for their owners.
- Emulator images/userdata, screenshots, signed APK/AABs, local test keys, raw logs/GPS and account-specific Active-grant preparations are deliberately excluded. Do not upload the local outputs directory wholesale.
- Other three independently backed-up scopes: `backup/android-field-qa-20261029`, `backup/android-quick-widget-20261029`, `backup/android-daily-widget-20261029`. These refs carry their own source manifests. This list is not an assertion that all historical worktrees are secured.

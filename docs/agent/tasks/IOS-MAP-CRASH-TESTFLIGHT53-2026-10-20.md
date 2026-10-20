# iOS native Maps crash fix – TestFlight53

Direct human03 authorization01a158fb-6129-7410-bded-299b6c1b8876: targeted fix, thorough checks, new iOS build first on TestFlight. No public App Store or Android release.03 owns patch;01 owns isolated release/build/upload.

Source03 b7293b14712c84cfa0ce1ac34582ad1b625f7b57 on current iOS52 productionJoker source49a578453a7bf6c7d8d5f41a88dc6c21f9d378fa. Six reviewed files; no dependency upgrade/lockfile/tracking/DB change. Release adds only iOS build53 and native runtime1.0.5-motion-v3, plus this report. Android config unchanged.

## Cumulative functions

Fresh EAS histories for original1.0.5 and1.0.5-motion-v2 total12groups; all sources ancestor of latest matching runtime source. All677normal105 product modules retained in686motion2 module graph; all48assets exact. Changed common modules explained only by already approved Help/Sharing, nativeMotionR2 and already published diagnostic UI. All686current module sources remain exact in this native build source; no feature cherry-picking or productJS change. Includes BackgroundLay/search, scale/reference/accuracy/recovery, Joker/Gummi/objectcorrection, transfer/groups, Help/Sharing, subscription/billing, documents/dogs/appointments, widgets/LiveActivity and nativeSensorR2.

## Gates

Local6guard tests,1028nativehost assertions/negativecontrol,4mapJest suites45tests,TSC,lint and iOS prebuild PASS. Full local Xcode unavailable; attemptedSwift19tests fail because local SDK/compiler mismatch. No test/guard weakened; cloud native-sensor-ios profile retains mandatory19sensor tests and adds map guard/contract tests. Cloud fullapp+WidgetKit compile/link/sign and actualIPA runtime/version/channel/entitlements/nativepatch evidence required.

## OTA routing requirement

New binary target: iOS1.0.5(53), runtime1.0.5-motion-v3, EAS production channel → production branch, same project/updateURL. New runtime deliberately isolates the changed native binary. Existing1.0.5-motion-v2/1.0.5/1.0.4 routes remain compatible and untouched. The new binary embeds ALL current approved JS; no extra OTA or unknown future publication is authorized by this task.

Once53is actually available, addMotion-v3+nativeBuildID+exactGitHubsource to canonical platform/release runtime inventory through00. Every later commissioned shared iOS OTA preflight must consider this supported installed runtime as well; first Motion3 OTA uses exact finished53nativebuild baseline and original first-runtime guard. Use a compatible source/fullbundle for each maintained runtime; never downgrade runtime or ship nativefix as OTA to52. Inspect actualIPA production channel header and native runtime; manifest204 before firstmatchingOTA is expected and means embedded source, not broken routing. Physical receipt remains unverified untildeviceQA.

## Remaining acceptance

Actual Apple processing+existing internalTeam(Expo) access required before claiming TestFlight available. Device navigation/mapmarker/replay/background/overlay/recording/dataretention QA follows. No comprehensive crash-freedom/devicePASS claim from hosttests. Operative evidence outputs/ios-maps-crash-release-01-2026-10-20.

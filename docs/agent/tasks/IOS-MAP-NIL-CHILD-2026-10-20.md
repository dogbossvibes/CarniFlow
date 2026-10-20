# iOS AIRMap nil-child crash fix — 2026-10-20

Owner: 03 iOS NATIVE. Integration/build/TestFlight owner: 01 RELEASES.
Base: `49a578453a7bf6c7d8d5f41a88dc6c21f9d378fa`; branch `fix/ios-map-nil-child-crash`.

## Problem and change

Seven symbolicated iOS 1.0.5 (52) crashes share the same exception: AIRMap's
`insertReactSubview:atIndex:` inserts nil into NSMutableArray. The matching build
binary and symbols identify AIRMap.m:138; the React Native Fabric legacy adapter
passes a child's nullable contentView. The precise customer navigation/lifecycle
trigger and logical child remain unknown.

Backport the four-line Apple Maps guard from upstream
[react-native-maps PR 5871](https://github.com/react-native-maps/react-native-maps/pull/5871/files)
to the existing pinned `react-native-maps` 1.20.1. Skip nil bookkeeping entries and
clamp the insertion index to the current child count. Keep existing marker/overlay
attachment and removal methods. No dependency upgrade, React/Fabric patch,
tracking/geometry/filter change, Android native code change or customer data write.

`postinstall` retains the existing TaskManager patch and then applies this patch.
It accepts only version 1.20.1 and the exact original or already patched AIRMap.m:

- Original SHA256: `4c034393e5f366ec975a2984a8a39102e8c7163692712be7022a2d7dabcc813b`
- Patched SHA256: `5a4355e79d080c44e75b45f1838ae8691d471d4dc807af54538926ee962751d4`

Unexpected source/version stops installation without writing. Repeated installation
is idempotent. Any future maps upgrade must explicitly review/remove this backport.
A native rebuild is required: OTA cannot replace compiled AIRMap code.

## Verification

- Six Node tests PASS: exact transformation, idempotence, unsupported versions,
  source drift/partial patch rejection, installed-file behavior and preserved hooks.
- Native host negative control PASS: the exact unpatched insertion method raises
  NSInvalidArgumentException containing nil, matching the customer exception.
- Patched native host contract PASS: 1,028 assertions covering nil children,
  index bounds, insertion order, all seven overlay classes, marker/overlay removal,
  wrapped children and 1,000 repeated insert/remove cycles.
- Four existing map Jest suites PASS: 45 tests (reference overlays, replay, camera,
  distance scale). These mock native views and do not prove native lifecycle safety.
- Full TypeScript `tsc --noEmit` PASS. Scoped ESLint PASS, zero warnings.
- `git diff --check` PASS. Lockfile and dependency versions unchanged.

The Objective-C host harness compiles the actual complete insert/remove methods
extracted from the verified installed AIRMap.m. It uses real Foundation arrays;
UIKit, MapKit and React are test stubs. It does not exercise the actual iOS app,
Fabric scheduling, view recycling or device navigation. The iOS cloud-build hook
retains sensor XCTest execution and adds the six guard tests and native host check.
The unchanged upstream int/NSUInteger loops have a scoped host compiler warning
suppression; production methods are not edited to silence that warning.

Initial local verification attempts used wrong Jest paths (zero tests executed)
and hit ESLint's undeclared CommonJS __dirname. Paths/global declaration were
corrected, then checks passed. The first native harness compile treated existing
upstream signedness warnings as errors; the scoped suppression above resolved it.
No product behavior was changed to make tests pass.

## Release handoff and remaining gates

Direct human instruction in chat 03: implement targeted fix, test thoroughly,
then have chat 01 provide a new iOS build through TestFlight first. Additional
human instruction in Werkstatt: commit all work to GitHub; verified read-only.
No App Store production release or Android release is authorized by this task.

01 must integrate this additive commit onto the freshly verified current iOS
release source, preserve approved release additions, use a new native runtime
and build number, run the full iOS/WidgetKit compile plus existing sensor tests
and the added map checks, inspect the packaged app, then submit to TestFlight.
Do not publish this native fix as an OTA to build 52.

TestFlight/device QA still required: repeatedly open/close logbook/detail/fullscreen
map, navigate back/forward, background/resume, zoom/group markers, replay and layer
switching; verify every expected marker, line and reference overlay remains visible.
Check start/pause/resume/finish without customer data loss. A successful host test
must not be reported as device acceptance or comprehensive crash freedom.

Machine logs and freeze evidence are held by chat 03 under
`outputs/ios-map-crash-fix-03-2026-10-20/` in the shared project workspace.

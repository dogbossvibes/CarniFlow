# Apple Watch companion session control — 2026-10-21

Owner03 iOS Native. Shared protocol/phone actions owner02; Android/Wear owner04;
GitHub backup coordinator00; native build/publisher01. Direct human scope in02:
`01a15bed-7add-7da2-bc86-7b53d183a64e` (21 October), personally read by03.

Base: clean current cumulative iOS source
`fb81698baced0a166432b175c5c37bdc39c6f192` (Journal53), not the old crash-only tree.
Worktree: `anyvo-ios-watch-session`; branch `feat/ios-watch-session-control`.

## Implementation

A real modern single-target SwiftUI watchOS app with its own executable, icon and
German/English/French/Italian text, embedded in the iPhone app via an idempotent
Expo plugin. Companion `com.anyvo.app.watchkitapp`, target `AnyvoWatch`, watchOS9+.
No independent Watch GPS/HealthKit/recording. The phone stays GPS, session,
permission, business-validation and persistence owner.

Native module `AnyvoWearableControl` implements the agreed02 JSON v1 schema and
exact API. Owner03 changes only native/core/tests and Watch plugin; parent
`index.ts` and `expo-module.config.json` belong to02 and are an explicit integration
dependency, not competing03 implementations. The source interface read from02
includes the agreed native `expiresAtMs` metadata addition.

Commands use only paired WCSession interactive requests/replies. Native-generated
request/peer IDs, native5s incoming deadline, strict8192-byte parser, at most8
pending callbacks; no persistent command queue or background mutation transfers.
Snapshots use latest-state application context. Clear/logout/watch switch invalidates
pending replies/state. Phone-side actions must also recheck the native expiry after
awaits, as confirmed and implemented by02. Native never acknowledges a recorder
action itself: only the matching phone ACK can confirm success.

The Watch shows current dog, phase, distance/time and only capabilities actually
supplied by the phone. StartLay is supported in the wire enum but not exposed by
the current phone binding; disclosure/recovery/quota stay on the phone. Search
start is offered only by an explicitly prepared/approach-confirmed phone context.
Mark object/pause/resume/end are capability-gated. End requires explicit confirmation
bound to the original context/revision/lease/session/dog/phase; changing those while
the dialog is open cannot end the replacement session. No automatic save claim.
Expired state, unreachable phone and unconfirmed commands are explicit. Reconnection
refreshes read-only state and never retries a mutation.

`app.json` only adds the Watch plugin before the existing widget plugin so reversed
Xcode mods apply the Watch target after widget restoration. Existing phone and
widget settings remain owned by their existing plugins. Versions/team follow the
phone metadata; identity drift/duplicate targets/missing version metadata stop
prebuild. iPhone depends on exact Watch product, embeds it under `Watch/`; no
reverse or self dependency. EAS signing metadata keeps the LiveActivity record.
Original1024px opaque app icon is reused unchanged. No added location/health/background
permissions. No dependency version, lockfile, DB or GPS/geometry code change.

EAS iOS postinstall keeps19sensor tests and map checks, then adds the Watch check:
shared Swift scenarios via XCTest on fullXcode plus actual iOS/watchOS simulator-SDK
typechecks. Full generated target/app/archive compile and execution remain separate.
The existing map-guard hook test is updated to the new preserved-plus-appended hook.

## Executed checks

-12 native Swift/Foundation scenarios PASS using the exact shared02 synthetic
fixtures: valid/invalid/unknown/missing/oversize wire data, prepared/null session,
capability/connection/expiry guards, matching ACK only, timeout/reconnection state,
context rotation/out-of-order messages, bounded monotonic freshness, confirmation
race, native request correlation/deadline/capacity/clear. This is host code execution,
not WatchConnectivity or device execution.
-3 Jest suites /28 tests PASS: new Watch PBX/metadata/idempotence/serialization tests
plus existing iOS extension and daily-widget tests.
-Full TypeScript typecheck PASS, scoped ESLint PASS (zero warnings), Swift syntax
parse PASS and diffcheck PASS; results bound in the final freeze. Swift syntax parsing does not prove SDK/API availability.
-6 existing map-patch regression tests PASS, unchanged installed map source.
-Repeated actual Expo prebuild succeeds in own tree. Watch plugin byte-idempotent;
exact five Watch Swift inputs and catalog copied, single target/embed/dependency,
companion plist checked. The first-to-second whole-project prebuild changes the
existing widget device-family1,2→1 through existing Expo behavior; no false blanket
whole-project byte-idempotence claim. Generated `ios/` stays ignored, not source.
-Podspec Ruby syntax PASS; original icon reports hasAlpha:no.

Local limitation: only CommandLineTools are installed, no Xcode app, watchOS/iOS
simulator SDK or XCTest. The initial `swift test` therefore failed before running
XCTest. A real Foundation host executable runs the same shared scenario source;
fullXcode keeps an XCTest wrapper in Package.swift. Initial host attempts were
invalidated by editing an input during a cold SDK compilation and by attempting to
relocate path-bound compiler caches. Both failures are retained; the stable-source
12-scenario run passed. No fake XCTest/SDK stubs were used or reported as a compile.

## Required next steps / remaining evidence

Integrate the exact02 shared phone contract/provider/real handlers with this03
native commit on the current source; retain03/02/04 ownership. Run independent
review of asynchronous source guards/confirmation and native transport boundaries.
00 backs up the reviewed isolated commits normally; no main merge/force push.

01's read-only preparation identifies no registered Watch bundle ID or EAS Watch
credentials yet; current phone/widget AdHoc profiles are invalid. A concrete
reviewed candidate must establish required Watch signing and paired test-device
prerequisites. No Apple registration/profile mutation performed by03.

Fresh native runtime/build number must be selected by01 from the integrated
candidate and fresh ASC/EAS state. Current53/Motion3 is only the source baseline;
this native delta is not an OTA-compatible upgrade for an existing binary.
No new build number/runtime is invented in this feature branch.

Full iPhone+existing widget+Watch native compile, simulator artifact inspection,
paired simulator lifecycle/reconnection/late command/duplicate/denial/session switch
execution and physical device QA are pending. Xcode26.2 cloud is a possible compile
path, but a paired simulator runner also needs an installed Watch runtime. Compile
alone is not paired runtime testing. Phone/watch testperson/devices and valid signed
AdHoc path must be arranged by01 for physical QA without an unreviewed Store/TestFlight
upload. No source-only test proves real connection behavior or customer-data safety.

No build, upload, production OTA, Store release, live DB write, device reset or
customer-data change was executed by03. Do not declare feature delivered until
native build/integration and actual device acceptance are separately evidenced.

Evidence: shared project `outputs/ios-watch-session-03-2026-10-21/`.

# Apple Watch companion control

Owner03: this iOS native module, shared Swift core/tests, Watch SwiftUI app and
`plugins/withAnyvoWatchApp.js`. Owner02: parent `index.ts`, module registration,
wire contract, phone coordinator and real recorder bindings. Owner04: Android/Wear.

The companion uses WCSession interactive messages `{json: string}` and reply
handlers. Native emits `onCommand` with its own UUID `requestId`, ephemeral paired
`peerId`, `expiresAtMs` (native receipt epoch +5s) and the strict validated JSON.
Remote JSON cannot provide those identities/deadline. Every command and read-only
snapshot request passes through the phone coordinator. Native never starts GPS,
selects a session, handles permissions or saves a recording.

Public native module: `AnyvoWearableControl`; methods `isAvailable`,
`publishSnapshot(json)`, `respond(requestId,json)`, `clear`; events `onCommand`,
`onConnection`. Parser rejects extra/missing keys, unsupported versions, invalid
types/IDs and JSON over8192 UTF-8 bytes. Only the paired WCSession can originate
native events. At most8 transient request callbacks, each expires after5s; clear,
watch switch and missing app invalidate callbacks. `respond` checks matching
message kind/command ID and native monotonic deadline before returning an ACK.
The phone coordinator independently checks the native deadline before mutations.

Snapshots use `updateApplicationContext` (latest state only), with an optional live
push. No `transferUserInfo`, persistent commands, cloud tokens, GPS history,
HealthKit, watch recorder or standalone tracking. Expired display leases cannot
enable controls. Reconnection and foreground entry request only a current snapshot;
no start/end replay. Success haptic/text requires the matching accepted phone ACK.
A timeout says confirmation is pending; it does not mean an action was rolled back.

The Watch app is a modern single target with a real executable, SwiftUI sources,
WatchConnectivity and its own asset catalog. It is embedded as
`Watch/AnyvoWatch.app`; the iPhone depends on the Watch target, never the reverse.
Bundle ID `<iphoneBundleId>.watchkitapp`, minimumwatchOS9, companion required;
version/build/team follow the iPhone config. The plugin is idempotent and runs
after existing widget-target restoration. EAS signing metadata includes the exact
Watch identity without changing the widget record.

Watch UI offers only phone-supplied capabilities. The v1 phone binding does not
remotely start laying: disclosure/recovery/quota remain on the phone. Prepared,
approach-confirmed search may offer start_search. End_phase requires explicit
Watch confirmation plus phone validation; an ACK is never a durable-save claim.
German, English, French and Italian text; system fonts, scrollable controls,
44pt minimum button content, accessibility labels, explicit stale/disconnected state.

Checks:

- `node scripts/check-watch-contract.mjs`: real host Foundation,13 shared parser,
  lifecycle, freshness, request-correlation scenarios; no Watch SDK required.
- `swift test --package-path modules/anyvo-wearable-control` on a fullXcode host:
  same shared scenarios through XCTest. CommandLineTools alone may lack XCTest.
- `node scripts/native-watch-check.mjs --local` on fullXcode: shared scenarios through XCTest plus
  actual watchOS/iOS simulator-SDK typechecks (not simulator execution).
- iOS EAS postinstall retains sensor/map tests and adds native-watch-check.
- Existing widget plugin tests and new Watch plugin tests verify target wiring,
  bundle identity, signing metadata, file membership and repeat prebuild behavior.

Required integration gates: merge exact02 index/config+handler contract with this
native delta, new iOS runtime/build through01, full app+widget+Watch compile and
packaged Watch executable/companion/signing verification. A config-plugin or host
test is not that build. Run actual paired simulator and later device tests for
prepare/start, mark, pause/resume, confirmed end, GPS denial, background/lock,
watch/iPhone restart, logout/owner/dog/session switch, duplicate/late ACK,
revocation/expired lease, reconnection and all pre-existing recorder/Widget flows.
No reinstall/reset or customer-data mutation as a fix. No Store upload or
Production release follows merely from this source implementation.

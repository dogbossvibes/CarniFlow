# Build 55 — start logo dismissal safeguard

Base: d13181bb392c211551c636a86eb1bad35ffed2ca. User explicitly authorized
implementation, commit and iOS Build55 OTA on 2026-10-28. Phase3 raw journal is
in a separate worktree and MUST NOT be included.

## Evidence and limit
24.412s screen recording shows ANYVO launch logo. User confirms touching the
screen immediately reveals the menu. Active OTA ID in that recording unknown.
Native55 update launch wait is 0ms. Router uses onReady -> one animation frame
-> internal splash hide. Cancellation/draw timing are candidates, not proven
physical root causes. The 26 October Build49 AIRMap nil crash is unrelated.

## Repair
RootLayout and its error fallback dismiss the existing native splash after a
nonzero finite root layout. Independent of touch, auth/network completion and
Router's animation frame. Idempotent per mount; bridge failure is reported and
a later layout may retry. No timers, reloads, auth bypass, new native module,
version changes, recording, map, storage or LiveShare changes.
Uses the already installed expo-router SplashScreen API, no new dependency.

## Required regression protection for future bundles
Retain useDismissStartupSplash plus its root/error-fallback bindings in all
successor bundles containing this fix. Run its regression suite together with
update-experience tests before release. Do not replace the guard with a touch
handler, arbitrary splash timeout or automatic app reload.
Required device check: cold launch without touching for logged-in and logged-out
states, online/offline; background/resume; error fallback; active session recovery.
A Jest pass cannot prove the physical iOS compositor behavior is fixed. The first
Build55 device acceptance after the OTA is still required; no absolute guarantee
against all future startup failures is made.

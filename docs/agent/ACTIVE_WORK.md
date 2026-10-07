# ANYVO – Active Work

## Canonical
- Branch `main`
- Worktree `/Users/moyo/canisflow-worktrees/anyvo-main`
- Produktintegration `2316e7cfd06149f0b0a7a1b2baa04430b88b867f` (T-64, lokal geprüft am 2026-10-07); nachfolgende Doku-Commits separat, HEAD frisch per Git abfragen
- `main` = kanonische Code-/Production-Linie.
- EAS `production` != Git `main`; der tatsächlich live veröffentlichte Stand wird in EAS geprüft.
- Produkt-/Release-Gesamtstatus: `docs/agent/ANYVO_MASTER_STATUS.md`.

## Main rule
- Auf `main` wird nicht regulär entwickelt.
- `main` nur für Integration getesteter Arbeit, Release-Preflight, Production-/Release-Ausgangspunkt und abschließende Tests.
- Neue Features/Fixes in eigenen Worktrees.
- Single-writer-Regel: Nur ein Writer gleichzeitig darf `main` verändern.
- Bei unerwartetem Drift: HARD STOP. Nicht zurücksetzen; Zustand prüfen und dokumentieren.

## Current active worktrees
Konservativ aktuell nur im täglichen Workspace:

### 00 MAIN – Production Line
- Branch `main`
- Worktree `/Users/moyo/canisflow-worktrees/anyvo-main`
- Status `Canonical / Integration only`

### TRACKING – End Detection
- Branch: `fix/tracking-end-detection`
- Worktree: `/Users/moyo/canisflow-worktrees/anyvo-fix-tracking-end-detection`
- Status: `Analysis / Implementation pending`
- ChatGPT: `02 – TRACKING`
- Codex terminal/session name: `TRACKING-END`

## Planned next work
PLAN – keine angelegten oder freigegebenen Branches/Worktrees:
- Tracking UI: Marker Collision Winkel/Gegenstand/Ende
- Tracking Continuity/Gaps: BLOCKED bis explizite Continuity-Semantik beschlossen
- Android: T-64 Native-Vorbereitung 1.0.4 (45) in main integriert; nativer Build und interner Play-Test separat freizugeben, Geräte-QA OPEN

## Worktree naming
- Feature: `anyvo-feature-<topic>` / `feat/<topic>`
- Fix: `anyvo-fix-<topic>` / `fix/<topic>`
- Native iOS nur wenn wirklich iOS-spezifisch: `anyvo-ios-<topic>` / `fix/ios-<topic>`
- Native Android nur wenn wirklich Android-spezifisch: `anyvo-android-<topic>` / `fix/android-<topic>`
- Release temporär: `anyvo-release-ios-<version>` / `release/ios-<version>` bzw. `anyvo-release-android-<version>` / `release/android-<version>`

## ChatGPT mapping
- `00 – ANYVO MASTER` → kanonischer Gesamtstatus / Entscheidungen
- `01 – RELEASES` → OTA, EAS, Builds, TestFlight, App Store, Play Store
- `02 – TRACKING` → GPS, Legen, Suche, Winkel, Gegenstände, End Detection, Replay
- `03 – iOS NATIVE` → Swift, Widget, Live Activity, Siri, App Intents, native iOS
- `04 – ANDROID NATIVE` → AndroidManifest, Services, Permissions, GNSS, native Android
- `05 – BACKEND / DB / SECURITY` → Supabase, RLS, Migrationen, Auth
- `06 – ABO / MEMBERSHIP` → RevenueCat, Produkte, Preise, Trial, Quotas
- `07 – UI / UX` → Screens, Gesten, Navigation, Design
- `08 – PRODUCT / ROADMAP` → Produktentscheidungen, MVP, Priorisierung
- `09 – WEBSITE / MARKETING` → Website, Social Media, App Store Assets

## Important
- `feat/track-module-rewrite` ist keine Production Source of Truth.
- Historische Worktrees nicht löschen, solange sie nicht separat geprüft und freigegeben wurden.

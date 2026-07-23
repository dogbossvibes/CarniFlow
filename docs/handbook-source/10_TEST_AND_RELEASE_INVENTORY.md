# 10 — Test, Release, Platform & Logging Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. Deckt Tests, Build/Release, iOS-/Android-Spezifika und Fehlerbehandlung/Logging ab. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme von Testabdeckung, Build-/Release-Konfiguration, plattformspezifischem Code sowie Fehlerbehandlung/Logging.

## Gefundene Dateien

- Test-Setup: `package.json` (`jest`, Preset `jest-expo`), `react-test-renderer.d.ts`, `types/`-Deklarationen.
- Build/Release: `eas.json`, `app.json`, `plugins/withAnyvoManifestCleanup.js`, `scripts/preflight.mjs`, `scripts/check-native-changes.mjs`, `scripts/update-production.mjs`, `EAS_BUILD.md`, `docs/BUILD_DECISION_MATRIX.md`, `docs/DEVELOPMENT_WORKFLOW.md`, `docs/TRAINER_ANDROID_PURCHASE_CHECKLIST.md`.
- iOS: `ios/ANYVO*`, `ios/LiveActivity/*` (Swift Widgets/Live Activity), `modules/anyvo-precision-location/ios/*.swift` + `.podspec`.
- Android: `android/app/src/*` (`main`, `debug`, `debugOptimized`), `modules/anyvo-precision-location/android/*` (Kotlin + `build.gradle`), Proguard-Regeln inline in `app.json`.
- Logging: `lib/monitoring.ts` (Sentry), `hooks/useCrashReporting.ts`.

## Tests (Ist)

- **32 Testdateien** (`**/__tests__/**/*.test.ts?(x)`), Schwerpunkt **Tracking/Fährte** (~19: engine, store, utils, repositories, components) — laut `AI_HANDOFF.md` zuletzt 32 Suites / 322 Tests grün.
- Weitere: `features/subscription/*` (3), `features/connect/*` (3), `features/ai/*` (1), `features/voice/*` (1), `services/__tests__/trainer-flow.test.ts`, `i18n`, `lib/haptics`, `components/ui/AnyvoButton`.
- **Abdeckungslücken (keine Tests gefunden):** `services/` (außer trainer-flow), Screens (`app/**`), Sync-Engine (`features/sync/services/syncEngine.ts` hat keinen direkten Test — nur Track-Persist/Recovery), RevenueCat (`lib/purchases.ts`). **[UNKLAR]** ob Integrationstests existieren (keine gefunden).
- Kein E2E-Framework (Detox/Maestro) im Repo gefunden.

## Build / Release (`eas.json`, `app.json`)

- EAS-Profile: `development` (dev-client, APK, channel development), `development-simulator` (iOS-Sim), `preview` (internal, APK), `production` (app-bundle Android, channel production, `autoIncrement:false`).
- Env pro Profil: `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (iOS-Key gesetzt; **kein Android-Key**). Sentry-Upload nur in production aktiv.
- Submit: iOS `ascAppId 6776362904`; Android `google-play-service-account.json`, track `internal`.
- Versionierung: `appVersionSource: local`; iOS `buildNumber 36`, Android `versionCode 36`, App-Version `1.0.1`, `runtimeVersion.policy: appVersion`.
- `experiments.reactCompiler` + `newArchEnabled` aktiv.
- Config-Plugin `withAnyvoManifestCleanup` (Android-Manifest-Bereinigung) + umfangreiche Plugin-Liste in `app.json` (Location/BLE/Calendar/SpeechRecognition/LocalAuth/BuildProperties etc.).

## iOS-spezifischer Code

- Prebuilt `ios/`-Projekt eingecheckt. **Live Activity / Widgets** in Swift (`ios/LiveActivity/*`, `LiveActivity.entitlements`) → Fährten-/Liegezeit-Anzeige (`features/tracking/native/faehrteLiveActivity.ts`, `liegezeitLiveActivity.ts`).
- Native Precision-Location iOS: `AnyvoPrecisionLocationModule.swift`, `AnyvoPrecisionLocationManager.swift` (CLLocationManager, Heading, Temporary Full Accuracy).
- iOS-spezifische UI: Liquid Glass (`expo-glass-effect`, iOS 26+), Apple Sign-In, `NSLocationTemporaryUsageDescriptionDictionary` (`app.json`), `supportsTablet:false`.

## Android-spezifischer Code

- Prebuilt `android/`-Projekt inkl. `debugOptimized`-Variante. Proguard/R8-Keep-Regeln inline in `app.json` (`expo-build-properties`, Minify+ShrinkResources in Release).
- Native Precision-Location Android: Kotlin-Modul mit **Raw GNSS Measurements**/GNSS-Status (`AnyvoPrecisionLocationModule.kt`).
- Permissions/BlockedPermissions in `app.json` (Foreground-Service-Location, Background-Location; blockiert u. a. Camera, ACTIVITY_RECOGNITION, READ_MEDIA_*). Edge-to-Edge aktiv, `predictiveBackGestureEnabled:false`. Google-Maps-API-Key inline.

## Fehlerbehandlung & Logging

- **Sentry** (`lib/monitoring.ts`): No-op ohne `EXPO_PUBLIC_SENTRY_DSN` **oder** bei Nutzer-Opt-out (`isCrashReportingEnabled`); Upload nur production. Globale `ErrorBoundary` in `app/_layout.tsx` → `captureError`. `components/ui/SoftBoundary.tsx` als lokale Boundary.
- **Service-Fehler:** einheitliches `Result<T> { data, error }`-Muster mit `console.error` in `features/tracking/services/trackService.ts`; viele „best-effort"-`try/catch` mit `console.warn` (z. B. Recorder, Purchases, Background-Location).
- **Logging:** ~27 Dateien nutzen `console.log/warn/error`, oft `__DEV__`-gated. Kein strukturierter Logger/keine zentrale Log-Abstraktion.

## Tatsächlicher Datenfluss (Release)

Code → `eas build` (Profil) → Channel (`eas update`) / Store-Submit. Native Änderungen erfordern Prebuild-Sync (`scripts/check-native-changes.mjs`).

## Bestehende Abhängigkeiten

- `jest-expo`, `@sentry/react-native`, EAS CLI, Google-Play-Service-Account, App-Store-Connect-App-ID.

## Aktuelle Regeln

- `docs/00_READ_FIRST.md` §6/§9: Workflow inkl. „iOS prüfen / Android prüfen / Tests ergänzen / kein Commit / kein Push"; Definition of Done verlangt TS + Lint + iOS + Android + Abschlussbericht.
- `AGENTS.md`: versionierte Expo-54-Doku vor Codeänderungen lesen.

## Inkonsistenzen

- Testabdeckung stark auf Tracking konzentriert; Sync/Services/Screens/IAP kaum abgedeckt.
- Android-RevenueCat-Key fehlt in `eas.json` (siehe Bericht 09).
- Kein einheitlicher Logger trotz Sentry.

## Offene Fragen

- Existiert eine CI (GitHub Actions o. Ä.)? Keine `.github/workflows` in der Top-Level-Liste gefunden — **[UNKLAR]**.
- Wird `development-simulator`/`preview` aktiv genutzt?

## Technische Risiken

- Direkte, ungetestete Remote-Schreibpfade (Fährten-Abschluss) ohne Integrationstests.
- Prebuilt Native-Projekte + Config-Plugins → Prebuild-Drift-Risiko bei `app.json`-Änderungen.

## Mögliche spätere Verbesserungen

- Integrationstests für Sync-Engine und Fährten-Abschluss; ggf. E2E (Maestro).
- Zentraler Logger; CI mit typecheck/lint/test.

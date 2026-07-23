# 00 — Repository Overview (Ist-Zustand)

> Analysebericht. Beschreibt den **tatsächlichen** Ist-Zustand des Repositories, nicht die Zielarchitektur. Keine Codeänderungen vorgeschlagen (außer im markierten Abschnitt am Ende). Unklare Punkte sind mit **[UNKLAR]** markiert.

## Zweck

Überblick über Projekt, Ordnerstruktur, verwendete Frameworks/Bibliotheken und das Toolchain-Setup als Grundlage für das Engineering Handbook.

## Projekt

- App-Name: **ANYVO** (`app.json` → `expo.name`), Slug `anyvo`, Scheme `anyvo`.
- Version `1.0.1`; iOS `buildNumber` 36 / Android `versionCode` 36 (`app.json`).
- Bundle/Package: `com.anyvo.app` (iOS + Android).
- Owner: `dog.boss.vibes`, EAS `projectId` `e6475526-66fa-42fa-b2a4-e11afc349e7a`.
- Git-Root: `/Users/moyo/canisflow/canisflow` (das ist das aktive App-Repo; die Ebene darüber `/Users/moyo/canisflow` enthält nur die Meta-`AGENTS.md`/`CLAUDE.md`).
- Aktueller Branch laut Handoff/Status: `feat/track-module-rewrite`.

## Verwendete Frameworks & Bibliotheken (aus `package.json`)

- **Expo SDK 54** (`expo ~54.0.36`), **React Native 0.81.5**, **React 19.1.0**.
- **New Architecture aktiviert** (`app.json` → `newArchEnabled: true`), `experiments.reactCompiler: true`, `experiments.typedRoutes: true`.
- **Expo Router ~6.0.24** (`main: "expo-router/entry"`) — dateibasierte Navigation.
- **State/Data:** `zustand ^5` (lokale Stores), `@tanstack/react-query ^5` (Server-State).
- **Backend:** `@supabase/supabase-js ^2.106.2`.
- **Styling:** `nativewind ^4.2.4` + `tailwindcss ^3.4.19` (Config `tailwind.config.js`, `global.css`, `babel.config.js` mit `jsxImportSource: 'nativewind'`). Parallel dazu große Nutzung von `StyleSheet.create` und Farb-Tokens `constants/colors.ts` (`C`).
- **Karten:** `react-native-maps 1.20.1` (Android Google Maps API-Key inline in `app.json`).
- **GPS/Sensorik:** `expo-location`, `expo-sensors`, `expo-task-manager`, `react-native-ble-plx` (externes BLE-GPS), eigenes Native-Modul `modules/anyvo-precision-location`.
- **IAP/Abos:** `react-native-purchases ^10.2.2` (RevenueCat).
- **Weitere:** `expo-sqlite` (Offline-DB), `expo-speech`, `expo-speech-recognition`, `expo-audio`, `expo-video`, `expo-calendar`, `expo-notifications`, `expo-live-activity`, `expo-local-authentication`, `@sentry/react-native ~7.2.0`, `i18next`/`react-i18next`, `react-native-reanimated ~4`, `react-native-worklets`.

## Ordnerstruktur (Top-Level, tatsächlich)

- `app/` — Expo-Router-Routen (Screens). Untergruppen: `(auth)`, `(tabs)`, `track/`, `trainer/`, `unit/`, `training/`, `analyse/`, `connect/`, `connection/`, `chat/`, `dog*`, `umfrage/`, `dev/`.
- `features/` — fachliche Module: `tracking/` (größtes Modul), `sync/`, `connect/`, `subscription/`, `ai/`, `dogs/`, `voice/`, `media/`, `training/`.
- `services/` — Supabase-nahe Service-Funktionen (31 Dateien, z. B. `auth.ts`, `dogs.ts`, `trainerService.ts`, `capabilityService.ts`, `trackingService.ts` [legacy]).
- `hooks/` — React-Query- und Setting-Hooks (28 Dateien).
- `lib/` — Querschnitt: `supabase.ts`, `purchases.ts`, `session-context.tsx`, `queryClient.ts`, `monitoring.ts`, `localDb/`, `entitlements/`, `trackRecorder.ts` (legacy), `externalGps.ts`.
- `components/` — UI-Bibliothek (`ui/`, `dogs/`, `training/`, `calendar/`, `analytics/`, `tracking/`).
- `stores/` — 3 kleine globale Zustand-Stores (`activeTraining.ts`, `homeLayout.ts`, `liveBarScroll.ts`).
- `types/` — zentrale Typen (14 Dateien).
- `constants/` — `colors.ts`, `theme.ts`, `disciplines.ts`, `sparten.ts`.
- `i18n/` — de-CH / de-DE / gsw-CH + `locales/` (de/fr/gsw). **[UNKLAR]** Zwei parallele i18n-Strukturen (`i18n/*.ts` vs. `i18n/locales/*.ts`) — siehe Bericht 08.
- `modules/anyvo-precision-location/` — eigenes Expo-Native-Modul (iOS Swift / Android Kotlin, TS-API).
- `supabase/functions/` — 13 Edge Functions; **kein** `supabase/migrations/` (Schema liegt als lose Root-`*.sql`-Dateien vor, siehe Bericht 03).
- `android/`, `ios/` — geprebuildete Native-Projekte (nicht rein „managed").
- `plugins/` — `withAnyvoManifestCleanup` (Config-Plugin, in `app.json` referenziert).
- `docs/` — vorhandene Dokumentation inkl. `docs/handbook-source/` (dieser Ordner) und `docs/faehrte/` (Stubs).
- `scripts/` — Build-/Preflight-Skripte (`preflight.mjs`, `check-native-changes.mjs`, `update-production.mjs`, `reset-project.js`).
- Zahlreiche `*.sql`-Dateien im Root (Setup/Migrations-Skripte, manuell auszuführen).

## Toolchain / Scripts (`package.json`)

- `test` → `jest` (Preset `jest-expo`, `testMatch: **/__tests__/**/*.test.ts?(x)`, Alias `@/ → rootDir`).
- `typecheck` → `tsc --noEmit`; `lint` → `expo lint` (ESLint 9, `eslint-config-expo`).
- EAS-Build-/Update-Skripte (development/preview/production), `native:check`, `preflight`.
- `tsconfig.json`: `strict: true`, Pfad-Alias `@/* → ./*`, **`supabase/functions` von TS ausgeschlossen** (Deno-Code).

## Bestehende Abhängigkeiten (strukturell)

- `expo.install.exclude: ['@react-navigation/native']` (Version wird bewusst gepinnt gehalten, `package.json`).
- Native Projekte (`ios/`, `android/`) sind eingecheckt → Änderungen an `app.json`-Plugins erfordern Prebuild/Sync (`scripts/check-native-changes.mjs`).

## Aktuelle Regeln (im Repo verankert)

- `AGENTS.md`/`CLAUDE.md` (beide Ebenen): „Expo HAS CHANGED — Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code."
- `docs/00_READ_FIRST.md` definiert das Ziel-Handbuch mit verbindlichen Prinzipien (Single Source of Truth, Offline First, deterministische Smart Analyse, keine zweite Hundestruktur/GPS-Engine, keine Fachlogik im UI, keine direkten DB-Zugriffe aus Screens).

## Inkonsistenzen (Überblick, Details in Fachberichten)

- **Zwei Track-Datenmodelle:** `services/trackingService.ts` (+ `types/tracking.ts`) nutzt `track_sessions` (Legacy); der aktive Recorder nutzt `training_sessions(type='track')` (`features/tracking/services/trackService.ts`). → Bericht 04/05/11.
- **Sehr viele lose `*.sql`-Setup-Dateien im Root** statt versionierter `supabase/migrations/`. → Bericht 03.
- **Uncommittete Arbeitskopie** ist umfangreich (viele `??`/`M`-Dateien in `git status`), u. a. `AI_HANDOFF.md`, `docs/`, `app/connect/`, Tracking-Registry-Dateien. → Bericht 11.

## Offene Fragen

- **[UNKLAR]** Ist die obere Verzeichnisebene `/Users/moyo/canisflow` bewusst ein separates Meta-Repo oder ein Artefakt?
- **[UNKLAR]** Welche Root-`*.sql`-Dateien sind bereits in Produktion eingespielt und welche nicht? (Kein Migrations-Ledger vorhanden.)

## Technische Risiken

- Fehlendes zentrales DB-Migrations-Ledger → Drift zwischen Code-Erwartung und tatsächlichem Supabase-Schema schwer nachweisbar.
- Inline-Fallback von Supabase-URL/Anon-Key und Google-Maps-API-Key im Repo (`lib/supabase.ts`, `app.json`) → Konfigurations-/Secret-Hygiene. (Anon-Key ist per Design öffentlich; Maps-Key sollte restringiert sein — **[UNKLAR]**.)

## Mögliche spätere Verbesserungen

- Root-`*.sql` in ein versioniertes `supabase/migrations/`-Verzeichnis mit Ledger überführen.
- i18n auf eine Struktur konsolidieren.
- Legacy-Track-Pfad (`services/trackingService.ts`, `types/tracking.ts`) explizit als deprecated markieren oder entfernen.

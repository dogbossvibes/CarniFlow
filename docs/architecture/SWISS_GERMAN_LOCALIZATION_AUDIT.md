# ANYVO Swiss German Localization Audit

Date: 2026-07-30
Agent: Codex
Scope: Localization-only audit and targeted correction for Swiss German (`gsw`).

## Summary

The existing localization stack uses `i18next` with `react-i18next`. The active resource setup is defined in `i18n/config.ts`; the Swiss German locale is `gsw`, with legacy `gsw-CH` normalized to `gsw`. The fallback language is `de`.

The root cause for visible High German in Swiss German mode was primarily incomplete `gsw` key coverage. Missing keys fell back to `de`. A secondary cause is hardcoded visible UI copy in screens and components that bypasses i18n entirely.

## A. CH Locale Code

`gsw`

Legacy locale handling also maps `gsw-CH` to `gsw`.

## B. Fallback Language

`de`

## C. DE Key Count

Current German reference key count after this pass: `372`.

Initial key count at the start of the audit: `184`.

## D. CH Key Count Before

Swiss German key count before corrections: `175`.

## E. Missing CH Keys Before

Missing Swiss German keys before corrections: `9`.

- `commands.title`
- `doghub.tab.commands`
- `doghub.tab.faehrte`
- `doghub.tab.heat`
- `doghub.tab.trainer`
- `doghub.tab.training`
- `heat.title`
- `track.angle`
- `training.timer`

## F. Missing CH Keys After

Missing Swiss German keys after corrections: `0`.

Empty Swiss German values after corrections: `0`.

## G. Corrected Translations

Swiss German entries added or corrected in this pass: `197`.

This includes the 9 previously missing keys plus new Auth, Account Security, Recovery, Login, Track/Faehrte, live tracking, background location, and voice guidance keys added to both `de` and `gsw`.

## H. Hardcoded UI Texts Moved To i18n

Diff-based count of removed hardcoded visible UI snippets in corrected files: `49`.

This count covers the changed Auth/Login/Account Security/Faehrte files and excludes style strings, technical identifiers, stored domain values, and native/system-provided labels.

## I. Screens Corrected

- Login/Register screen
- Password forgot screen
- Password recovery screen
- Account & Security overview
- Change email screen
- Change password screen
- Faehrte legen screen
- Live tracking chrome
- Active Faehrte card
- Background location disclosure
- Track voice guidance phrases

## J. Intentionally Identical DE/CH Terms

Some strings remain identical by design because they are product names, sports terms, abbreviations, provider names, legal labels, or widely understood technical terms.

Examples:

- `ANYVO`
- `GPS`
- `Training`
- `Timer`
- `Smart Coach`
- `Smart Analyse`
- `Google`
- `Apple`
- `E-Mail`
- `Passwort`
- `Face ID`
- `Sync-Center`
- `Trainer`
- `IGP`
- `IBGH`
- `Obedience`
- `Agility`
- `GW`
- `OW`
- `BW`
- `AGB`
- `Datenschutzrichtlinien`

Identical DE/CH values are reported by the localization test but are not treated as automatic failures.

## K. Legal Texts

Legal and consent-related wording was left in standard German where present. AGB, Datenschutz, purchase/subscription, consent, and similar legally relevant texts were not freely rewritten into dialect.

Legal texts requiring Swiss German would need separate legal/product approval.

## L. Business Logic Changed

NEIN.

No Auth, Supabase, GPS, tracking calculation, subscription, database, navigation, or persistence logic was intentionally changed. Code edits only connected existing visible text locations to the existing i18n layer.

## M. DB Changed

NEIN.

No database schema, migrations, Supabase tables, policies, or SQL were changed.

## N. Tests

Added localization consistency coverage in `i18n/__tests__/localization-consistency.test.ts`.

The test checks:

- all German reference keys exist in Swiss German
- no empty Swiss German values exist
- DE/GSW flat key structures match
- important Auth keys exist
- important Track/Faehrte keys exist
- important Home keys exist
- important Profile keys exist
- suspicious identical DE/CH values are reportable without failing the suite

Validation results:

- `npx tsc --noEmit`: PASS
- ESLint on changed files: PASS with existing warnings only
- Relevant localization/auth/login/track tests: PASS, 7 suites / 75 tests
- Full Jest suite: PASS, 50 suites / 476 tests

Known validation warnings that remain:

- `app/track/legen.tsx`: pre-existing lint warnings for unused `lastAngle`, require-style import, and hook dependency
- `features/tracking/hooks/useTrackVoiceGuidance.ts`: require-style import warning from the existing test/audio fallback pattern
- Jest reports a known open-handle warning after the full suite

## O. Remaining Non-Translated Or Risk Areas

The key parity problem is fixed for the central translation dictionaries: `de` and `gsw` now have matching key sets.

However, a repository-wide hardcoded text scan still finds many candidates in `app/`, `components/`, and `features/`. These were not all converted in this pass because doing so blindly would risk changing legal copy, stored domain labels, debug text, business logic, or large untouched flows.

Remaining areas requiring follow-up review include:

- Trainer screens under `app/trainer/`
- Dog add/edit/profile flows
- Sync and upload screens
- Survey and onboarding-like screens
- Premium/subscription screens
- Help components and guided tour text
- Some tracking support components such as GPS source picker, marker bottom sheet, debug panels, and map fallbacks
- `app/auth/callback.tsx`, which still contains English loading text
- Some Faehrte stored/display domain values such as surface, condition, and object material names. These were not remapped because they may be persisted or used as domain values.

Simulator visual language QA was not completed in this pass. It should be done after the remaining hardcoded candidates are triaged, especially for:

- Login
- Start
- Hund
- Training
- Faehrte legen
- Faehrte absuchen
- Analyse
- Profil
- Hilfe
- Konto & Sicherheit

## Files Changed In This Localization Pass

- `i18n/de-CH.ts`
- `i18n/gsw-CH.ts`
- `i18n/__tests__/localization-consistency.test.ts`
- `app/(auth)/login.tsx`
- `app/(auth)/__tests__/login-redesign.test.ts`
- `app/auth/forgot-password.tsx`
- `app/auth/recovery.tsx`
- `app/account-security.tsx`
- `app/account-security/change-email.tsx`
- `app/account-security/change-password.tsx`
- `app/track/legen.tsx`
- `features/auth/__tests__/authStaticIntegration.test.ts`
- `features/tracking/components/ActiveFaehrteCard.tsx`
- `features/tracking/components/BackgroundLocationDisclosure.tsx`
- `features/tracking/components/LiveChrome.tsx`
- `features/tracking/hooks/useTrackVoiceGuidance.ts`

## Final Assessment

Swiss German dictionary completeness is now enforced and the most visible Auth/Login/Account Security/Faehrte paths were localized through the existing i18n system. The app is not yet guaranteed to be fully Swiss German across every screen because broad hardcoded UI text remains in other product areas and needs a separate, careful localization pass.

## Phase 2 Update

Date: 2026-07-30
Agent: Codex
Scope: Hardcoded visible UI text cleanup in priority product areas.

### A. Hardcoded Candidates Before Phase 2

Repository-wide scanner candidates in `app/`, `components/`, and `features/` before Phase 2: `1045`.

Scanner pattern covered common visible text surfaces:

- `<Text>…</Text>`
- `Alert.alert(...)`
- Toast/showToast calls
- `title=`
- `subtitle=`
- `label=`
- `placeholder=`
- `accessibilityLabel=`

### B. Real Visible Localizable Texts

The raw scanner output included category A-E candidates:

- A: visible localizable UI copy
- B: product names, sport terms, abbreviations, stored labels, provider names
- C: legal or store-relevant copy
- D: debug/dev-only output
- E: internal strings, keys, routes, test text, comments

Phase 2 changed only category A strings in low-risk UI surfaces. Category B/C/D/E were not changed.

### C. Migrated To i18n

Scanner candidate reduction in Phase 2: `160` fewer candidates (`1045` -> `885`).

This is a scanner-based approximation. The actual migration included visible labels, buttons, placeholders, accessibility labels, empty states, modal/sheet labels, status labels, and alert copy across the screens below.

### D. New Translation Keys

New keys added in Phase 2: `301`.

Current key count:

- DE: `673`
- CH: `673`
- Missing CH keys: `0`
- Extra CH keys: `0`

### E. DE Key Count After Phase 2

`673`

### F. CH Key Count After Phase 2

`673`

### G. Missing CH Keys After Phase 2

`0`

Empty CH values after Phase 2: `0`.

### H. Intentionally Not Translated Terms

These terms stayed identical or mostly identical where they are product, provider, sport, or technical terminology:

- `ANYVO`
- `CONNECT`
- `GPS`
- `iPhone GPS`
- `Timer`
- `Training`
- `Smart Analyse`
- `Smart Coach`
- `Google`
- `Apple`
- `E-Mail`
- `Passwort`
- `Trainer`
- `Tasso`
- `IGP`
- `IBGH`
- `Obedience`
- `Agility`
- `GW`
- `OW`
- `BW`
- `TS`
- `GS`
- `MFi`
- `Expo Go`
- `Store-Build`
- `Dev-Build`

### I. Legal Texts Left Untouched

JA.

Legal, purchase, privacy, AGB, App Store, subscription terms, and similar legally relevant copy were not freely rewritten into dialect. Premium purchase logic and legal links were not changed.

### J. Remaining Hardcoded Visible Texts

Remaining scanner candidates after Phase 2: `885`.

Important remaining visible areas:

- `app/trainer/edit.tsx`
- `app/trainer/registrieren.tsx`
- `app/trainer/plan-neu.tsx`
- `app/trainer/plan/[id].tsx`
- `components/ShareSheet.tsx`
- `components/training/*`
- `app/unit/*`
- `features/connect/screens/*`
- `app/connect/*`
- `components/AppLockGate.tsx`
- `components/ui/DateField.tsx`
- Some analytics cards and insight components
- Some profile/edit-profile/account-delete/legal screens
- Some debug/dev-only tracking panels

Some remaining hits are intentionally not category A:

- Comments
- Debug panels
- Test strings
- Product names
- Legal copy
- Stored/persisted domain labels
- Backend/service messages
- Dynamic model/user content

### K. Affected Screens

Corrected in Phase 2:

- Start/Home partial labels
- Home customize screen
- Quick Actions widget
- Add dog screen
- Dog goals card
- Dog training list
- Dog quick action tiles
- Sync center
- Offline banner
- Help center
- Help sheet
- Guided tour
- Help registry render path
- Trainer dashboard
- Trainer plan list
- Shared plans screen
- My trainers screen
- Connect error state
- Connect identity selector
- GPS source picker
- Marker bottom sheet
- Compass bottom sheet
- Track stats panel
- Tracking map fallback/start label
- Auth callback loading texts
- Modal screen
- AI coach subtitle/empty state
- Root error boundary
- Hub tab trainer module lock/module labels

### L. Business Logic Changed

NEIN.

No Auth, GPS, Faehrte, subscription entitlement, RevenueCat, Supabase, DB, navigation, route, persisted ID, or calculation logic was intentionally changed.

### M. DB Changed

NEIN.

No migrations, SQL, local SQLite schema, Supabase table, RLS policy, or remote data were changed.

### Phase 2 Tests

- `npx tsc --noEmit`: PASS
- ESLint on changed files: PASS with warnings only
- Localization tests: PASS, 2 suites / 33 tests
- Relevant Auth/Login/Dog/Tracking tests: PASS, 8 suites / 83 tests
- Full Jest suite: PASS, 50 suites / 477 tests

Known warnings during validation:

- `app/(tabs)/home.tsx`: existing unused imports/locals
- `app/auth/callback.tsx`: existing React Hook dependency warnings for `router`
- `features/tracking/components/TrackingMap.tsx`: existing unused eslint-disable warning
- Subscription and tracking recovery tests print known defensive warnings
- Jest still reports the known open-handle warning after completion

### Phase 2 Visual QA

Simulator/emulator visual QA was not run in this pass. No EAS build or submit was performed.

## Phase 3 - Restbestand klassifizieren + kundensichtbare Texte bereinigen

Datum: 2026-07-30

### A. Rohkandidaten vorher

Phase-2-Ausgangswert: `885` Scanner-Kandidaten.

### B. Klassifikation A-I nach Phase 3

Neuer Scanner: `scripts/localization-hardcoded-scan.mjs`

- Rohkandidaten nach Phase 3: `689`
- A - echter sichtbarer UI-Text: `433`
- B - Accessibility-Text: `2`
- C - Fachbegriff / Produktname: `14`
- D - Legal / Datenschutz / AGB / Store-Copy: `11`
- E - Debug / DEV / Test: `66`
- F - interner technischer String: `1`
- G - Datenbankwert / Enum / ID / Route: `9`
- H - dynamischer User-Content / Dateninhalt: `3`
- I - False Positive / bereits lokalisierte `t(...)`-Zeile / rein visuelles Artefakt: `150`

### C. Echte sichtbare Kandidaten

Nach automatischer Kategorisierung verbleiben `435` A/B-Kandidaten. Diese sind echte oder wahrscheinlich echte sichtbare Resttexte, nicht mehr nur Scanner-Rauschen.

### D. Lokalisierte Texte Phase 3

Phase 3 hat weitere kundensichtbare Texte auf den bestehenden i18n-Layer migriert in:

- `app/(tabs)/activity.tsx`
- `app/(tabs)/clients.tsx`
- `app/(tabs)/dogs.tsx`
- `app/premium.tsx`
- `app/trainer/plan-neu.tsx`
- `app/trainer/plan/[id].tsx`
- `app/unit/[discipline].tsx`
- `app/unit/detail.tsx`
- `app/unit/document.tsx`
- `app/unit/live.tsx`
- `app/unit/new-category.tsx`
- `app/unit/start.tsx`
- `app/unit/stats.tsx`
- `app/unit/summary.tsx`
- `app/unit/timer.tsx`
- `components/analytics/TrendLine.tsx`
- `components/training/CommentThread.tsx`
- `components/training/LiveTrainingBar.tsx`
- `components/training/MultiVideoUpload.tsx`
- `components/training/SwipeableTrainingItem.tsx`
- `components/training/UnitListCard.tsx`
- `features/ai/components/AiCoachCard.tsx`
- `features/ai/components/CoachSummaryCard.tsx`
- `features/ai/components/ScoreTrendCard.tsx`
- `features/ai/components/TrainingBalanceCard.tsx`

### E. Neue Keys

DE/CH-Key-Anzahl stieg von `673` auf `995`.

Wichtige neue Key-Gruppen:

- Unit Start / Live / Detail / Document / Summary / Stats
- Custom category editor
- Training comments and media upload
- Premium cards, badges, trial, restore, package states
- Trainer activity / client management
- Dogs tab empty/error states
- AI coach and analysis card labels
- App lock, date fields, share sheet, trainer plan forms from the continued Phase-3 workset

### F. DE-Key-Anzahl nachher

`995`

### G. CH-Key-Anzahl nachher

`995`

### H. Fehlende CH-Keys nachher

`0`

### I. Legal-Ausnahmen

Legal/store-relevante Texte wurden nicht frei in Dialekt umgeschrieben. Dazu zählen insbesondere:

- Datenschutz / Nutzungsbedingungen
- App-Store-Zahlungs- und Kündigungshinweise
- Account-Delete-Warnungen mit rechtlichem Charakter
- Sicherheits-/RLS-Hinweise in Connect

Diese bleiben als `LEGAL_EXEMPT` bzw. standardsprachlich zu behandeln.

### J. Fachbegriffe / Produktnamen

Bewusst identisch oder nur minimal angepasst:

- ANYVO
- CONNECT
- Active
- Founder Active
- Lifetime
- Smart Coach
- Smart Feedback
- Training
- GPS
- Timer
- Trainer
- IGP / IBGH / Obedience / Agility
- GW / OW / BW / TS / GS
- MFi / Dev-Build / Store-Build

### K. Technische False Positives

Der neue Scanner klassifiziert unter anderem getrennt:

- technische Routes / IDs / QueryKeys / Product IDs
- Debug-/DEV-/Testtexte
- bereits lokalisierte `t(...)`-Zeilen
- dynamische User- und Model-Inhalte
- Fachabkürzungen und Produktnamen

Damit ist die Rohzahl nicht mehr gleichbedeutend mit offenen Übersetzungsfehlern.

### L. Verbleibende echte UI-Texte

Es verbleiben `435` A/B-Kandidaten. Wichtige offene Bereiche:

- `app/(tabs)/analytics.tsx`
- `app/(tabs)/home.tsx`
- `app/(tabs)/profile.tsx`
- `app/(tabs)/training.tsx`
- `app/analyse/*`
- `app/chat/*`
- `app/dog/*`, `app/dog-command/*`, `app/dog-document/*`, `app/dog-goal/*`, `app/dog-health/*`, `app/dog-heat/*`
- `components/ui/AudioRecorder*`, `PhotoPicker`, `VideoUpload`, `PremiumGate`
- mehrere `components/dogs/*`
- einzelne Tracking-Debug-/Overlay-Komponenten
- `features/voice/*`

### M. RELEASE-RELEVANTE offene Texte

`435`

Release-relevante offene CH-Texte sind damit noch nicht `0`. Diese Phase hat den Scanner verbessert und weitere zentrale Bereiche migriert, aber der vollständige Release-Zielzustand ist noch nicht erreicht.

### N. Connect separat

Connect-Rohkandidaten nach Phase 3: `56`.

Connect ist weiterhin separat zu behandeln. Falls CONNECT für den aktuellen Release nicht aktiv ist, sollten diese Kandidaten nicht automatisch den App-Store-Release blockieren; falls CONNECT sichtbar ist, müssen die Connect-Screens vor Release lokalisiert werden.

### O. Voice Guidance geprüft?

Ja, im Sinne dieser Phase rein sprachlich/strukturell. Bereits vorhandene Voice-Guidance-Keys aus Phase 1/2 bleiben erhalten. In Phase 3 wurden keine Voice-, GPS-, Distanz-, dogProgressM-, 5/10-m- oder Trigger-Berechnungen geändert.

Offen bleiben sichtbare/gesprochene Voice-Recorder- und Voice-Command-Hinweise in:

- `features/voice/hooks/useVoiceCommands.ts`
- `features/voice/hooks/useVoiceRecorder.ts`
- `features/voice/components/VoiceNotesList.tsx`
- `features/voice/components/VoiceRecorderCard.tsx`

### P. Simulator Smoke Test Ergebnis

Nicht ausgeführt. Diese Phase war Localization-/Scanner-/Testarbeit ohne Simulatorlauf.

### Phase 3 Tests

- `npx tsc --noEmit`: PASS
- `npx eslint` auf Phase-3-geänderten Dateien: PASS mit `0` Errors, `7` Warnings
- `npx jest i18n/__tests__/localization-consistency.test.ts --runInBand`: PASS, `1` Suite / `11` Tests
- `npx jest --runInBand`: PASS, `50` Suites / `479` Tests

Bekannte Validierungsnotiz:

- Jest meldet weiterhin den bekannten Open-Handle-Hinweis nach Abschluss.
- ESLint-Warnungen betreffen vorhandene unused/hook-deps/no-unused-expression-Stellen in bereits geänderten Dateien, keine neuen TypeScript-Fehler.

### Phase 3 Safety

- Businesslogik verändert: NEIN
- DB / Migration verändert: NEIN
- Auth-Logik verändert: NEIN
- GPS-/Fährtenlogik verändert: NEIN
- Abo-Entitlements / Product IDs / RevenueCat-Logik verändert: NEIN
- Commit / Push / EAS Build / Submit: NEIN

## Phase 4 — Release-Gate Resttexte

### A. Key-Stand

- DE Keys: `1258`
- CH Keys: `1258`
- Fehlende CH Keys: `0`

### B. Scanner-Metrik nach Phase 4

- Rohkandidaten: `489`
- Kategorie A: `0`
- Kategorie B: `0`
- Kategorie C: `147`
- Kategorie D: `15`
- Kategorie E: `66`
- Kategorie F: `35`
- Kategorie G: `6`
- Kategorie H: `0`
- Kategorie I: `220`
- Echte kundensichtbare nicht lokalisierte Texte: `0`
- Release-relevante offene Kandidaten: `0`
- Connect separat: `56`

### C. Phase-4-Änderungen nach Bereich

Migriert wurden sichtbare Texte in:

- Analytics Hauptscreen
- Chat-Liste und Chat-Thread
- Shared Media: Foto-Auswahl, Video-Upload, Audio-Recorder native/web
- Kalender/Terminplanung: Create/Reschedule, Timeline, Month/Week, Reminder, Trainer Appointment Cards
- Profil, Profil bearbeiten, Help/FAQ, Boot-Fallback
- Dog Detail: Löschen-Dialoge
- Dog-Unterseiten: Profil bearbeiten, Gesundheit, Läufigkeit, Dokumente, Ziele
- Fährten-Schrittlängen-Kalibrierung
- Voice Recorder / Voice Commands / Warmup Overlay

### D. Klassifizierte Ausnahmen

Bewusst nicht als offene Release-Fehler gezählt:

- Legal/System: Konto-Löschen-Hinweise, App-Sperre/Build-/Systemeinstellungen
- Technisch: URLs, Konstanten, Debug-/Dev-only, ID-/Enum-artige Werte
- Dynamisch: Server-/Service-Fehlertexte und variable Alert-Titel
- Fachbegriffe/Standard-Schweizer-UI: GPS, Trainer, Training, Active, Smart Coach, Fährte, TS/GS/GW/OW/BW und kurze fachliche Labels, die in Schweizer Apps natürlich standardsprachlich bleiben dürfen

### E. Voice

Voice wurde geprüft und sichtbare/gesprochene Nutzertexte wurden auf i18n umgestellt, soweit sie in Phase 4 betroffen waren. Trigger, Distanzlogik, Timing, GPS, dogProgressM und 5/10-m-Logik wurden nicht geändert.

### F. Simulator Smoke Test

- iOS: technisch versucht, aber nicht verwertbar. App liess sich öffnen, Screenshot `/private/tmp/anyvo-phase4-ios.png` zeigte nur schwarzen Splash/App-Zustand.
- Blocker iOS: Metro auf Port `8090` konnte wegen Node `v24.15.0` / Expo `ERR_SOCKET_BAD_PORT` nicht starten. Keine vorhandene Node-22/20-Installation über `nvm`, `fnm`, `volta`, `mise`, `/opt/homebrew/opt/node@22` oder `/usr/local/opt` gefunden.
- Android: nicht geprüft; `adb devices` zeigte keine verbundenen Geräte.
- Es wurden keine Simulator-Daten gelöscht.

### G. Tests Phase 4

- `npx tsc --noEmit`: PASS
- ESLint geänderte Phase-4-Dateien: PASS
- Localization-Test: PASS, `1` Suite / `11` Tests
- Jest gesamt: PASS, `50` Suites / `479` Tests

Bekannte Testnotiz: Jest meldet weiterhin den bestehenden Open-Handle-Hinweis nach Abschluss.

### H. Release-Gate

Release-relevante offene Schweizerdeutsch-UI-Texte: `0`

Release-Gate: `PASS`

### I. Safety

- Businesslogik verändert: NEIN
- DB / Migration verändert: NEIN
- Auth-Logik verändert: NEIN
- GPS-/Fährtenlogik verändert: NEIN
- Abo-/RevenueCat-Logik verändert: NEIN
- Connect bearbeitet: NEIN
- Commit / Push / EAS Build / Submit: NEIN

# ANYVO — Current State

> Länger gültiger, technischer Projektzustand für Agenten (Claude Code & Codex).
> **Kein Session-Log** (dafür `SESSION_HANDOFF.md` / `WORK_LOG.md`).
> Jede Aussage ist als **Verified / Assumed / Unknown** markiert.
> **Repository state > Git state > Handoff documentation > Agent assumptions.**

## Verified (im Repository nachprüfbar)
- **Stack:** Expo SDK 54 / React Native, Expo Router (file-based, `app/`), TypeScript. (`package.json`, `app.json`)
- **Native:** Continuous Native Generation — `ios/` und `android/` existieren lokal/git-ignored; native Builds verändern den versionierten Tree nicht direkt.
- **Release-Worktree:** lokaler Release-Worktree ist sauber und steht auf Branch `release/build38-hotfix`, HEAD `f7a5997`.
- **Build 38 Config im Release-Worktree:** App-Version `1.0.1`, iOS buildNumber `38`, Android versionCode `38`, `runtimeVersion` policy `appVersion`, `updates.url` gesetzt, production channel vorhanden.
- **Hauptrepo HEAD:** `ba273f5 chore(agent): record T-34 entitlement commit in handoff docs` auf Branch `feat/track-module-rewrite`.
- **Feature-Commits in HEAD:** Backpack `0434182`, Journal `2a85fbc`, Dashboard `0061fed`, Home-Backpack-Integration `e447cd2`,
  Entitlement-System (T-34) `50ccfd2`, Agent-Doku-Update `ba273f5`.
  Diese Commits sind noch nicht gepusht.
- **Build-38-Hotfix 2:** EAS Updates veröffentlicht auf Channel/Branch `production`, Runtime `1.0.1`:
  - iOS group `ed746533-d71f-4102-a2b8-a03e59293d97`, update `019fc012-76cc-7bfe-bcad-d1c99453ee3c`
  - Android group `f8c4461c-513c-4039-9369-5eb1c6a956f3`, update `019fc014-3873-7a8b-9a4d-af2eba66de05`
- **Hotfix 2 Inhalt:** GS-/Winkel-Quick-Picker nutzen ein gemeinsames blickdichtes Panel; Absuche startet nicht automatisch, sondern nur über `Jetzt starten` nach 5-/10-m-Auswahl.
- **Build 38 Release-Status:** Build 38 ist erfolgreich auf TestFlight. Android ist fuer Google Play vorbereitet; `android.versionCode` ist `38`.
- **EAS Update Betriebsmodell:** EAS Update ist eingerichtet und wird fuer JS-/TS-Hotfixes auf Build-38-Binaries mit Runtime `1.0.1` verwendet.
- **Post-Build-38 Hotfix-Scope:** Neben GS-/Winkel-Picker und manueller Absuche wurden weitere Hotfixes umgesetzt: Tracking-UI, Keyboard-Fixes, Google-Login und Auswertungslayout.
- **Aktueller Release-Fokus:** Testerfeedback einsammeln, auf echten Geraeten verifizieren und bei Bedarf gezielte EAS-Hotfixes liefern; keine neue Build-Erstellung als Hauptfokus.
- **Tests zuletzt grün:**
  - Hauptrepo: `npx tsc --noEmit`, `npx jest --runInBand` = 60 Suites / 577 Tests, `git diff --check`; ESLint Hotfix-Dateien 0 Errors mit bestehenden Warnings.
  - Release-Worktree: `npx tsc --noEmit`, `npx jest --runInBand` = 59 Suites / 570 Tests, `git diff --check`, `npx expo config --type public`; ESLint Hotfix-Dateien 0 Errors mit bestehenden Warnings.
- **Backend-Client:** Supabase (`@supabase/*`) für Auth/Daten; Google-OAuth in `services/auth.ts`.
- **Offline-First:** lokale SQLite mit Tabellen u. a. `local_training_sessions`, `local_track_points`, `local_track_markers`, `sync_queue`, `local_schema_migrations`.
- **Feature-Domänen im Code:** Tracking/Fährte (`features/tracking/`, `app/track/`), Training/Timer (`app/unit/`), Hunde (`features/dogs/`, `app/dog/`), Smart Coach/Analyse lokal (`features/ai/`), Connect (`features/connect/`, flag-gated), Hilfe/Onboarding (`features/help/`, `components/help/`), Home-Customization.
- **Agent-Infrastruktur:** `docs/agent/*`, `scripts/agent-*.mjs`, `AGENTS.md`/`CLAUDE.md`-Regeln.

## Verified Remote/Release State (aus dieser Session)
- **RevenueCat Webhooks:** `revenuecat-webhook` und `revenuecat-webhook-google` wurden in Production deployed, beide ACTIVE und `verify_jwt=false`.
- **Remote KI Cleanup:** die sieben verwaisten KI-Edge-Functions wurden in Production gelöscht; `ANTHROPIC_API_KEY` blieb laut späterer Freigabe unangetastet.
- **Subscription P0:** Production-P0-DB-Änderungen wurden mit Freigabe ausgeführt und finaler Schema-Stand versioniert (`f29717d`).

## Verified (Backpack/Journal/Dashboard — committed, nicht gepusht)
- **Backpack (T-25/T-26, `0434182`):** `features/dogs/backpack.ts` = per-user/per-dog AsyncStorage-Checkliste
  (Key `dog_backpack:<userId>:<dogId>`), CRUD/aktiv/gepackt/Reorder/Reset/Vorschläge; UI `app/dog-backpack/[id].tsx`
  + `components/dogs/DogBackpackCard.tsx`; verdrahtet in `features/dogs/DogHubScreen.tsx` + `app/dog/[id].tsx`. **Keine DB-Tabelle/-Migration.**
- **Journal (T-27, `2a85fbc`):** `app/training-journal.tsx` + `features/training/journal.ts` auf bestehendem `useTrainingFeed`
  (`services/trainingFeed.ts` = Single Source of Truth: `training_units` + `training_sessions` + GPS-Fährten). Keine zweite Historie/DB.
- **Produktnamen (T-28):** sichtbar „Journal" und „Backpack" (feste Produktnamen, NICHT lokalisiert); technische i18n-Keys stabil.
- **Dashboard Phase C (T-29, `0061fed`):** Overview-Tab in `DogHubScreen.tsx` als Dashboard; reine Logik `features/dogs/dashboard.ts`;
  Karten `DogTodayCard`/`DogAppointmentsCard`/`DogRecentCard`/`DogStatusTiles`; Termine via `getCalendarEvents` (bestehend).
  VM additiv erweitert (`trainingsThisWeek`, `lastFaehrteLabel`). Kein Wetter, keine neue KI, keine Migration.
- **Tests dieser Feature-Commits (Verified):** isolierte Backpack-/Journal-/Dashboard-Index-Prüfungen bestanden;
  `npx tsc --noEmit` = 0 Errors; fokussierte Jest-Suites grün; `git diff --check` sauber.
  ESLint der neuen/geänderten Dateien = 0 Errors (nur bekannte Test-Mock-Warnings); `expo export` iOS + Android erfolgreich.
- **Reports:** `docs/architecture/TRAINING_JOURNAL_FIX_REPORT.md`, `docs/architecture/DOG_PERSONAL_DASHBOARD_PHASE_C_FIX_REPORT.md`.

## Verified (Home-Backpack-Integration — committed, nicht gepusht)
- **Commit `e447cd2`:** personalisierte Home-Schnellaktionen und ein konfigurierbares Backpack-Widget pro `dogs.id`.
- **Konfiguration:** `stores/homeScreenConfig.ts` unterstützt instanzierte Aktionen/Widgets mit `dogId`, Sanitizing
  und Rückwärtskompatibilität für bestehende einfache Home-Konfigurationen.
- **UI/Routing:** Home, Anpassungsansicht, QuickActionsWidget, DogBackpackWidget und `/dog-backpack/[id]` verwenden
  die bestehende Backpack-Domäne ohne DB-Migration oder neue Hundestruktur.
- **Status:** DE/gsw/FR-Backpack-Keys sowie frühere Einträge, Reaktivierung und dauerhafte Löschbestätigung enthalten.
- **Tests:** TypeScript und 6 fokussierte Suites / 64 Tests bestanden; vollständige Jest-Suite und iOS-/Android-Exports
  waren zuvor ebenfalls erfolgreich. iOS wurde teilweise visuell geprüft; Android blieb wegen fehlender Java-Runtime ungetestet.

## Verified (Entitlement-System T-34 — committed, nicht gepusht)
- **Commit `50ccfd2`:** serverseitig abgesichertes Entitlement-System. Kontrollierte Werte `lifetime`, `beta_tester`,
  `ambassador`, `staff`; `lifetime` schaltet alle regulären Produkt-Capabilities frei, keine Admin-/Debug-/Supportrechte.
- **Code:** zentrale Auflösung `resolveEffectiveCapabilities()`/`hasEffectiveCapability()` in `features/subscription/plans.ts`;
  `services/entitlementService.ts` liest nur eigene aktive Entitlements (RLS); `services/capabilityService.ts`,
  `lib/entitlements/getUserAccess.ts`, `hooks/useCapabilities.ts`, `types/capabilities.ts` additiv erweitert.
- **Migrationen (committed, NICHT remote angewendet):** `supabase/migrations/20260802100000_user_entitlements.sql`
  (Tabelle + CHECK-Constraint + RLS „read own active only", keine Client-Schreibpolicy) und
  `20260802110000_lifetime_quota_access.sql` (`is_pro_member(uuid)` berücksichtigt aktives `lifetime`; interner
  SECURITY-DEFINER-Helfer, direkte Client-Ausführung entzogen; keine Spiegelung nach `user_capabilities`).
- **Tests:** `npx tsc --noEmit` = 0 Errors; fokussierte Suites `entitlements`/`entitlementService`/`lifetime-quota-migration`
  = 3 Suites / 19 Tests grün; `git diff --cached --check` sauber.
- **Doku:** `docs/architecture/ENTITLEMENT_SYSTEM.md`; `docs/lifetime-access.md` auf Verweis reduziert.
- **Isoliert committed:** genau 13 Dateien, kein fremder WIP; Review + Commit durch Claude (2026-08-03).

## Current Dirty State (Verified via `git status --short`)
- Das Hauptrepo ist weiterhin dirty mit vielen vorbestehenden/WIP-Dateien ausserhalb der Feature-Commits.
- Backpack/Journal/Dashboard/Home-Backpack und das Entitlement-System (T-34) sind nicht mehr dirty, sondern in HEAD
  committed; sie wurden nicht gepusht.
- Hotfix 2 selbst ist committed (`d4501a7`); die verbleibenden dirty Dateien sind nicht Teil dieses Hotfixes.
- Wichtige dirty/untracked Bereiche: Heat- und Home-i18n-Änderungen, Home/Profile/Tracking/Connect-Komponenten,
  Website-Dateien, Architektur-/Agent-Dokumentation, P0-FIX-01 Migrations-Baseline (`supabase/migrations/README.md`) und
  P0-Reports, lokale SQL-/Dump-/Screenshot-/dist-Artefakte. (Die Entitlement-Codedateien sind jetzt committed.)
- Mehrere Dateien aus dem Home-Backpack-Commit sind weiterhin dirty und enthalten dort fremde bzw. nachgelagerte Hunks;
  insbesondere Home-/Locale-Dateien müssen bei späterem Staging hunk-genau behandelt werden.

## Assumed
- EAS Updates erreichen installierte Build-38-Binaries mit Runtime `1.0.1` auf production channel; reale Geräteprüfung steht noch aus.
- Build 38 ist fuer den naechsten Google-Play-Schritt vorbereitet; finaler Store-Submit/Review-Status ist nicht im Repository verifizierbar.
- RevenueCat Dashboard muss ggf. weiterhin manuell je Store geprüft/getestet werden.

## Unknown / nicht als Wahrheit behandeln
- Ob die frisch veröffentlichten EAS Updates bereits auf allen realen Geräten angekommen sind.
- Ob Google Play Build 38 bereits eingereicht, reviewed oder veroeffentlicht wurde.
- Ob Store-/RevenueCat-Dashboard-Konfiguration vollständig finalisiert ist.
- Ob die Website-Startseite/Funktionsseite releasefähig ist; sie ist lokal WIP und nicht deployed.
- Vollständigkeit/Aktualität der ADR-/Architektur-Docs gegenüber dem aktuellen Code.
- Ob der Home-Backpack-Flow auf Android und auf echten Geräten vollständig abgenommen ist.

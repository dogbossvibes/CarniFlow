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
- **Hauptrepo HEAD:** `c268eee fix(navigation): keep analytics tab and present trainer hub as modal` auf Branch
  `feat/track-module-rewrite` (42 Commits vor `origin/feat/track-module-rewrite`, ungepusht).
- **Feature-Commits in HEAD:** Backpack `0434182`, Journal `2a85fbc`, Dashboard `0061fed`, Home-Backpack-Integration `e447cd2`,
  Entitlement-System (T-34) `50ccfd2`, Startseiten-FAB (T-41) `7490969`.
  Diese Commits sind noch nicht gepusht.
- **Build-38-Hotfix 2:** EAS Updates veröffentlicht auf Channel/Branch `production`, Runtime `1.0.1`:
  - iOS group `ed746533-d71f-4102-a2b8-a03e59293d97`, update `019fc012-76cc-7bfe-bcad-d1c99453ee3c`
  - Android group `f8c4461c-513c-4039-9369-5eb1c6a956f3`, update `019fc014-3873-7a8b-9a4d-af2eba66de05`
- **Hotfix 2 Inhalt:** GS-/Winkel-Quick-Picker nutzen ein gemeinsames blickdichtes Panel; Absuche startet nicht automatisch, sondern nur über `Jetzt starten` nach 5-/10-m-Auswahl.
- **Build 38 Release-Status:** Build 38 ist erfolgreich auf TestFlight. Android ist fuer Google Play vorbereitet; `android.versionCode` ist `38`.
- **EAS Update Betriebsmodell:** EAS Update ist eingerichtet und wird fuer JS-/TS-Hotfixes auf Build-38-Binaries mit Runtime `1.0.1` verwendet.
- **Post-Build-38 Hotfix-Scope:** Neben GS-/Winkel-Picker und manueller Absuche wurden weitere Hotfixes umgesetzt: Tracking-UI, Keyboard-Fixes, Google-Login und Auswertungslayout.
- **Aktueller Release-Fokus:** Testerfeedback einsammeln, auf echten Geraeten verifizieren und bei Bedarf gezielte EAS-Hotfixes liefern; keine neue Build-Erstellung als Hauptfokus.
- **Tests zuletzt grün (2026-08-04):**
  - Arbeitender Tree (mit allen uncommitteten Änderungen): `npx tsc --noEmit` 0 Errors; `npx jest` = **84 Suites /
    910 Tests PASS**; `git diff --check` sauber.
  - Clean-HEAD (`c268eee`, detachierter Worktree): `npx tsc --noEmit` 0 Errors; `npx jest` = **77 Suites / 856 Tests
    PASS**; `expo export` iOS + Android OK; ESLint 1 vorbestehender Error (`app/dog-command/detail.tsx:69:110`).
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

## Verified (Hunde-/Training-Features T-36…T-41 — auf feat/track-module-rewrite)
- **Sport-/Registrierungs-Features (T-36/T-37/T-38, committed, nicht gepusht):** Länder-Register-Details `ec85884`,
  Tasso-Fix `f4076c4`, Add-dog-Gating über reale Capabilities `c859e33`, FAB-Hide auf Hunde-Tab `9560f0b`,
  Sportprofil vereinfacht + eigene Disziplin `9f48119`.
- **Trainingsjournal-Karte (T-39, uncommittet):** `app/(tabs)/training.tsx` zeigt einen Journal-Einstieg;
  Test `app/(tabs)/__tests__/training.test.tsx` grün.
- **Journal-Distanz + Dedup (T-40, uncommittet):** `services/trainingFeed.ts` dedupliziert `type='track'` und
  mappt `distance_meters`; `app/training-journal.tsx` zeigt Distanzen; 3 Suites grün. Keine DB-Migration.
- **Personalisierbarer Startseiten-FAB (T-41, committed `7490969`):** `stores/homeScreenConfig.ts` um `fabActionId`
  (+ `'hidden'`) und `fabVisible` erweitert (AsyncStorage `home_screen_config:<userId>`, Sanitize-Fallback auf
  `create_appointment`); `components/QuickAddSheet.tsx` mit `personalized`-Prop (kurzer Tipp = Aktion,
  langer Tipp = Auswahl-Modal, `hidden`/`fabVisible:false` → kein Button); `components/home/ActionListModal.tsx`
  als generisches Options-Modal; `app/home-customize.tsx` mit „Schnellbutton"-Sektion (Aktion wählen +
  Sichtbarkeits-Switch); `app/(tabs)/home.tsx` nutzte `<QuickAddSheet personalized />`. Aktionen:
  `start_training`, `document_training`, `training_journal`, `start_track`, `create_appointment`, `add_dog`
  (NEWBIE-Quota-Gate → `/premium`), `open_backpack` (0/1/mehrere Hunde). i18n DE/gsw/FR (`fab.*`-Keys).

## Verified (Globaler ANYVO-Schnellbutton T-42/T-42A/B/C + T-42D — committed, nicht gepusht)
- **Zentrale Renderstelle:** `app/(tabs)/_layout.tsx` rendert `<QuickAddSheet />` als Geschwister neben `<Tabs>`
  und versorgt es per `<BottomTabBarHeightContext.Provider value={tabBarHeight}>` (ein Wert, iOS 88 /
  Android 66+insets.bottom) mit der Tab-Bar-Höhe → Button erscheint auf ALLEN 5 Haupt-Tabseiten
  (Start, Hunde, Training, Hub/Analyse, Profil); Nicht-Tab-Routen haben automatisch keinen Button.
- **Button:** grüner runder Fab (`C.accent` `#00FFCC`, FAB_SIZE=58) mit weissem `assets/images/anyvologo.png`,
  nie Kalender/Plus. Kurzer Tipp: 1 Aktion → direkte Ausführung, 2–8 → radialer Aktionsfächer; langer Tipp
  (500 ms) → Schnellbutton-Einstellungen (`/home-customize`, T-42B, `quickButton.longPressHint`);
  **Drag (RN-Core `PanResponder`) → Button verschieben, beim Loslassen Snap an den näheren Rand + Persistenz
  (T-42C)**; FAB-`accessibilityHint` = `quickButton.dragHint`, `onAccessibilityTap`.
- **T-42A:** `FAN_ITEM` 56→68 (grösseres Logo), Fan-Labels blickdicht (`'#FFFFFFE6'`).
- **T-42D (Hover-by-Drag im Fächer):** Der vollflächige Fan-Overlay (`testID quick-fan-overlay`) trägt den
  PanResponder (`onStartShouldSetPanResponder: false` → Tipp bleibt bei Kindern; übernimmt erst ab >10 px
  Bewegung). Drüberziehen hebt den aktuellen Kreis hervor (Skalierung 1.22 per `Animated.spring`,
  Teal-Rand `C.accent` 2 px + stärkerer Glow, Icon 22→26, Label fett/heller, Hund-Avatar 36→40 px,
  `accessibilityState.selected`); Loslassen auf dem Kreis führt genau diese Aktion aus, ausserhalb nur
  Schliessen. Haptik (`haptic.selection`) nur bei echtem Wechsel; Hit-Radius `FAN_ITEM/2+10` px,
  Hysterese 6 px gegen Flackern; `fanHitTest` deterministisch. Rein RN-Core (RNGH/Reanimated installiert,
  aber nirgends genutzt). Konstanten: `FAN_ACTIVE_SCALE=1.22`, `FAN_HIT_SLOP=10`, `FAN_HYSTERESIS=6`,
  `FAN_TAKEOVER_SLOP=10`, `FAN_SCALE_SPEED=24`.
- **Aktionsfächer:** max. 8 Aktionen (`MAX_QUICK_BUTTON_ACTIONS`), Nutzer-Reihenfolge; `FanOverlay` mit
  Scrim + radialem Fächer (`fanOffsets` Spread 56–96°, bei >6 Aktionen zwei Radien 92/170), Label-Pillen,
  X-Close, Tipp-außerhalb schließt; **Anker folgt der Button-Position (`anchorX, anchorY, side`), öffnet nach
  links/rechts bzw. nach unten (Button in oberer Hälfte), nie über die Tab-Leiste**; Hund-Aktionen
  `open-dog:<id>`/`open-backpack:<id>` mit `DogAvatar` (Profilbild/Fallback); `hide_button` entfernt sich +
  `quickButtonVisible=false`.
- **Live-Priorität (nie zwei primäre Elemente):** (1) `active.unitId` → `LiveTrainingBar`,
  (2) `tracks.length>0` → `GlobalActiveFaehrtenBar` (zentriert via `useFabBottom`), (3) sonst Schnellbutton.
- **Store (`stores/homeScreenConfig.ts`):** Multi-Action-Format `quickButtonActions: string[]` (max. 8) +
  `quickButtonVisible`; Migration beim Sanitize: Vorrang `quickButtonActions`, dann Legacy
  `quickButtonActionId`/`quickButtonDogId`, dann `fabActionId`/`fabVisible`; komplett neue Nutzer →
  `['create_appointment']`, leere bewusste Auswahl bleibt leer; gelöschte Hunde gefiltert; Helper
  `parseQuickActionId`/`quickButtonActionKey`/`sanitizeQuickButtonActions`/`quickButtonActionIdsOf`/
  `resolveQuickAction`/`addQuickButtonAction`/`removeQuickButtonAction`/`moveQuickButtonAction`.
  Hund-Aktionen speichern nur IDs, nie Namen. Keine DB-Migration.
  **Position (T-42C):** `quickButtonPosition: {side:'left'|'right', yRatio:0..1}` +
  `DEFAULT_QUICK_BUTTON_POSITION = {side:'right', yRatio:1}` + `sanitizeQuickButtonPosition`
  (klemmt yRatio, ungültig → Default, `undefined`/`null` → `undefined` = klassische Standardposition);
  Persistenz via `setHomeScreenConfig` → AsyncStorage; Hydrate übernimmt gespeicherte Position.
- **home-customize:** grüne Vorschau, Aktive-Aktionen-Liste (Reihenfolge, Klick-Entfernen), `chooseActions`
  (ActionListModal auf `QUICK_BUTTON_FIXED_ACTIONS`), Eigene-Hunde-Bereich mit `DogAvatar` + open/backpack-Chips,
  Sichtbarkeits-Switch, `selectedCount`, max.-8-Hinweis. i18n `quickButton.*` DE/gsw/FR (inkl. gsw-Fix
  „Eigener Hund", `dragHint`/`longPressHint`).
- **Verifikation (Verified):** `tsc --noEmit` 0 Errors; Vollsuite `npx jest --runInBand` = **81 Suites /
  854 Tests PASS** (Store-Tests 40–58 inkl. Position 53–58, QuickAddSheet **60 Tests** inkl. Drag/Snap/
  Persistenz 26–50 und T-42D-Hover 51–60, i18n-Parität `quickButton.*` inkl. FR); `git diff --check` sauber.
  In HEAD **committed** (`7490969`/`e8f57be`/`c268eee`, ungepusht); fremde WIP-Hunks in home.tsx/profile.tsx/i18n
  sind weiterhin unangetastet im Tree. Hinweis: im parallelen `npx jest`-Lauf crasht der Worker von
  `trainer-flow.test.ts` sporadisch mit SIGSEGV (flaky, vorbestehend; in Isolation/`--runInBand` grün).
  Vorbestehende Jest-Warnung „worker process … not exit gracefully" ist `trackPersist.ts:61` (4-s-Timer),
  nicht von T-42D.

## Verified (Eindeutige Benutzernamen T-43 — committed, nicht gepusht)
- **Migration `supabase/migrations/20260803140000_profiles_username.sql` (NICHT remote angewendet):**
  `profiles.username text` nullable + CHECK `profiles_username_format_check` (`length 3–24` und
  `^[a-z0-9_]+(\.[a-z0-9_]+)*$` — Punkte nur zwischen Segmenten) + partial unique index
  `profiles_username_lower_idx` auf `lower(username) where username is not null` (case-insensitive unique,
  NULLs mehrfach erlaubt). RPC `check_username_available(text) returns boolean` (SECURITY DEFINER, `stable`,
  `set search_path=public`, Reserveliste identisch zum Client, `not exists`-Check gegen `lower(username)`;
  `revoke all … from public`, `grant execute … to authenticated`).
- **Normalisierungs-/Validierungskontrakt (Servicespiegel, `services/profileService.ts`):**
  trim → lowercase → führende `@` entfernen; gespeichert ohne `@`, UI zeigt `@username`. `validateUsername`
  (24 Testfälle): leer → `null` (= entfernen, kein Fehler), 3–24 Zeichen, Zeichenklasse, `RESERVED_USERNAMES`
  (admin, administrator, support, help, anyvo, official, moderator, system, root, staff, trainer, null, undefined).
  `updateUsername` → `from('profiles').update({username}).eq('id', …)`, Unique-Verletzung `23505` → `taken:true`.
  Nur `profiles`-Tabelle, KEIN Auth-`user_metadata`-Dual-Write.
- **Anzeigeorte `@username`:** eigene Profilkarte (`app/(tabs)/profile.tsx` Z. 285, Style `usernameText`),
  Home-Hero-Gruss (`app/(tabs)/home.tsx` Z. 308, Style `heroUsername`), Trainer-Liste (`app/trainer/index.tsx`),
  Kunden-Listen Pending/Active (`app/(tabs)/clients.tsx`), Daten via `listConnections` →
  `ConnectionView.counterpartUsername` (`services/connectionService.ts`, `types/connection.ts`).
- **Bearbeitung `app/edit-profile.tsx`:** Hydration aus `useProfile()`-Cache (null = nicht hydriert-Marker),
  Debounce-400-ms-Availability-Check mit Cancel-Flag (RPC `check_username_available`, nie für den eigenen Namen),
  `USERNAME_ERROR_KEY`-Map → i18n, Save validiert vor Update (Name zuerst, dann Username; Fehler → Alert + Abbruch),
  `Input` `autoCapitalize="none" autoCorrect={false} maxLength={24}`. Cache-Refresh via bestehendem
  `invalidateQueries(['profile'])`.
- **RLS unverändert:** keine neue globale SELECT-Policy. Anzeige nur wo bestehende RLS es erlaubt (eigene Zeile,
  `read_trainer_directory`, `trainer_read_client_profile` via `public.coach_link_exists`); Availability nur via RPC.
- **i18n:** 10 neue `profile.username*`-Keys × DE/gsw/FR (gsw SS-Schreibweise, fr Umlaute); Paritätstests grün.
- **Verifikation (Verified):** `tsc --noEmit` 0 Errors; Vollsuite `npx jest --runInBand` = **82 Suites / 893 Tests
  PASS** (neu `services/__tests__/profileService.test.ts` 38 Tests inkl. `mapUsernameCheckResult`);
  `git diff --check` sauber. `trainer-flow.test.ts` im Parallellauf weiterhin flaky (SIGSEGV, vorbestehend,
  --runInBand grün). In HEAD **committed** (`7517e1d`, ungepusht); fremde WIP-Hunks in home.tsx/profile.tsx/i18n
  blieben unangetastet. Migration nicht remote angewendet; kein Push.
- **BUGFIX (2026-08-04):** „Verfügbarkeit konnte nicht geprüft werden" / früher falsch „vergeben" — Ursache
  verifiziert: Migration `20260803140000` in Production (ANYVO `axkkhyqrjrtbkumaulta`, auch App-Ziel via
  `EXPO_PUBLIC_SUPABASE_URL`) NICHT angewendet; PostgREST-Probe liefert `PGRST202` (RPC nicht im Schema-Cache)
  und `42703` (column profiles.username does not exist). Client-Härtung: `mapUsernameCheckResult` in
  `services/profileService.ts` (Fehler → `check_failed`, nie falsch verfügbar/vergeben; strikte boolean-
  Auswertung), DEV-Logging (code/message/details/hint, RPC-Name, Kandidat) in `app/edit-profile.tsx`,
  neuer i18n-Key `profile.usernameCheckFailed` (DE/gsw/FR). RPC (Migration) erweitert um `auth.uid()`-Ausschluss
  der eigenen Zeile → eigener unveränderter Name ist verfügbar. `dog.boss.vibes` gültig (Punkt-Regel konsistent
  Client + CHECK).

## Current Dirty State (Verified via `git status --short`)
- Das Hauptrepo ist weiterhin dirty (~115 Einträge modified+untracked), Index leer (0 staged).
- Committed, aber nicht gepusht (42 Commits vor `origin`): Backpack/Journal/Dashboard/Home-Backpack, T-34
  Entitlement-System, T-36…T-43, Trainer-Hub-Modal (`c268eee`).
- **Uncommittete Build-39-Arbeit (noch hunk-genau zu committen):** T-39 (`app/(tabs)/training.tsx` +
  `app/(tabs)/__tests__/training.test.tsx` untracked), T-40 (`app/training-journal.tsx`, `services/trainingFeed.ts`,
  `features/training/__tests__/journal.test.ts`, `app/__tests__/training-journal.test.tsx` + `services/__tests__/trainingFeed.test.ts`
  untracked), T-44 (`app/trainer-hub.tsx`, `app/umfrage/index.tsx`, `app/unit/summary.tsx`,
  `app/(tabs)/__tests__/tab-navigation.test.ts`, Profil-Duplikat-Hunks in `app/(tabs)/profile.tsx`,
  `trainer.*`-i18n-Hunks in `i18n/de-CH.ts`/`i18n/gsw-CH.ts`), Build-39-Fixes (`components/ui/DateField.tsx` +
  `DateField.test.tsx` untracked, `services/shareService.ts` + `shareService.test.ts` untracked,
  T-43-`@username`-Hunks in `profile.tsx`/`trainer/index.tsx`).
- **Fremd / NICHT committen (ausschliessen):** ANYVO-ID-Umbennung (i18n `username*`→„ANYVO ID", fr komplett),
  i18n-Hardcode-Migration (`trainer/dashboard`, `trainer/index`, `unit/live`, `unit/stats`, `index`, `sync`,
  `track/*`, `tracking/*`, `connect/*`, `AppLockGate`, `ShareSheet`, `DogHeatCard`, `DogQuickActions`,
  `GpsSourcePicker`, `MarkerBottomSheet`, `ActiveFaehrteCard`, `TrackStatsPanel`), `legal-web/*`, SQL-Dumps,
  Screenshots, `dist-*`, ADRs, `AI_HANDOFF.md`, Workspace-Dateien.
- **Migrationen:** `20260803120000_fix_shared_trainings_fk.sql` untracked (nicht committed, nicht remote),
  `20260803140000_profiles_username.sql` committed `7517e1d` (nicht remote). Remote fehlen genau diese 2.

## Verified (Build 39 — Release-Readiness-Audit, 2026-08-04) — GATE: NOT READY
- **Clean-HEAD (`c268eee`, detachierter Worktree):** `npm ci` OK; `tsc --noEmit` 0 Errors; Jest **77 Suites /
  856 Tests PASS**; `expo config --type public` OK (Sentry-org/project nur via Env); `expo export` iOS + Android
  beide OK; `git diff --check HEAD^ HEAD` sauber. Vorbestehend: 1 Lint-Error `app/dog-command/detail.tsx:69:110`
  (seit `ab602c0`), 77 Warnungen.
- **Arbeitender Tree:** `tsc --noEmit` 0 Errors; Jest **84 Suites / 910 Tests PASS** (+7 Suites/+54 Tests aus
  uncommitteter Arbeit).
- **Release-Konfiguration (Verified):** `app.json` version `1.0.1`, iOS `buildNumber "38"`, Android
  `versionCode 37` (TASKS.md T-18-Behauptung „38" ist veraltet). `eas.json`: production `autoIncrement:false`,
  `appVersionSource:local`, channel `production`, buildType `app-bundle`. **`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
  nirgends gesetzt** (nur iOS-Key) → `configurePurchases` (lib/purchases.ts:27) bricht auf Android ab → IAP
  inaktiv, Trial-Fallback. Sentry-org/project nur als Env in production.
- **Status explizit:** kein Push, kein Build, keine Remote-Migration, keine History-Reparatur, keine
  Release-Nummern geändert, Working Tree weiterhin dirty, Build 39 aktuell **nicht READY**.

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

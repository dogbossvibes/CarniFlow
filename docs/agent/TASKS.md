# ANYVO — Task-Liste (Agent-Handoff)

> IDs stabil, chronologisch. Status: DONE · DONE(committed) · DONE(deployed) · BLOCKED · OPEN.
> Priorität bei Widerspruch: Repository state > Git state > Handoff-Doku.
> Stand: 2026-08-04 · Branch `feat/track-module-rewrite`, HEAD `c268eee` (42 Commits vor `origin`).

## Abgeschlossen / versioniert
- **T-01 — Auth-Recovery & Account-Security** · DONE(committed `ecc1242`)
  Passwort-Recovery, Account-Security und Provider-aware Account-Flows.
- **T-02 — Login-Branding-Assets** · DONE(committed `4071062`)
  App-Icons und optimiertes Login-Hintergrundbild.
- **T-03 — Supabase-Auth-Release-Checkliste** · DONE
  Auth-Release-Checkliste erstellt.
- **T-04 — Subscription/Entitlement-Audit** · DONE
  NEWBIE-/Capability-/RevenueCat-Risiken geklärt.
- **T-05/T-06 — Subscription P0 Client/Quota/Restore** · DONE(committed)
  Commit-Kette: `d5330c1`, `c239ecb`, später DB-Artefakt `f29717d`.
- **T-07/T-08 — Subscription P0 Production DB** · DONE
  Production-P0-SQL wurde mit Freigaben ausgeführt; finaler Schema-Stand versioniert in `f29717d`.
- **T-09 — KI-Entfernung Client-Runtime** · DONE(committed `4a0ffb8`)
  Smart Coach/Analyse/Recommendation lokal regel- und statistikbasiert; alte KI-Client-Aufrufe entfernt.
- **T-10 — Registrierung: Trainer-Selbstauswahl entfernt** · DONE(committed `7da956e`)
- **T-11/T-12 — Legal Web Datenschutz/AGB KI-Update** · DONE(committed `5f7cfcc`)
- **T-13 — Build-38 Release konsolidieren** · DONE
  Release-Commits erstellt, sauberer lokaler Release-Worktree, iOS/Android Build 38 vorbereitet.
- **T-14 — RevenueCat Webhook Production Setup** · DONE(deployed)
  `revenuecat-webhook` und `revenuecat-webhook-google` deployed, beide `verify_jwt=false`, Runtime-Checks GREEN.
- **T-15 — Remote KI Cleanup** · DONE
  Sieben verwaiste KI-Edge-Functions aus Production gelöscht. Secrets laut späterer Freigabe nicht gelöscht.
- **T-16 — Build 38 Hotfix 1** · DONE(deployed)
  Commit `cf2399f` im Hauptrepo, `425f30c` im Release-Worktree. EAS Update für Tracking/Formulare/Google Sign-in veröffentlicht.
- **T-17 — Build 38 Hotfix 2** · DONE(deployed)
  Commit `d4501a7` im Hauptrepo, `f7a5997` im Release-Worktree.
  EAS Updates veröffentlicht:
  - iOS: group `ed746533-d71f-4102-a2b8-a03e59293d97`, update `019fc012-76cc-7bfe-bcad-d1c99453ee3c`
  - Android: group `f8c4461c-513c-4039-9369-5eb1c6a956f3`, update `019fc014-3873-7a8b-9a4d-af2eba66de05`
- **T-18 — Build 38 TestFlight / Google Play Vorbereitung** · DONE
  Build 38 ist erfolgreich auf TestFlight. Android ist mit versionCode `38` fuer Google Play vorbereitet.
  EAS Update ist fuer Build-38-kompatible JS-/TS-Hotfixes eingerichtet.
- **T-19 — Post-Build-38 Hotfixes** · DONE(deployed)
  Mehrere Hotfixes nach Build 38 umgesetzt/veroeffentlicht: GS-/Winkel-Picker, manueller Start der Absuche
  mit 5-/10-m-Auswahl, Tracking-UI, Keyboard-Fixes, Google-Login und Auswertungslayout.

## Feature-Arbeit — committed, nicht gepusht
> Rein additiv. Keine DB-Migration, keine bestehende Trainings-/Fährten-/Kalender-/Zyklus-/Abo-Logik verändert.
> Die drei Feature-Commits sind in HEAD enthalten, aber noch nicht gepusht.
- **T-25 — Backpack Phase A (Datenschicht)** · DONE(committed `0434182`)
  `features/dogs/backpack.ts`: per-user/per-dog AsyncStorage (`dog_backpack:<userId>:<dogId>`), Sanitizer, CRUD,
  aktiv/inaktiv, gepackt, ↑/↓-Reorder, Reset-nur-Häkchen, Vorschläge (nie auto-persistiert). Keine DB-Migration.
- **T-26 — Backpack Phase B (UI)** · DONE(committed `0434182`)
  Overview-Card + Verwaltungsscreen `app/dog-backpack/[id].tsx` (Add/Edit/Delete, aktiv/inaktiv, gepackt, Reorder,
  Reset, Vorschläge mit Duplikatschutz), i18n de/gsw/fr, verdrahtet in `DogHubScreen`/`app/dog/[id].tsx`.
- **T-27 — Journal (spartenübergreifende Trainingshistorie)** · DONE(committed `2a85fbc`)
  Route `app/training-journal.tsx` auf bestehendem `useTrainingFeed` (Single Source of Truth), `features/training/journal.ts`
  (Filter/Suche/Gruppierung/Pagination), Einstiege Home-Schnellaktion/Hundeprofil/Analyse. Keine zweite DB.
- **T-28 — Produktnamen-Rename** · DONE(committed `0434182`, `2a85fbc`)
  „Trainingstagebuch"→**Journal**, „Rucksack"→**Backpack** (feste Produktnamen, nicht lokalisiert); nur sichtbare
  i18n-Werte + Registry-Fallback, technische Keys/AsyncStorage/Typen/Dateien unverändert.
- **T-29 — Persönliches Hunde-Dashboard (Phase C)** · DONE(committed `0061fed`)
  Overview-Tab als Dashboard (Heute/Termine/Läufigkeit/Ziel/Backpack/Zuletzt/Status/Smart Analyse). Neue reine Logik
  `features/dogs/dashboard.ts` + 4 Karten; Termine via bestehendem `getCalendarEvents`. Kein Wetter, keine neue KI,
  keine Migration. Report `docs/architecture/DOG_PERSONAL_DASHBOARD_PHASE_C_FIX_REPORT.md`.

## Agent-Infrastruktur
- **T-31 — agent:start Startprotokoll mit TASKS.md abgleichen** · DONE(committed `8ef90fe`)
  `scripts/agent-start.mjs` zeigt jetzt das verbindliche Startprotokoll inkl. `AGENTS.md`, `CLAUDE.md`,
  `docs/agent/TASKS.md`, `CURRENT_STATE.md`, `SESSION_HANDOFF.md`, `DECISIONS.md` und `git status`.
  `TASKS.md` wird ausdrücklich als verbindliche Aufgabenquelle genannt; `SESSION_HANDOFF.md` als letzte Übergabe.
  Keine robuste automatische TASKS.md-Task-Ermittlung eingeführt, weil die Markdown-Struktur weiterhin primär
  menschlich gepflegt ist.
- **T-32 — Backpack von Hunde-Dashboard entkoppeln** · DONE(committed `0434182`)
  Reine Statuslogik `backpackStatus` aus `features/dogs/dashboard.ts` nach `features/dogs/backpack.ts` verschoben.
  `components/dogs/DogBackpackCard.tsx` importiert die Funktion jetzt direkt aus dem Backpack-Modul; Dashboard behält
  einen Re-Export fuer bestehende Dashboard-Aufrufer/Tests. Keine UI-/Text-/Journal-/Tracking-/SQL-Arbeit.
- **T-33 — Dashboard isoliert vorbereiten und committen** · DONE(committed `0061fed`)
  Hunde-Dashboard Phase C vollständig isoliert staged, index-isoliert getestet und als
  `feat(dogs): add personal dashboard overview` committed. Backpack (`0434182`) und Journal (`2a85fbc`) waren in HEAD.
- **T-34 — Server-seitiges Entitlement-System** · DONE(committed `50ccfd2`)
  Neue kontrollierte Entitlement-Werte (`lifetime`, `beta_tester`, `ambassador`, `staff`), zentrale effektive
  Capability-Auflösung, Supabase-Migration `user_entitlements` mit RLS, Service-/Hook-Integration und technische
  Dokumentation. Nachbesserung: `is_pro_member()` berücksichtigt aktives `lifetime` serverseitig für NEWBIE-Quotas;
  keine Spiegelung nach `user_capabilities`. Von Claude read-only reviewt und isoliert committed (13 Dateien, kein
  fremder WIP). Migrationen committed, aber NICHT remote angewendet. Kein Push, kein Build.

- **T-35 — Personalisierte Home-Backpack-Integration** · DONE(committed `e447cd2`)
  Hundespezifische Backpack-Schnellaktionen und Backpack-Widget mit `dogId`, instanzierter Home-Konfiguration,
  Sanitizing, DE/gsw/FR und bestehender `/dog-backpack/[id]`-Route. Keine DB-Migration, keine neue Hundestruktur.

## Hunde-/Training-Features — committed, nicht gepusht
> Weitere Feature-Arbeit auf `feat/track-module-rewrite`; rein additiv, keine DB-Migration.
- **T-36 — Hunde-Register-Details + Tasso-Fix** · DONE(committed)
  `ec85884 feat(dogs): add country-specific registry details`, `f4076c4 fix(dogs): keep tasso_registered non-null on create`.
- **T-37 — Add-dog-Gating + FAB-Hide auf Hunde-Tab** · DONE(committed)
  `c859e33 fix(dogs): gate add-dog button with real capabilities, not legacy plan`,
  `9560f0b fix(dogs): hide training fab on dogs tab`.
- **T-38 — Sportprofil vereinfacht + eigene Disziplin** · DONE(committed `9f48119`)
  `feat(dogs): simplify sports profile and allow custom discipline`.
- **T-39 — Trainingsjournal-Karte im Training-Tab** · DONE(uncommittet)
  `app/(tabs)/training.tsx` zeigt Journal-Einstieg (`training.journal`/`training.journalSub`),
  Test `app/(tabs)/__tests__/training.test.tsx` (untracked). → noch hunk-genau committen.
- **T-40 — Trainingsjournal mit Distanz + Dedup** · DONE(uncommittet)
  `services/trainingFeed.ts` dedupliziert `type='track'` und mappt `distance_meters`; `app/training-journal.tsx`
  zeigt Distanz; Suites `services/__tests__/trainingFeed.test.ts` (6, untracked),
  `features/training/__tests__/journal.test.ts` (28), `app/__tests__/training-journal.test.tsx` (5, untracked) grün.
  → noch hunk-genau committen.
- **T-41 — Personalisierbarer Startseiten-FAB** · DONE(committed `7490969`, ungepusht)
  Neuer Quick-FAB unten rechts auf der Startseite (kurzer Tipp = Aktion, langer Tipp = Auswahl-Modal),
  Aktion auswählbar + Button ausblendbar; `stores/homeScreenConfig.ts` (FAB-Config via AsyncStorage),
  `components/QuickAddSheet.tsx` (`personalized`), `components/home/ActionListModal.tsx` (neu),
  `app/home-customize.tsx` (Schnellbutton-Sektion), i18n DE/gsw/FR. Siehe SESSION_HANDOFF.md.
- **T-42 — Globaler ANYVO-Schnellbutton (alle Haupt-Tabs, Multi-Action-Fächer)** · DONE(committed `7490969`/`e8f57be`/`c268eee`, ungepusht)
  Zentral im Tab-Layout (`app/(tabs)/_layout.tsx`): `<BottomTabBarHeightContext.Provider>` um `<Tabs>` +
  `<QuickAddSheet />` als Geschwister → Button auf allen 5 Haupt-Tabseiten. Immer `anyvologo.png`
  auf grünem `C.accent`-Kreis, nie Kalender/Plus. Aktionsfächer (radial) mit max. 8 Aktionen:
  kurzer Tipp = direkte Ausführung (bei 1 Aktion) bzw. Fächer (bei 2–8), langer Tipp (500 ms) =
  Schnellbutton-Einstellungen (`/home-customize`), Drag = Verschieben mit Snap links/rechts + Persistenz.
  Hund-Aktionen `open-dog:<id>`/`open-backpack:<id>` mit Profilbild-Avataren. Live-Priorität:
  laufendes Training → `LiveTrainingBar`, offene GPS-Fährte → `GlobalActiveFaehrtenBar`, sonst Button
  (nie zwei primäre Elemente).
  Config neu als Multi-Action-Format `quickButtonActions: string[]` (max. 8, Nutzer-Reihenfolge) +
  `quickButtonVisible` + `quickButtonPosition: {side:'left'|'right', yRatio:0..1}` in
  `stores/homeScreenConfig.ts` (Migration aus Legacy `quickButtonActionId/quickButtonDogId` und
  `fabActionId/fabVisible` beim Sanitize; `sanitizeQuickButtonPosition` klemmt yRatio, Feld fehlt →
  Standard rechts/unten).
  `home-customize.tsx`: grüne Vorschau + Auswahl/Reihenfolge + Eigene-Hunde-Bereich. i18n `quickButton.*`
  DE/gsw/FR (inkl. „Eigener Hund"-Fix, `dragHint`/`longPressHint`). Verifikation: `tsc --noEmit` PASS,
  Vollsuite **81 Suites / 854 Tests PASS** (Store 58 Tests inkl. Position 53–58, QuickAddSheet 60 Tests
  inkl. Drag/Snap/Persistenz 26–50 und T-42D-Hover 51–60), `git diff --check` PASS. Siehe SESSION_HANDOFF.md.
- **T-42D — Hover-by-Drag im Aktionsfächer (Hervorhebung + Auswahl per Drag)** · DONE(committed `e8f57be`, ungepusht)
  Im geöffneten Fächer hebt das Darüberziehen einen Aktionsbutton hervor (Skalierung ~1.22 per
  `Animated.spring`, Teal-Rand `C.accent`, Icon 22→26, Label fett/heller, Hund-Avatar 36→40 px,
  `accessibilityState.selected`); Loslassen auf dem Button führt genau diese Aktion aus, ausserhalb nur
  Schliessen. Haptik nur bei echtem Wechsel, Hit-Radius grösser als der Kreis, Hysterese gegen Flackern,
  kein FAB-Drag und keine Aktion gleichzeitig (Overlay übernimmt erst ab >10 px Bewegung, Tipp bleibt bei
  den Kindern). Rein RN-Core (`PanResponder` + `Animated`; RNGH/Reanimated im Projekt installiert, aber
  nirgends genutzt). Neue Tests 51–60 in `FabQuickAddSheet.test.tsx` (jetzt 60 Tests) — grün. Siehe
  SESSION_HANDOFF.md.
- **T-43 — Eindeutige Benutzernamen (Social Identity)** · DONE(committed `7517e1d`, ungepusht)
  `profiles.username` (nullable, case-insensitive unique per partial index `profiles_username_lower_idx`,
  CHECK `profiles_username_format_check` auf `^[a-z0-9_]+(\.[a-z0-9_]+)*$`, 3–24 Zeichen). Migration
  `supabase/migrations/20260803140000_profiles_username.sql` + RPC `check_username_available` (SECURITY DEFINER,
  stable, `search_path=public`, revoke/grant authenticated). Gespeichert ohne `@`, UI zeigt `@username`.
  `profileService.ts`: `normalizeUsername`/`validateUsername` (24 Fälle)/`RESERVED_USERNAMES`/`checkUsernameAvailable`
  (rpc)/`updateUsername` (23505→`taken`). Anzeige: eigene Profilkarte, Home-Hero-Gruss, Trainer-/Kundenlisten
  (`counterpartUsername` in `ConnectionView`). `app/edit-profile.tsx`: Debounce-400-ms-Check mit Cancel-Flag,
  Hydration aus `useProfile()`-Cache, Save validiert vor Update. i18n 10 `profile.username*`-Keys × DE/gsw/FR.
  RLS unverändert (kein globales SELECT — nur eigene Zeile/Trainer-Directory/coach_link + RPC). Verifikation:
  `tsc --noEmit` PASS, Vollsuite **82 Suites / 884 Tests PASS** (neu: `services/__tests__/profileService.test.ts`
  30 Tests), `git diff --check` PASS. Migration NICHT remote angewendet. Kein Commit, kein Push. Siehe
  SESSION_HANDOFF.md.
- **BUGFIX T-43 (2026-08-04):** Ursache „immer vergeben/Prüfung fehlgeschlagen" = Migration `20260803140000`
  remote fehlt (per PostgREST-Probe verifiziert: RPC → `PGRST202`, Column → `42703`). Client-Härtung:
  `mapUsernameCheckResult` (pure, technischer Fehler → `check_failed`, nie falsch „verfügbar/vergeben") +
  DEV-Logging von code/message/details/hint + RPC-Name + Kandidat in `edit-profile.tsx`; neue i18n-Key
  `profile.usernameCheckFailed` × DE/gsw/FR. Migration erweitert: RPC schliesst eigene Zeile via
  `auth.uid()` aus (eigener unveränderter Name → verfügbar). `dog.boss.vibes` gültig (Punkte zwischen
  Segmenten, Client + DB-Check identisch). Tests: Vollsuite **82 Suites / 893 Tests PASS** (+9:
  `dog.boss.vibes`-Validierung,   `mapUsernameCheckResult` inkl. PGRST202/42501/401/Netzwerk). Migration
  in HEAD committed, aber weiterhin NICHT remote angewendet.

## Build 39 — Release-Readiness-Audit (2026-08-04) — GATE: NOT READY
> Ergebnis eines read-only Readiness-Audits (kein Build, kein Push, keine Remote-Migration, keine Release-Nummern geändert).
> Gate-Entscheidung: **Build 39 ist noch NICHT READY.** Blocker siehe unten und SESSION_HANDOFF.md.
- **Clean-HEAD-Verifikation (`c268eee`, detachierter Worktree, danach entfernt):** `npm ci` OK; `tsc --noEmit` 0 Errors;
  Jest **77 Suites / 856 Tests PASS**; `expo export` iOS + Android beide OK; `git diff --check` sauber.
  Vorbestehend: 1 Lint-Error `app/dog-command/detail.tsx:69:110` (seit `ab602c0`, nicht Build-39) + 77 Warnungen.
- **Arbeitender Tree (mit allen uncommitteten Änderungen):** `tsc --noEmit` 0 Errors; Jest **84 Suites / 910 Tests PASS**.
- **T-44 — Trainer-Hub-Redesign + Profil-/Umfrage-/Summary-Nacharbeit** · DONE(uncommittet, verifiziert grün)
  Bündelt die im Readiness-Audit als uncommittet erkannten, bisher nicht erfassten Build-39-Arbeiten:
  1. **Trainer-Hub-Redesign:** `app/trainer-hub.tsx` — Header (`trainer.workspace`/`hubTitle`/`hubSubtitle` +
     anyvologo), 2 grosse Karten (Trainerprofil → `/trainer/edit`, Kund:innen → `/(tabs)/clients` mit Live-Metriken
     aus `getMyClientConnections` accepted + `useHubBadge` pending), Tools-Liste (Pläne/Statistik/Nachrichten/
     Umfragen/Mini-Verbindungen), Umfragen-Sheet (`/umfrage/meine`, `/umfrage`). i18n `trainer.*`-Keys × DE/gsw/CH-fr
     (in `i18n/de-CH.ts`/`i18n/gsw-CH.ts`, gemischt mit fremder ANYVO-ID-Umbennung → hunk-genau). Tests in
     `app/(tabs)/__tests__/tab-navigation.test.ts` (Close-Button vor Loading-Gate, Safe-Area-Header).
  2. **Profil-Duplikat-Einträge entfernt:** in `app/(tabs)/profile.tsx` nur noch „Trainer-Hub" →
     `/trainer-hub`; die zwei Duplikate „Terminumfrage erstellen" (→ `/umfrage`) und „Meine Umfragen"
     (→ `/umfrage/meine`) entfernt. Routen bleiben bestehen.
  3. **Umfrage-Back-Fallback:** `app/umfrage/index.tsx` — `handleBack` mit
     `router.canGoBack() ? router.back() : router.replace('/trainer-hub')` (Header-Button + nach Versand-Alert).
  4. **Summary-Back-Fallback:** `app/unit/summary.tsx` — absoluter Back-Button (`SafeAreaView edges={['top']}`,
     TestID `backWrap`/`backBtn`), `zurueck()` mit Unsaved-Guard via `dirty` (Keys `training.leaveTrainingTitle`/
     `leaveTrainingBody`/`continueEditing`/`backToTraining` sind bereits in HEAD).
  Verifikation: `tsc --noEmit` 0 Errors; Tab-Nav-Test 10/10 grün; `git diff --check` sauber. → noch hunk-genau committen.
- **Noch hunk-genau zu committen (Build 39):** T-39, T-40, **T-44** (Trainer-Hub-Redesign, Profil-Duplikat-Einträge,
  Umfrage-Back-Fallback, Summary-Back-Fallback) sowie uncommittete Build-39-Fixes (DateField-Android-Spinner,
  ShareLink-Robustheit, T-43-`@username`-Anzeige in `profile.tsx`/`trainer/index.tsx`). Gemischte Dateien
  (`app/(tabs)/profile.tsx`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts`) enthalten fremde WIP (ANYVO-ID-Umbennung,
  i18n-Hardcode-Migration) → kein `git add .`, nur hunk-genaues Staging.
- **Migrationen (kein `supabase db push`):** remote fehlen `20260803120000_fix_shared_trainings_fk.sql` (untracked,
  noch nicht committed) und `20260803140000_profiles_username.sql` (committed `7517e1d`). Beide kontrolliert über den
  Supabase-Migrationsworkflow anwenden bzw. History synchronisieren, danach RPC-Smoke-Test. Share-FK nur zusammen mit
  dem committed Share-Code behandeln (fremder ShareSheet-WIP nicht mitschneiden).
- **Release-Konfiguration vor Build 39:** Android `versionCode` `37`→`39`, iOS `buildNumber` `"38"`→`"39"` (`app.json`);
  `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` prüfen/ergänzen (aktuell nur iOS-Key in `.env`/`eas.json` → IAP auf Android inaktiv);
  sauberen Release-Worktree aus committed HEAD erstellen; iOS und Android aus derselben Feature-Basis bauen.

## Offen / Blocker
- **T-20 — Testerfeedback und Build-38-Hotfix-Triage** · OPEN
  Release-Fokus liegt jetzt auf TestFlight-/Google-Play-Testerfeedback, echter Geraetepruefung und gezielten
  JS-/TS-Hotfixes per EAS Update statt auf neuer Build-Erstellung.
- **T-21 — Dirty Working Tree aufräumen und Release-Branch-Strategie klären** · OPEN
  Hauptrepo enthält weiterhin viele vorbestehende uncommittete/WIP-Dateien ausserhalb der Build-38-Hotfixes
  (Home/Profile/Connect/Tracking-Komponenten, Legal-Web-Startseite, lokale Artefakte, SQL-Dumps, Bilder, Agent-Dateien).
  Keine pauschalen Commits, kein `git add .`, kein Reset/Clean.
- **T-22 — Website-Relaunch Scope prüfen/abschliessen** · OPEN
  `legal-web/index.html`, `legal-web/funktionen.html`, `legal-web/assets/` sind lokal dirty/untracked.
  Wurde nicht deployed und nicht committed.
- **T-23 — RevenueCat Dashboard manuell finalisieren/testen** · OPEN
  Apple-/Google-Webhooks im RevenueCat-Dashboard je Store setzen/testen; echte Events nur mit gesonderter Freigabe.
- **T-24 — Store/Release Monitoring Build 38** · OPEN
  Auf echten Geräten prüfen, ob EAS Updates ankommen: GS/Winkel-Panels, Absuche nur manuell, 5/10 m,
  Tracking-UI, Google Login, Keyboard-Formulare, Auswertungslayout.

## ► TASK-ID-Stand
- **T-30 ist OPEN/MANUAL reserviert** für den manuellen Realgeräte-Abnahmetest von T-25…T-29.
- **Nächste freie allgemeine TASK-ID:** **T-45**
- Letzte bearbeitete TASK-ID: **T-44** (Build-39-Nacharbeit: Trainer-Hub-Redesign, Profil-Duplikat-Einträge,
  Umfrage-/Summary-Back-Fallback — uncommittet, verifiziert grün).
Empfohlene nächste Arbeit:
1. **T-39/T-40/T-44 + Build-39-Fixes sauber stagen/committen** (hunk-genau; keine fremden WIP-Hunks in
   `profile.tsx`/`i18n/*` mitschneiden). Commit-Vorschläge:
   - `feat(training): add journal entry card on training tab` (T-39)
   - `feat(training): show GPS track distance and dedup tracks in journal` (T-40)
   - `feat(trainer): redesign trainer hub and safe back navigation` (T-44)
2. **Migrationen kontrolliert remote anwenden** (Supabase-Migrationsworkflow, kein `supabase db push`):
   `20260803120000_fix_shared_trainings_fk.sql` (untracked → erst committen) und
   `20260803140000_profiles_username.sql` (committed `7517e1d`) — danach RPC-Smoke-Test
   `check_username_available` (frei/reserviert/belegt/case-insensitive) + Unique-Index (2× gleicher
   lowercase-Name → 23505). Share-FK nur zusammen mit committed Share-Code behandeln.
3. **Entitlement-Migrationen (`20260802100000`/`20260802110000`) kontrolliert remote anwenden**, danach
   SQL-Smoke-Tests inkl. Lifetime-/Ablauf-/Widerrufsfällen. `50ccfd2` ist committed, aber nicht gepusht.
4. **Release-Konfiguration vor Build 39:** `app.json` Android `versionCode` `37`→`39`, iOS `buildNumber`
   `"38"`→`"39"`; `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` prüfen/ergänzen (nur iOS-Key vorhanden → Android-IAP
   sonst inaktiv); sauberen Release-Worktree aus committed HEAD erstellen; iOS+Android aus derselben Basis bauen.
5. **T-30: Realgeräte-Abnahmetest** für Backpack/Journal/Dashboard und Home-Backpack-Integration — DE/gsw/FR, iPhone klein/gross + Galaxy S23.
6. Weiterhin offen (Release): **T-20** Testerfeedback/Build-38-Hotfix-Triage, **T-21** Dirty-Tree-Aufräumen
   (inkl. P0-FIX-01 Migrations-Baseline `supabase/migrations/README.md` + P0-Reports als eigener Strang).
Kein Commit/Push ohne ausdrückliche Freigabe.

## Später / nicht blockierend
- App-Store-Connect App-Privacy und Review-Texte final prüfen.
- Vercel/Legal-Web nur nach sauberem Scope deployen.
- Production Monitoring Supabase/RevenueCat/Auth nach Live-Traffic prüfen.

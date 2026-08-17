# ANYVO — Current State

> Länger gültiger, technischer Projektzustand für Agenten (OpenCode & OpenAI Codex).
> **Kein Session-Log** (dafür `SESSION_HANDOFF.md` / `WORK_LOG.md`).
> Jede Aussage ist als **Verified / Assumed / Unknown** markiert.
> **Repository state > Git state > Handoff documentation > Agent assumptions.**

## Aktueller Stand — 2026-08-17 (autoritativ, verifiziert via git) — MAßGEBLICH

> Ergänzt nach der Codex-Übernahme: read-only NEWBIE-Quota-Production-Preflight + **committeter**
> Trainer-Verbinden-Keyboard-Fix `0e7aaba`. **Kein Push/Build/OTA, keine Production-Schreiboperation.**
> Diese Sektion ist die neueste MAßGEBLICHE; ältere (ab „2026-08-15" abwärts) sind Historie. **Code ist Wahrheit.**

### REPO (Verified)
- Branch `feat/track-module-rewrite`, **HEAD `0e7aaba`**, **3 Commits VOR origin** (0 hinter). Working Tree weiterhin
  absichtlich **dirty** (fremder WIP + Doku-Appends — **NICHT anfassen**).
- **Neu seit letztem Handoff (`fddd1f1`)** — zwei Subscription-Commits auf dem Branch, **nicht** in dieser Session
  erstellt und **noch nicht gepusht**: `c210008 feat(subscription): add 3-day ACTIVE trial funnel`,
  `adfc3b5 fix(subscription): allow 2 NEWBIE trainings per month`.
- **T-57 committed:** `0e7aaba fix(trainer): keep connect sheet above keyboard` enthält ausschließlich
  `app/trainer/index.tsx` (Keyboard-Fix, 35+/28−, 3 Hunks). Weitere geänderte Produktdateien im Tree
  (`features/subscription/plans.ts`, `features/tracking/hooks/useTrackVoiceGuidance.ts`, `hooks/useCapabilities.ts`)
  sind **fremder WIP — nicht anfassen**.

### NEWBIE-QUOTA — PRODUCTION-PREFLIGHT (Verified read-only, 2026-08-17)
- **Production `axkkhyqrjrtbkumaulta` liefert bereits** `newbie_quota_limit` = **dog=1, training=2, track=0**
  (PostgREST/anon-RPC; `.env EXPO_PUBLIC_SUPABASE_URL` = Production bestätigt; Tabelle `newbie_quota_claims` existiert).
- **Migration `supabase/migrations/20260816130000_newbie_training_quota_two.sql` (training 1→2) = No-Op**
  (idempotent, keine Datenänderung). **Nicht erforderlich; nicht ohne Freigabe ausführen.**
- **`20260808120000_newbie_training_quota_one.sql` (→1) NICHT isoliert anwenden** (Regression 2→1).
- Premium (ACTIVE/FOUNDER/TRAINER/Lifetime) via `is_pro_member`/`user_capabilities.pro_member` **vor**
  `newbie_quota_limit` auf unbegrenzt kurzgeschlossen → von der Quota unberührt. Keine User-Daten betroffen.
- **Verifikationsgrenze:** kein DDL-Dump (`pg_dump`/`psql`/`service_role` fehlen; `supabase migration list --linked`
  scheitert an fehlendem `SUPABASE_DB_PASSWORD`) → Beleg verhaltensbasiert (RPC-Werte), nicht per Body-Dump.

### TRAINER VERBINDEN — KEYBOARD-FIX (Verified im Code, committed `0e7aaba`)
- **`app/trainer/index.tsx`:** Bottom-Sheet „Code eingeben" war `position:absolute; bottom:0` im `Modal` **ohne**
  `KeyboardAvoidingView` → Tastatur verdeckte das Feld. Fix: Backdrop + Sheet in Vollbild-`KeyboardAvoidingView`
  (`behavior ios:padding / android:height`, `modalRoot { flex:1, justifyContent:'flex-end' }`), `position:absolute`
  entfernt, `autoFocus` gesetzt; Backdrop-Tap-Schließen und Bottom-Safe-Area erhalten.
- Statisch verifiziert: `npx tsc --noEmit` PASS; `npx jest services/__tests__/trainer-flow.test.ts --runInBand`
  PASS (1 Suite / 6 Tests); `git diff --check` PASS. **Real-Device-Abnahme iOS/Android (Galaxy S23) steht aus.**

---

## Aktueller Stand — 2026-08-15 (autoritativ, verifiziert via git) — MAßGEBLICH

> Ergänzt von Claude Code nach dem **Production-OTA des Fährten-Render-/Confidence-Winkel-Fixes**.
> Diese Sektion ist die neueste MAßGEBLICHE; ältere Sektionen (ab „2026-08-12" abwärts) sind Historie.
> Bei Widerspruch gilt DIESE Sektion + echter git-Stand. **Code ist Wahrheit.**

### REPO (Verified)
- Branch `feat/track-module-rewrite`, **HEAD `fddd1f1`** (`fddd1f1db5798c32cc415e309362e95d32df95ab`),
  **synchron mit origin** (0 ahead / 0 behind). Working Tree weiterhin **absichtlich dirty** (~88 Einträge,
  fremder WIP + ältere Doku-Appends — **NICHT anfassen**, siehe „Current Dirty State" unten).

### PRODUCTION-OTA 2026-08-15 (Verified — veröffentlicht)
- Commit **`fddd1f1`** — `fix: restore track rendering and robust angle detection`, aus **sauberem detached
  Worktree** gebündelt (kein fremder WIP). Runtime **1.0.1** (policy `appVersion` = iOS/Android Build 40),
  Channel **`production`**, Environment `production`, plattformweise (kein Web).
  - **iOS** update `01a00692-bd2f-7edd-868e-54143abe7c41` (group `219a6fc9-3278-4fb6-b01c-45b4b5231f18`)
  - **Android** update `01a00697-d886-7580-ab39-7528bc0163f5` (group `d88e7d0d-fb09-4e57-b55e-9b63df340828`)
  - Message: „fix(tracking): restore solid track rendering and robust angle detection".
  - **Kein neuer nativer Build, keine DB-Migration, kein Store-Submit.** OTA erreicht Build-40-Geräte beim App-Start.

### FÄHRTE — was jetzt PRODUKTIV ist (Verified im Code `fddd1f1`)
- **Gelegte Fährte in der Absuche = solide, durchgehend, ANYVO-Mint.** Root Cause war die frühere
  `dimLay`-Darstellung (gedimmt/transparent/gestrichelt) in `features/tracking/components/TrackingMap.tsx`;
  neue zentrale, reine Renderlogik `laidTrackStroke()` (`features/tracking/utils/trackSegments.ts`). Die
  **Ist-Suchspur bleibt separat blau**. `dimLay`-Prop deprecated/ignoriert (Aufrufer-kompatibel).
- **Auto-Winkelerkennung = Confidence-basiert** (`features/tracking/utils/autoCornerDetection.ts`).
  Das frühere **harte Einzelpunkt-Gate `MAX_ANGLE_ACCURACY_M = 20` ist entfernt** (führte im Feld/Wald dazu,
  dass Auto-Winkel bei Accuracy > 20 m gar nicht erzeugt wurden). Faktoren (Σ = 1.0): `angle 0.24`,
  `straightBefore 0.16`, `straightAfter 0.16`, `support 0.10`, `accuracy 0.12` (robust über die Punktsequenz,
  nicht Einzel-Scheitel), `bearing 0.12`, `legLength 0.10`. Zustände: **accept** (gültige Klasse ∧
  `minStraight ≥ 0.70` ∧ `confidence ≥ 0.62`), **pending** (Schenkel zu kurz / Grenz-Confidence → weiter
  Punkte sammeln, **keine Duplikate**), **reject** (Kurve/Schlangenlinie / zu niedrig). Ein einzelner
  schlechter GPS-Fix zerstört einen geometrisch klaren Winkel nicht mehr.
- **Schlangenlinien-Schutz bleibt erhalten** (T-45): echte 90°/Spitzwinkel erkannt; Schlangenlinie / S-Kurve /
  GPS-Zickzack / kontinuierliche Kurve → **0 Winkel** (Regressionstests grün). **Nicht** durch großzügige
  Accuracy-Schwellen ersetzen.
- **Winkeltypen:** auto `links/rechts/spitz_links/spitz_rechts`; manuell `GW/OW/BW/Abriss` **unverändert**
  (separat, eigene Persistenz). **Links/Rechts mathematisch verifiziert** (N→O rechts, N→W links, O→S rechts,
  O→N links, S→W rechts, S→O links, W→N rechts, W→S links) — keine UI-/Screen-Koordinaten.
- **Voice/Haptik = NICHT Root Cause.** Der Pfad Detection → Store → Snapshot → Restore → Search → Map →
  Voice/Haptik ist testgetrieben verifiziert: ein erzeugter Auto-Winkel gelangt korrekt an Karte + Voice + Haptik.
  Der frühere Eindruck „nur Gegenstände werden angesagt" entstand, weil Auto-Winkel wegen des alten Gates gar
  nicht erzeugt wurden. Voice/Haptik **bewusst nicht refactored**.
- **1/5/10-m-Hundeführerabstand** unverändert (Default 5 m): `dogProgressM = trustedHandlerProgressM +
  searchHandlerDistanceM` (keine echte Hund-GPS-Position; Smartphone beim Hundeführer).
- **DEV-Diagnostik** `features/tracking/utils/angleDiagnostics.ts` existiert (accept/pending/reject, Confidence,
  Accuracy, Winkelklasse) — **DEV-only, NICHT produktiv verdrahtet, nicht im Bundle**. Nicht ohne Anlass aktivieren.

### FÄHRTE — was noch getestet werden muss (P0, Verified als offen)
- **Realer Feldtest des Confidence-Fixes steht aus** (der Fix ist produktiv, aber nicht feldverifiziert):
  reale Fährte mit 90° rechts/links + Spitzwinkel rechts/links + ≥ 2 Gegenständen + Schlangenlinie bei
  **schwankender GPS-Accuracy**, iOS **und** Android. Prüfen: Karte (solide Mint-Fährte, separate blaue Suchspur,
  alle Auto-Winkel + Gegenstände sichtbar), Guidance (Voice/Haptik je Winkeltyp, keine Doppelansagen),
  Regression (Schlangenlinie → 0 Winkel), 1/5/10-m stichprobenartig, kurzer Off-Track-Test. → siehe `TASKS.md` (T-56).

### OFF-TRACK (Verified — Stand unverändert ggü. 2026-08-12)
- **Live verdrahtet:** State-Machine im Recorder (`c251434`) + Feedback (`bccce35`): `on_track/warning/off_track`,
  Recovery-Banner, Voice/Haptik nur auf echten Transitionen, Spam-Schutz. **`freezeProgress` bewusst NICHT aktiv**
  (nur Feedback, kein Progress-/Recorder-Freeze). Detail-Schwellen/Statistikkern siehe Off-Track-Report — nur die
  hier genannten Teile sind als live bestätigt.

### TESTSTAND (Verified, `fddd1f1`)
- Targeted Tracking/Angle/Guidance: **103 PASS** (`laidTrackStroke`, `cornerConfidence`,
  `searchGuidancePipeline`, `autoCornerDetection`, `angleClassify`, `angleTypes`, `angleDiagnostics` u. a.).
- Gesamtsuite zuletzt: **1191 PASS / 1 FAIL** — der eine Fehler ist ausschließlich der **vorbestehende stale**
  `app/track/__tests__/run-arming.test.ts` (erwartet `([5, 10] as const).map`, `run.tsx` unverändert). **Die
  Suite ist NICHT vollständig grün, solange dieser stale Test existiert.** `tsc --noEmit` 0 Errors, ESLint der
  berührten Dateien 0 Errors, iOS + Android `expo export` OK.

### RUCKSACK / TRAININGSTAGEBUCH (Verified im Code/git)
- **Backpack (Rucksack):** Phase A (Datenschicht `0434182`) + Phase B (UI `app/dog-backpack/[id].tsx`, `0434182`)
  + Home-Integration (`e447cd2`) committed & gepusht. Keine DB-Tabelle/Migration.
- **Trainingstagebuch (Journal):** `app/training-journal.tsx` auf `useTrainingFeed` (`2a85fbc`) committed;
  **Fährteneintrag-Löschen** (`deleteFeedItem`) ergänzt in **`c4c075f`** (gepusht). Keine zweite DB.

### REPORTS (Detailquellen — nicht hier duplizieren)
- `docs/architecture/FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md` (Render/Pipeline/Root-Cause)
- `docs/architecture/FAEHRTE_ANGLE_CONFIDENCE_FIX_REPORT.md` (Confidence-Faktoren/Schwellen/Zustände)
- `FAEHRTE_ANGLE_TYPES_FIX_REPORT.md`, `FAEHRTE_ANGLE_QUICK_PICKER_FIX_REPORT.md`,
  `FAEHRTE_OFF_TRACK_AND_HANDLER_DISTANCE_FIX_REPORT.md`, `FAEHRTE_ABSUCHE_HANDLER_DISTANCE_FIX_REPORT.md`,
  `FAEHRTE_STEP_CALIBRATION_FIX_REPORT.md`, `FAEHRTE_TEILSTRECKE_START_STOP_FIX_REPORT.md`.

---

## Aktueller Stand — 2026-08-12 (autoritativ, verifiziert via git) — MAßGEBLICH

> Ergänzt von Claude Code. Spiegelt den REAL gepushten Stand nach Off-Track + Save-Reliability +
> App-Store-Release + Production-OTA. Ältere Sektionen unten (inkl. „2026-08-10") sind Historie;
> bei Widerspruch gilt DIESE Sektion + echter git-Stand.

### REPO
- Branch `feat/track-module-rewrite`, **HEAD `4e0bf1e`**, **synchron mit origin** (0 ahead / 0 behind, verifiziert).
- Working Tree weiterhin **absichtlich dirty** (fremde WIP-Cluster: Codex/opencode-Agent-Handoff-Dateien,
  i18n-Hardcode-Migration, ADR/Architecture-Docs, SQL-Dumps, `dist-*`, Screenshots, `.opencode/`). **NICHT anfassen.**
  Ein bündelbarer Fremd-Diff bleibt in `features/tracking/hooks/useTrackVoiceGuidance.ts` (uncommittet).

### PRODUCT / RELEASE
- ANYVO **1.0.1**, iOS **Build 40**, `runtimeVersion` policy `appVersion` (→ 1.0.1).
- **Von Apple genehmigt und im App Store veröffentlicht.**
- **Production-OTA (2026-08-12)** auf Runtime 1.0.1, Channel `production`, iOS + Android (**kein Web**):
  iOS group `4fe50aa1-402a-4d7d-8abc-672ff347f5c8`, Android group `f69ea5a8-93ed-4109-8121-5e6326ccdf13`;
  Message „fix: improve track save reliability"; aus sauberem HEAD `4e0bf1e` gebündelt.

### SUBSCRIPTIONS
- **Newbie** = Free-Tier (kein einzureichendes Kaufprodukt). **Active** + **Trainer** öffentlich kaufbar.
- **Founder** NICHT mehr öffentlich kaufbar (`6d30359`); bestehende Founder-Legacy-/Restore-Unterstützung intern erhalten.
- RevenueCat-Init vor Produktladen abgesichert (`d45a1f3`); Diagnose-Code wieder entfernt (`52360f0`); iOS Active↔Trainer
  Wechsel möglich (`6dc3462`). Production-EAS-Env `production` hat iOS + Android RevenueCat Public SDK Keys.

### TRACK LEGEN
- Robuste Auto-Winkel-Erkennung (T-45 `bfc9c58`, Test `87fc3dd`): Schlangenlinien ≠ Winkel, 90°/Spitzwinkel getrennt,
  Links/Rechts verifiziert, Recorder = Single Source.
- **Save = Local-first + Sync-Queue + Retry + History-Merge** (P-SAVE1 `7087e15` / P-SAVE2 `431a2d6` / P-SAVE3 `94e8ec2`):
  clientUuid = `training_sessions.id`; SQLite durable truth; idempotenter Upsert; Lay-Points/Marker Replace-by-session.

### TRACK ABSUCHE
- **Off-Track Phase 1 (`c251434`) + Phase 2 (`bccce35`)**: State-Machine im Recorder, Banner/Voice/Haptik, Spam-Schutz.
  **`freezeProgress` bewusst NICHT aktiv** (nur Feedback, kein Progress-/Recorder-Freeze).
- **Run-Save = Local-first + Queue + Retry** (RUN-SAVE1 `0ab0520` / RUN-SAVE2 `c47d5a6` / RUN-SAVE3 `cc58df5`+`4e0bf1e`):
  runUuid = `track_runs.id`; Run-Ergebnis zuerst lokal in `payload_json.run`; lokale Run-History + Detail-Local-Fallback.
- **Kanonische Remote-Absuche-Spur = `track_runs.run_points`** — KEIN zusätzliches `point_type='search'` nach remote `track_points`.

### KNOWN ISSUES / DEFERRED
- **Freeze Progress** bewusst vertagt (siehe DECISIONS 2026-08-12).
- **Web-Bundle** bricht via `react-native-maps` (native-only Import) → OTA plattformweise ios/android; kein Mobile-Blocker,
  **nicht nebenbei fixen**.
- **Vorbestehender stale Test** `app/track/__tests__/run-arming.test.ts` (erwartet `([5, 10] as const).map`) weiterhin rot,
  unabhängig von den Save-Fixes.
- Weitere offene Tasks nur nach echter Repo-Verifikation (siehe `TASKS.md` Update 2026-08-12).

---

## Aktueller Stand — 2026-08-10 (Historie, überholt durch 2026-08-12)

> Ergänzt von Claude Code. Spiegelt den REAL gepushten Stand nach P1–P8 + Security + Branding +
> Dog/Home-UI. Ältere Sektionen unten bleiben Historie; bei Widerspruch gilt diese Sektion + echter git-Stand.

### REPO
- Branch `feat/track-module-rewrite`, **HEAD `69d7b72`**, **synchron mit origin** (0 ahead / 0 behind).
- Working Tree weiterhin **absichtlich dirty** (fremde WIP-Cluster: opencode-Agent-Handoff inkl. T-45
  Winkel/`autoCornerDetection`, ADR/Architecture-Docs, Artefakte/Rauschen) — NICHT Teil dieser Commits.

### RELEASE
- ANYVO **1.0.1**, iOS **Build 40**, Android **Build 40**, `runtimeVersion` policy `appVersion` (→ 1.0.1).
- Production-OTA vorhanden (`updates.url` gesetzt, channel `production`); mehrere OTAs (Recovery/Subscription)
  bereits veröffentlicht (Runtime 1.0.1).

### ABGESCHLOSSEN / AUF ORIGIN (verifiziert gepusht)
- **P1** Recovery-Route — `a40a68c` · **P2** NEWBIE-Copy — `3c3c17e` · **P3** FR Recovery-Parität — `9b578b3`
- **P4** ANYVO ID — `06e5aaf` · **P5** 1-m Search-Distance — `a13f412` · **P6** Off-Track-Utilities — `2dc0398`
- **P7** Tracking-Design-Tokens (accText) — `2468ebe` · **P8** Localization-Sweep — `60be031`
- **CONNECT** Entitlement fail-closed — `19a2bf1` · **Branding** ConnectHomeScreen ANYVO-Logo — `f1d7abe`
- **Dog/Home-UI:** Quick Actions `d1f240d` · Heat-Card `ba6ce75` · Active-Fährte-Card + GPS `9e74454` ·
  ShareSheet-Härtung `82d01d7` · Home-Widget/i18n-Testabdeckung `69d7b72`

### AUTH
- Passwort-Recovery auf echtem Gerät **erfolgreich**. PKCE, Deep-Link `anyvo://auth/recovery` (Datei-Route +
  `_layout`-Registrierung). Temporärer Diagnose-Code **vollständig entfernt** (netto keine Diagnose am HEAD).
  Same-Device-Hinweis bleibt.

### CONNECT
- ANYVO ID. Production-Entitlement-Enforcement **fail-closed** (`__DEV__===false` erzwingt Tier-Logik; fehlendes
  Env-Flag gewährt KEIN ALL_ACCESS mehr). Branding korrigiert (anyvologo).

### TRACKING
- **1-m Search-Toleranz** (`HANDLER_DISTANCES_M=[1,5,10]`, Default 5 m).
- **Off-Track State Machine** vorhanden (`features/tracking/utils/offTrack.ts` + Tests), **NICHT verdrahtet**.
- **Offen:** Winkel / rechts-links / Schlangenlinien (T-45, opencode-WIP `autoCornerDetection`).

### SUBSCRIPTIONS
- Mitgliederbereich; RevenueCat `managementURL` (+ Store-Fallback); Planwechsel `canSwitchPlanInApp` (in-app nur
  store-sichere Upgrades; Android Product-Change `oldProductIdentifier` + `WITH_TIME_PRORATION`).
- **Offen:** Founder Active später vereinfachen / für Neukunden aus regulärer Auswahl nehmen; Bestandskunden erhalten.

### DOG/HOME
- Neue Quick Actions, Heat-Empty-State, Active-Fährte-Card + GPS-Quality, ShareSheet-Guard, Home-Widget-/i18n-Tests.

## Verified (im Repository nachprüfbar)
- **Stack:** Expo SDK 54 / React Native, Expo Router (file-based, `app/`), TypeScript. (`package.json`, `app.json`)
- **Native:** Continuous Native Generation — `ios/` und `android/` existieren lokal/git-ignored; native Builds verändern den versionierten Tree nicht direkt.
- **Release-Worktree:** lokaler Release-Worktree ist sauber und steht auf Branch `release/build38-hotfix`, HEAD `f7a5997`.
- **Build 38 Config im Release-Worktree:** App-Version `1.0.1`, iOS buildNumber `38`, Android versionCode `38`, `runtimeVersion` policy `appVersion`, `updates.url` gesetzt, production channel vorhanden.
- **Hauptrepo HEAD:** `2d9e1cc feat(web): relaunch ANYVO website with journal, backpack and design pass` auf Branch
  `feat/track-module-rewrite`, **0 Commits vor `origin/feat/track-module-rewrite`** (alle zuvor ungepushten Commits
  wurden mit Freigabe gepusht, HEAD == Remote).
- **Feature-Commits in HEAD (alle remote):** Backpack `0434182`, Journal `2a85fbc`, Dashboard `0061fed`,
  Home-Backpack-Integration `e447cd2`, Entitlement-System (T-34) `50ccfd2`, Startseiten-FAB (T-41) `7490969`,
  Schnellbutton-Kette `7490969`/`e8f57be`/`c268eee`, Benutzernamen (T-43) `7517e1d`, Build-39-Kette bis `6e10838`,
  Website-Relaunch `2d9e1cc`.
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
- **Agent-Infrastruktur:** `docs/agent/*`, `scripts/agent-*.mjs`, `AGENTS.md`-Regeln und `.opencode/`-Konfiguration; `CLAUDE.md`/`.claude/` sind Legacy bis zu einem separaten Cleanup.

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

## Verified (Website-Relaunch legal-web — committed `2d9e1cc` + gepusht)
- **Inhalt:** `legal-web/index.html` (Startseite mit Backpack + Journal), `legal-web/funktionen.html` ==
  `legal-web/funktionen/index.html`, echte Screenshots (`assets/screenshots/*`: journal/backpack/smartanalyse),
  `assets/site.css`/`site.js`, Meta aktualisiert.
- **Design-Pass 2 (nur `assets/site.css`):** `.module-card` auf Flex-Column mit pro Bild passendem `aspect-ratio`
  (2/3 Porträt/Screenshot, 3/2 Landschaft), `.audience-card` als 2-Spalten-Editorial, `.cta-band`
  `object-fit: contain` mit unscharfem `::before`-Hintergrund, Card-Buttons Sekundärstil, `.tag-row margin-top:auto`.
- **Verifikation:** 9 Viewport-Breiten (320/375/390/430/768/1024/1280/1440/1920) ohne Overflow; Bild-Containers
  entsprechen exakt den nativen Aspect-Ratios (`yam20.jpg` 1023×1537, `bazooka.jpg` 1920×1280, `Malu13.jpg` 4000×6000,
  `11GSLOGODSC4449.jpg` 3500×2333) → `cover` kann den Hund mathematisch nicht beschneiden; „vollständig sichtbar"
  **nicht visuell bestätigt** (kein Bildeingang).
- **Commit + Push (mit Freigabe):** `2d9e1cc` selektiv gestaged (nur Legal-Web, fremder WIP unangetastet), gepusht
  auf `origin/feat/track-module-rewrite` (`6e10838..2d9e1cc`); HEAD == Remote (0/0).
- **Deployment:** NICHT erfolgt (kein Vercel/Netlify o. ä.).

## Current Dirty State (Verified via `git status --short`)
- Das Hauptrepo ist weiterhin dirty (uncommittete WIP/Artefakte), Index leer (0 staged).
- **Push abgeschlossen:** HEAD `2d9e1cc` == `origin/feat/track-module-rewrite` (0 vor, 0 hinter). Alle bisher
  ungepushten Commits (Backpack/Journal/Dashboard/Home-Backpack, T-34, T-36…T-44, Build-39-Kette bis `6e10838`,
  Website-Relaunch `2d9e1cc`) sind jetzt remote.
- **Uncommittete Build-39-Nacharbeit:** ist grösstenteils committed (DateField, Journal-Karte/Distanz, Trainer-Hub,
  Summary-Back, Share-Härtung, Release-Nummern, env-Bindung). Im Tree verbleiben v. a. **fremde WIP-Stränge**:
  ANYVO-ID-Umbennung (`i18n/de-CH.ts`/`gsw-CH.ts`/`fr.ts`), i18n-Hardcode-Migration (`index/sync/track/trainer/unit/
  connect/tracking/AppLockGate/ShareSheet/DogHeatCard/DogQuickActions/GpsSourcePicker/MarkerBottomSheet/
  ActiveFaehrteCard/TrackStatsPanel`), optionale Home/Backpack-Test-Files.
- **Fremd / NICHT committen (ausschliessen):** ANYVO-ID-Umbennung (i18n `username*`→„ANYVO ID", fr komplett),
  i18n-Hardcode-Migration (`trainer/dashboard`, `trainer/index`, `unit/live`, `unit/stats`, `index`, `sync`,
  `track/*`, `tracking/*`, `connect/*`, `AppLockGate`, `ShareSheet`, `DogHeatCard`, `DogQuickActions`,
  `GpsSourcePicker`, `MarkerBottomSheet`, `ActiveFaehrteCard`, `TrackStatsPanel`), SQL-Dumps,
  Screenshots, `dist-*`, ADRs, `AI_HANDOFF.md`, Workspace-Dateien.
- **Migrationen remote (applied):** `20260802100000`, `20260802110000`, `20260803130000`, `20260803140000` und
  `20260803120000` (letztere committed `6e10838` + nachträglich appliziert). Keine Remote-Migration offen.

## Verified (Build 39 — Release-Readiness-Audit, 2026-08-04) — GATE: NOT READY
- **Clean-HEAD (`c268eee`, detachierter Worktree):** `npm ci` OK; `tsc --noEmit` 0 Errors; Jest **77 Suites /
  856 Tests PASS**; `expo config --type public` OK (Sentry-org/project nur via Env); `expo export` iOS + Android
  beide OK; `git diff --check HEAD^ HEAD` sauber. Vorbestehend: 1 Lint-Error `app/dog-command/detail.tsx:69:110`
  (seit `ab602c0`), 77 Warnungen.
- **Arbeitender Tree:** `tsc --noEmit` 0 Errors; Jest **84 Suites / 910 Tests PASS** (+7 Suites/+54 Tests aus
  uncommitteter Arbeit).
- **Release-Konfiguration (Verified):** `app.json` version `1.0.1`, iOS `buildNumber "38"`, Android
  `versionCode 37` (TASKS.md T-18-Behauptung „38" ist veraltet). `eas.json`: production `autoIncrement:false`,
  `appVersionSource:local`, channel `production`, buildType `app-bundle`, `"environment": "production"` (seit
  `82b0868`). **`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` ist als sensible EAS-Env in `production` angelegt**
  (`eas env:create`, NICHT in Git); `eas env:list production` → `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` +
  `SENTRY_AUTH_TOKEN` (beide sensitive). `configurePurchases` (lib/purchases.ts:27) liest den Key auf Android
  damit aus der EAS-production-Umgebung. Sentry-org/project nur als Env in production.
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
- Ob die Website releasefähig ist; sie ist committed (`2d9e1cc`) + gepusht, aber **nicht deployed** und die
  manuelle Sichtprüfung der Hundefotos steht aus.
- Vollständigkeit/Aktualität der ADR-/Architektur-Docs gegenüber dem aktuellen Code.
- Ob der Home-Backpack-Flow auf Android und auf echten Geräten vollständig abgenommen ist.

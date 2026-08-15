# ANYVO — Task-Liste (Agent-Handoff)

> IDs stabil, chronologisch. Status: DONE · DONE(committed) · DONE(deployed) · BLOCKED · OPEN.
> Priorität bei Widerspruch: Repository state > Git state > Handoff-Doku.
> Stand: 2026-08-05 · Branch `feat/track-module-rewrite`, HEAD `2d9e1cc` (0 Commits vor `origin`, gepusht).

## Update 2026-08-15 (Claude Code) — Fährten-Render-/Confidence-Winkel-Fix DEPLOYED (HEAD `fddd1f1`, == origin)

> Verifiziert gegen git/Code. Diese Sektion ist die neueste maßgebliche.
> **Production-OTA** (Runtime 1.0.1, Channel `production`, iOS + Android; kein Web) aus sauberem Worktree auf `fddd1f1`:
> iOS update `01a00692-bd2f-7edd-868e-54143abe7c41` (group `219a6fc9-3278-4fb6-b01c-45b4b5231f18`),
> Android update `01a00697-d886-7580-ab39-7528bc0163f5` (group `d88e7d0d-fb09-4e57-b55e-9b63df340828`).

### Neu DONE (auf origin + per OTA produktiv)
- **T-55 — Fährten-Absuche: Solid-Mint-Render + Confidence-Winkel** · **DONE(deployed `fddd1f1`)**
  (1) Gelegte Fährte in der Absuche wieder **solide, durchgehend, Mint** (`laidTrackStroke()` in
  `features/tracking/utils/trackSegments.ts`; Renderer `TrackingMap.tsx`; `dimLay` deprecated; Ist-Suchspur separat blau).
  (2) **Confidence-basierte Auto-Winkelerkennung** (`features/tracking/utils/autoCornerDetection.ts`): hartes
  `MAX_ANGLE_ACCURACY_M=20`-Gate entfernt; Faktoren angle/straightBefore/straightAfter/support/accuracy(robust)/
  bearing/legLength (Σ=1); Zustände accept/pending/reject; ein schlechter GPS-Fix vetot keinen klaren Winkel mehr;
  Schlangenlinien-Schutz erhalten. Voice/Haptik/Store/Persistenz/1-5-10-m/Off-Track unverändert. Keine DB/Native.
  Tests: `laidTrackStroke` (5), `cornerConfidence` (24), `searchGuidancePipeline` (18), `autoCornerDetection` (38).
  DEV-Diagnostik `angleDiagnostics.ts` (nicht verdrahtet). Reports: `FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md`,
  `FAEHRTE_ANGLE_CONFIDENCE_FIX_REPORT.md`.

### OPEN — P0 Real-Device-Test-Gate (Feldfehler → Feldverifikation zwingend)
- **T-56 — Real-Device-Test Confidence-/Render-Fix (iOS + Android)** · OPEN(P0, Test-Gate)
  Reale Fährte: 90° rechts, 90° links, Spitzwinkel rechts, Spitzwinkel links, ≥ 2 Gegenstände, Schlangenlinie,
  **schwankende GPS-Accuracy**. Prüfen:
  - **iOS** (P0): Karte solide Mint + separate blaue Suchspur, alle Auto-Winkel + Gegenstände sichtbar; Guidance
    Voice/Haptik je Winkeltyp; keine Doppelansagen.
  - **Android** (P0): dasselbe.
  - **Schlangenlinien-Regression im Feld** (P0): Schlangenlinie erzeugt **keinen** Winkel.
  - **Voice/Haptik-Feldtest** (P0): Rechts-/Links-/Spitz-L/Spitz-R angesagt + vibriert; Gegenstände weiterhin korrekt.
  - **1/5/10-m-Stichprobe** (P0): Ansage-Zeitpunkt korrekt, Typ/Reihenfolge unverändert.
  - **Off-Track-Feldtest** (P0): kurzer Off-Track-Abstecher → Feedback korrekt, keine falschen neuen Trigger.

### ► TASK-ID-Stand (aktualisiert 2026-08-15)
- Neu vergeben: **T-55** (DONE deployed), **T-56** (OPEN P0). **Nächste freie allgemeine TASK-ID: T-57.**
- Weiterhin offen (unverändert, echter Stand): **Rucksack Phase C / Home-Backpack-Feinschliff** (Backpack A/B +
  Home-Integration DONE `0434182`/`e447cd2`), **Trainingstagebuch** DONE inkl. Fährten-Löschen (`c4c075f`),
  **T-54 E-Mail-Confirm** (uncommitted, Supabase-Redirect-URL freigeben + `legal-web` deployen), **T-22 Website
  deployen**, **T-23 RevenueCat-Dashboard**, **T-24 Store/Release-Monitoring**, **T-21 Dirty-Tree-Strategie**,
  **Connect-Localization/Supabase-Live-Auth-Checkliste** (siehe untenstehende Blöcke; nicht wieder öffnen, was DONE ist).

## Update 2026-08-13 (Claude Code) — T-54 E-Mail-Aktivierungsflow (uncommitted)

> **Kein Commit/Push/Build/Deployment.** Rein additiv; fremder WIP unangetastet.
- **T-54 — E-Mail-Aktivierungsflow: dedizierte Bestätigungsseite** · DONE(uncommitted)
  Ursache: `signUp()` ohne `emailRedirectTo` → Supabase-Site-URL → Homepage ohne Rückmeldung.
  Fix: zentrale `EMAIL_CONFIRM_REDIRECT_URL` (`features/auth/accountSecurity.ts`), `signUp()`
  (`services/auth.ts`) setzt `emailRedirectTo`; neue Seite `legal-web/auth/confirmed.html` +
  Resolver `legal-web/assets/auth-confirm.js` (Status success/expired/error/neutral, kein Erfolg
  bei Direktaufruf), „ANYVO öffnen" → festes `anyvo://` (Fallback: Store-Links). Tests:
  `legal-web/__tests__/authConfirmStatus.test.ts`, `services/__tests__/signup-redirect.test.ts`.
  Doku: `docs/architecture/EMAIL_CONFIRMATION_FLOW.md`.
  **Manuell offen:** Supabase → Authentication → URL Configuration → Redirect URLs:
  `https://anyvo.app/auth/confirmed` freigeben. **Website nicht deployed.**
- **Nächste freie allgemeine TASK-ID:** **T-55**.

## Update 2026-08-12 (Claude Code) — HEAD `4e0bf1e`, synchron mit origin (autoritativ)

> Verifiziert gegen `git log`/Code. Diese Sektion ist maßgeblich; ältere „OPEN"-Blöcke unten
> (v. a. „Update 2026-08-10") sind dadurch überholt und **SUPERSEDED** (siehe Hinweis dort).
> **Production:** ANYVO **1.0.1 / iOS Build 40** von Apple **genehmigt & im App Store veröffentlicht**.
> **Production-OTA** (Runtime 1.0.1, Channel `production`, iOS + Android; kein Web) veröffentlicht:
> iOS group `4fe50aa1-402a-4d7d-8abc-672ff347f5c8` / update `019ff763-96b1-7a29-87bb-4c73cebce279`,
> Android group `f69ea5a8-93ed-4109-8121-5e6326ccdf13` / update `019ff765-8a60-7785-a397-0e76cdc1db0d`.

### Neu DONE (auf origin, verifiziert gepusht)
- **T-45 — Auto-Winkelerkennung gegen kontinuierliche Kurven härten** · **DONE(committed `bfc9c58`, Test `87fc3dd`, gepusht)**
  Gerade-vor/Gerade-nach-Prüfung (stabile Ein-/Auslaufschenkel); Schlangenlinien werden NICHT als Winkel gewertet;
  90° ± Toleranz + Spitzwinkel getrennt; Links/Rechts verifiziert; Recorder = Single Source; RUN-Richtung separat
  test-verifiziert (`87fc3dd`). (Zuvor als „DONE(uncommitted)" geführt → jetzt committed & gepusht.)
- **T-46 — Off-Track Phase 1 (State in Search-Flow integrieren)** · **DONE(committed `c251434`, gepusht)**
  `offTrackState` in `useSearchRecorder` verdrahtet/exponiert; **kein Freeze**.
- **T-47 — Off-Track Phase 2 (Feedback)** · **DONE(committed `bccce35`, gepusht)**
  Warning-/Off-Track-/Recovery-Banner, Voice, Haptik, Spam-Schutz (nur auf echten Transitionen). **Freeze weiterhin NICHT aktiv.**
- **T-48 — Off-Track `freezeProgress`** · **DEFERRED (bewusst)**
  Produktentscheidung: Freeze-Progress wird **vorerst nicht** verwendet (nur Feedback, kein Recorder-/Progress-Freeze).
- **T-49 — LEGEN Save Reliability (P-SAVE1–3)** · **DONE(committed, gepusht)**
  P-SAVE1 `7087e15` (Local-first Session, clientUuid, ID-Race weg, kein getUser()-Netz-Zwang beim Start),
  P-SAVE2 `431a2d6` (SQLite durable truth, persistente `training_session`-Sync-Queue, idempotenter Upsert,
  Lay-Points + Marker Replace-by-session, Retry/Restart/Reconnect), P-SAVE3 `94e8ec2` (lokale pending/failed
  Fährten im Verlauf, Remote/Local-Merge, Dedupe über Session-ID, Remote-Ausfall verdeckt lokale Daten nicht).
- **T-50 — ABSUCHE Save Reliability (RUN-SAVE1–3)** · **DONE(committed, gepusht)**
  RUN-SAVE1 `0ab0520` (runUuid synchron beim Start, Run-ID-Race weg, Run-Ergebnis zuerst lokal in
  `payload_json.run`), RUN-SAVE2 `c47d5a6` (direkter Remote-Run-Pfad durch bestehende `training_session`-Queue
  ersetzt, `track_runs` idempotent per runUuid, kanonische Absuche-Spur = `track_runs.run_points`, KEIN
  zusätzliches `point_type='search'` nach remote `track_points`), RUN-SAVE3 `cc58df5` + `4e0bf1e` (lokale
  Absuche sofort im Verlauf, Score/Distanz/Deviation lokal, Detail-Local-Fallback, Remote+Local-Supplement,
  pending/failed navigierbar, Delete/hidden berücksichtigt, nach Sync keine Doppel-Fährte).
- **T-51 — Apple IAP / RevenueCat Fix + Founder aus Verkauf + iOS Plan-Wechsel** · **DONE(committed, gepusht)**
  RevenueCat-Init vor Produktladen abgesichert `d45a1f3`; temporärer StoreKit-Diagnose-Code hinzugefügt `184b193`
  und wieder entfernt `52360f0` (netto keine Diagnose am HEAD); iOS Active↔Trainer-Wechsel ermöglicht `6dc3462`;
  Founder aus regulärer Verkaufsauswahl entfernt `6d30359` (interne Legacy-/Restore-Referenzen bleiben erhalten).
  Production-EAS-Env `production` enthält iOS **und** Android RevenueCat Public SDK Keys (verifiziert via `eas env:list`).
- **T-52 — Production OTA Runtime 1.0.1 (iOS + Android, kein Web)** · **DONE(deployed 2026-08-12)**
  `eas update --channel production --environment production --platform ios|android --message "fix: improve track save reliability"`.
  Beide Updates aus sauberem HEAD `4e0bf1e` gebündelt (temporärer Stash des fremden WIP, danach `stash pop` wiederhergestellt).

### OPEN (weiterhin offen)
- **T-53 — QA-Regression Save Reliability (Real-Device)** · OPEN(QA)
  Nutzer bestätigt produktiv „es funktioniert". Sinnvoll bleiben systematische Regressionsläufe: Offline-Stop,
  App-Kill nach Stop, Reconnect/Retry, keine Duplikate — für LEGEN **und** ABSUche. **Nicht** so behandeln, als sei
  der Save-Fix noch nicht implementiert (er IST auf Production).
- **T-24 — Store/Release-Monitoring** · OPEN — OTA-Zustellung/Verhalten auf realen iOS/Android-Geräten prüfen.
- **T-23 — RevenueCat-Dashboard manuell finalisieren/testen** · OPEN.
- **T-22 — Website-Relaunch deployen** · DONE(committed `2d9e1cc`, **nicht deployed**).
- **T-21 — Dirty Working Tree / Release-Branch-Strategie** · OPEN — fremder WIP bleibt unangetastet; keine pauschalen Git-Aktionen.
- **T-20 — Testerfeedback / Hotfix-Triage** · OPEN.

### Known issues / bewusst offen
- **Web-Bundle bricht** (`react-native-maps` importiert native-only Module) → OTA läuft plattformweise ios/android;
  **kein** Release-Blocker für Mobile, **nicht** im Rahmen von Mobile-Fixes nebenbei beheben.
- **Vorbestehender stale Test** `app/track/__tests__/run-arming.test.ts` (erwartet `([5, 10] as const).map`, Code nutzt
  `HANDLER_DISTANCES_M`) ist weiterhin rot — **unabhängig** von den Save-Fixes, bewusst NICHT nebenbei gefixt.

### ► TASK-ID-Stand (aktualisiert 2026-08-12)
- **Nächste freie allgemeine TASK-ID:** **T-53** (T-53 hier bereits als QA-Task vergeben → nächste frei: **T-54**).

## Update 2026-08-10 (Claude Code) — HEAD `69d7b72`, synchron mit origin

### Gepusht (DONE, auf origin)
- Recovery-Route `a40a68c` · NEWBIE-Copy `3c3c17e` · FR-Recovery-Parität `9b578b3` · ANYVO ID `06e5aaf` ·
  1-m Search-Distance `a13f412` · Off-Track-Utilities (unverdrahtet) `2dc0398` · Tracking-Design-Tokens `2468ebe` ·
  Localization-Sweep `60be031` · CONNECT Entitlement fail-closed `19a2bf1` · Branding anyvologo `f1d7abe` ·
  Dog Quick Actions `d1f240d` · Heat-Card `ba6ce75` · Active-Fährte-Card + GPS `9e74454` · ShareSheet-Härtung
  `82d01d7` · Home-Widget/i18n-Tests `69d7b72`.

### OPEN — offene App-Tasks (NICHT erledigt, nur weil Codefragmente existieren)
> **SUPERSEDED (2026-08-12):** Dieser Block ist überholt. Off-Track (T-46/T-47), Winkel/Rechts-Links (T-45),
> 1-m-Search (produktiv getestet) und Founder-Vereinfachung (T-51) sind DONE (siehe Update 2026-08-12 oben).
- **OPEN — Off-Track-Lib in Search-Flow integrieren:** `features/tracking/utils/offTrack.ts` ist committed, aber
  **nicht verdrahtet** (kein Konsument in `app/track/run.tsx`/Recorder).
- **OPEN — Off-Track UI/Banner/Haptik/Voice/Recorder-Freeze:** separat entscheiden & umsetzen.
- **OPEN — Rechts/Links-Erkennung** auf echtem Gerät verifizieren.
- **OPEN — Winkel-Erkennung:** nur echte Winkel als Winkel erkennen; **Schlangenlinien NICHT** als Winkel;
  **90°** klarer erkennen; **Spitzwinkel** klar erkennen. (opencode-WIP T-45 `autoCornerDetection` im Tree, uncommittet.)
- **OPEN — 1-m Search-Distance real-device testen** (GPS-/Ansageverhalten bei 1 m).
- **OPEN — UI-Sichtprüfung DE/gsw/FR** der lokalisierten Screens (P8) + Dog/Home-UI-Pakete.
- **OPEN — Founder Active Vereinfachung** nach Store-Review (für Neukunden aus regulärer Auswahl nehmen;
  Bestandskunden erhalten).
- **OPEN — verbleibende Store-/Release-Checks** (iOS/Android Build 40, OTA-Zustellung auf realen Geräten).
- **OPEN — verbleibende Docs/Architecture-Reports** prüfen/committen (`docs/adr/*`, `docs/architecture/*` — untracked).
- **OPEN — Artefakte/Rauschen bereinigen** (dist-*, ZIP, Screenshots, SQL-Dumps, `.opencode/`, Workspaces) →
  ggf. `.gitignore` statt committen.
- **OPEN (fremder opencode-WIP, nicht anfassen):** Agent-Handoff-Tooling (AGENTS/README/DECISIONS/WORK_LOG/
  SESSION_HANDOFF/scripts) + T-45 Winkel-Code bleiben in opencodes Hoheit.

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

## Feature-Arbeit — committed + gepusht
> Rein additiv. Keine DB-Migration, keine bestehende Trainings-/Fährten-/Kalender-/Zyklus-/Abo-Logik verändert.
> Die Feature-Commits sind in HEAD und remote (Push mit Freigabe 2026-08-04/05).
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
  fremder WIP). Migrationen committed und remote appliziert (2026-08-04 verifiziert). Push mit Freigabe (2026-08-05).

- **T-35 — Personalisierte Home-Backpack-Integration** · DONE(committed `e447cd2`)
  Hundespezifische Backpack-Schnellaktionen und Backpack-Widget mit `dogId`, instanzierter Home-Konfiguration,
  Sanitizing, DE/gsw/FR und bestehender `/dog-backpack/[id]`-Route. Keine DB-Migration, keine neue Hundestruktur.

## Hunde-/Training-Features — committed + gepusht
> Weitere Feature-Arbeit auf `feat/track-module-rewrite`; rein additiv, keine DB-Migration.
- **T-36 — Hunde-Register-Details + Tasso-Fix** · DONE(committed)
  `ec85884 feat(dogs): add country-specific registry details`, `f4076c4 fix(dogs): keep tasso_registered non-null on create`.
- **T-37 — Add-dog-Gating + FAB-Hide auf Hunde-Tab** · DONE(committed)
  `c859e33 fix(dogs): gate add-dog button with real capabilities, not legacy plan`,
  `9560f0b fix(dogs): hide training fab on dogs tab`.
- **T-38 — Sportprofil vereinfacht + eigene Disziplin** · DONE(committed `9f48119`)
  `feat(dogs): simplify sports profile and allow custom discipline`.
- **T-39 — Trainingsjournal-Karte im Training-Tab** · DONE(committed `a87aad3`, gepusht)
  `app/(tabs)/training.tsx` zeigt Journal-Einstieg (`training.journal`/`training.journalSub`),
  Test `app/(tabs)/__tests__/training.test.tsx`.
- **T-40 — Trainingsjournal mit Distanz + Dedup** · DONE(committed `a87aad3`, gepusht)
  `services/trainingFeed.ts` dedupliziert `type='track'` und mappt `distance_meters`; `app/training-journal.tsx`
  zeigt Distanz; Suites `services/__tests__/trainingFeed.test.ts` (6),
  `features/training/__tests__/journal.test.ts` (28), `app/__tests__/training-journal.test.tsx` (5) grün.
- **T-41 — Personalisierbarer Startseiten-FAB** · DONE(committed `7490969`, gepusht)
  Neuer Quick-FAB unten rechts auf der Startseite (kurzer Tipp = Aktion, langer Tipp = Auswahl-Modal),
  Aktion auswählbar + Button ausblendbar; `stores/homeScreenConfig.ts` (FAB-Config via AsyncStorage),
  `components/QuickAddSheet.tsx` (`personalized`), `components/home/ActionListModal.tsx` (neu),
  `app/home-customize.tsx` (Schnellbutton-Sektion), i18n DE/gsw/FR. Siehe SESSION_HANDOFF.md.
- **T-42 — Globaler ANYVO-Schnellbutton (alle Haupt-Tabs, Multi-Action-Fächer)** · DONE(committed `7490969`/`e8f57be`/`c268eee`, gepusht)
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
- **T-42D — Hover-by-Drag im Aktionsfächer (Hervorhebung + Auswahl per Drag)** · DONE(committed `e8f57be`, gepusht)
  Im geöffneten Fächer hebt das Darüberziehen einen Aktionsbutton hervor (Skalierung ~1.22 per
  `Animated.spring`, Teal-Rand `C.accent`, Icon 22→26, Label fett/heller, Hund-Avatar 36→40 px,
  `accessibilityState.selected`); Loslassen auf dem Button führt genau diese Aktion aus, ausserhalb nur
  Schliessen. Haptik nur bei echtem Wechsel, Hit-Radius grösser als der Kreis, Hysterese gegen Flackern,
  kein FAB-Drag und keine Aktion gleichzeitig (Overlay übernimmt erst ab >10 px Bewegung, Tipp bleibt bei
  den Kindern). Rein RN-Core (`PanResponder` + `Animated`; RNGH/Reanimated im Projekt installiert, aber
  nirgends genutzt). Neue Tests 51–60 in `FabQuickAddSheet.test.tsx` (jetzt 60 Tests) — grün. Siehe
  SESSION_HANDOFF.md.
- **T-43 — Eindeutige Benutzernamen (Social Identity)** · DONE(committed `7517e1d`, gepusht)
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
  30 Tests), `git diff --check` PASS. Migration remote appliziert (2026-08-04). Commit `7517e1d` + Push mit Freigabe
  (2026-08-05). Siehe SESSION_HANDOFF.md.
- **BUGFIX T-43 (2026-08-04):** Ursache „immer vergeben/Prüfung fehlgeschlagen" = Migration `20260803140000`
  remote fehlt (per PostgREST-Probe verifiziert: RPC → `PGRST202`, Column → `42703`). Client-Härtung:
  `mapUsernameCheckResult` (pure, technischer Fehler → `check_failed`, nie falsch „verfügbar/vergeben") +
  DEV-Logging von code/message/details/hint + RPC-Name + Kandidat in `edit-profile.tsx`; neue i18n-Key
  `profile.usernameCheckFailed` × DE/gsw/FR. Migration erweitert: RPC schliesst eigene Zeile via
  `auth.uid()` aus (eigener unveränderter Name → verfügbar). `dog.boss.vibes` gültig (Punkte zwischen
  Segmenten, Client + DB-Check identisch). Tests: Vollsuite **82 Suites / 893 Tests PASS** (+9:
  `dog.boss.vibes`-Validierung,   `mapUsernameCheckResult` inkl. PGRST202/42501/401/Netzwerk). Migration
  remote appliziert (2026-08-04, verifiziert); Commit `7517e1d` gepusht (2026-08-05).

## Build 39 — Release-Readiness-Audit (2026-08-04) → danach umgesetzt
> Ergebnis des read-only Readiness-Audits: **Build 39 war NICHT READY** (uncommittete Build-39-Features,
> fehlende Remote-Migrationen, Release-Config-Lücken). Die Blocker wurden anschliessend von Claude umgesetzt:
> Build-39-Arbeit committed (`e794d4d`…`6e10838`), Migrationen remote appliziert, Release-Nummern auf 39 gesetzt,
> beide Production-Builds gestartet. Alles inzwischen gepusht (2026-08-05).
- **Clean-HEAD-Verifikation (`c268eee`, detachierter Worktree, danach entfernt):** `npm ci` OK; `tsc --noEmit` 0 Errors;
  Jest **77 Suites / 856 Tests PASS**; `expo export` iOS + Android beide OK; `git diff --check` sauber.
  Vorbestehend: 1 Lint-Error `app/dog-command/detail.tsx:69:110` (seit `ab602c0`, nicht Build-39) + 77 Warnungen.
- **Arbeitender Tree (mit allen uncommitteten Änderungen):** `tsc --noEmit` 0 Errors; Jest **84 Suites / 910 Tests PASS**.
- **T-44 — Trainer-Hub-Redesign + Profil-/Umfrage-/Summary-Nacharbeit** · DONE(committed `2cdd1e7`, gepusht)
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
  Verifikation: `tsc --noEmit` 0 Errors; Tab-Nav-Test 10/10 grün; `git diff --check` sauber. **Committet**
  (`a87aad3`/`2cdd1e7`) + gepusht (2026-08-05).
- **Build-39-Arbeit committed:** DateField-Android-Spinner (`e794d4d`), Journal-Karte/Distanz + Summary-Back
  (`a87aad3`), Trainer-Hub/Profil/Umfrage-Back (`2cdd1e7`), Share-Härtung (`f028f14`), Release-Nummern 39
  (`d7045a0`), eas.json-Env-Bindung (`82b0868`), Share-FK-Migration (`6e10838`). Alles gepusht.
- **Migrationen remote (applied):** `20260802100000`, `20260802110000`, `20260803130000`, `20260803140000` und
  `20260803120000` (letztere committed `6e10838` + nachträglich appliziert). Keine Remote-Migration offen.
- **Release-Konfiguration (vor Build 39 erledigt):** `app.json` Android `versionCode` `37`→`39`, iOS `buildNumber`
  `"38"`→`"39"`; `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` als **sensible EAS-Env in `production`** vorhanden
  (`eas env:create`, nicht in Git; `eas env:list production` → Key + `SENTRY_AUTH_TOKEN`), in Builds geladen via
  `eas.json` production `"environment": "production"`.
- **Agent-Doku (2026-08-04/05):** Readiness-Audit (`73a2e70`) und Website-Relaunch-Update (`2d9e1cc`) committed;
  Handover opencode → Claude Code. AUTO-GENERATED-Block von `SESSION_HANDOFF.md` per
  `agent:handoff -- --agent=claude` regeneriert. Nächste freie TASK-ID: **T-45**.

## Offen / Blocker
- **T-45 — Auto-Winkelerkennung gegen kontinuierliche Kurven härten** · DONE(committed `bfc9c58`, Test `87fc3dd`, gepusht) — *aktualisiert 2026-08-12, siehe Update 2026-08-12 oben*
  `useTrackRecorder` verlangt zusätzlich stabile Ein- und Auslaufschenkel; kontinuierliche Kurven/Schlangenlinien
  werden nicht mehr allein wegen einer großen lokalen Richtungsänderung markiert. Neue reine Regressionstests decken
  90° links/rechts, Spitzwinkel, Kurven und GPS-Rauschen ab. Keine DB-Migration.
- **T-20 — Testerfeedback und Build-38-Hotfix-Triage** · OPEN
  Release-Fokus liegt jetzt auf TestFlight-/Google-Play-Testerfeedback, echter Geraetepruefung und gezielten
  JS-/TS-Hotfixes per EAS Update statt auf neuer Build-Erstellung.
- **T-21 — Dirty Working Tree aufräumen und Release-Branch-Strategie klären** · OPEN
  Hauptrepo enthält weiterhin viele vorbestehende uncommittete/WIP-Dateien ausserhalb der Build-38-Hotfixes
  (Home/Profile/Connect/Tracking-Komponenten, i18n-Hardcode-Migration, lokale Artefakte, SQL-Dumps, Bilder, Agent-Dateien).
  Keine pauschalen Commits, kein `git add .`, kein Reset/Clean.
- **T-22 — Website-Relaunch Scope prüfen/abschliessen** · DONE(committed, nicht deployed)
  `legal-web/` (Startseite mit Backpack+Journal, Funktionen-Seite, echte Screenshots, Design-Pass 1+2) ist
  **committet (`2d9e1cc`)** und **gepusht** (`origin/feat/track-module-rewrite`). Deployment (Vercel o. ä.) und
  manuelle Sichtprüfung der Hundefotos stehen aus → erst nach Deployment als DONE(deployed) schliessen.
- **T-23 — RevenueCat Dashboard manuell finalisieren/testen** · OPEN
  Apple-/Google-Webhooks im RevenueCat-Dashboard je Store setzen/testen; echte Events nur mit gesonderter Freigabe.
- **T-24 — Store/Release Monitoring Build 38** · OPEN
  Auf echten Geräten prüfen, ob EAS Updates ankommen: GS/Winkel-Panels, Absuche nur manuell, 5/10 m,
  Tracking-UI, Google Login, Keyboard-Formulare, Auswertungslayout.

## ► TASK-ID-Stand
- **T-30 ist OPEN/MANUAL reserviert** für den manuellen Realgeräte-Abnahmetest von T-25…T-29.
- **Nächste freie allgemeine TASK-ID:** **T-45**
- Letzte bearbeitete TASK-ID: **T-45** (Auto-Winkelerkennung gegen kontinuierliche Kurven gehärtet,
  uncommitted).
Empfohlene nächste Arbeit:
1. **Website (T-22):** manuelle Sichtprüfung der Hundefotos im Browser, dann Deployment (Vercel o. ä.) mit Freigabe —
   danach T-22 als DONE(deployed) schliessen.
2. **Build-39-Nachlese:** `eas build:list --limit 2` (Android `de64df89…` prüfen); FR-`trainer.*`-Keys ergänzen
   (nur `trainer.*`-Block in `i18n/locales/fr.ts`, NICHT die ANYVO-ID-Umbenennung); Lint-Error
   `app/dog-command/detail.tsx:69:110`; Share-End-to-End-Test auf echtem Gerät.
3. **T-30: Realgeräte-Abnahmetest** für Backpack/Journal/Dashboard und Home-Backpack-Integration — DE/gsw/FR, iPhone klein/gross + Galaxy S23.
4. Weiterhin offen (Release): **T-20** Testerfeedback/Build-38-Hotfix-Triage, **T-21** Dirty-Tree-Aufräumen
   (inkl. P0-FIX-01 Migrations-Baseline `supabase/migrations/README.md` + P0-Reports als eigener Strang),
   **T-23** RevenueCat-Dashboard, **T-24** Store/Release-Monitoring.
Kein Commit/Push/Deployment ohne ausdrückliche Freigabe.

## Später / nicht blockierend
- App-Store-Connect App-Privacy und Review-Texte final prüfen.
- Vercel/Legal-Web nur nach sauberem Scope deployen.
- Production Monitoring Supabase/RevenueCat/Auth nach Live-Traffic prüfen.

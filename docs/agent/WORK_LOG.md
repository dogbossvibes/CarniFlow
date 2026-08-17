# ANYVO — Agent Work Log

> Kurzer chronologischer Verlauf. **Keine** vollständigen Chatprotokolle.
> Neueste Einträge oben. Agenten pflegen diesen Log manuell (nicht halluzinieren).

## 2026-08-17 — Codex (T-57 Real-Device-QA releaseverifiziert)

T-57 bleibt der unveränderte Produktcode-Commit **`0e7aaba fix(trainer): keep connect sheet above keyboard`**.
Real-Device-QA abgeschlossen: **iOS PASS**; **Android / Galaxy S23 PASS** (Gesten- und Drei-Button-Navigation).
Keyboard öffnen/schließen, sichtbares Eingabefeld + CTA, Backdrop bei offener Tastatur, mehrfaches Öffnen/Schließen
sowie gültiger/ungültiger Trainer-Codefluss PASS. Kein Produktcode, Build, OTA, Submit oder DB-Vorgang.

## 2026-08-17 — Codex (T-57 Trainer-Verbinden Keyboard-Fix committed)

Branch `feat/track-module-rewrite`, Commit **`0e7aaba fix(trainer): keep connect sheet above keyboard`**; HEAD damit
**3 Commits vor origin** (0 hinter). Kein Push/Build/OTA/Submit/DB-Vorgang.
- Ausschließlich `app/trainer/index.tsx` committed (35+/28−): Bottom-Sheet lag ohne Keyboard-Avoidance hinter der
  Tastatur. `KeyboardAvoidingView` um Backdrop + Sheet (iOS `padding`, Android `height`), flexbasierter Modal-Root,
  entfernte absolute Sheet-Positionierung und `autoFocus`; Bottom-Safe-Area und Backdrop-Schließen bleiben erhalten.
- Checks: `npx tsc --noEmit` PASS; `npx jest services/__tests__/trainer-flow.test.ts --runInBand` PASS
  (1 Suite / 6 Tests); `git diff --check` PASS.
- Die zu diesem Zeitpunkt noch offene Real-Device-QA ist im neueren Eintrag oben als PASS/releaseverifiziert erfasst.
  Fremdes WIP blieb unangetastet.

## 2026-08-17 — Claude Code (NEWBIE-Quota Production-Preflight + Trainer-Keyboard-Fix)

Branch `feat/track-module-rewrite`, HEAD **`adfc3b5`** (**2 Commits vor origin**, ungepusht: `c210008`, `adfc3b5`). **Kein Commit/Push/Build/OTA, keine Production-Schreiboperation.**
- **Supabase-Sicherheitscheck:** nur richtiges Production-Projekt `axkkhyqrjrtbkumaulta` (Org `lkwpufuyneijzttbupsg`)
  verwendet; Repo war bereits korrekt gelinkt (kein erneutes `supabase link`). `shadesofym` nie angefasst.
- **NEWBIE-Quota read-only Preflight:** Production liefert bereits `newbie_quota_limit` dog=1/**training=2**/track=0
  (PostgREST/anon-RPC; `.env`-URL = Production). ⇒ Migration `20260816130000_newbie_training_quota_two.sql` (training 1→2)
  ist **No-Op / nicht erforderlich**. Warnung: `20260808120000_..._one.sql` (→1) nicht isoliert anwenden (Regression).
  Premium via `is_pro_member` unberührt; keine User-Daten. Grenze: kein DDL-Dump (kein `SUPABASE_DB_PASSWORD`) →
  verhaltensbasiert belegt. Keinerlei Schreiboperation ausgeführt.
- **Trainer-Verbinden Keyboard-Bug (uncommitted):** `app/trainer/index.tsx` — Bottom-Sheet „Code eingeben" von der
  Tastatur verdeckt. Fix: Vollbild-`KeyboardAvoidingView` (ios:padding/android:height) + `flex-end`-Layout,
  `position:absolute` entfernt, `autoFocus`; Backdrop-Tap-Schließen erhalten. `tsc --noEmit` (Datei) fehlerfrei.
  Real-Device-Abnahme iOS/Android offen. Der komplette Diff dieser Datei ist dieser Fix (kein fremder WIP).
- **Doku/Handoff-Update:** nur `docs/agent/*` (CURRENT_STATE/TASKS/SESSION_HANDOFF/WORK_LOG) + `agent:handoff`
  AUTO-Block. Kein Produktcode über den obigen uncommitteten Trainer-Fix hinaus.

## 2026-08-15 — Claude Code (Fährtenabsuche Production-Fix + OTA)

Branch `feat/track-module-rewrite`, HEAD **`fddd1f1`** == origin (0/0). Reiner Doku/Handoff-Task heute (kein Produktcode).
- **Realer Feldfehler** (Absuche): gelegte Fährte gestrichelt/gedimmt/transparent, Auto-Winkel fehlen, „nur Gegenstände" angesagt.
- **Root Cause 1 (Render):** bewusste `dimLay`-Darstellung in `TrackingMap.tsx` → **Solid-Mint-Fix** via zentraler
  `laidTrackStroke()` (gelegte Fährte solide Mint, Ist-Suchspur separat blau).
- **Winkelpipeline** Detection→Store→Snapshot→Restore→Search→Map→Voice/Haptik **testgetrieben** verifiziert (nicht die Root Cause).
- **Root Cause 2 (Feld):** hartes `MAX_ANGLE_ACCURACY_M=20`-Gate → Auto-Winkel entstanden im Feld gar nicht.
  **Confidence-Erkennung** eingeführt (accept/pending/reject; robuste Accuracy über Sequenz; einzelner schlechter Fix
  zerstört keinen klaren Winkel). **Schlangenlinien-Regressionsschutz erhalten** (echte 90°/Spitz erkannt; Schlange/S/Zickzack → 0).
- **Commit `fddd1f1`** (Solid-Track + Confidence + Tests + Reports + DEV-Diagnostik), gepusht.
- **Production-OTA** iOS + Android, Runtime 1.0.1, Channel `production`, aus sauberem Worktree
  (iOS `01a00692-…`, Android `01a00697-…`). Kein Build/Submit/DB.
- **Real-Device-Validierung noch offen** (P0, T-56). Tests: targeted 103 PASS; Gesamt 1191 PASS / 1 FAIL (vorbestehender
  stale `run-arming.test.ts`). Details: `FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md`, `FAEHRTE_ANGLE_CONFIDENCE_FIX_REPORT.md`.

## 2026-08-13 — Claude Code (T-54: E-Mail-Aktivierungsflow)

Branch `feat/track-module-rewrite`. **Kein Commit/Push/Build/Deployment.** Fremder WIP unangetastet.
- **Ursache:** `signUp()` übergab kein `emailRedirectTo` → Supabase nutzte die Site URL → Nutzer landeten
  ohne Rückmeldung auf der Homepage `anyvo.app`.
- **Fix (App):** zentrale Konstante `EMAIL_CONFIRM_REDIRECT_URL = 'https://anyvo.app/auth/confirmed'`
  (`features/auth/accountSecurity.ts`); `signUp()` (`services/auth.ts`) übergibt sie als
  `options.emailRedirectTo`. Post-Signup-„Bitte E-Mail bestätigen"-UX in `login.tsx` war schon vorhanden → belassen.
- **Fix (Web):** neue Bestätigungsseite `legal-web/auth/confirmed.html` (dark ANYVO-Brand, mobile-first, Logo,
  4 Statusansichten) + reiner Resolver `legal-web/assets/auth-confirm.js` (`resolveConfirmStatus` success/expired/
  error/neutral; **kein** Erfolg bei Direktaufruf). „ANYVO öffnen" → festes `anyvo://` (kein Open-Redirect),
  Store-Fallback für Desktop.
- **Tests:** `legal-web/__tests__/authConfirmStatus.test.ts` + `services/__tests__/signup-redirect.test.ts` →
  grün (mit `auth-security.test.ts` 25 Tests). `tsc --noEmit` 0 Errors, ESLint berührter Dateien 0 Errors,
  `git diff --check` sauber.
- **Doku:** `docs/architecture/EMAIL_CONFIRMATION_FLOW.md`.
- **Manueller Schritt offen:** Supabase → Authentication → URL Configuration → Redirect URLs:
  `https://anyvo.app/auth/confirmed` freigeben. Deep-Linking bleibt Custom-Scheme (keine Universal Links).

## 2026-08-12 — Claude Code (Off-Track + Save Reliability + App-Store-Release + Production-OTA)

Branch `feat/track-module-rewrite`, HEAD **`4e0bf1e`** == origin (0/0). Verifiziert gegen `git log`.
- **App-Store-Release:** ANYVO 1.0.1 / iOS Build 40 von Apple genehmigt & veröffentlicht. Apple-IAP/RevenueCat-Fix
  (`d45a1f3` Init vor Produktladen, `184b193`/`52360f0` Diagnose add/remove), Founder aus Verkauf (`6d30359`,
  interne Legacy/Restore erhalten), iOS Active↔Trainer-Wechsel (`6dc3462`).
- **T-45 Auto-Winkel** (`bfc9c58`, Test `87fc3dd`): stabile Ein-/Auslaufschenkel; Schlangenlinien ≠ Winkel;
  90°/Spitzwinkel getrennt; Links/Rechts; Single-Source-Recorder.
- **Off-Track** Phase 1 (`c251434`, State im Recorder) + Phase 2 (`bccce35`, Banner/Voice/Haptik/Spam-Schutz).
  **`freezeProgress` bewusst nicht aktiviert.**
- **LEGEN Save Reliability** P-SAVE1 `7087e15` (Local-first Session/clientUuid, ID-Race weg, kein getUser-Netz-Zwang),
  P-SAVE2 `431a2d6` (SQLite durable, Sync-Queue, idempotenter Upsert, Lay/Marker Replace, Retry),
  P-SAVE3 `94e8ec2` (lokale pending/failed im Verlauf, Merge/Dedupe).
- **ABSUCHE Save Reliability** RUN-SAVE1 `0ab0520` (runUuid synchron, Run-Ergebnis lokal in `payload_json.run`),
  RUN-SAVE2 `c47d5a6` (Run über `training_session`-Queue, `track_runs` idempotent per runUuid, kanonisch
  `track_runs.run_points`, kein `point_type='search'` remote-Replikat), RUN-SAVE3 `cc58df5`+`4e0bf1e`
  (Verlauf-Score, Detail-Local-Fallback, Remote+Local-Supplement, Delete/hidden, kein Doppel nach Sync).
- **Production-OTA (Runtime 1.0.1, Channel `production`, iOS + Android, kein Web):** iOS group
  `4fe50aa1-402a-4d7d-8abc-672ff347f5c8`, Android group `f69ea5a8-93ed-4109-8121-5e6326ccdf13`, Message
  „fix: improve track save reliability". Aus sauberem HEAD gebündelt (temporärer `git stash -u` mit Freigabe,
  danach `stash pop`; Working-Tree-Fingerprint vor/nach identisch). Web-Export bricht via `react-native-maps`
  (bewusst plattformweise ios/android; kein Mobile-Blocker).
- Prüfungen der Save-Kette: `tsc` 0 Errors, ESLint 0 Errors, `git diff --check` sauber; Save-Suiten grün;
  Gesamt-Regression 500/501 (einziger Fehler = vorbestehender stale `run-arming`-Test, unabhängig).
- **Dieses Doku-Update:** nur `docs/agent/*` aktualisiert (CURRENT_STATE/TASKS/SESSION_HANDOFF/DECISIONS/WORK_LOG),
  kein Produktcode, kein Commit/Push/Build/OTA.

## 2026-08-10 — OpenCode (T-45 Auto-Winkelerkennung)

Reine, begrenzte Tracking-Änderung; kein Commit, Push, Reset, Clean oder DB-Zugriff.
- Verifizierte Ursache: Der Lege-Recorder klassifizierte nur die gesamte Richtungsänderung über kurze 4-m-Schenkel;
  kontinuierliche Schlangenlinien/Kurven konnten dadurch wie Winkel aussehen.
- `hasStableCornerLegs` ergänzt: Die Teilsegmente jedes Ein- und Auslaufschenkels müssen zur jeweiligen
  Schenkelrichtung passen. Der vorhandene Richtungs-/Innenwinkel- und Markerpfad bleibt unverändert.
- Neue Regressionstests: 90° links/rechts, Spitzwinkel, Schlangenlinie, weite Kurve sowie GPS-Rauschen auf Gerade
  und Kurve. `lib/trackGuidance.ts` geprüft, aber nicht verändert: eigenständiger Legacy-/Suchdetektor und kein
  kleiner gemeinsamer Fix ohne Scope-Ausweitung.
- Prüfungen: fokussierte Jest-Suites 3/3, 17 Tests PASS; `npm run typecheck` PASS; `git diff --check` PASS.

## 2026-08-05 — opencode (Website-Relaunch committed + gepusht, Handover → Claude Code)

Branch: `feat/track-module-rewrite`, HEAD `2d9e1cc` (**0 Commits vor `origin`** — alle 50 zuvor ungepushten
Commits jetzt remote). Danach nur Agent-Doku; kein weiterer Commit/Push/Build.
- **Website-Relaunch (T-22):** `legal-web/index.html` (Startseite: Backpack + Journal), `legal-web/funktionen.html`
  == `legal-web/funktionen/index.html`, echte Screenshots, Meta. Design-Pass 1 (`.premium`-Klassen, Sync funktionen,
  Validierung grün) + Design-Pass 2 (nur `assets/site.css`: Flex-Column-Cards mit nativen `aspect-ratio`s 2/3 und 3/2,
  `.audience-card`-Editorial, `.cta-band` contain, Sekundär-Buttons). Verifikation: 9 Breiten 320–1920 ohne Overflow.
- **Commit + Push (mit ausdrücklicher Freigabe):** `2d9e1cc feat(web): relaunch ANYVO website with journal, backpack
  and design pass` selektiv gestaged (nur Legal-Web), gepusht auf `origin/feat/track-module-rewrite`
  (`6e10838..2d9e1cc`). HEAD == Remote (0/0).
- **Nicht deployt:** Website ist weder auf Vercel noch anderswo live. „Hund vollständig sichtbar" nicht visuell
  bestätigt → manuelle Sichtprüfung nötig.
- **Handover opencode → Claude Code:** manuelle Sektionen in `SESSION_HANDOFF.md` gepflegt; `CURRENT_STATE.md`,
  `TASKS.md` (T-22 → committed/nicht deployed; Push-Status; Migrationen remote) und `WORK_LOG.md` aktualisiert;
  AUTO-GENERATED-Block per `npm run agent:handoff -- --agent=claude` regeneriert; `npm run agent:status` grün.
- Prüfungen: `git status --short`, `git diff --check` — PASS.

## 2026-08-04 — opencode (Handover opencode → Codex: Doku-Commit + Block-Regenerierung)

Branch: `feat/track-module-rewrite`, HEAD `73a2e70` (43 Commits vor `origin`). Nur Agent-/Handoff-Doku;
kein Product-Code, kein Push, kein Build, keine Migration.
- **Doku-Commit `73a2e70 chore(agent): record build 39 readiness and remaining release work`** mit Freigabe:
  `TASKS.md`, `CURRENT_STATE.md`, `SESSION_HANDOFF.md`, `WORK_LOG.md` (4 Dateien, 568+/179-);
  `DECISIONS.md` bewusst NICHT (fremder, vorbestehender T-34-Diff unangetastet).
- **AUTO-GENERATED-Block regeneriert:** `npm run agent:handoff -- --agent=codex` → Generated
  `2026-08-04T19:18:06.418Z`, Agent `codex`, Branch `feat/track-module-rewrite`, 113 Git-Einträge;
  kein Stale-Warning mehr in `agent:status`.
- **Handover opencode → Codex** in den manuellen Sektionen von `SESSION_HANDOFF.md` dokumentiert
  (Session-Arbeit, geänderte Dateien, uncommitteter Zustand, Tests, bekannte Risiken, Build-/Release-Stand,
  offene Aufgabe + Akzeptanzkriterien, nächster Schritt, out-of-scope WIP).
- Prüfungen: `npm run agent:status`, `npm run agent:start`, `git diff --check` — PASS.
- Git-Zustand unverändert: T-39/T-40/T-44 + Build-39-Fixes uncommittet (hunk-genau zu committen);
  Migrationen `20260803120000`/`20260803140000` fehlen remote; fremde WIP bleibt unangetastet.

## 2026-08-04 — opencode (Build-39-Release-Readiness-Audit + Handoff-Doku)

Branch: `feat/track-module-rewrite`, HEAD `c268eee` (42 Commits vor `origin`). Read-only-Audit; danach
ausschliesslich Agent-Doku aktualisiert. Kein `git add`, kein Commit, kein Push, kein Build, keine
Remote-Migration, keine History-Reparatur, keine Release-Nummern geändert.
- **Clean-HEAD-Verifikation** (detachierter Worktree auf `c268eee`, danach entfernt): `npm ci` OK;
  `tsc --noEmit` 0 Errors; Jest **77 Suites / 856 Tests PASS**; `expo export` iOS + Android beide OK;
  `git diff --check HEAD^ HEAD` sauber. Vorbestehend: 1 Lint-Error `app/dog-command/detail.tsx:69:110`
  (seit `ab602c0`), 77 Warnungen.
- **Arbeitender Tree:** `tsc --noEmit` 0 Errors; Jest **84 Suites / 910 Tests PASS**.
- **Klassifikation der uncommitteten Änderungen:** T-39 (Journal-Karte), T-40 (Distanz+Dedup), **T-44**
  (neu vergeben; Trainer-Hub-Redesign, Profil-Duplikat-Einträge, Umfrage-/Summary-Back-Fallback) + Build-39-Fixes
  (DateField-Android-Spinner, ShareLink-Robustheit, T-43-`@username`-Hunks) als Build-39 zu committen;
  fremde WIP (ANYVO-ID-Umbennung, i18n-Hardcode-Migration, Connect/Tracking) ausgeschlossen.
- **Statuskorrektur in Doku:** T-42/T-42D (`7490969`/`e8f57be`/`c268eee`) und T-43 (`7517e1d`, inkl. Migration)
  sind bereits **committed** — TASKS.md/CURRENT_STATE/SESSION_HANDOFF behaupteten „uncommittet" (veraltet).
- **Datenbank (verified):** remote fehlen `20260803120000_fix_shared_trainings_fk.sql` (untracked) und
  `20260803140000_profiles_username.sql` (committed) — kein `supabase db push`, nur kontrollierter Workflow.
- **Release-Konfiguration (verified):** `app.json` version `1.0.1`, iOS `buildNumber "38"`, Android
  `versionCode 37` (→ 39); `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` — **Korrektur (später verifiziert):** der Key ist
  als **sensible EAS-Env in `production`** angelegt (`eas env:create`, nicht in Git; `eas env:list production`
  → Key + `SENTRY_AUTH_TOKEN`), in Builds geladen via `eas.json` production `"environment": "production"`.
- **Gate:** Build 39 = **NOT READY** (uncommittete Build-39-Features, fehlende Remote-Migrationen,
  Release-Config-Lücken). Nächste freie TASK-ID jetzt **T-45**.
- Doku: `TASKS.md`, `CURRENT_STATE.md`, `SESSION_HANDOFF.md` (manuelle Sektionen; AUTO-GENERATED-Block bewusst
  nicht regeneriert, da `agent:handoff` nicht ausgeführt), `WORK_LOG.md`.
- Prüfungen: `npm run agent:status`, `npm run agent:start`, `git diff --check` — PASS.

## 2026-08-03 — Claude Code (T-34 Übernahme + isolierter Commit)

Branch: `feat/track-module-rewrite`. Übernahme von Codex; read-only Takeover-Bericht erstellt.
- **T-34 read-only reviewt:** Entitlement-Diffs (`plans.ts`, `entitlementService.ts`, `capabilityService.ts`,
  `getUserAccess.ts`, `useCapabilities.ts`, `types/capabilities.ts`) + beide Migrationen — in sich geschlossen,
  keine fremden WIP-Hunks.
- **Verifikation:** `npx tsc --noEmit` = 0 Errors; fokussierte Jest-Suites (entitlements/entitlementService/
  lifetime-quota-migration) = 3 Suites / 19 Tests PASS; `git diff --cached --check` sauber.
- **T-34 isoliert committed:** `50ccfd2 feat(entitlements): add server-backed lifetime entitlement system`
  (13 Dateien: Code + `20260802100000_user_entitlements.sql` + `20260802110000_lifetime_quota_access.sql` + 3 Tests +
  `docs/architecture/ENTITLEMENT_SYSTEM.md` + `docs/lifetime-access.md`). Kein fremder WIP mitgestaged.
- **Bewusst ausgelassen:** `supabase/migrations/README.md` (P0-FIX-01 Baseline), P0-Reports, ADRs, Home/Profile/
  Connect/Tracking/legal-web-WIP, Dumps, Artefakte, Bilder — bleiben unangetastet.
- **Nicht gemacht:** kein Push, kein Build, keine Remote-Migration.
- Agent-Doku aktualisiert (SESSION_HANDOFF, TASKS, dieser Log); separater Doku-Commit mit Freigabe.

## 2026-08-03 — Codex (T-35 Home-Backpack-Integration)

Branch: `feat/track-module-rewrite`. Commit `e447cd2`; kein Push, kein Build, kein Submit.
- Personalisierte Backpack-Schnellaktionen pro Hund und Backpack-Widget auf dem Home-Screen umgesetzt.
- Instanzierte `quickActions`-/`widgetConfigs` mit `dogId`, Sanitizing und Rückwärtskompatibilität ergänzt.
- Bestehende Backpack-Datenquelle und Route `/dog-backpack/[id]` weiterverwendet; keine DB-Migration und keine neue Hundestruktur.
- DE/gsw/FR-Backpack-i18n für Widget, Status, frühere Einträge, Reaktivierung und Löschbestätigung aufgenommen.
- Tests: `npx tsc --noEmit` PASS; fokussierte Backpack/Home-Suites PASS (6 Suites / 64 Tests); `git diff --cached --check` PASS.
- Vollständige Jest-Suite und iOS-/Android-Exports waren zuvor PASS. iOS-Simulator nur teilweise visuell geprüft;
  Android-Build scheiterte vor Installation wegen fehlender Java-Runtime.
- Uncommittete WIP-Hunks in denselben Home-/Locale-Dateien bleiben erhalten und dürfen nicht pauschal mitgestaged werden.

## 2026-08-02 — Codex (Feature-Commits Backpack / Journal / Dashboard)

Branch: `feat/track-module-rewrite`. Alle drei Feature-Commits sind in HEAD, kein Push.
- **T-25/T-26 Backpack:** Commit `0434182 feat(dogs): add local backpack checklist`.
  Isolierter Index geprüft; fokussierte Backpack-Jest-Suites, TypeScript und `git diff --check` bestanden.
- **T-27 Journal:** Commit `2a85fbc feat(training): add training journal`.
  Journal-Code, Journal-i18n und Einstiegspunkte isoliert geprüft; fokussierte Journal-Suites,
  TypeScript und `git diff --check` bestanden.
- **T-29 Dashboard:** Commit `0061fed feat(dogs): add personal dashboard overview`.
  Vollständiger Dashboard-Index inklusive DogRecentCard/Journal-Navigation und `dash.*` geprüft;
  index-isolierte Dashboard-/Backpack-/Journal-Tests, TypeScript und `git diff --check` bestanden.
- **T-30:** manueller Realgeräte-Abnahmetest für Backpack/Journal/Dashboard bleibt OPEN/MANUAL.

## 2026-08-02 — Codex (T-34 Entitlement-System Nachbesserung)

Branch: `feat/track-module-rewrite`. Kein Commit/Push/Build; keine Remote-Migration.
- **T-34:** serverseitig abgesichertes Entitlement-System für Sonderrechte implementiert.
- Bestehenden Entitlement-Pfad weiterverwendet statt Parallelarchitektur: `services/entitlementService.ts`,
  `services/capabilityService.ts`, `useCapabilities()` und `useAccess()`.
- Neues kontrolliertes Modell: `lifetime`, `beta_tester`, `ambassador`, `staff`; `lifetime` aktiviert alle
  regulären Produkt-Capabilities, aber keine Admin-/Debugrechte.
- Neue Migration `supabase/migrations/20260802100000_user_entitlements.sql` erstellt: Tabelle,
  Check-Constraint, Indizes, RLS-Lesepolicy nur fuer eigene aktive Entitlements, keine Client-Schreibpolicy.
- Neue additive Migration `supabase/migrations/20260802110000_lifetime_quota_access.sql`: `is_pro_member(uuid)`
  berücksichtigt aktive `lifetime`-Entitlements für serverseitige Quota-RPCs; keine Spiegelung nach
  `user_capabilities`, direkte Prüfung durch normale Clients entzogen, Service-Role-Zugriff erhalten.
- Statischer SQL-Test `supabase/__tests__/lifetime-quota-migration.test.ts` ergänzt.
- Technische Doku `docs/architecture/ENTITLEMENT_SYSTEM.md`; alte Kurz-Doku `docs/lifetime-access.md`
  verweist auf Migration und Architektur-Doku.
Tests: `npx tsc --noEmit` PASS; fokussierte Jest-Suites PASS (7 Suites / 95 Tests); ESLint der berührten TS-Dateien
PASS; `git diff --check` PASS; `npm run agent:start` PASS; `npm run agent:status` PASS.

## 2026-08-02 — Codex (T-33 Dashboard-Commit)

Branch: `feat/track-module-rewrite`. Commit `0061fed`; kein Push.
- **T-33:** Persönliches Hunde-Dashboard Phase C vollständig isoliert staged, index-isoliert getestet und committed.
- Backpack (`0434182`) und Journal (`2a85fbc`) waren vorher in HEAD; DogRecentCard/Journal-Navigation gehörten
  dadurch zum Dashboard-Scope.
- Commit: `0061fed feat(dogs): add personal dashboard overview`.
Tests: fokussierte Dashboard-/Backpack-/Journal-Jest-Suites PASS, `npx tsc --noEmit` PASS, `git diff --check` PASS.

## 2026-08-02 — Codex (T-32 Backpack-Entkopplung)

Branch: `feat/track-module-rewrite`. Commit `0434182`; kein Push.
- **T-32:** `backpackStatus` aus `features/dogs/dashboard.ts` nach `features/dogs/backpack.ts` verschoben.
- `components/dogs/DogBackpackCard.tsx` importiert die Statuslogik jetzt direkt aus dem Backpack-Modul.
- `features/dogs/dashboard.ts` re-exportiert `backpackStatus`/`BackpackStatus` fuer bestehende Dashboard-Aufrufer
  und Tests; keine Logik-, UI- oder Textänderung.
- `features/dogs/__tests__/backpackSuggestions.test.ts` deckt die unveränderten Status-Grenzfälle nun im
  Backpack-Scope ab.
- Isolierter Backpack-Commit erstellt: `0434182 feat(dogs): add local backpack checklist`.
Tests: fokussierte Backpack-Jest-Suites PASS (4 Suites / 44 Tests), `npx tsc --noEmit` PASS, `git diff --check` PASS.

## 2026-08-02 — Codex (T-31 Agent-Infrastruktur)

Branch: `feat/track-module-rewrite`. Kein Commit/Push.
- **T-31:** `npm run agent:start` an das verbindliche Startprotokoll angepasst.
- Ausgabe nennt jetzt explizit `AGENTS.md`, `CLAUDE.md`, `docs/agent/TASKS.md`,
  `CURRENT_STATE.md`, `SESSION_HANDOFF.md`, `DECISIONS.md` und `git status`.
- `TASKS.md` wird als verbindliche Aufgabenquelle beschrieben; `SESSION_HANDOFF.md`
  als letzte Übergabe; Repository-/Git-Status bleibt Vorrang bei Widersprüchen.
- Keine automatische nächste-Task-Ermittlung aus `TASKS.md` implementiert: Die Datei ist
  bewusst menschenlesbares Markdown und nicht robust genug als Maschinenformat.
Tests: `npm run agent:start` PASS, `npm run agent:status` PASS, `git diff --check` PASS.

## 2026-08-02 — Claude Code (Feature-Arbeit: Backpack / Journal / Dashboard)

Branch: `feat/track-module-rewrite`. Rein additiv, **kein Commit/Push/Build/Submit**, **keine DB-Migration**.
- **T-25 Backpack Phase A:** lokale per-user/per-dog Packliste (`features/dogs/backpack.ts`), 23 Tests.
- **T-26 Backpack Phase B:** Card + Verwaltungsscreen `app/dog-backpack/[id].tsx`, i18n de/gsw/fr, Duplikatschutz.
- **T-27 Journal:** `app/training-journal.tsx` + `features/training/journal.ts` auf bestehendem `useTrainingFeed`
  (Single Source of Truth), Einstiege Home/Hundeprofil/Analyse. Keine zweite Historie/DB.
- **T-28 Rename:** „Trainingstagebuch"→Journal, „Rucksack"→Backpack (feste Produktnamen, nicht lokalisiert);
  nur sichtbare i18n-Werte, technische Keys stabil.
- **T-29 Dashboard Phase C:** Overview-Tab als Dashboard (Heute/Termine/Läufigkeit/Ziel/Backpack/Zuletzt/Status/
  Smart Analyse); `features/dogs/dashboard.ts` + 4 Karten; Termine via bestehendem `getCalendarEvents`; VM additiv
  (`trainingsThisWeek`, `lastFaehrteLabel`). Kein Wetter, keine neue KI.
Tests: `tsc --noEmit` sauber; Jest **69 Suites / 671 Tests grün**; ESLint 0 Errors; `expo export` iOS+Android ok.
Reports: `docs/architecture/{TRAINING_JOURNAL_FIX_REPORT,DOG_PERSONAL_DASHBOARD_PHASE_C_FIX_REPORT}.md`.
Nächste freie TASK-ID: **T-30**; letzte bearbeitete: **T-29**. Alles lokal uncommittet.

## 2026-08-02 — Codex

Branch: `feat/track-module-rewrite`; Release-Worktree: lokaler Release-Worktree
auf `release/build38-hotfix`.

Status-Update nach weiteren Arbeiten:
- Build 38 ist erfolgreich auf TestFlight.
- Android Build 38 ist fuer Google Play vorbereitet (`android.versionCode` 38).
- EAS Update ist eingerichtet und wird fuer JS-/TS-Hotfixes auf Build 38 / Runtime `1.0.1` genutzt.
- Weitere Post-Build-38-Hotfixes wurden umgesetzt: GS-/Winkel-Picker, manueller Start der Absuche
  mit 5-/10-m-Auswahl, Tracking-UI, Keyboard-Fixes, Google-Login und Auswertungslayout.
- Release-Fokus liegt jetzt auf Testerfeedback, realer Geraetepruefung und gezielten Hotfixes
  statt auf Build-Erstellung.

Ergebnis:
- Build-38-Release-Commits konsolidiert; Subscription-P0, KI-freie Smart-Funktionen,
  RevenueCat-Webhooks, Legal-App, Guards, Build-Assets/-Config und iOS/Android Build 38
  wurden in getrennten Commits vorbereitet.
- Production-Schritte mit Freigabe erledigt: Subscription-P0-DB-Fixes, RevenueCat-Webhooks
  Apple/Google, Remote-Cleanup der sieben alten KI-Edge-Functions.
- Build-38-Hotfix 1: `cf2399f` im Hauptrepo, `425f30c` im Release-Worktree; EAS Update
  für Tracking/Formulare/Google Sign-in veröffentlicht.
- Build-38-Hotfix 2: `d4501a7` im Hauptrepo, `f7a5997` im Release-Worktree; GS-/Winkel-
  Quick-Picker-Panel blickdicht und Absuche nur noch manuell nach 5-/10-m-Auswahl.
- EAS Update Hotfix 2 veröffentlicht:
  - iOS production/runtime `1.0.1`: group `ed746533-d71f-4102-a2b8-a03e59293d97`,
    update `019fc012-76cc-7bfe-bcad-d1c99453ee3c`
  - Android production/runtime `1.0.1`: group `f8c4461c-513c-4039-9369-5eb1c6a956f3`,
    update `019fc014-3873-7a8b-9a4d-af2eba66de05`

Tests:
- Hauptrepo Hotfix 2: `npx tsc --noEmit`, `npx jest --runInBand` (60 Suites / 577 Tests),
  ESLint Hotfix-Dateien 0 Errors, `git diff --check`.
- Release-Worktree Hotfix 2: `npx tsc --noEmit`, `npx jest --runInBand`
  (59 Suites / 570 Tests), ESLint Hotfix-Dateien 0 Errors, `git diff --check`,
  `npx expo config --type public`.

Offen:
- Hauptrepo bleibt dirty mit vielen vorbestehenden WIP-/Artefakt-Dateien.
- Kein Git-Push ausgeführt.
- Naechste empfohlene Task: **T-20 — Testerfeedback und Build-38-Hotfix-Triage**.

## 2026-08-01 — Claude Code

Branch: feat/track-module-rewrite
Tasks: T-01…T-12 (siehe `TASKS.md`).
Ergebnis (Kurz):
- T-01/T-02 **committet** (`ecc1242` Auth-Recovery/Account-Security, `4071062` Branding-Assets).
- T-05/T-06 **Subscription P0** (uncommittet): NEWBIE≠pro (`features/subscription/plans.ts`),
  CONNECT fail-closed, Smart-Coach-Gate, Webhook Newbie/Founder-lapse; NEWBIE-Quotas + Founder-
  Lifecycle als SQL-Artefakte; serverautoritatives Quota-Wiring (Training zentral in
  `trainingUnitService`, Fährte in `legen.tsx`), `quotaService` fail-closed, `quotaUx`.
- T-07 **Staging** aus Prod-Schema-Dump (schema-only) mit pgvector-Fix aufgebaut; Deploy+Smoke
  in Staging GREEN (Nutzer bestätigt). Prod-Deploy (T-08) am Freigabe-Gate gestoppt.
- T-09 **KI aus Client-Runtime entfernt** (uncommittet): 0 Anthropic/OpenAI-/Embedding-/
  Transkriptions-Aufrufe; Smart Coach/Analyse regelbasiert; App+Website Datenschutz/AGB angepasst.
- T-10 Registrierungs-Rollenauswahl entfernt. T-11/T-12 Website `legal-web/{datenschutz,agb}.html`.
Tests: `tsc --noEmit` sauber; Jest **516/516** (52 Suites); ESLint der geänderten Dateien sauber.
Handoff: siehe `SESSION_HANDOFF.md`; nächste Task **T-13**. Kein Commit/Push in dieser Abschluss-Session.

## 2026-07-29 — Claude Code

Branch: feat/track-module-rewrite
Task: Bidirektionales Agent-Handoff-System (Claude Code ↔ Codex) aufsetzen.
Result: `docs/agent/*`, `scripts/agent-{lib,handoff,status,start}.mjs`, `agent:*`-npm-Scripts,
Regeln in `AGENTS.md`/`CLAUDE.md`, `.claude/commands/handoff.md`. Rein additiv; keine
Produkt-/Domänenlogik berührt; keine fremden uncommitteten Änderungen angefasst.
Tests: `agent:status`/`agent:handoff`-Sequenz geprüft; kein Commit/Push.
Handoff: siehe `SESSION_HANDOFF.md`.

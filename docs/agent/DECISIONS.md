# ANYVO — Agent Decisions

> Nur relevante technische Entscheidungen. Kein Kleinklein.
> Status: `accepted` · `temporary` · `superseded`.

## 2026-08-15 — Confidence-basierte Auto-Winkelerkennung (statt hartem Accuracy-Gate) · `accepted`

Context:
Im realen Feld/Wald liegt die GPS-Accuracy oft > 20 m. Das frühere harte Einzelpunkt-Gate
`MAX_ANGLE_ACCURACY_M = 20` verwarf dadurch echte Winkel komplett — Auto-Winkel entstanden gar nicht (Karte +
Voice + Haptik zeigten „nur Gegenstände", da diese manuell gesetzt werden). Gemeldet als Production-Feldfehler.

Decision:
- **Winkel:** Die Auto-Winkelerkennung (`features/tracking/utils/autoCornerDetection.ts`) nutzt eine
  **Confidence-Bewertung** je Kandidat (angle .24 · straightBefore .16 · straightAfter .16 · support .10 ·
  accuracy .12 · bearing .12 · legLength .10; Σ = 1) mit drei Zuständen **accept / pending / reject** —
  **kein** hartes Einzelpunkt-Accuracy-Gate mehr.
- **GPS:** Ein einzelner schlechter Fix darf einen **geometrisch klar bestätigten** Winkel **nicht allein**
  verwerfen — Accuracy wird **robust über die Punktsequenz** (Median) bewertet, nicht über den Scheitelpunkt.
- **Schlangenlinie:** **Geradheit/Stabilität vor und nach dem Scheitel ist Pflicht** (harte Untergrenze
  `minStraight ≥ 0.70` für accept). Schlangenlinie / S-Kurve / GPS-Zickzack / kontinuierliche Kurve → **0 Winkel**.
  Nicht durch großzügige Accuracy-Schwellen ersetzen.
- **Guidance:** Karte/Voice/Haptik bleiben **Verbraucher desselben gespeicherten Markerpfads** (kein Refactor;
  Voice/Haptik waren nicht die Root Cause). Manuelle Winkel GW/OW/BW/Abriss + Marker-/Persistenzarchitektur
  **unverändert**.
- **Production:** Der Fix ist per **OTA auf Runtime 1.0.1 / Channel `production`** produktiv ausgeliefert
  (Commit `fddd1f1`, iOS + Android). Details siehe `docs/architecture/FAEHRTE_ANGLE_CONFIDENCE_FIX_REPORT.md`
  und `FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md`.

Consequences:
- Gewichte/Schwellen sind konservativ + testgedeckt, aber **feld-unvalidiert** → Real-Device-Test (T-56) ist P0.
- Änderungen an Gewichten/Schwellen/Straightness-Regeln nur mit Feldbeleg **und** Regressionstests.

## 2026-07-29 / 2026-08-10 — Repository-basiertes Agent-Handoff-System (OpenCode ↔ OpenAI Codex)

Context:
Zwei Agenten (OpenCode, OpenAI Codex) arbeiten abwechselnd im selben Repo. Ohne
gemeinsame Wahrheit droht Überschreiben fremder Arbeit oder Verlust offener Tasks.

Decision:
Das Repository ist die gemeinsame Wahrheit. Handoff via `docs/agent/` (manuell gepflegt)
plus ein automatisch erzeugter Git-Snapshot-Block in `SESSION_HANDOFF.md`
(`scripts/agent-handoff.mjs`). Die gemeinsamen Regeln stehen in `AGENTS.md`; OpenCode-spezifische
Konfiguration liegt unter `.opencode/`.
Prioritätsregel: **Repository state > Git state > Handoff documentation > Agent assumptions.**

Reason:
Nur Node-Standardbibliothek (keine neue Dependency), rein additiv, keine Git-Schreib-/
Remote-/DB-Aktionen. Manuelle und automatische Bereiche sind über Marker strikt getrennt,
damit ein erneuter Handoff manuellen Inhalt nie überschreibt.

Consequences:
- Neue Scripts `agent-handoff`/`agent-status`/`agent-start` + `agent-lib`.
- Neue npm-Scripts `agent:*`.
- OpenCode-`/handoff`-Command in `.opencode/commands/`.
- Agenten müssen beim Start `CURRENT_STATE.md` + `SESSION_HANDOFF.md` + `git status` lesen
  und den Handoff gegen den echten Repo-Zustand verifizieren.
- `CLAUDE.md` und `.claude/` bleiben bis zu einem separaten Legacy-Cleanup erhalten.

Status: accepted

## 2026-08-02 — Sammelnachtrag Build-38-Release & Produktentscheidungen

> Kompakte Nachdokumentation der seit dem 29.07.2026 getroffenen Entscheidungen
> (Detailverlauf: `WORK_LOG.md`, Task-IDs: `TASKS.md`). Alle **accepted**.

- **Build-38-Release (Version 1.0.1, buildNumber/versionCode 38).**
  Warum: Der große Feature-/Fix-Batch (Subscription-P0, KI-Entfernung, Auth-Recovery,
  Tracking-Fixes) sollte als ein stabiler Store-Stand ausgeliefert werden; Build 37 war
  überholt. Release läuft aus separatem Worktree `anyvo-build38` → Hauptrepo-WIP gefährdet den Build nicht.

- **Expo Updates (EAS Update) als Hotfix-Strategie.**
  Warum: Reine JS-/TS-Fixes ohne nativen Anteil sollen ohne neuen Store-Build/Review live gehen
  (schnellere Korrektur, gleiche Runtime `1.0.1`, production channel). Natives bleibt an echte Builds gebunden.

- **Entfernung aller externen KI aus dem Client-Runtime.**
  Warum: Produktentscheidung „keine KI" + Apple-/Datenschutz-Klarheit. Keine Übermittlung von
  Trainings-/Hunde-/Audiodaten an Anthropic/OpenAI. Smart Coach/Analyse laufen jetzt **regel-/statistikbasiert**
  aus lokalen Daten (keine zweite Engine); externe Transkription/Embeddings/Semantiksuche deaktiviert.

- **RevenueCat-Webhook-Architektur (Apple + Google, serverautoritativ).**
  Warum: Käufe dürfen nicht dem Client vertrauen. Zwei Edge-Functions (`revenuecat-webhook`,
  `revenuecat-webhook-google`), `verify_jwt=false` (RevenueCat sendet eigenen Auth-Header/Secret),
  setzen Plan/Capabilities server-seitig.

- **Subscription-/Quota-System (NEWBIE ≠ pro).**
  Warum: NEWBIE ist kostenloses Standard-Tier, nicht Premium. `planToCapabilities('newbie')` → `pro_member=false`;
  serverautoritative Monats-Quotas (1 Hund, 2 Trainings, 1 Fährte) via atomarer, idempotenter RPC (`claim_newbie_quota`),
  Client **fail-closed** in Production (kein Bypass bei RPC-Fehler).

- **Founder-„11 jemals".**
  Warum: Max. 11 Founder-Plätze **insgesamt**, nicht 11 gleichzeitig. Ablauf/Kündigung markiert `status='lapsed'`
  (kein Delete, kein Reissue an andere); derselbe Nutzer reaktiviert seinen eigenen Slot. Race-sicher via `pg_advisory_xact_lock`.

- **CONNECT fail-closed in Production.**
  Warum: Ein fehlendes Env-Flag darf NEWBIE/Free nicht versehentlich Premium-CONNECT-Rechte geben.
  In Prod wird Enforcement erzwungen (`!__DEV__`); ALL_ACCESS nur noch als Dev-Fallback.

- **Google OAuth/PKCE-Fix (Doppel-Exchange vermeiden).**
  Warum: „invalid flow state" trat auf, weil der PKCE-Code doppelt eingelöst wurde (nativ in `services/auth.ts`
  UND im Callback). Nativ wird nur noch einmal eingelöst; der Callback wartet nur auf die Session.

- **Absuche startet nur noch manuell.**
  Warum: Der automatische Absuche-Start (Countdown/„kurz halten") war fehleranfällig/verwirrend.
  Start jetzt ausschließlich über `Jetzt starten` nach expliziter 5-/10-m-Auswahl.

- **GS-/Winkel-Quick-Picker: gemeinsames blickdichtes Panel.**
  Warum: Halbtransparente Panels waren auf der Karte schlecht lesbar; ein gemeinsames dunkles,
  blickdichtes Layout (`quickPickerLayout`) vereinheitlicht Gegenstand- und Winkel-Auswahl.

- **Keyboard-Avoiding als Standard in Formularen.**
  Warum: Eingabefelder wurden von der Tastatur verdeckt; einheitliches KeyboardAvoiding/Scroll-Verhalten
  in den betroffenen Formularen/Screens behebt das reproduzierbar.

- **Start-Protokoll: `TASKS.md` verpflichtend (T-22).**
  Warum: `TASKS.md` (Task-IDs + nächste TASK-ID) war nicht im Start-Protokoll verankert → Agenten
  übersahen es. Jetzt in `AGENTS.md`/`CLAUDE.md`/`README.md` als Pflicht-Lesedatei. `AI_HANDOFF.md`
  bleibt als **Legacy** erhalten (in `docs/handbook-source/*` referenziert), abgelöst durch `SESSION_HANDOFF.md`.

## 2026-08-02 — Backpack / Journal / Dashboard (T-25…T-29) · accepted

- **Journal & Dashboard nutzen den bestehenden vereinheitlichten Feed als Single Source of Truth.**
  Warum: `services/trainingFeed.ts`/`hooks/useTrainingFeed.ts` mischen bereits `training_units` + `training_sessions`
  + GPS-Fährten. Eine zweite Trainingshistorie/-tabelle wäre Dupl-Logik und Divergenz-Risiko. Keine neue DB, keine Migration.

- **Backpack ist lokal (AsyncStorage), pro Nutzer UND pro Hund.**
  Warum: Persönliche Packliste, gerätelokal ausreichend; Key `dog_backpack:<userId>:<dogId>` trennt Nutzer/Hunde sauber.
  Kein Supabase, keine Migration; ein späterer Server-Umzug betrifft nur `features/dogs/backpack.ts`.

- **Produktnamen „Journal" und „Backpack" werden NICHT lokalisiert.**
  Warum: feste Markennamen. Nur sichtbare i18n-Werte (de/gsw/fr) tragen den Namen; technische i18n-Keys
  (`journal.*`, `backpack.*`, `dash.*`), AsyncStorage-Keys, Typen und Dateinamen bleiben stabil.

- **Journal ist eine Push-Route, kein neuer Bottom-Tab.**
  Warum: die Tab-Leiste ist bereits voll (Start/Hunde/Training/Analyse·Hub/Connect/Profil); ein Tab hätte bestehende
  verdrängt. Stattdessen `/training-journal` erreichbar über Home-Schnellaktion, Hundeprofil und Analyse.

- **Dashboard Phase C ist rein additiv; Smart Analyse bleibt deterministisch, kein Wetter.**
  Warum: Vorgabe. Overview-Karten bündeln vorhandene Quellen (Feed/Ziel/Heat/Backpack/Kalender) ohne neue KI,
  ohne Wetter-API und ohne Änderung bestehender Trainings-/Fährten-/Kalender-/Zyklus-/Abo-Logik.

## 2026-08-02 — Entitlements erweitern Store-Abos additiv (T-34) · accepted

- **`lifetime` ist ein Produktzugriffsrecht, keine Rolle.**
  Warum: Ausgewählte Benutzer sollen alle aktuellen und zukünftigen regulären Premium-/Trainer-Funktionen ohne
  Store-Kauf nutzen können, aber keinen Admin-, Debug-, Support- oder Fremddatenzugriff erhalten.

- **Bestehender Capability-Pfad bleibt die zentrale Runtime-Quelle.**
  Warum: `useCapabilities()`/`getMyCapabilities()` sind bereits die Gates für Pro/Trainer. Entitlements werden dort
  additiv mit `subscriptions`/`user_capabilities` zusammengeführt; RevenueCat und Store-Receipt-Logik bleiben
  unverändert.

- **Entitlement-Werte sind kontrolliert und serverseitig verwaltet.**
  Warum: Sicherheitsrelevante Rechte dürfen keine freien Client-Strings sein. Die Migration beschränkt
  `entitlement` auf `lifetime`, `beta_tester`, `ambassador`, `staff`; normale Benutzer haben nur RLS-geschützten
  Lesezugriff auf eigene aktive Entitlements.

## 2026-08-03 — Home-Backpack pro Hund über instanzierte Konfiguration (T-35) · accepted

- **Bestehende Home-Konfiguration bleibt kompatibel.**
  Einfache Action-IDs bleiben gültig; Backpack-Aktionen und Backpack-Widgets benötigen eine Instanz mit `dogId`.
  Ungültige oder verwaiste Hunde-Referenzen werden sanitisiert und dürfen keinen Crash auslösen.
- **`dogs.id` bleibt die einzige fachliche Hundereferenz.**
  Das Home-Feature verwendet die bestehende Hundequelle, Backpack-Domäne und `/dog-backpack/[id]`-Route; keine zweite
  Hundestruktur, keine neue Datenbanktabelle und keine Migration.

## 2026-08-11/12 — Track Save Reliability (LEGEN P-SAVE1–3, ABSUCHE RUN-SAVE1–3) · accepted

> Verifiziert gegen Commits `7087e15`/`431a2d6`/`94e8ec2` (LEGEN) und `0ab0520`/`c47d5a6`/`cc58df5`/`4e0bf1e`
> (ABSUCHE). Keine Datenmigration (Client-UUID auf uuid-PK + `payload_json`/`track_data`). Append-only; ältere
> Entscheidungen bleiben gültig.

- **SQLite = durable local truth für Track-Save.**
  Warum: Eine gelegte Fährte / abgeschlossene Absuche darf nie an Netz/Supabase hängen. Lokale Finalisierung ist die
  Save-Erfolgsschwelle; der Nutzer sieht „gespeichert" nach lokalem, nicht nach remotem Erfolg.

- **Sync-Queue = einziger Remote-Transport nach lokaler Finalisierung.**
  Warum: Der frühere direkte Remote-Pfad (`createTrackSession`/`finishTrackRecording` bzw. `startTrackRun`/
  `finishTrackRun`) lief fire-and-forget parallel und konnte bei kurzem Stop/Offline/Netzfehler das Ergebnis verlieren.
  Ersetzt durch die bestehende persistente `training_session`-Sync-Queue (P-SAVE2). **Keine zweite Sync-Architektur**,
  **kein** neuer `SyncEntityType='track_run'` — der Run reist mit der Session.

- **clientUuid = `training_sessions.id`, runUuid = `track_runs.id` (deterministisch beim Start).**
  Warum: Beseitigt den ID-Race (Stop vor Remote-Antwort) und macht Retry idempotent. Verifiziert: `id` ist uuid-PK
  mit `gen_random_uuid()`-Default → client-seitige UUID zulässig; RLS „owner_id = auth.uid()" bzw. „owner via session"
  deckt INSERT/UPDATE/DELETE owner-scoped (keine Remote-Migration).

- **Remote-Sync ist idempotent: `upsert(onConflict:'id')` + Replace-by-session.**
  Warum: Retry/verlorene ACK/App-Kill dürfen keine Doppel-Fährte/-Run erzeugen. Session per Upsert; Lay-Points und
  Marker per Replace-by-session (delete `session_id`+`point_type='lay'`/Marker → insert). FK-Reihenfolge:
  Session-Upsert → Lay/Marker → `track_runs`-Upsert → erst danach lokal `synced`.

- **Kanonische Remote-Absuche-Spur = `track_runs.run_points`.**
  Warum: Der Detail-Screen (`app/track/[id].tsx`) liest die Spur aus `track_runs.run_points`; remote
  `track_points point_type='search'` wird nirgends gelesen. Daher **NICHT** zusätzlich `point_type='search'` nach
  remote `track_points` replizieren (keine Doppelspeicherung). Lokal-only Detail nutzt `payload_json.run.run_points`
  als Lückenfüller.

- **Remote darf NIE die Save-Erfolgsschwelle sein; Navigation wartet nicht auf Remote-Sync.**
  Warum: Robustheit im Feld (schlechtes Netz). Bei Remote-Fehler bleiben Session + Run + Punkte lokal erhalten,
  Queue bleibt pending/failed → Retry bei App-Start/Reconnect/Foreground (`SyncProvider`). `sync_failed ≠ save_failed`.

- **Verlauf/Detail zeigen lokale pending/failed Fährten (P-SAVE3/RUN-SAVE3).**
  Warum: Ein Remote-Ausfall darf lokale Daten nicht verdecken. Remote+Local-Merge (Dedupe über Session-ID, Remote
  autoritativ, lokaler Run ergänzt fehlenden Remote-Run); Detail-Local-Fallback baut aus SQLite auf.

## 2026-08-11/12 — Off-Track Feedback + Produkt-/Release-Entscheidungen · accepted

- **Off-Track Feedback nur auf echten State-Transitionen; `freezeProgress` DEFERRED.**
  Warum (`c251434`/`bccce35`): Voice/Haptik/Banner werden einmalig je Transition (on_track/warning/off_track/recovered)
  ausgelöst (Spam-Schutz via debounced State-Machine). Ein Recorder-/Progress-Freeze bei off_track wird **bewusst
  vorerst NICHT** verwendet (Produktentscheidung) — nur Feedback, keine Auto-Pause.

- **Founder nicht mehr öffentlich verkaufen.**
  Warum (`6d30359`): Active + Trainer sind die öffentlich kaufbaren Pläne; Newbie ist Free-Tier. Founder ist aus der
  regulären Verkaufsauswahl entfernt; interne Legacy-/Restore-Referenzen bleiben für Bestandskunden erhalten.

- **Web ist derzeit kein Release-Ziel der mobilen App.**
  Warum: Der Web-Export bricht (`react-native-maps` importiert native-only Module). Production-OTA läuft daher
  plattformweise (`--platform ios|android`) auf Channel/Environment `production`, Runtime 1.0.1. Kein Mobile-Blocker;
  der Web-Bruch wird **nicht** im Rahmen von Mobile-Fixes nebenbei behoben.

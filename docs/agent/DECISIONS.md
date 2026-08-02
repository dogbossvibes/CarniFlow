# ANYVO — Agent Decisions

> Nur relevante technische Entscheidungen. Kein Kleinklein.
> Status: `accepted` · `temporary` · `superseded`.

## 2026-07-29 — Repository-basiertes Agent-Handoff-System (Claude ↔ Codex)

Context:
Zwei Agenten (Claude Code, OpenAI Codex) arbeiten abwechselnd im selben Repo. Ohne
gemeinsame Wahrheit droht Überschreiben fremder Arbeit oder Verlust offener Tasks.

Decision:
Das Repository ist die gemeinsame Wahrheit. Handoff via `docs/agent/` (manuell gepflegt)
plus ein automatisch erzeugter Git-Snapshot-Block in `SESSION_HANDOFF.md`
(`scripts/agent-handoff.mjs`). Regeln in `AGENTS.md` (Codex) und `CLAUDE.md` (Claude).
Prioritätsregel: **Repository state > Git state > Handoff documentation > Agent assumptions.**

Reason:
Nur Node-Standardbibliothek (keine neue Dependency), rein additiv, keine Git-Schreib-/
Remote-/DB-Aktionen. Manuelle und automatische Bereiche sind über Marker strikt getrennt,
damit ein erneuter Handoff manuellen Inhalt nie überschreibt.

Consequences:
- Neue Scripts `agent-handoff`/`agent-status`/`agent-start` + `agent-lib`.
- Neue npm-Scripts `agent:*`.
- Claude-`/handoff`-Command in `.claude/commands/`.
- Agenten müssen beim Start `CURRENT_STATE.md` + `SESSION_HANDOFF.md` + `git status` lesen
  und den Handoff gegen den echten Repo-Zustand verifizieren.

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

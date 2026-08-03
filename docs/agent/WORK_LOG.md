# ANYVO — Agent Work Log

> Kurzer chronologischer Verlauf. **Keine** vollständigen Chatprotokolle.
> Neueste Einträge oben. Agenten pflegen diesen Log manuell (nicht halluzinieren).

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

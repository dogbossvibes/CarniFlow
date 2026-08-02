# ANYVO — Agent Work Log

> Kurzer chronologischer Verlauf. **Keine** vollständigen Chatprotokolle.
> Neueste Einträge oben. Agenten pflegen diesen Log manuell (nicht halluzinieren).

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

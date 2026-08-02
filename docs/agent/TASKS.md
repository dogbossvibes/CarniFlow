# ANYVO — Task-Liste (Agent-Handoff)

> IDs stabil, chronologisch. Status: DONE · DONE(committed) · DONE(deployed) · BLOCKED · OPEN.
> Priorität bei Widerspruch: Repository state > Git state > Handoff-Doku.
> Stand: 2026-08-02 · Branch `feat/track-module-rewrite`.

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

## Diese Session — Feature-Arbeit (verifiziert, UNCOMMITTET)
> Rein additiv. Keine DB-Migration, keine bestehende Trainings-/Fährten-/Kalender-/Zyklus-/Abo-Logik verändert.
> Alles lokal uncommittet (kein Commit/Push).
- **T-25 — Backpack Phase A (Datenschicht)** · DONE (uncommittet)
  `features/dogs/backpack.ts`: per-user/per-dog AsyncStorage (`dog_backpack:<userId>:<dogId>`), Sanitizer, CRUD,
  aktiv/inaktiv, gepackt, ↑/↓-Reorder, Reset-nur-Häkchen, Vorschläge (nie auto-persistiert). Keine DB-Migration.
- **T-26 — Backpack Phase B (UI)** · DONE (uncommittet)
  Overview-Card + Verwaltungsscreen `app/dog-backpack/[id].tsx` (Add/Edit/Delete, aktiv/inaktiv, gepackt, Reorder,
  Reset, Vorschläge mit Duplikatschutz), i18n de/gsw/fr, verdrahtet in `DogHubScreen`/`app/dog/[id].tsx`.
- **T-27 — Journal (spartenübergreifende Trainingshistorie)** · DONE (uncommittet)
  Route `app/training-journal.tsx` auf bestehendem `useTrainingFeed` (Single Source of Truth), `features/training/journal.ts`
  (Filter/Suche/Gruppierung/Pagination), Einstiege Home-Schnellaktion/Hundeprofil/Analyse. Keine zweite DB.
- **T-28 — Produktnamen-Rename** · DONE (uncommittet)
  „Trainingstagebuch"→**Journal**, „Rucksack"→**Backpack** (feste Produktnamen, nicht lokalisiert); nur sichtbare
  i18n-Werte + Registry-Fallback, technische Keys/AsyncStorage/Typen/Dateien unverändert.
- **T-29 — Persönliches Hunde-Dashboard (Phase C)** · DONE (uncommittet)
  Overview-Tab als Dashboard (Heute/Termine/Läufigkeit/Ziel/Backpack/Zuletzt/Status/Smart Analyse). Neue reine Logik
  `features/dogs/dashboard.ts` + 4 Karten; Termine via bestehendem `getCalendarEvents`. Kein Wetter, keine neue KI,
  keine Migration. Report `docs/architecture/DOG_PERSONAL_DASHBOARD_PHASE_C_FIX_REPORT.md`.

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

## ► NÄCHSTE FREIE TASK-ID: **T-30**
Letzte bearbeitete TASK-ID: **T-29** (Hunde-Dashboard Phase C, uncommittet).
Empfohlene nächste Arbeit (Codex):
1. **Gerätetest T-25…T-29** (Backpack/Journal/Dashboard) — DE/gsw/FR, iPhone klein/gross + Galaxy S23,
   Hündin/Rüde, mit/ohne Termine/Ziel/Historie. Danach ggf. Feinschliff.
2. Weiterhin offen (Release): **T-20** Testerfeedback/Build-38-Hotfix-Triage, **T-21** Dirty-Tree-Aufräumen.
Kein Commit/Push ohne ausdrückliche Freigabe.

## Später / nicht blockierend
- App-Store-Connect App-Privacy und Review-Texte final prüfen.
- Vercel/Legal-Web nur nach sauberem Scope deployen.
- Production Monitoring Supabase/RevenueCat/Auth nach Live-Traffic prüfen.

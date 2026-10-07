# Agent Session Handoff

> Aktuellster Handoff: **Codex (2026-10-07), T-63 Android subscription hotfix**. Shared production state: `docs/agent/ANYVO_MASTER_STATUS.md`.
> Der Block zwischen den AUTO-GENERATED-Markern wird von `scripts/agent-handoff.mjs` erzeugt —
> **nicht manuell** bearbeiten. Alles ausserhalb der Marker wird von den Agenten **manuell** gepflegt.
>
> Priorität bei Widerspruch:
> **Repository state > Git state > Handoff documentation > Agent assumptions.**
> Der tatsächliche Repository-Zustand hat immer Vorrang vor dieser Doku.

## Current task — T-63 (2026-10-07)

- **Goal/completed:** publish Android subscription identifier/price fix and document coordinated release state. Android Production runtime 1.0.3 is live from `e88371dc49233853162e87d8114c9f9d38a112d9`; group `168ae23f-676f-455c-8f15-bb475910d83e`, update `01a117b7-e024-7a59-9d60-ade29e2b6b01`.
- **Validation:** full release run 325 PASS/1 stale agent-heading assertion; repaired-suite + native-contract rerun 2/36 PASS. All 326 suites/3968 distinct tests verified, tsc PASS, lint 0 errors (one existing warning), export/bundle and wrapper checks PASS.
- **Canonical code:** main includes feature `3979246` and agent-heading/approval-test repair `c302bce`. No push.
- **Important coordination:** `integration/production-points-2026-10-07@570bd1e` is based on older `7d43db9`. Its planned FF no longer fits current main. Preserve its four changes and reconcile without dropping T-63. No foreign worktree was modified or messaged.
- **Do not touch:** foreign integration/feature worktrees; iOS production releases; Google Play submissions; DB. Never merge the Android runtime snapshot commit `f0b1331` into main.
- **Next step/open issue:** owner verifies store prices, purchase buttons, Google purchase sheet and subscription access on the updated Android device. If still unavailable, obtain installed OTA ID and store SDK error.
- **Relevant files:** `docs/agent/tasks/T-63.md`, `docs/agent/ANYVO_MASTER_STATUS.md`, `features/subscription/plans.ts`, `lib/purchases.ts`, `app/premium.tsx`, `app/membership.tsx`.

<!-- AUTO-GENERATED:START -->

Generated: 2026-10-07T18:56:23.219Z
Agent: codex
Branch: main

### Git status
```
M docs/agent/ANYVO_MASTER_STATUS.md
 M docs/agent/SESSION_HANDOFF.md
 M docs/agent/TASKS.md
 M docs/agent/WORK_LOG.md
 D docs/agent/tasks/ANDROID_SUBSCRIPTION_PRODUCT_MATCHING_2026-10-07.md
?? docs/agent/tasks/T-63.md
```

### Diff stat
```
docs/agent/ANYVO_MASTER_STATUS.md                  | 40 +++++++++++++++++-----
 docs/agent/SESSION_HANDOFF.md                      | 12 ++++++-
 docs/agent/TASKS.md                                |  9 +++++
 docs/agent/WORK_LOG.md                             |  9 +++++
 ...OID_SUBSCRIPTION_PRODUCT_MATCHING_2026-10-07.md | 16 ---------
 5 files changed, 61 insertions(+), 25 deletions(-)
```

### Modified files
```
docs/agent/ANYVO_MASTER_STATUS.md
docs/agent/SESSION_HANDOFF.md
docs/agent/TASKS.md
docs/agent/WORK_LOG.md
docs/agent/tasks/ANDROID_SUBSCRIPTION_PRODUCT_MATCHING_2026-10-07.md
```

### Untracked files
```
docs/agent/tasks/T-63.md
```

### Recent commits
```
c302bce test(release): preserve approval checks across agent workflow names
3979246 fix(subscription): match Android base plan product identifiers
7d43db9 docs(agent): make ChatGPT and Codex the primary workflow
e30297a docs(agent): record background lay hotfix and iOS OTA 1.0.4
fd0c727 fix(tracking): process background lay fixes by session
```

### Runtime
```
Node: v24.15.0
Package manager: npm
```

<!-- AUTO-GENERATED:END -->

> Hinweis: Der AUTO-GENERATED-Block oben wird beim Handoff-Script aktualisiert.
> Maßgeblich bei Widerspruch bleibt der tatsächliche Repository-Zustand.
> Stand der manuellen Sektionen: **2026-08-17 (Codex)** — NEWBIE-Quota read-only Production-Preflight (No-Op) +
> T-57 Trainer-Keyboard-Fix `0e7aaba` ist releaseverifiziert; HEAD `0e7aaba`.
> Hinweis: Der AUTO-GENERATED-Block oben ist ggf. älter als diese manuellen Sektionen; maßgeblich ist der echte git-Stand.

## Current task
**Session 2026-08-17 (Codex):** (1) **Read-only Production-Preflight** der geplanten NEWBIE-Quota-Korrektur
gegen ANYVO Production (`axkkhyqrjrtbkumaulta`); (2) **T-57 releaseverifiziert** `app/trainer/index.tsx`
(Bottom-Sheet „Trainer verbinden → Code eingeben" bei Tastatur sichtbar). **Kein Push/Build/OTA/Submit,
keine Production-Schreiboperation.** HEAD steht auf **`0e7aaba`**, Branch `feat/track-module-rewrite`, und ist
**3 Commits VOR origin** (`c210008`, `adfc3b5`, `0e7aaba` sind **ungepusht**; 0 hinter origin).

> **Repository-Zustand > Handoff.** Zwei Subscription-Commits sind seit dem letzten Handoff (`fddd1f1`) auf dem
> Branch, in der vorherigen Session **nicht** erstellt und **noch nicht gepusht** — nur als Repo-Zustand dokumentiert:
> `c210008 feat(subscription): add 3-day ACTIVE trial funnel` und `adfc3b5 fix(subscription): allow 2 NEWBIE trainings per month`.
> **Neu in dieser Session:** `0e7aaba fix(trainer): keep connect sheet above keyboard`, ebenfalls ungepusht.

## Goal
NEWBIE-Quota-Zielzustand (dog=1 · training=2 · track=0) sicher auf Production halten **ohne unnötige Migration**
und den **realen Feldtest** des
Fährten-Confidence-/Render-Fixes (P0, T-56, siehe unten).

## NEWBIE-Quota Preflight — Ergebnis (Verified read-only, 2026-08-17)
- **Production liefert bereits** `newbie_quota_limit` = **dog=1, training=2, track=0** (via PostgREST/anon-RPC gegen
  `axkkhyqrjrtbkumaulta`; `.env EXPO_PUBLIC_SUPABASE_URL` = Production bestätigt). Tabelle `newbie_quota_claims` existiert.
- **Migration `supabase/migrations/20260816130000_newbie_training_quota_two.sql` (training 1→2) ist damit ein No-Op**
  (idempotentes `CREATE OR REPLACE`, keine Datenänderung, keine Wirkung). **Nicht erforderlich.**
- **Falle:** `20260808120000_newbie_training_quota_one.sql` senkt training auf **1** — darf **nicht isoliert** auf
  Production laufen (Regression 2→1).
- Premium (ACTIVE/FOUNDER/TRAINER/Lifetime) via `is_pro_member`/`user_capabilities.pro_member` wird **vor**
  `newbie_quota_limit` auf unbegrenzt kurzgeschlossen → von der Quota unberührt.
- **Verifikationsgrenze:** kein DDL-Dump möglich (`pg_dump`/`psql`/`service_role` fehlen; `supabase migration list
  --linked` scheitert an fehlendem `SUPABASE_DB_PASSWORD`). Beleg ist **verhaltensbasiert** (RPC-Rückgabewerte),
  nicht per Funktions-Body-Dump.

## Trainer-Verbinden Keyboard-Fix (releaseverifiziert, committed `0e7aaba`, `app/trainer/index.tsx`)
- **Bug:** Bottom-Sheet „Code eingeben" war `position:absolute; bottom:0` in einem `Modal` **ohne**
  `KeyboardAvoidingView` → Tastatur verdeckte das Eingabefeld, Eingabe nicht sichtbar.
- **Fix (Projekt-Idiom):** Backdrop + Sheet in eine Vollbild-`KeyboardAvoidingView`
  (`behavior={Platform.OS==='ios'?'padding':'height'}`, `modalRoot { flex:1, justifyContent:'flex-end' }`);
  `position:absolute` vom Sheet entfernt; `autoFocus` aufs Code-Feld. Tap-auf-Backdrop-Schließen bleibt erhalten.
- **Verifikation:** `npx tsc --noEmit` PASS; `npx jest services/__tests__/trainer-flow.test.ts --runInBand` PASS
  (1 Suite / 6 Tests); `git diff --check` PASS. **Real-Device-QA abgeschlossen / releaseverifiziert:** iOS PASS;
  Android / Galaxy S23 PASS (Gesten- und Drei-Button-Navigation). Keyboard öffnen/schließen, sichtbares Eingabefeld
  + CTA, Backdrop bei offenem Keyboard, mehrfaches Öffnen/Schließen sowie gültiger/ungültiger Codefluss PASS.

## Current implementation state (Verified im Code `fddd1f1`)
- **Solid-Track produktiv:** gelegte Fährte immer solide Mint via `laidTrackStroke()`
  (`features/tracking/utils/trackSegments.ts`), Renderer `features/tracking/components/TrackingMap.tsx`; Ist-Suchspur
  separat blau; `dimLay` deprecated.
- **Confidence-Winkel produktiv:** `features/tracking/utils/autoCornerDetection.ts` — hartes `MAX_ANGLE_ACCURACY_M`-
  Gate entfernt, Confidence-Faktoren (angle .24 / straightBefore .16 / straightAfter .16 / support .10 /
  accuracy .12 (robust über Sequenz) / bearing .12 / legLength .10), Zustände accept/pending/reject. Ein einzelner
  schlechter GPS-Fix zerstört einen klaren Winkel nicht mehr. Schlangenlinien-Schutz erhalten.
- Voice/Haptik/Store/Persistenz/1-5-10-m/Off-Track **unverändert** (Voice/Haptik waren nicht die Root Cause).

## Work completed — Stand 2026-08-15
- **Commit `0e7aaba`** — `fix(trainer): keep connect sheet above keyboard` (ausschließlich
  `app/trainer/index.tsx`, 35+/28−). Kein Build/OTA/Submit/DB-Vorgang, nicht gepusht.
- **T-57 Real-Device-QA:** iOS und Android / Galaxy S23 (Gesten- und Drei-Button-Navigation) PASS; Fix ist
  releaseverifiziert. Kein Produktcode, Build, OTA, Submit oder DB-Vorgang in dieser Verifikation.
- **Commit `fddd1f1`** — `fix: restore track rendering and robust angle detection` (10 Dateien: TrackingMap +
  trackSegments + autoCornerDetection + 5 Tests + 2 Reports; `angleDiagnostics.ts` DEV-only). Gepusht (== origin).
- **Production-OTA 2026-08-15** aus **sauberem detached Worktree** auf `fddd1f1` (kein fremder WIP), Runtime **1.0.1**,
  Channel `production`, plattformweise:
  - iOS update `01a00692-bd2f-7edd-868e-54143abe7c41` (group `219a6fc9-3278-4fb6-b01c-45b4b5231f18`)
  - Android update `01a00697-d886-7580-ab39-7528bc0163f5` (group `d88e7d0d-fb09-4e57-b55e-9b63df340828`)
  - Message „fix(tracking): restore solid track rendering and robust angle detection". Kein Build/Submit/DB.
- Reports: `FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md`, `FAEHRTE_ANGLE_CONFIDENCE_FIX_REPORT.md`.

## Tests / verification (Verified)
- Targeted Tracking/Angle/Guidance **103 PASS**; Gesamtsuite **1191 PASS / 1 FAIL** = ausschließlich der
  vorbestehende stale `app/track/__tests__/run-arming.test.ts` (`run.tsx` unverändert). **Suite NICHT vollständig
  grün, solange dieser stale Test existiert.** `tsc --noEmit` 0 Errors, ESLint berührter Dateien 0 Errors,
  iOS + Android `expo export` OK.

## Open work (P0)
- **Real-Device-Test des Confidence-/Render-Fixes** (iOS + Android) — siehe `TASKS.md` T-56 (Karte, Guidance,
  Schlangenlinien-Regression, 1/5/10-m, kurzer Off-Track).

## Do not change casually (ohne Feldbeleg + Regressionstests)
- Confidence-**Gewichte** und **Schwellen** (`ACCEPT_CONF`, `STRAIGHT_ACCEPT`, `ACC_BAD_M` …), **Straightness-Regeln**,
  **Schlangenlinien-Unterdrückung**, **Links/Rechts-Logik**, **Voice/Haptik**. Nicht durch großzügiges Anheben von
  Accuracy-Schwellen „reparieren".

## Known issues / offene Punkte
- **NEWBIE-Quota-Migration `20260816130000` ist auf Production ein No-Op** (training bereits 2). Nicht ausführen,
  außer man will die Definition bewusst idempotent festschreiben — **nur nach ausdrücklicher Freigabe**.
- **Stale Test** `app/track/__tests__/run-arming.test.ts` (`([5, 10] as const).map` vs. `HANDLER_DISTANCES_M`) rot, unabhängig.
- **Web-Bundle** bricht via `react-native-maps` → OTA plattformweise ios/android; kein Mobile-Blocker, **nicht nebenbei fixen**.
- **`freezeProgress` bewusst DEFERRED** — nur Feedback, kein Progress-/Recorder-Freeze.
- Fremder WIP im Tree (inkl. bündelbarer Diff `features/tracking/hooks/useTrackVoiceGuidance.ts`) — **nicht anfassen**.

## Important context
- **NICHT erneut bauen:** zweite Track-Sync-Queue · zweite Off-Track-State-Machine · zweite Winkel-Erkennung ·
  separater Run-Sync-Stack · Search-Points zusätzlich remote in `track_points` replizieren (kanonisch ist
  `track_runs.run_points`).
- Architektur: **SQLite = durable local truth**, **Sync-Queue = einziger Remote-Transport** nach lokaler Finalisierung,
  **clientUuid = `training_sessions.id`**, **runUuid = `track_runs.id`**, Remote-Sync **idempotent** (Upsert onConflict:id +
  Replace-by-session), **Remote ist NIE die Save-Erfolgsschwelle**, Navigation wartet nicht auf Remote-Sync.
- `AGENTS.md` + `docs/agent/*` sind die gemeinsame Wahrheit (Handoff Claude Code ↔ Codex).

## Do not touch
- Der gesamte vorbestehende fremde WIP (Produkt-/Tracking-/i18n-WIP, SQL-Dumps, Artefakte, Screenshots, `dist-*`,
  Workspaces, ZIPs, `.opencode/`) — inkl. `features/tracking/hooks/useTrackVoiceGuidance.ts`.
- **T-57 ist committed:** `app/trainer/index.tsx` in `0e7aaba`; nicht ohne neuen, klar abgegrenzten Auftrag verändern.
- **Keine Production-DB-Schreiboperation** (NEWBIE-Quota-Migration inkl.) ohne ausdrückliche Freigabe.
- Keine pauschalen Git-Aktionen (`git add .`, reset, clean, checkout fremder Dateien); kein Push/Build/OTA/Store-Submit ohne Freigabe.
- Den AUTO-GENERATED-Block nie händisch editieren (nur via `agent:handoff`).

## Next recommended step
1. **NEWBIE-Quota:** Entscheidung des Nutzers einholen — da Production bereits training=2 liefert, ist die Migration
   **nicht nötig**; optionales idempotentes Festschreiben nur nach Freigabe. `20260808120000` (→1) **nicht** anwenden.
2. **T-56 Real-Device-Test** Confidence-/Render-Fix auf echten Geräten (iOS **und** Android): solide Mint-Fährte,
   Auto-Winkel (90°/Spitz L+R) sichtbar + Voice/Haptik, Schlangenlinie → 0 Winkel, 1/5/10-m-Stichprobe, kurzer Off-Track.
2. Bei Feldbeleg zur Auto-Erkennung optional die vorbereitete **DEV-Diagnostik** (`angleDiagnostics.ts`) für **eine**
   Fährte aktivieren (accept/pending/reject + Confidence + Accuracy) — danach wieder entfernen.
3. **T-24 Store/Release-Monitoring** (OTA-Zustellung realer Geräte) · **T-22 Website deployen** · **T-21 Dirty-Tree/
   Release-Branch-Strategie** (fremder WIP unangetastet).

## Relevant files (diese Session 2026-08-17)
- **Keyboard-Fix (committed `0e7aaba`):** `app/trainer/index.tsx` (Bottom-Sheet „Code eingeben").
- **NEWBIE-Quota (Repo, keine Ausführung):** `supabase/migrations/20260816130000_newbie_training_quota_two.sql` (No-Op),
  `20260808120000_newbie_training_quota_one.sql` (→1, nicht isoliert anwenden), `SUBSCRIPTION_NEWBIE_QUOTAS_SETUP.sql`,
  `features/subscription/plans.ts` (`NEWBIE_QUOTA = { dog:1, training:2, track:0 }`), `SUBSCRIPTION_P0_DB_DEPLOYMENT.md`.

## Relevant files (Render- + Confidence-Fix `fddd1f1`)
- Render: `features/tracking/components/TrackingMap.tsx`, `features/tracking/utils/trackSegments.ts` (`laidTrackStroke`).
- Confidence: `features/tracking/utils/autoCornerDetection.ts` (+ `angleDiagnostics.ts` DEV-only, nicht verdrahtet).
- Tests: `features/tracking/utils/__tests__/{laidTrackStroke,cornerConfidence}.test.ts`,
  `features/tracking/__tests__/searchGuidancePipeline.test.ts`, `features/tracking/utils/__tests__/autoCornerDetection.test.ts`.
- Konsument (unverändert): `app/track/run.tsx`, `features/tracking/hooks/{useTrackVoiceGuidance,useTrackHapticGuidance,useTrackRecorder}.ts`.

## Open questions
- NEWBIE-Quota: Will der Nutzer die No-Op-Migration trotzdem idempotent festschreiben, oder Production so belassen (empfohlen)?
- Justieren einzelne Feld-Fährten die Confidence-Gewichte/Schwellen? Nur mit Regressionstests + Feldbeleg.
- Wann/ob der Web-Bundle-Bruch (`react-native-maps`) separat behoben wird (kein Mobile-Blocker).

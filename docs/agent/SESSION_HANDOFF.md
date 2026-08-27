# Agent Session Handoff

> Aktuellster Handoff: **OpenCode (2026-08-10)** → **OpenAI Codex**.
> Der Block zwischen den AUTO-GENERATED-Markern wird von `scripts/agent-handoff.mjs` erzeugt —
> **nicht manuell** bearbeiten. Alles ausserhalb der Marker wird von den Agenten **manuell** gepflegt.
>
> Priorität bei Widerspruch:
> **Repository state > Git state > Handoff documentation > Agent assumptions.**
> Der tatsächliche Repository-Zustand hat immer Vorrang vor dieser Doku.

<!-- AUTO-GENERATED:START -->

Generated: 2026-08-27T15:56:36.161Z
Agent: claude
Branch: feat/track-module-rewrite

### Git status
```
M docs/agent/SESSION_HANDOFF.md
 M i18n/__tests__/localization-consistency.test.ts
 M i18n/gsw-CH.ts
 M i18n/locales/en.ts
 M i18n/locales/fr.ts
 M i18n/locales/gsw.ts
 M i18n/locales/it.ts
```

### Diff stat
```
docs/agent/SESSION_HANDOFF.md                   |  593 ++------
 i18n/__tests__/localization-consistency.test.ts |  114 +-
 i18n/gsw-CH.ts                                  |   26 +-
 i18n/locales/en.ts                              | 1088 ++++++-------
 i18n/locales/fr.ts                              | 1856 +++++++++++------------
 i18n/locales/gsw.ts                             |   10 +-
 i18n/locales/it.ts                              | 1272 ++++++++--------
 7 files changed, 2381 insertions(+), 2578 deletions(-)
```

### Modified files
```
docs/agent/SESSION_HANDOFF.md
i18n/__tests__/localization-consistency.test.ts
i18n/gsw-CH.ts
i18n/locales/en.ts
i18n/locales/fr.ts
i18n/locales/gsw.ts
i18n/locales/it.ts
```

### Untracked files
```
(leer)
```

### Recent commits
```
d19e8bd feat(dogs): add heat cycle calendar and phase timeline
630a9b2 chore(repo): ignore local workspaces and QA artifacts
0703fde docs(tracking): preserve angle and track-layout reference
aa40c4e docs(database): preserve production and staging schema snapshots
6176d97 chore(release): preserve Supabase deployment and verification tooling
```

### Runtime
```
Node: v24.15.0
Package manager: npm
```

<!-- AUTO-GENERATED:END -->

> Hinweis: Der AUTO-GENERATED-Block oben wird beim Handoff-Script aktualisiert.
> Maßgeblich bei Widerspruch bleibt der tatsächliche Repository-Zustand.
> Stand der manuellen Sektionen: **2026-08-26 (Codex)** — Phase 6 i18n-Copy-Repair ist uncommitteter WIP;
> siehe den aktuellen Übergabeblock direkt unten. Kein Commit, Push, OTA, Deploy, nativer Build oder DB-Vorgang.
> Hinweis: Der AUTO-GENERATED-Block oben ist ggf. älter als diese manuellen Sektionen; maßgeblich ist der echte git-Stand.

## Übergabe (Claude) — Phase 6 i18n ABGESCHLOSSEN (2026-08-27)

### Current task
**ANYVO Phase 6 — FR / IT / EN Translation Repair + GSW Typo Fix.** Ziel war: alle 1.684 produktiven
Locale-Werte in FR/IT/EN sprachlich bereinigen, klare GSW-Tippfehler gezielt korrigieren und den
`localization-consistency`-Quality-Scan gegen German-/Fremdsprachen-Leakage, Key-Name-Leaks und bekannte
Garbage-Patterns härten. **Status: erledigt, uncommitted.** Kein Architektur-, Produktlogik-, Tracking-,
DB- oder Native-Change vorgenommen.

### Goal — erreicht
- FR garbage/mixed = 0; IT garbage/mixed = 0; EN garbage/mixed = 0; EN German leakage = 0 (automatisiert
  verifiziert, siehe Tests).
- Placeholder, Key-Parität und alle fünf Sprachen vollständig gehalten (1.684 Keys je Sprache, 0 missing/empty).
- i18n-/Hardcode-/Gesamttests + `tsc` verifiziert (siehe unten). Es gibt keine dedizierten Voice-/
  Notification-Testdateien in diesem Repo — die relevanten Locale-Werte (`track.voice*`,
  `notification.*`) sind Teil der normalen i18n-Suiten und wurden mitprüft.

### Work completed (diese Session, Claude, aufbauend auf FR/IT-WIP von Codex)
- **Baseline verifiziert:** Branch `feat/track-module-rewrite`, uncommitted vorbestehend:
  `i18n/locales/fr.ts`, `i18n/locales/it.ts`, `docs/agent/SESSION_HANDOFF.md`. Nichts zurückgesetzt/gestasht.
- **Programmatisches Audit statt Stichproben:** `i18n/locales/{de,fr,it,en}.ts` sowie `i18n/de-CH.ts` per
  TypeScript-Compiler-AST (nicht Regex) zu Key/Value-Objekten geparst, um alle 1.684 Werte je Sprache exakt
  gegen `de` zu vergleichen (Diff-Scripts nur im Scratchpad, nicht im Repo).
- **EN war faktisch nie überarbeitet** (Handoff-Annahme oben war korrekt): **374 von 1.684 Werten** waren
  reine "Key-Name-Echo"-Platzhalter (z. B. `track.searchStartHint` → `"Track search start hint"`,
  `profile.secTrack` → `"PROFILE SEC TRACK"`). Zusätzlich **~180 weitere** Werte hatten Deutsch/Englisch-
  Mischmasch, kaputte Ergebnisse eines automatisierten Teil-Ersetzungslaufs (z. B.
  `"Please to tracksansatz gehen. Choose the distance to dog..."`) oder rohe camelCase-Key-Fragmente
  (`"trainer-Moyoul freischalten"`, `"corner-Erkennung"`). **Alle 552 betroffenen EN-Keys wurden neu auf
  natürliches Englisch übersetzt** (`i18n/locales/en.ts`, komplett).
- **IT war trotz Codex-WIP (918+/918−, Parität/Placeholder bereits ok) an ~175 Stellen noch kaputt**: u. a.
  eine grosse `help.*`/`training.*`-Gruppe mit rohen camelCase-Fragmenten (`"Aiuto faqDogAnswer"`,
  `"Allenamento chooseDogtitolo"`), erfundene Pseudo-Wörter (`"tuttinamento"`, `"Ksu"`, `"daverksut"`),
  Deutsch-Leaks (`"Il tuo Zugang ist attivo."`) und ALL-CAPS-Keys mit unübersetztem Englisch
  (`"RATING LABEL"`, `"BEST PRICE"`, `"SHARE WITH"`) sowie 4 Fälle, in denen der Übersetzer das
  literale Schlüsselwort „title" statt des Referenzwerts übersetzt hatte (`sync.title`/`chat.title`/
  `journal.title` → `"Titolo"` statt Inhalt). **Alle ~175 betroffenen IT-Keys korrigiert**
  (`i18n/locales/it.ts`).
- **FR war grösstenteils sauber** (Codex-Review war korrekt) — nur **9 echte Bugs** gefunden und behoben:
  `TEILEN MIT`/`GETEILT MIT`/`BESTER PREIS`/`EMPFOHLEN` blieben unübersetzt Englisch (`"SHARE WITH"` etc.),
  `profile.noMailApp` behielt `"E-Mail-Programm"`, `calendar.appleGoogleCalendar` hatte falsche Wortstellung,
  `training.pausedShort`/`training.totalTime` hatten Wortstellungs-/Grammatikfehler, und
  `analyse.importantHints` nutzte die DE-spezifischen Adjektiv-Endungs-Platzhalter grammatikalisch falsch
  (siehe unten).
- **GSW-Tippfehler behoben** (genau wie in der Vorgabe benannt): `Gegestand` → `Gegenstand` (12× in
  `i18n/gsw-CH.ts`, 5× in `i18n/locales/gsw.ts`), `Beschaffeheit` → `Beschaffenheit` (1×). Die 317
  DE-identischen Werte wurden **nicht** angefasst.
- **`analyse.importantHints`** (alle drei Sprachen): Die deutschen Platzhalter `{suffixHint}`/
  `{suffixImportant}` bilden deutsche Adjektivdeklination ab (`wichtigeR Hinweis` / `wichtigE HinweisE`) und
  haben keine Entsprechung in FR/IT/EN-Grammatik. FR/IT/EN referenzieren diese zwei Platzhalter jetzt bewusst
  nicht mehr (i18next ignoriert nicht referenzierte Interpolationswerte, kein Aufrufer-Code geändert) und
  nutzen stattdessen zahl-neutrale Formulierungen (`"{count} remarque(s) importante(s)"`,
  `"{count} indicazione/i importante/i"`, `"{count} important note(s)"`). Dafür ist der Key in einer
  dokumentierten Ausnahme im Placeholder-Test gelistet — bewusste, kommentierte Ausnahme, keine
  Architekturänderung.
- **`localization-consistency.test.ts` gehärtet** (klein gehalten, wie gefordert): zwei neue Guards
  `keyNameLeaks` (erkennt Key-Name-Echo-Fallbacks) und `camelCaseFragmentLeaks` (erkennt rohe
  camelCase-Key-Fragmente in Werten), je 2 kleine, kommentierte Ausnahme-Listen für echte Grenzfälle
  (Beispiel-Usernamen, `Row-Level`, `Apple/Google`, FR/IT-Elision vor Grossbuchstaben). Ausserdem
  `intentionallyNeutralIdenticalKeys` um 19 Keys erweitert (DE selbst nutzt hier bereits Lehnwörter wie
  „Chat", „Custom", „Engine", „PAUSED" — Identität mit DE ist dort korrekt, keine Übersetzungslücke) und
  `germanUiPattern` um 9 hochsignifikante Wörter ergänzt (`Zugriff`, `Verwaltung`, `Funktionen`,
  `Einstellungen`, `Programm`, `erforderlich`, `freischalten`, `verfügbar`, `erfasse`).

### Tests (alle in dieser Session selbst ausgeführt, PASS)
- `npx jest i18n/__tests__/ --runInBand` → **6 Suites / 81 Tests PASS** (inkl. der 2 neuen Guard-Tests).
- `npx jest --silent` (voller Lauf) → **122 Suites / 1.341 Tests PASS**, keine Fehlschläge, kein
  vorbestehender stale Test mehr vorhanden (`app/track/__tests__/run-arming.test.ts` ist grün).
- `npx tsc --noEmit --pretty false` → **0 Fehler**.
- `node scripts/localization-hardcoded-scan.mjs --json` → läuft, liefert Report (Kategorien A–I,
  `releaseRelevantOpen: 17`, unverändert Teil des separaten Hardcode-Backlogs, nicht Teil dieser Phase).
- `git diff --check` → **PASS**, keine Whitespace-Fehler.
- Programmatisch verifiziert: FR/IT/EN je 1.684 Keys, 0 missing, 0 extra, 0 empty, 0 Placeholder-Mismatches
  (ausser der dokumentierten `analyse.importantHints`-Ausnahme).

### Known issues
- **Restrisiko „stille Falschübersetzung":** Die automatisierten Guards fangen Garbage-/Leak-/Leerwert-
  Muster zuverlässig, aber **nicht** jede denkbare semantisch falsche, aber grammatikalisch saubere
  Übersetzung (z. B. wurde `trainer.eyebrow` it="SEZIONE" — wörtlich „Section" statt „Trainer" — nur durch
  manuellen DE-Abgleich gefunden, nicht durch ein generisches Muster). Es wurde **nicht** jeder der 1.684
  Werte je Sprache manuell gegen DE gelesen — das wäre über den Rahmen dieser Phase hinausgegangen. Bei
  weiteren Verdachtsmomenten gezielt nachprüfen, nicht pauschal neu auditieren.
- Phase-5 Visual Runtime-QA bleibt separat BLOCKED/DEVICE-QA REQUIRED; diese Phase war reine Copy-/Test-QA,
  keine Geräte-Verifikation der UI-Darstellung (Zeilenumbrüche, Textlänge in Buttons etc.).
- `media.addSplit` (EN/IT) enthält bewusst einen Zeilenumbruch (`"Add"`/`"Aggi\nungi"`) für einen schmalen
  Button — analog zur bestehenden DE-Vorlage `'Hinzu\nfügen'`; auf Gerät verifizieren, ob der IT-Trennpunkt
  „Aggi/ungi" optisch taugt.

### Important context
- Mapping unverändert: de/gsw → `de-CH`, fr → `fr-CH`, it → `it-IT`, en → `en-GB`.
- IGP-Kontext: Fährte = piste/track, Gegenstand = objet/oggetto/object, Dübel = piquet/piolo/dowel,
  Liegezeit = temps de repos/tempo di posa/resting time. Voice-Texte kurz und natürlich gehalten; keine
  Voice-Architektur oder Speech-Calls geändert.
- `trainingCount_other` (EN) war in einem eigenen Fix-Durchgang versehentlich auf `"{count} trainings"`
  gesetzt worden (inkonsistent zu `trainingCount_one` = `"{count} training session"`); korrigiert zu
  `"{count} training sessions"` — durch den bestehenden Test `i18n/__tests__/i18n.test.ts` (15c) abgesichert.

### Do not touch
- Keine Produktlogik, i18n-Architektur, Tracking-Algorithmen, TTS-Mapping, DB/Migration, OTA, Deploy oder
  nativen Build.
- Keine Git-Reset-/Clean-/Stash-/Checkout-Aktion, kein `git add .`, kein Commit/Push (weiterhin offen —
  Nutzerentscheidung).
- `features/ai/components/AiCoachCard.tsx` (Aufrufer von `analyse.importantHints`) bewusst nicht geändert —
  siehe Kontext oben zu den Deklinations-Platzhaltern.

### Next recommended step
1. Diff review durch den Nutzer (`git diff i18n/`), danach Commit/Push nach Freigabe.
2. Optional: gezielte Geräte-Stichprobe für lange FR/IT/EN-Strings in engen UI-Elementen (Buttons, Chips),
   da diese Phase reine Text-/Test-QA war, keine visuelle Geräte-Verifikation.
3. Bei Bedarf weitere manuelle Stichproben gegen `de.ts` für Domains, die in dieser Phase nicht im Fokus
   der automatisierten Muster lagen (semantische Fehlübersetzungen ohne Garbage-Signatur, siehe „Known
   issues").

### Relevant files
- Geändert (uncommitted): `i18n/locales/fr.ts`, `i18n/locales/it.ts`, `i18n/locales/en.ts`,
  `i18n/gsw-CH.ts`, `i18n/locales/gsw.ts`, `i18n/__tests__/localization-consistency.test.ts`.
- Referenz/Runtime (unverändert): `i18n/locales/de.ts`, `i18n/de-CH.ts`, `i18n/config.ts`, `i18n/index.ts`,
  `i18n/format.ts`, `features/tracking/hooks/useTrackVoiceGuidance.ts`, `app/track/legen.tsx`,
  `features/ai/components/AiCoachCard.tsx`.

### Open questions
- Soll `analyse.importantHints` langfristig auf eine echte i18next-Pluralform (`_one`/`_other` Keys)
  umgestellt werden, statt der DE-spezifischen Suffix-Platzhalter? Das wäre eine i18n-Architekturänderung
  und damit ausserhalb dieser Phase — Nutzerentscheidung nötig.
- Soll die stichprobenartige semantische Prüfung (siehe „Known issues") in einer eigenen Folge-Phase auf
  alle 1.684 Werte je Sprache ausgeweitet werden, oder reicht der jetzige automatisierte Garbage-/Leak-Scan?

## Current task
**Session 2026-08-18 (Codex):** Fährten-Voice-Guidance Diagnose Phase 2 — ausschließlich DEV-only
Ketten-Diagnose + Replay-Tests, uncommitted. Keine Threshold-/Speech-Architektur-Änderung, kein Commit/Push/OTA/
Production-Vorgang. Die reale Feldursache ist noch offen: Die neue Diagnostik muss beim nächsten Lauf den Pfad
Auto-Kandidat → Marker → Search-Snapshot → Guidance/Suppression belegen.

**Session 2026-08-17 (Codex):** **T-60 Health Phase 2** — Staging-Migration + RLS/CRUD-Smoketest PASS auf
`cbhrxkjclakzlvajyvfn`; iOS- und Android-Dev-Clients sind lokal Staging-gebunden, die manuelle NEWBIE/Premium-QA
ist aber weiterhin OPEN. Android ADB/Emulator ist nun verfügbar. Ein früherer lokaler Android-Login war ein
gespeicherter Production-Account; er wurde abgemeldet, und es wurden keine Production-Daten geschrieben. Kein
Commit, Push, OTA oder Production-DB-Vorgang.

> **Repository-Zustand > Handoff.** Zwei Subscription-Commits sind seit dem letzten Handoff (`fddd1f1`) auf dem
> Branch, in der vorherigen Session **nicht** erstellt und **noch nicht gepusht** — nur als Repo-Zustand dokumentiert:
> `c210008 feat(subscription): add 3-day ACTIVE trial funnel` und `adfc3b5 fix(subscription): allow 2 NEWBIE trainings per month`.
> **Neu in dieser Session:** `0e7aaba fix(trainer): keep connect sheet above keyboard`, ebenfalls ungepusht.

## Goal
Health Phase 2 mit einem Staging-fähigen iOS- und Android-Testzugang manuell abnehmen. NEWBIE-Basiswerte
müssen sichtbar und bearbeitbar bleiben; nur Verlauf/Planung werden per Capability gegatet.

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
- **T-60 Health Phase 2 (uncommitted, local only):** `app/dog-health/[id].tsx` erfasst Gewicht mit lokalem
  Messdatum und optionale letzte Entwurmung/Präparat. `dogs.weightHistory` zeigt Premium-Nutzern eine
  Gewichtstrendlinie inkl. Veränderung; `dogs.dewormingSchedule` zeigt Verlauf und erlaubt ein freiwillig
  gesetztes nächstes Datum. NEWBIE bleibt im Health-Screen; `PremiumInlineUpsell` sperrt nur die
  weiterführenden Bereiche. `services/dogHub.ts` enthält die additiven Read/Write-Zugriffe.
- **Lokale Migration:** `supabase/migrations/20260817190000_dog_deworming_entries.sql` legt ausschließlich
  `dog_deworming_entries` an. Nach Staging-Review wurde sie auf **ANYVO Staging `cbhrxkjclakzlvajyvfn`**
  direkt und isoliert ausgeführt (kein `db push`) und nur Version `20260817190000` als applied markiert.
  `owner_id → auth.users` und `dog_id → public.dogs` sind jeweils ON DELETE CASCADE; kein festes medizinisches
  Intervall. Vier RLS-Policies verlangen bei jeder Operation auth.uid als owner **und** einen eigenen Hund;
  kein verbundenen-Trainer-Read-Bypass.
- **Staging CRUD/RLS Smoke PASS:** `supabase/staging_health_phase2_smoke.sql` erzeugte temporär einen
  Owner-Hund/Entwurmungseintrag, bestätigte Owner CREATE/READ/UPDATE/DELETE sowie fremd SELECT/UPDATE/DELETE =
   0 und INSERT = RLS denied. Danach: `remaining_smoke_rows=0`, `remaining_smoke_dogs=0`.
- **Android-Runtime-Vorbereitung:** Debug-Development-Client mit Staging-Bundle auf dem Galaxy-S23-Emulator
  installiert; Metro-Port 8083 und Staging-Ref verifiziert. Zwei temporäre, bestätigte Staging-Fixtures
  (NEWBIE/Premium, je ein Hund) wurden angelegt. Der anfänglich erhaltene Production-Login wurde im Profil explizit
  abgemeldet. Schreibversuche gegen den fremden Fixture-Hund wurden nicht gespeichert (RLS); keine
  Production-Schreiboperation wurde ausgeführt.
- **Voice-Guidance Diagnose Phase 2 (uncommitted):** `useTrackRecorder` protokolliert für jeden bewerteten
  Auto-Winkel-Kandidaten (DEV-only, ohne Koordinaten/PII) Accuracy, Schenkel, Geradheit, Confidence, Ergebnis
  und bei Marker-Erzeugung ID/arcM. `run.tsx` protokolliert den eingefrorenen Search-Snapshot. Die Voice-Guidance
  protokolliert Kandidat, Vorausdistanz, Cooldown, Auswahl, Suppression und den Aufruf von `Speech.speak`.
- **T-59 deployed `b1a8269`:** post-load dogId-Fallback in `app/unit/{start,document}.tsx`, sichtbarer Ein-Hund-Chip,
  0-Hund-Add-Dog-State und 2 neue Tests. Checks: 2 neue Suites / 6 Tests PASS, Training-Tab 6/6 PASS, `tsc` PASS,
  Diff-Check PASS, iOS-/Android-OTA-Bundles PASS. OTA Runtime 1.0.1 / `production`: iOS
  `01a010dc-746e-76bb-ac7a-9427bba498be`, Android `01a010e1-1298-7591-97fd-0f7a7a2ceb5e`; auf origin gepusht.
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
- **T-60:** `npx tsc --noEmit --skipLibCheck` PASS; fokussierte Jest-Suites **6 / 53 PASS** (Health-Helper,
  Health-Capabilities, Capability-Screen-Gate, i18n, lokale Migration, Keyboard-Form); ESLint der berührten
  Dateien PASS; `git diff --check` inkl. neuer Dateien PASS. Der vollständige `npx tsc --noEmit`-Lauf
   überschritt in dieser Session 5 Minuten ohne Diagnose. Kein Real-Device-Test.
- **Android Runtime:** Staging-Metro/Development-Client startet und der Health-Editor rendert. Vollständige
  NEWBIE-/Premium-Abnahme ist **nicht** bestanden: die Emulator-Eingabe hatte zunächst gespeicherte
  Production-Autofill-Daten übernommen; nach Logout war die Fixture-Anmeldung noch nicht zuverlässig abgeschlossen.
- **Voice-Diagnose:** 4 fokussierte Suites / **69 Tests PASS** (`voiceGuidanceDiagnostics`, Pipeline,
  Auto-Corner, Diagnostics); `npx tsc --noEmit --skipLibCheck` und `git diff --check` PASS. ESLint: 0 Errors;
  bestehende Warnings in `run.tsx` sowie die vorbestehende defensive `require('expo-speech')`-Warning bleiben.
- **T-60 Staging:** Migration-Datei-Check PASS; Remote-Schema/FKs/RLS/Policies read-only verifiziert; isolierter
  CRUD/RLS-Smoke **8 / 8 PASS**. Migration-History danach: nur vorherige Staging-Version `20260808120000` plus
  `20260817190000`; andere Pending-Migrationen blieben unangetastet.
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
- **T-60 Runtime-QA OPEN:** Lokaler iOS-Development-Client ist installiert. Er wurde mit `EXPO_NO_DOTENV=1`
  und expliziten Staging-Variablen gebaut; Staging-Ref ist sowohl im Export als auch in der Metro-Bundle
  nachgewiesen. Danach wurde ein **neuer** iOS-Simulator erstellt, der nur diesen Client enthält; eine
  Production-Session ist dort nicht vorhanden. Der Dev Launcher wartet aber auf die iOS-Bestätigung zum Öffnen
  des Staging-Servers; ohne UI-Automation kann weder sie noch ein Staging-Login eingegeben werden. Keine Staging-
   Accounts/-Testdaten erzeugt. Android ADB/Emulator ist inzwischen verfügbar; der Development-Client ist Staging-
   gebunden. Der vorige, gespeicherte Production-Login wurde abgemeldet. Die Staging-Fixture-Anmeldung braucht nach
   dem Emulator-Neustart eine saubere ADB-Eingabe ohne abgeschnittene Anfangszeichen. NEWBIE-/Premium-Flows,
   Tastatur, Safe Area, Back und Button-Überlagerungen sind noch nicht manuell bestätigt.
- **Voice-Guidance:** Es gibt noch keine reale DEV-Trace. Replay belegt: realistisch leicht ungerader 90°-Winkel
  wird aktuell erzeugt; ein Fortschrittssprung hinter den virtuellen Hund unterdrückt den Marker bewusst;
  jedes spätere `say()` ruft `Speech.stop()` auf und kann eine Winkelansage ersetzen. Ohne Feldtrace ist die
  häufigste reale Ursache nicht belastbar zwischen fehlendem Marker und Speech-Kollision zu entscheiden.
- **NEWBIE-Quota-Migration `20260816130000` ist auf Production ein No-Op** (training bereits 2). Nicht ausführen,
  außer man will die Definition bewusst idempotent festschreiben — **nur nach ausdrücklicher Freigabe**.
- **Stale Test** `app/track/__tests__/run-arming.test.ts` (`([5, 10] as const).map` vs. `HANDLER_DISTANCES_M`) rot, unabhängig.
- **Web-Bundle** bricht via `react-native-maps` → OTA plattformweise ios/android; kein Mobile-Blocker, **nicht nebenbei fixen**.
- **`freezeProgress` bewusst DEFERRED** — nur Feedback, kein Progress-/Recorder-Freeze.
- Fremder WIP im Tree (inkl. bündelbarer Diff `features/tracking/hooks/useTrackVoiceGuidance.ts`) — **nicht anfassen**.
- **T-59:** Nachbeobachtung auf echten Geräten für Start und direkte Dokumentation mit 0/1/mehreren Hunden sinnvoll;
  die Code-/Regressionstests und beide OTA-Bundles sind grün.

## Important context
- **Health:** Basis-Gesundheit, aktuelles Gewicht und letzte Entwurmung bleiben NEWBIE-frei. Ausschließlich
  `dogs.weightHistory` und `dogs.dewormingSchedule` nutzen `useCapabilities().can(...)`; keine pauschale
  `isPremium`-Sperre oder medizinisch vorgegebene Entwurmungsintervalle.
- **Staging:** Zielprojekt ist ausschließlich `cbhrxkjclakzlvajyvfn`. Die Remote-Migrationsliste hatte weitere
  lokale Pending-Versionen, daher **nie `supabase db push`** verwenden. T-60 wurde bewusst via einzelner
   `db query --file` + einzelner `migration repair --status applied 20260817190000` ausgeführt.
- **Android Runtime:** ADB liegt unter `$HOME/Library/Android/sdk/platform-tools/adb`; der aktive Emulator ist
  `emulator-5554` (Galaxy-S23-AVD). Die sichtbaren Screenshots sind auf 920×2000 skaliert, während ADB-Taps auf
  1080×2340 erfolgen. Für präzise Touch-Bounds kann `adb exec-out uiautomator dump /dev/tty` genutzt werden.
  Gboard-Autofill darf keine Production-Credentials übernehmen; Production-Account vor jeder Prüfung abmelden.
- **iOS Dev Runtime:** `lib/supabase.ts` erhält den Zielendpunkt aus statischen `EXPO_PUBLIC_*`-Referenzen.
  Für Staging deshalb immer `EXPO_NO_DOTENV=1` plus explizite Staging-Variablen verwenden; die Production-`.env`
  darf niemals von Metro geladen werden. Der lokale Build benötigte nur `SENTRY_DISABLE_AUTO_UPLOAD=true`,
  um den Debug-Symbolupload ohne Sentry-Org zu überspringen; keine Source-/Native-Änderung.
- **NICHT erneut bauen:** zweite Track-Sync-Queue · zweite Off-Track-State-Machine · zweite Winkel-Erkennung ·
  separater Run-Sync-Stack · Search-Points zusätzlich remote in `track_points` replizieren (kanonisch ist
  `track_runs.run_points`).
- Architektur: **SQLite = durable local truth**, **Sync-Queue = einziger Remote-Transport** nach lokaler Finalisierung,
  **clientUuid = `training_sessions.id`**, **runUuid = `track_runs.id`**, Remote-Sync **idempotent** (Upsert onConflict:id +
  Replace-by-session), **Remote ist NIE die Save-Erfolgsschwelle**, Navigation wartet nicht auf Remote-Sync.
- `AGENTS.md` + `docs/agent/*` sind die gemeinsame Wahrheit (Handoff Claude Code ↔ Codex).

## Do not touch
- **T-60-Migration nicht erneut oder auf Production anwenden** und keine Health-OTA veröffentlichen ohne
  ausdrückliche Freigabe.
- **Keine Production-Schemaänderung:** T-60 ist nur auf Staging; weder auf `axkkhyqrjrtbkumaulta` anwenden noch
  eine OTA, einen Build, Commit oder Push ausführen.
- Der gesamte vorbestehende fremde WIP (Produkt-/Tracking-/i18n-WIP, SQL-Dumps, Artefakte, Screenshots, `dist-*`,
  Workspaces, ZIPs, `.opencode/`) — inkl. `features/tracking/hooks/useTrackVoiceGuidance.ts`.
- **T-57 ist committed:** `app/trainer/index.tsx` in `0e7aaba`; nicht ohne neuen, klar abgegrenzten Auftrag verändern.
- **T-59 ist committed/deployed:** `b1a8269` enthält ausschließlich `app/unit/{start,document}.tsx` und
  `app/unit/__tests__/{start,document}.test.tsx`; nicht ohne neuen, klar abgegrenzten Auftrag verändern.
- **Keine Production-DB-Schreiboperation** (NEWBIE-Quota-Migration inkl.) ohne ausdrückliche Freigabe.
- Keine pauschalen Git-Aktionen (`git add .`, reset, clean, checkout fremder Dateien); kein Push/Build/OTA/Store-Submit ohne Freigabe.
- Den AUTO-GENERATED-Block nie händisch editieren (nur via `agent:handoff`).

## Next recommended step
1. **Voice-Guidance:** DEV-Build/realen Fährtenlauf durchführen und die neuen `[trackDiag:angle]`,
   `[trackDiag:snapshot]` und `[trackDiag:voice]`-Zeilen sichern. Erst danach den minimalen fachlichen Fix
   freigeben: fehlender Marker → Erkennung; vorhandener aber unterdrückter Marker → konkrete Suppression bzw.
   priorisierte Speech-Ausgabe. Keine Threshold-Änderung auf Verdacht.
2. **T-60:** Android zunächst mit einer sauber bestätigten Staging-NEWBIE-Fixture anmelden (vorher ggf. Emulator-
   App-Session prüfen/abmelden), dann den vollständigen NEWBIE-/Premium-Flow testen. Für iOS eine erlaubte
   UI-Automationsmöglichkeit oder interaktive Bedienung bereitstellen; der frische Simulator und der Staging-
   Dev-Client stehen bereit. Danach NEWBIE/Premium manuell
   abnehmen (Messdatum, Trend, Entwurmung, freiwillig gesetztes nächstes Datum, Upgrade/Downgrade,
   Tastatur, Safe Area, Back, keine Überlagerungen). Erst danach Release-/Production-Entscheidung einholen.
   Temporäre Staging-Fixtures danach löschen.
3. **NEWBIE-Quota:** Entscheidung des Nutzers einholen — da Production bereits training=2 liefert, ist die Migration
   **nicht nötig**; optionales idempotentes Festschreiben nur nach Freigabe. `20260808120000` (→1) **nicht** anwenden.
4. **T-59:** Ein-Hund-Start und direkte Dokumentation auf echten Geräten mit 0/1/mehreren Hunden nachbeobachten.
5. **T-56 Real-Device-Test** Confidence-/Render-Fix auf echten Geräten (iOS **und** Android): solide Mint-Fährte,
   Auto-Winkel (90°/Spitz L+R) sichtbar + Voice/Haptik, Schlangenlinie → 0 Winkel, 1/5/10-m-Stichprobe, kurzer Off-Track.
2. Bei Feldbeleg zur Auto-Erkennung optional die vorbereitete **DEV-Diagnostik** (`angleDiagnostics.ts`) für **eine**
   Fährte aktivieren (accept/pending/reject + Confidence + Accuracy) — danach wieder entfernen.
3. **T-24 Store/Release-Monitoring** (OTA-Zustellung realer Geräte) · **T-22 Website deployen** · **T-21 Dirty-Tree/
   Release-Branch-Strategie** (fremder WIP unangetastet).

## Relevant files (diese Session 2026-08-17)
- **T-60 Health:** `app/dog-health/[id].tsx`, `services/dogHub.ts`, `features/dogs/health.ts`,
  `components/analytics/TrendLine.tsx`, `components/subscription/PremiumInlineUpsell.tsx`,
  `supabase/migrations/20260817190000_dog_deworming_entries.sql`,
  `supabase/staging_health_phase2_smoke.sql`,
  `features/dogs/__tests__/health.test.ts`, `i18n/__tests__/health-i18n.test.ts`,
  `supabase/migrations/__tests__/dog-deworming-entries.test.ts`.
- **T-59 (deployed `b1a8269`):** `app/unit/{start,document}.tsx`, `app/unit/__tests__/{start,document}.test.tsx`.
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
- **T-60:** Welcher Staging-fähige iOS-/Android-Build und welche NEWBIE-/Premium-Testzugänge stehen für die
  verbleibende manuelle Runtime-Abnahme bereit?
- NEWBIE-Quota: Will der Nutzer die No-Op-Migration trotzdem idempotent festschreiben, oder Production so belassen (empfohlen)?
- Justieren einzelne Feld-Fährten die Confidence-Gewichte/Schwellen? Nur mit Regressionstests + Feldbeleg.
- Wann/ob der Web-Bundle-Bruch (`react-native-maps`) separat behoben wird (kein Mobile-Blocker).

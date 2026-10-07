# ANYVO Master Status

**Purpose:**
Canonical source of truth for current ANYVO product, engineering, release and
open-work status.

**Last verified:** 2026-10-07 · fresh EAS query: iOS Runtime 1.0.3 → `968884f` (group `455dc249…`, unchanged), iOS Runtime 1.0.4 → `fd0c727` (group `79175057…`), Android Runtime 1.0.3 → `68b23f1` (group `917f8312…`, unchanged).

## Rules

- Claude, Codex and other agents read this file before substantial work.
- Old task documents (`docs/agent/tasks/*`) are historical detail sources,
  but **not** the current status truth.
- Branch names alone do not determine the Production state.
- Change a status only when a task was actually **verified**.
- Never mark a task as done only because code exists.
- Treat Production release, commit, push, OTA, build and store release as
  **separate** steps. One does not imply another.
- The existing rule still applies: `Repository state > Git state > Handoff
  documentation > Agent assumptions`. This file records product/release status;
  for technical facts the repository wins.

## How this file relates to the other agent documents

| Document | Role |
|---|---|
| `docs/agent/ANYVO_MASTER_STATUS.md` (this file) | Current production baseline, completed / active / open work. **The only operative master list.** |
| `docs/agent/TASKS.md` | Ledger of task IDs and the next free TASK-ID. Do **not** allocate IDs here. Its status sections are historical (last updated 2026-08-17). |
| `docs/agent/CURRENT_STATE.md` | Long-lived technical state notes. Last updated 2026-08-17; do not read it as the current release state. |
| `docs/agent/SESSION_HANDOFF.md`, `WORK_LOG.md`, `DECISIONS.md`, `WORKTREES.md`, `README.md` | Handoff mechanics, chronology, decisions, parallel-work rules. Unchanged. |
| `docs/agent/tasks/*` | Technical detail reports, root-cause analyses, test records, historical implementation notes. They must **not** automatically overwrite this master list. |

Example: this file says "V6.2 F1 field test open"; the task documents hold the
full GPS / motion / corner diagnostics behind it.

---

## Canonical Git line (binding since 2026-10-06)

- **`main` is the canonical ANYVO Production/Release line.** It was fast-forwarded on
  2026-10-06 from `e90df20` to `54a74c4` (`release/ios-production-native-next`): no merge
  commit, no rebase, no rewritten SHAs — Build 49 (`3f7c2e7`) and OTA 1.0.4 (`04cad8d`)
  are contained unchanged.
- New Production/Release branches **must branch off `main`**.
- After a successful device/release test, legitimate changes are integrated back into
  `main` (fast-forward or reviewed merge; no history rewrite of built/published commits).
- Feature branches must not permanently replace `main` as the de-facto Production line.
- The EAS branch/channel `production` is **not** the same thing as Git `main`. EAS stays the
  binding source for what is live; `main` is the binding source for code and release tooling.
- OTA/release tooling on `main` (`scripts/update-production.mjs`) is the source of truth.
- `feat/track-module-rewrite` is **not** canonical (despite older wording in `WORKTREES.md`
  up to 2026-08-18). It diverged on 2026-08-18 (`3de67c0`): 30 own commits that are not in
  Production (i18n quality fixes, heat calendar, command cards, obedience cone exercise,
  CTA/button polish, docs) and it lacks 154+ newer Production commits. These 30 commits are
  **not** integrated automatically — separate audit/integration task.
- Android parity work continues from `main` or a branch explicitly based on it. Old
  worktrees are never automatically a release source of truth.
- A future **1.0.3 hotfix branch must contain the runtime-aware guard** (`23e5df6` + `54a74c4`);
  branches of the old 1.0.3 line (e.g. `968884f`) still carry the old guard.

## Local integration candidates (verified locally 2026-10-07; NOT in `main`)

These commits exist on their named local branches and in clean worktrees. None is
an ancestor of `main`; no local remote-tracking ref contains them. This is a Git
inventory, **not** a Production release or a decision to integrate them.

| Phase | Branch | Commit | Base / dependency |
|---|---|---|---|
| 1 | `feat/integrate-accuracy-aware-search` | `4b11825` | parent `e30297a` |
| 2 | `fix/tracking-distance-scale-visible` | `d3037b1` | parent `4b11825`; requires Phase 1 |
| 4 | `fix/integrate-heat-schema-restore` | `d00b8f1` | parent `e30297a` |
| 6 | `chore/integrate-track-module-repo-hygiene` | `9ba2ec3` | parent `e30297a` |

Pending decisions from the production audit, preserved for the Codex handoff:

- **Phase 3: HARD STOP.** No commit; explicit continuity semantics are missing.
- **Phase 5:** No missing Android code was identified in that audit; Android still
  needs a native build and a new `versionCode` before release. Reverify before action.
- **Phase 6:** 16 older commits from `feat/track-module-rewrite` still need manual
  review. The branch has 30 commits not in `main` by Git ancestry; do not equate
  that raw count with the 16-item audit list or integrate automatically.

---

## Source of truth for the LIVE Production state

**EAS is the only binding source for what is live right now.** This file is a
documented snapshot. It must **never** be used on its own as a release source
(neither for "what is in Production" nor as the base for a Production OTA).

Before every Production OTA, read EAS fresh
(`eas update:list --branch production --json` + `eas update:view <group> --json`).
The wrapper `scripts/update-production.mjs` enforces this: shared release lock,
fresh EAS read, ancestry guard, second EAS check directly before `eas update`,
post-publish verification (see `docs/DEVELOPMENT_WORKFLOW.md` §8).

## Current Production Baseline

Snapshot as of 2026-10-06 — verify against EAS before relying on it. Two iOS runtimes are
live in parallel on the EAS branch `production`; each runtime only receives its own OTAs.

### iOS Runtime 1.0.3 (Store build 1.0.3 (48)) — unchanged

| Item | Value |
|---|---|
| Version / iOS Build / Runtime | 1.0.3 / 48 / 1.0.3 |
| Production HEAD (iOS, runtime 1.0.3) | `968884f712544f45b35ebf8900ab64332b45ff7d` (`feat(tracking): add dog colors to track overlays`) |
| Update Group / iOS update ID | `455dc249-fb4f-4868-a646-67d88c1ae7cb` / `01a10cd3-9696-7554-976d-442010037a09` |
| Published | 2026-10-05 16:09:15 UTC |
| EAS verification | **PASS** 2026-10-06 — newest runtime-1.0.3 group, iOS only, gitCommitHash `968884f` |

Contains, on top of `34e6185`: open-track continuation/recovery fixes, resting background
UX, hold-to-abort, Live Activity V2 JS (V1 fallback on 1.0.3 binaries), Multi-Dog track
overlays (`c904955`) and per-dog overlay colors (`968884f`).

### iOS Runtime 1.0.4 (Build 1.0.4 (49))

| Item | Value |
|---|---|
| Native build | EAS build `994f04ba-0e1e-4cba-9888-79059a225213` from `3f7c2e746fd064d1b103aa67f926c514a52eed44` — **Build SUCCESS** (store, `com.anyvo.app`, channel `production`) |
| App Store Connect | Upload **SUCCESS** (submission `02ea21d2-1804-4dcd-97a0-7b5c42dc7a92`) — **not yet released in the App Store** |
| Native content | Live Activity V2 + Dynamic Island (multi-dog resting activities), quick-start widget, App Intents / App Shortcuts (de/fr/it), prebuild idempotency hardening, version/runtime contract 1.0.4 |
| OTA (iOS only, runtime 1.0.4) | `04cad8da58c7b86ee0b808d0e01964e3341cca2a` — adaptive track distance scale, live distance, distance to next article |
| Update Group / iOS update ID | `fcd879d9-b307-4cac-87e8-2a90f3d7f727` / `01a1114f-b484-724d-864f-87cebe27f239` (published 2026-10-06 13:03:18 UTC via guard) |
| Device verification | **PASS** (owner, 1.0.4 (49) + OTA): quick-start widget, Live Activity V2, Dynamic Island, track distance scale |
| OTA (iOS only, runtime 1.0.4) — **current since 2026-10-07** | `fd0c727a4d252e531dc95ad9592040265cf12418` — background lay hotfix: lay recording keeps processing/persisting with screen off (`b6bc114` diagnostics, `43ab3a9` session-scoped lay processor, `fd0c727` background lay fixes by session); supersedes `04cad8d` (contains it) |
| Update Group / iOS update ID (current) | `79175057-4da7-4314-bf7f-ae7f0ccd738b` / `01a115cd-3e88-7611-b4bd-8321716cba59` (published 2026-10-07 via guard, baseline `fcd879d9…` ancestry PASS) |
| Background screen-off device QA | **PASS** (owner-reported, pre-integration on hotfix build; screen off / pocket). Post-OTA smoke test on Build 49: pending |

### Production OTA guard (on `main`)

- Runtime isolation **PASS** (`23e5df6`): baseline = newest group with exactly platform + runtime; fail closed otherwise.
- Initial runtime hardening **PASS** (`54a74c4`): `--initial-runtime-release` only with `--confirm`, only without an existing group for that runtime, same-platform fallback baseline, "FIRST OTA FOR RUNTIME" block, post-publish runtime mapping check.
- **103/103** guard tests PASS; real dry-runs 1.0.3 (baseline `968884f`) and 1.0.4 (baseline `04cad8d`) PASS.

Android is unchanged and **not** part of this baseline (parity analysis separate).

### Historical snapshot 2026-10-04 (superseded by the tables above)

| Item | Value |
|---|---|
| App | ANYVO |
| Version | 1.0.3 |
| iOS Build | 48 |
| Runtime | 1.0.3 (`runtimeVersion.policy = appVersion`) |
| Channel / Environment / Platform | `production` / `production` / iOS only |
| Release branch of this state | `release/customer-track-diagnosis-1.0.3` |
| Production HEAD (iOS) | `34e618519b2da670fc5e7efd4ec43e08afc4ed53` |
| iOS OTA (update ID) | `01a10749-4051-7700-be7d-4495600d6544` |
| Update Group | `e3be2717-5f31-4a22-ba23-ed370566c2eb` |
| OTA message | `feat(tracking): add customer track diagnosis and sharing` |
| Published | 2026-10-04 14:20:03 UTC |
| EAS verification | **PASS** — fresh EAS query: newest group on `production`, iOS only, runtime 1.0.3, gitCommitHash = HEAD |
| Device verification | not yet documented for `34e6185` (last device PASS: `b780603`, 2026-10-03) |

Commit chain (oldest → newest, linear, all contained in the Production HEAD):

| Commit | Content |
|---|---|
| `8c77f7d` | Tracking V6.2 (corner recovery, end confirmation) |
| `15c9f46` | Global ANYVO-A quick action (cherry-pick of `997115f`) |
| `716e2d4` | Restore NEWBIE membership state (`8dcce2b`) |
| `962e7c8` | Restore NEWBIE backpack limit (`25ffd82`) |
| `b780603` | Restore customer update experience (`0bac025`) — previous verified baseline |
| `8ada75c` | V6.2.1 sharpness consensus |
| `3ae505c` | Search fix accuracy in QA export |
| `0b24e7d` | "Neu in ANYVO": tracking improvements |
| `1f6d7dc` | Customer support diagnostics |
| `94dd576` | Resilient track recovery |
| `34b4b4c` | Search lifecycle recovery |
| `1d9b0d2` | Customer track diagnosis + reliable sharing |
| `34e6185` | Customer track diagnosis i18n (DE/GSW/EN/FR/IT) |

**Not in Production:** Multi-Dog Track Overlays (`78322cfe65a3d5a95bf59edc33b651a896f6c9f8`,
branch `feat/multi-dog-track-overlays-1.0.3`) — not device/field tested.
*(Superseded 2026-10-05: Multi-Dog overlays reached Production via `c904955`, contained in `968884f`.)*

Android is **not** part of this baseline. No Android OTA, build or store release
belongs to the state above.

## CRITICAL RELEASE RULE (still binding)

**Never publish a Production OTA from an isolated feature branch that does not
contain the complete current Production baseline.**

A Production OTA is a complete JS/assets bundle, not a delta over previously
published feature branches. Whatever the publishing branch lacks is rolled back
for every user on that runtime.
(Verified incident: OTAs from the tracking line silently reverted the ANYVO-A
button, the NEWBIE membership/backpack state and the update experience until the
Production-Continuity restore.)

Before any Production OTA, additionally follow the mandatory rules in
`AGENTS.md` ("ANYVO Production OTA") and use the wrapper
`npm run update:production:ios -- --message "<message>"`
(`scripts/update-production.mjs`).

---

## ✅ Erledigt

Items that predate 2026-10-02 (Website, Digital Health Record) are taken from the
project owner's status and were not re-verified when this file was created.
Evidence for the rest is the commit chain above and the task reports.

### iOS 1.0.4 (Build 49) — device PASS, not yet store-released
- native Build SUCCESS, App Store Connect Upload SUCCESS
- Schnellstart-Widget PASS
- Live Activity V2 PASS
- Dynamic Island PASS
- Fährten-Maßstab (OTA 1.0.4, `04cad8d`) PASS

### Release Tooling
- `main` als kanonische Production-/Release-Linie (Fast-Forward auf `54a74c4`)
- Production-OTA-Guard runtime-isoliert + Initial-Runtime-Hardening, 103/103 Tests PASS

### Tracking V6.2
- Golden `gps_split_apex` erhalten
- `turn_episode_pair` Recovery implementiert
- keine IMU-only Turn Creation
- Sharpness bleibt geometry-only
- stationary End-Fixes korrigiert
- `low_confidence` / `stale_fix` / `gps_outlier` für Endbestätigung blockiert
- Duplicate End-Fixes dedupliziert
- Regressionen bestanden
- V6.2 ist Bestandteil des Production-Continuity-Standes

### OTA / Diagnose
- Build & OTA Diagnose vorhanden
- App-Version / Build / Runtime / Channel sichtbar
- laufende OTA Update ID sichtbar
- Git Commit Injection vorhanden
- Emergency-Fallback-Anzeige vorhanden
- aktuelle iOS Production OTA auf realem iPhone verifiziert

### Background Lay Screen-Off Fix (2026-10-07)
- Background-Task verarbeitet Lay-Fixes über denselben session-scoped Processor (ohne Screen/Handler)
- eindeutige Session-Bindung (fail closed), Dedup, Serialisierung, awaited Persistenz, Finalize-Race
- Device QA Screen-Off / Hosentasche PASS (Owner); main `fd0c727`; Full Suite 333/4122 PASS
- Production OTA iOS Runtime 1.0.4 `79175057…` — Runtime 1.0.3 und Android unverändert

### Production Continuity
- 24 bekannte Runtime-1.0.3 Production-Stände auditiert
- keine bekannte verlorene Runtime-Funktion mehr
- gemeinsamer Continuity-Stand hergestellt

### UI
- globaler ANYVO-A Schnellbutton wiederhergestellt

### NEWBIE Membership
- 1 Hund
- 2 Trainings / Monat
- 1 Fährte / Monat
- Trainingsjournal
- Trainer-Verbindung
- allgemeine Gesundheitsdaten
- Backpack
- Kommandoerfassung bis 5

### Backpack
- NEWBIE max. 2 Einträge pro Hund
- ACTIVE/Lifetime nicht entsprechend limitiert

### Update Experience
- Neu-in-ANYVO Experience
- einmal pro Release-ID
- Store Check max. täglich
- „Später“ = 7 Tage
- Netzwerkfehler still
- Version/Build im Profil

### Website
- anyvo.app live
- Apple-Link aktiv
- Play Store als „Bald verfügbar“
- Fährtenbild korrekt dargestellt

### Digital Health Record
- Phase 1–3B technisch umgesetzt
- Owner / unrelated user / Trainer / Vet Zugriff validiert

---

## 🟡 In Arbeit

### Tracking Feldverifikation

1. **V6.2 F1:** R → L, ca. 10 Schritte pro Schenkel, keine Gegenstände.
   Prüfen:
   - beide echten Richtungswechsel
   - keine Phantomwinkel
   - blaue Suchlinie
   - automatisches Ende
   - End-Hysterese
2. **V6.2 F2:** SR → SL → R → L.
   Hauptziel: alle echten Richtungswechsel ohne Phantomwinkel.
   Sharpness darf `unresolved` bleiben, wenn die GPS-Geometrie sie nicht
   belastbar hergibt.

### Release Engineering
- ✅ kanonische Production-/Release-Linie definiert: `main` (2026-10-06, siehe oben)
- ✅ race-sicherer, runtime-isolierter Production-OTA-Wrapper auf `main` (`23e5df6`, `54a74c4`)
- `main` ist lokal integriert, **noch nicht gepusht** (Push nur mit Freigabe)
- iOS 1.0.4 (49): App-Store-Release offen (Freigabeentscheidung)
- Audit/Integration der 30 nicht-produktiven Commits von `feat/track-module-rewrite`
- Grenze: Lock serialisiert nur lokale Worktrees; volle Cross-Machine-Serialisierung
  bräuchte einen zentralen Release-Runner/CI mit globaler Concurrency-Control

---

## 🔴 Offen

### Android
- erneute Google-Play-Ablehnung vollständig analysieren
- Android Production-Stand danach separat prüfen
- Paritätsarbeit nur von `main` bzw. einem explizit darauf basierenden Branch weiterführen
  (Android Production 1.0.3 (44) stammt aus `5a0610b` + uncommitteten Änderungen im Worktree
  `anyvo-android-parity-1.0.3`; dieser Stand muss vor jeder Android-OTA in den Zielstand)

### Tracking / Training
- Schrittlängen-Kalibrierung
- Wetter beim Training speichern
- eigene Übung anlegen
- eigene Sparte hinzufügen
- Obedience: Kegelgruppe umrunden

### Medien
- MP4/MOV Video Upload

### Dokumente
- Mehrfach-Upload / Constraint

### Engineering
- Ordner-/Dateistruktur Audit und Bereinigung
- Dependency-/Security-Audit separat
- Production-Release-Branch-Strategie: `main` kanonisch (erledigt); Folgeregeln für Hotfix-Branches pro Runtime dokumentiert

### Gesture UX
- bestehenden Pilot bewerten
- breiten Rollout entscheiden

### Health
- finaler Product-/UX-Rollout der Gesundheitsakte

### Marketing
- ANYVO Knows Kampagne
- Social/Reels/Cover
- NEWBIE + Fährten-Downloads steigern
- Partner-Follow-ups Goodstuff / Epona / Fleischeslust

### Produkt / Monetarisierung
- Kooperation/Werbung vs. Abo weiter bewerten
- regionale Preise
- Mehrwert für Nutzer ohne Fährtenarbeit ausbauen

---

## 🔵 Später

- Health Erinnerungen
- lokale Notifications
- optionale Kalenderintegration
- erweiterte Tracking-Statistiken
- weitere Sensor-/Kalibrieroptimierung nach Feldtests
- app-weite Gesture UX
- Trainer Connect Ausbau
- größere In-App Events / Marketing-Kampagnen
- Retention-Funktionen für Alltag und Health
- Produkt-/Retention-/Conversion Analytics

---

## Not currently classified as bugs

### F2 sharpness `unresolved`
Kein bestätigter Softwarefehler.

Wenn GPS die Schärfe bei schlechter Geometrie nicht zuverlässig bestimmen kann,
ist „unresolved“ korrekt. Die Richtung darf erkannt werden, ohne Sharpness zu
erfinden. (Detail: Root-Cause-Analyse V6.2, F2 Apex 21: Beinahe-Umkehr, nur ein
gültiges After-Fenster, GPS-Accuracy ≈ Schenkellänge.)

### Startup des letzten F1
Kein belegter Fehler.

Die Daten zeigen, dass relevante Gehbewegung erst nach dem Fallback begann.
Keine Schwellenänderung ohne neue Feldbelege.

---

## Status change log

| Date | Change | Evidence |
|---|---|---|
| 2026-10-03 | Master status created. Production baseline set to `b780603`; iOS OTA `01a10074…` device-verified (PASS). | OTA group `ae879d82…`; commit chain above; owner device verification |
| 2026-10-06 | `main` defined as canonical Production/Release line (fast-forward `e90df20` → `54a74c4`, no merge commit). iOS 1.0.4 (49) built + uploaded (not store-released); device PASS widget / Live Activity V2 / Dynamic Island / distance scale; OTA 1.0.4 `fcd879d9` (`04cad8d`). Runtime 1.0.3 unchanged on `968884f`. Guard runtime isolation + initial-runtime hardening (103/103). | Fresh EAS queries of groups `455dc249…` and `fcd879d9…`; EAS build `994f04ba…`; submission `02ea21d2…`; owner device test |
| 2026-10-07 | Background lay screen-off hotfix integrated into `main` by fast-forward `8f0a497` → `fd0c727` (pushed). iOS-only Production OTA runtime 1.0.4: group `79175057-4da7-4314-bf7f-ae7f0ccd738b`, iOS update `01a115cd-3e88-7611-b4bd-8321716cba59`, commit `fd0c727`. Runtime 1.0.3 (iOS `455dc249…`) and Android (`917f8312…`) unchanged. Device QA screen-off PASS (owner, pre-integration). | Guard dry-run + publish + post-check PASS; fresh EAS queries before/after publish; Full Suite 333/333 · 4122/4122 on `main` |
| 2026-10-04 | iOS Production baseline → `34e6185` (customer track diagnosis + i18n on top of `34b4b4c`). Incident: OTA `fce1c140` (base `94dd576`) briefly superseded `34b4b4c`; restored via republish `3492bf85`, then `e3be2717` from a base containing `34b4b4c`. EAS declared the binding live source. | Fresh EAS query of group `e3be2717…` (gitCommitHash `34e6185`, iOS only, runtime 1.0.3) |

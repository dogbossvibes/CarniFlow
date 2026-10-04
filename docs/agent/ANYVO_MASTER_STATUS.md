# ANYVO Master Status

**Purpose:**
Canonical source of truth for current ANYVO product, engineering, release and
open-work status.

**Last verified:** 2026-10-04 · iOS Production `34e6185` per fresh EAS query (update group `e3be2717…`).

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

Snapshot as of 2026-10-04 — verify against EAS before relying on it.

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

Android is **not** part of this baseline. No Android OTA, build or store release
belongs to the state above.

### CRITICAL RELEASE RULE

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
- kanonische Production-/Release-Linie definieren
- keine wechselnden Feature-Branches mehr direkt auf Production
- race-sicherer Production-OTA-Wrapper (Lock im git-common-dir, Ancestry-Guard,
  zweiter EAS-Check) — Branch `chore/production-ota-guard`, lokal, nicht integriert
- Grenze: Lock serialisiert nur lokale Worktrees; volle Cross-Machine-Serialisierung
  bräuchte einen zentralen Release-Runner/CI mit globaler Concurrency-Control

---

## 🔴 Offen

### Android
- erneute Google-Play-Ablehnung vollständig analysieren
- Android Production-Stand danach separat prüfen

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
- Production-Release-Branch-Strategie finalisieren

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
| 2026-10-04 | iOS Production baseline → `34e6185` (customer track diagnosis + i18n on top of `34b4b4c`). Incident: OTA `fce1c140` (base `94dd576`) briefly superseded `34b4b4c`; restored via republish `3492bf85`, then `e3be2717` from a base containing `34b4b4c`. EAS declared the binding live source. | Fresh EAS query of group `e3be2717…` (gitCommitHash `34e6185`, iOS only, runtime 1.0.3) |

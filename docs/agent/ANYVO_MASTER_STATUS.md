# ANYVO Master Status

**Purpose:**
Canonical source of truth for current ANYVO product, engineering, release and
open-work status.

**Last verified:** 2026-10-03 · created from the verified Production-Continuity state.

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

## Current Production Baseline

| Item | Value |
|---|---|
| App | ANYVO |
| Version | 1.0.3 |
| iOS Build | 48 |
| Runtime | 1.0.3 (`runtimeVersion.policy = appVersion`) |
| Channel / Environment / Platform | `production` / `production` / iOS only |
| Canonical current production/integration branch | `fix/production-continuity-1.0.3` |
| Production HEAD | `b780603fe18f723a7f577c6e2bf2126c22a3b69a` |
| Verified iOS OTA (update ID) | `01a10074-223b-76f4-813c-8740a1f402d2` |
| Update Group | `ae879d82-e274-4adf-85e1-f7330f1d4194` |
| OTA message | `fix(production): restore continuity with tracking v6.2` |
| Device verification | **PASS — 2026-10-03** (iPhone, confirmed by the project owner) |

**iOS Production Verification = DONE.** It is not an open item.

Commit chain of the baseline (oldest → newest, all contained in the Production HEAD):

| Commit | Content |
|---|---|
| `8c77f7d` | Tracking V6.2 (corner recovery, end confirmation) |
| `15c9f46` | Global ANYVO-A quick action (cherry-pick of `997115f`) |
| `716e2d4` | Restore NEWBIE membership state (`8dcce2b`) |
| `962e7c8` | Restore NEWBIE backpack limit (`25ffd82`) |
| `b780603` | Restore customer update experience (`0bac025`) |

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

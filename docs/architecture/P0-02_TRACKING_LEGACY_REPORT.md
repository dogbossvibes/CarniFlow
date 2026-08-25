# P0-02 — Tracking Legacy Report

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-26
**Bezug:** [[P0-01_DATABASE_TRUTH_REPORT]]

## P0-FIX-02 — Umsetzungsstatus (2026-07-26)

**CODE LEGACY: teilweise entfernt**
- ✅ **Gelöscht** (Delete-Safety bewiesen: keine Runtime-/dynamischen/Barrel-Imports, keine Tests, keine Config, 0 Treffer in `app/`):
  - `services/trackingService.ts`
  - `hooks/useTrackSessions.ts`
- 🟡 **Bewusst erhalten** (noch aktiv genutzt, KEIN reiner Legacy-DB-Pfad):
  - `types/tracking.ts` — weiterhin importiert von `components/tracking/TrackMap.tsx` (Typ `TrackArticle`) und `lib/trackRecorder.ts` (Typ `TrackPoint`).
  - `lib/trackRecorder.ts` — aktiver BLE-/Positionspuffer, importiert von `features/tracking/utils/positionStream.ts`.
- **Verbleibende Legacy-Erwähnungen im Code (kein DB-Zugriff):** `services/trainingFeed.ts` (nur Kommentar), `features/ai/*` (`'track_articles_focus'` = Insight-String-Key, nicht die Tabelle).
- **Verifikation nach Löschung:** `tsc --noEmit` grün; `jest --runInBand` 322/322; `expo lint` 3 Errors/72 Warnings (alle vorbestehend, unverändert).

**REMOTE DATA LEGACY: weiterhin vorhanden — DO NOT DELETE — MIGRATION NOT YET VERIFIED**
- `track_sessions`: **22 Datensätze** (Stand letzter Read-only-Verifikation, 2026-07-25/26).
- `track_articles`: **4 Datensätze**.
- **NICHT** verändert/gelöscht/migriert. Kein `DROP`/`DELETE`/`TRUNCATE`, keine Migration ausgeführt. Der Tabellen-DROP bleibt bis zur separat verifizierten Datenmigration (siehe „Abschluss") ausdrücklich **offen**.

---

## Zielbild (kanonisch) vs. Legacy

| Aspekt | **Legacy** | **Kanonisch (Ziel)** | Remote-Wahrheit |
|---|---|---|---|
| Session | `track_sessions` (Spalten `distanz_m`, `dauer_sec`, …) | `training_sessions(type='track')` | beide existieren; `track_sessions.distance_meters` = 404 |
| Punkte | `track_points.track_id` + `seq` | `track_points.session_id` + `timestamp` | `track_id` = **404**, `session_id` = 200 |
| Marker/Gegenstände | `track_articles.track_id` | `track_markers.session_id` (+`track_engine_sessions`, `track_runs`) | `track_articles.session_id` = **404**; `track_markers.session_id` = 200 |

➡️ Die **Runtime-Aufnahme** (`features/tracking/services/trackService.ts`) schreibt **ausschließlich kanonisch** (`training_sessions`, `track_points.session_id`, `track_markers`, `track_runs`, `track_engine_sessions`, `track_data.segments`). Verifiziert über `.from(...)`-Aufrufe in `trackService.ts` (Zeilen 38, 83, 144, 149, 190, 220, 260, 275, 305, 316, 352–356).

---

## Datei-für-Datei-Klassifikation

### 1. `services/trackingService.ts` — **DEAD CODE (Legacy) → ✅ ENTFERNT (P0-FIX-02, 2026-07-26)**
- Schreibt/liest `track_sessions`, `track_points` **mit `track_id`**, `track_articles`.
- **Würde zur Laufzeit fehlschlagen:** `track_points.track_id` existiert remote nicht (404) → Inserts liefen ins Leere.
- **Einziger Importeur:** `hooks/useTrackSessions.ts` (siehe unten, ebenfalls dead).
- Klassifikation: **Dead Code · migrationsrelevant** (referenziert Legacy-Tabellen).

### 2. `hooks/useTrackSessions.ts` — **DEAD CODE (Legacy) → ✅ ENTFERNT (P0-FIX-02, 2026-07-26)**
- Nutzt `getTrackSessions`/`getTrackStats` aus `trackingService.ts`.
- **Nirgends in `app/` referenziert** (`grep useTrackSessions app/` → 0 Treffer). Kein Screen bindet den Hook ein.
- Klassifikation: **Dead Code**.

### 3. `types/tracking.ts` — **RUNTIME AKTIV (indirekt), beschreibt Legacy-Shapes**
- Definiert `TrackSession/TrackPoint/TrackArticle` mit Legacy-Feldern (`distanz_m`, `track_id`, `seq`, `seq_index`).
- Importeure: `hooks/useTrackSessions.ts` (dead), **`lib/trackRecorder.ts` (aktiv)**, **`components/tracking/TrackMap.tsx` (aktiv, nur `TrackArticle`-Typ)**.
- Klassifikation: **indirekt aktiv** (nur als TS-Typ für den BLE-Punktpuffer / Map-Prop). Kein DB-Zugriff.

### 4. `lib/trackRecorder.ts` — **RUNTIME AKTIV (eingeschränkt), NICHT der Recorder**
- Selbst als **LEGACY** markiert; alter `startRecording()`-Pfad entfernt.
- Verbleibende, **genutzte** Funktion: Puffer für **externes BLE-GPS** (`pushPoint`/`subscribeRecorder`) + Snapshot für `positionStream`.
- Aktive Importeure: `features/tracking/utils/positionStream.ts`, `features/tracking/native/backgroundLocationTask.ts` (nur Task-Namens-Kommentar), `features/voice/services/speechRecognition.ts`.
- Kein Zugriff auf Legacy-Tabellen. Klassifikation: **Runtime aktiv** (Nicht-DB; BLE-Pfad).

### 5. `features/tracking/services/trackService.ts` — **KANONISCH, RUNTIME AKTIV**
- Voll kanonisch (siehe oben). **Kein** Bezug zu `track_sessions`/`track_articles`.
- Von `app/track/*` (legen/liegen/run/[id]/index/historie) genutzt. Klassifikation: **Runtime aktiv (Ziel)**.

### Zusätzliche Referenz-Checks (Falsch-Positive ausgeschlossen)
- `services/trainingFeed.ts`: „track_sessions" nur in einem **Kommentar** (keine Query).
- `features/ai/…`: „track_articles" nur als **Insight-String-Key** `'track_articles_focus'` (keine Tabellen-Query).
- `supabase/functions/delete-account`: referenziert **kanonische** Track-Tabellen (kein `track_sessions`).
- Root-SQL mit `track_sessions`: `FAEHRTE_SUCHE_SETUP.sql`, `TRACK_MODULE_SETUP.sql` (CREATE der Legacy-Tabellen).

---

## Runtime-/Dead-Matrix

| Datei | Runtime aktiv | Indirekt aktiv | Test-only | Doku-only | Dead | Migrationsrelevant |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `services/trackingService.ts` | | | | | ✅ → **entfernt** | ✅ |
| `hooks/useTrackSessions.ts` | | | | | ✅ → **entfernt** | |
| `types/tracking.ts` | | ✅ | | | | ✅ (beschreibt Legacy) |
| `lib/trackRecorder.ts` | ✅ (BLE/Stream) | | | | | |
| `features/tracking/services/trackService.ts` | ✅ (Ziel) | | | | | |

---

## Daten-Migrationslage (remote)

- `track_sessions` = **22 Zeilen**, `track_articles` = **4 Zeilen** vorhanden.
- **Kein** Migrations-SQL `track_sessions → training_sessions` im Repo (`INSERT INTO training_sessions … FROM track_sessions` → 0 Treffer).
- Ob diese 22/4 Zeilen bereits als `training_sessions(type='track')` dupliziert/übernommen wurden, ist **NICHT bewiesen** (Daten-Abgleich = BLOCKED, siehe P0-01 §5).
- **GDPR-Randnotiz:** `delete-account` löscht kanonische Tabellen; ob Legacy-`track_sessions`/`track_articles`-Zeilen eines Users beim Account-Löschen mit erfasst werden, ist zu prüfen (sonst verwaiste personenbezogene Daten).

---

## Abschluss (zwingend)

### Legacy `track_sessions` vollständig entfernbar: **NOCH NICHT BEWEISBAR**

**Begründung:**
1. **Code-seitig:** entfernbar — die einzigen Nutzer (`trackingService.ts` → `useTrackSessions.ts`) sind **Dead Code** und in keinem Screen eingebunden; alle Runtime-Pfade sind kanonisch. `track_articles` wird von keinem Runtime-Query gelesen.
2. **Daten-seitig:** **blockierend** — 22 `track_sessions`- und 4 `track_articles`-Zeilen existieren remote, ohne Beweis, dass sie nach `training_sessions` migriert wurden. Ein DROP vor verifizierter Migration = **Datenverlust**.
3. **Schema-seitig:** RLS/FK/Trigger auf `track_sessions`/`track_articles` sind nicht read-only prüfbar (BLOCKED) → mögliche Abhängigkeiten unbekannt.

**Bedingungen, damit „JA" beweisbar wird:**
- (a) Daten-Abgleich: jede Legacy-Zeile existiert (oder ist bewusst verworfen) in `training_sessions`.
- (b) `delete-account` deckt Legacy-Tabellen ab **oder** sie sind leer.
- (c) Dead Code entfernt — **✅ erledigt** für `trackingService.ts` + `useTrackSessions.ts` (P0-FIX-02). `types/tracking.ts`/`lib/trackRecorder.ts` bleiben (noch aktiv genutzt); deren Legacy-Typen erst nach Ablösung der aktiven Nutzer entfernbar.
- (d) DROP als **versionierte Migration** (siehe P0-01-A).

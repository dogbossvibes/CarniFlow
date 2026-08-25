# P0-06 — Offline Truth Report

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-26
**Bezug:** [[P0-05_GPS_PIPELINE_REPORT]] · [[P0-01_DATABASE_TRUTH_REPORT]]

## Speichermechanismen im Repo

| Mechanismus | Ort | Zweck |
|---|---|---|
| **Zustand** (Zustand/RAM) | `features/tracking/store/trackingStore.ts` | Live-Aufnahmezustand |
| **SQLite** `anyvo_local.db` | `lib/localDb/client.ts` (+ `migrations.ts`, `ids.ts`) | Offline-First lokale DB + `sync_queue` |
| **SQLite (Track-spezifisch)** | `features/tracking/store/searchPersist.ts` | Absuche-Suchpunkte (autoritativ lokal) |
| **AsyncStorage** | `trackPersist.ts` (gelegte Spur), `activeFaehrten.ts` (Registry) | Recovery-Snapshots / aktive-Fährte-Registry |
| **Supabase** | `features/tracking/services/trackService.ts`, `features/sync/services/*` | Remote-Persistenz / Source of Truth |

---

## Zwei parallele Offline-Modelle (Kernbefund P0-06-A)

1. **Generischer Offline-First-Sync** (`features/sync`): lokale SQLite-Tabellen + **`sync_queue`** (SQLite) → `syncEngine` → `remoteTrainingSyncService` → Supabase.
   - `SyncEntityType = 'training_session' | 'track_point' | 'track_marker' | 'media_file'`, `SyncOperation = create|update|delete|upload_media`.
   - Push-Ziele: `training_sessions` (insert/update/delete), `track_points`, `track_markers`, Medien via `mediaService`. „track_point/track_marker werden mit ihrer Session synchronisiert."
2. **Fährten-Recorder-eigene Persistenz** (`features/tracking/store/*` + `trackService.ts`): schreibt **direkt** best-effort nach Supabase und nutzt AsyncStorage/SQLite als **Recovery-Puffer** — **nicht** die `sync_queue`.

➡️ **Divergenz:** Der Live-Fährten-Flow (Legen/Absuche) läuft **nicht** über die generische `sync_queue`, obwohl diese `track_point`/`track_marker` als Entitätstypen kennt. Zwei Wege für dieselben Daten = **Konsolidierungslücke** (unklare/mehrfache Source of Truth, siehe Tabelle).

---

## Datenart → Speicher-Matrix

Legende: ✅ genutzt · ➖ nicht genutzt · **SoT** = Source of Truth

> **Korrektur (Reconciliation `CODEX_P0_REVIEW.md`, 2026-07-26):** Der **Live-Fährten-Recorder** schreibt Punkte/Marker **direkt** über `localTrackRepository` (`createLocalTrackPointsBatch()`/`createLocalTrackMarker()`, `useTrackRecorder.ts` Z. 16/151) in die lokalen SQLite-Tabellen `local_track_points`/`local_track_markers` — **nicht** über die generische `sync_queue`. Die generische Sync-Schicht *kennt* `track_point`/`track_marker`, ist aber **nicht** der Schreibpfad des aktiven Recorders. Frühere Formulierung „via `sync_queue` track_point" war ungenau.

| Datenart | Zustand | SQLite | AsyncStorage | Supabase | aktuelle Source of Truth | empfohlene Source of Truth |
|---|:--:|:--:|:--:|:--:|---|---|
| **Training Sessions** (allg.) | ➖ | ✅ (`local_training_sessions` + `sync_queue`) | ➖ | ✅ (`training_sessions`) | **Supabase** (lokal = Offline-Cache/Queue) | **Supabase** kanonisch; SQLite = Offline-Cache (unverändert) |
| **Gelegte Track Points** | ✅ (live `trackPoints`) | ✅ (**direkt** `local_track_points` via `createLocalTrackPointsBatch`) | ✅ (`trackPersist` Snapshot, Fallback) | ✅ (`track_points.session_id`, direkt via `trackService`) | **uneindeutig** — Direkt-SQLite **und** Direkt-Supabase **und** AsyncStorage-Snapshot parallel (P0-06-A) | **SQLite lokal = SoT bis synchronisiert**, dann Supabase; **ein** Schreib-/Idempotenzpfad (Remote-ID), AsyncStorage-Snapshot nur als Crash-Recovery |
| **Search Points** (Absuche) | ✅ (live `searchTrackPoints`) | ✅ (`searchPersist` → `local_track_points(point_type='search')`, **autoritativ lokal**) → `track_runs.run_points` | ➖ (nur Fallback in `trackPersist.searchPoints?`) | ✅ (`track_runs`) | **SQLite lokal** bis Finalisierung, dann **Supabase** | **SQLite lokal** (beibehalten); AsyncStorage-Fallback entfernen (Doppelhaltung) |
| **Marker (GS/Winkel/Abriss)** | ✅ (`markers`) | ✅ (**direkt** `local_track_markers` via `createLocalTrackMarker`) | ✅ (in Track-Snapshot) | ✅ (`track_markers`, best-effort sofort) | **uneindeutig** — Direkt-SQLite + Direkt-Supabase + Snapshot | **SQLite lokal = SoT bis synchronisiert**, dann Supabase; Idempotenz über Remote-ID |
| **TS (Teilstrecken)** | ✅ (`segments`) | ➖ (kein eigenes SQLite) | ✅ (`trackPersist.segments?`) | ✅ (`training_sessions.track_data.segments` JSON) | **Supabase (JSON)**; lokal = Recovery | **Supabase (JSON)** kurzfristig; mittelfristig Normalisierung erwägen (Analytics, siehe P0-03-D) |
| **Aktive Fährte (Registry)** | ✅ (`activeFaehrten` Map) | ➖ | ✅ (`activeFaehrten` KEY) | ➖ (nur abgeleitete Kennzahlen gespiegelt) | **Gerät** (AsyncStorage) — pro `dog_id` | **Gerät** (AsyncStorage) beibehalten (Live-Lifecycle ist gerätelokal sinnvoll) |
| **Liegezeit** | ✅ (`layStartedAt`/`layFinishedAt`, zeitstempelbasiert) | ➖ | ✅ (im Track-Snapshot + Registry `layStartedAt`) | ✅ (`training_sessions.laying_duration_seconds` bei Abschluss) | **Gerät** (Timer) → **Supabase** bei Abschluss | **Gerät** (Timer) als Live-SoT → **Supabase** finalisiert (unverändert) |
| **Medien** (Bild/Video/Audio) | ➖ | ✅ (`localMediaRepository` + `sync_queue` media_file) | ➖ | ✅ (Supabase Storage via `mediaService`; `training_media`/`voice_notes`) | **Supabase Storage**; lokal = Upload-Queue | **Supabase Storage** kanonisch; SQLite = Upload-Queue (unverändert) |
| **Sync Status / Queue** | ➖ | ✅ (`sync_queue` Tabelle: `status`, `attempts`, `priority`) | ➖ | ➖ | **SQLite lokal** (Gerät) | **SQLite lokal** (beibehalten); nach erfolgreicher Direkt-Persistenz konsequent `synced` markieren (Duplikate vermeiden) |
| **Recovery-Snapshot** (laid track) | Quelle | ➖ | ✅ (`trackPersist` per `dog_id`) | ➖ | **Gerät** (AsyncStorage) | **In SQLite konsolidieren** (einheitlich mit `local_track_points`), AsyncStorage-Snapshot reduzieren |

---

## Weitere Befunde

- **P0-06-B — SQLite-Verfügbarkeit ist Build-abhängig:** `lib/localDb/client.ts` wirft „SQLite nicht verfügbar (neuer Build nötig)", `SQLITE_AVAILABLE`-Guard. In Builds ohne SQLite fällt der Offline-Pfad (inkl. `sync_queue`, `searchPersist`) aus → nur AsyncStorage-Recovery + direkte Supabase-Schreibversuche greifen. Robustheit je Build zu verifizieren.
- **P0-06-C — Mehrere Recovery-Quellen für dieselbe Spur:** Live-`trackPoints` (RAM) ↔ `trackPersist` (AsyncStorage) ↔ `track_points` (Supabase). Bei Absuche zusätzlich `searchPersist` (SQLite, „autoritativ") ↔ `trackPersist.searchPoints?` (Fallback). Konfliktauflösung/Priorität ist implizit; klare Vorrangregel empfehlenswert.
- **P0-06-D — Registry entkoppelt von Session-Persistenz:** `activeFaehrten` (AsyncStorage, pro Hund) hält den Lebenszyklus (laying/resting/searching …) unabhängig von Supabase; nur Kennzahlen werden gedrosselt gespiegelt. Bei Divergenz (z. B. Remote-Session gelöscht) kann die Registry veralten.
- **P0-06-E — Dieselben Fachdaten werden mehrfach dauerhaft abgelegt (Duplikationsrisiko):**
  - Gelegte Track Points: Zustand (RAM) **+** AsyncStorage-Snapshot **+** SQLite `local_track_points` **+** Supabase `track_points`.
  - Marker: Zustand **+** AsyncStorage-Snapshot **+** SQLite `local_track_markers` **+** Supabase `track_markers` (best-effort sofort).
  - Suchpunkte: Zustand **+** (AsyncStorage-Fallback) **+** SQLite `local_track_points(point_type='search')` **+** Supabase `track_runs.run_points`.
  ⇒ Der Recorder speichert teils **direkt** nach Supabase, während die **generische Sync-Schicht** dieselben lokalen Punkte/Marker **später erneut** hochladen kann. Ohne durchgängige **Idempotenz/Remote-ID-Strategie** über alle Pfade besteht **Duplikat-Risiko** — besonders, wenn die Direkt-Persistenz teilweise erfolgreich war und die SQLite-Zeile weiter `pending` bleibt. **Verifikation empfohlen** (siehe P1-FIX-07). *(Ergänzt nach `CODEX_P0_REVIEW.md`.)*

## BLOCKED / nicht in diesem Pass geprüft
- Exakte lokale SQLite-Schema-Migrationen (`lib/localDb/migrations.ts`) im Detail.
- Reales Sync-Verhalten bei Netzverlust/Reconnect (Retry/Attempts/Priority) zur Laufzeit.
- Ob der Fährten-Recorder-Pfad und der `sync_queue`-Pfad je dieselbe Session doppelt nach Supabase schreiben können (Race → Duplikate). **Verifikation empfohlen.**

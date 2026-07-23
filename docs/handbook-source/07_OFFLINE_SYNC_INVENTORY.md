# 07 — Offline & Sync Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. **[UNKLAR]** markiert Ungesichertes.

## Zweck

Bestandsaufnahme der Offline-Speicherung, Sync-Queue/-Engine und Recovery-Mechanismen.

## Gefundene Dateien

- SQLite: `lib/localDb/client.ts`, `lib/localDb/migrations.ts`, `lib/localDb/ids.ts`.
- Sync: `features/sync/services/syncEngine.ts`, `remoteTrainingSyncService.ts`, `netinfo.ts`; `features/sync/repositories/syncQueueRepository.ts`; `features/sync/store/syncStore.ts`; `features/sync/hooks/useNetworkStatus.ts`; `features/sync/types/sync.ts`; UI `SyncProvider.tsx`, `OfflineBanner.tsx`, `SyncStatusPill.tsx`.
- Lokale Repos: `features/training/repositories/localTrainingRepository.ts`, `features/tracking/repositories/localTrackRepository.ts`, `features/media/repositories/localMediaRepository.ts`.
- Fährten-Recovery (separat): `features/tracking/store/trackPersist.ts` (AsyncStorage `PendingTrack`), `searchPersist.ts`, `searchRecovery.ts`, `restingTime.ts`.
- Screens/Debug: `app/sync.tsx`, `app/dev/offline-debug.tsx`. Doku: `OFFLINE_README.md`.
- Tests: `features/tracking/store/__tests__/searchPersist*.test.ts`, `searchRecovery.test.ts`, `trackPersistPerDog.test.ts`, `restingP3.test.ts`, `restingTime.test.ts`, `searchPointsRepo.test.ts`.

## Zwei getrennte Offline-Mechanismen (tatsächlich)

1. **SQLite + Sync-Queue** (für Trainings-Sessions, Track-Punkte/Marker, Media):
   - Tabellen V1–6 (`lib/localDb/migrations.ts`): `local_training_sessions`, `local_track_points`, `local_track_markers`, `local_media_files`, `sync_queue`.
   - Engine `syncEngine.ts` (`syncNow`): online-Check (`netinfo`) → Session-Check → `getPendingSyncOperations(200)` → pro Item `processQueueItem` → `clearCompleted`. Entities: `training_session` (create/update/delete), `media_file`; `track_point`/`track_marker` werden **mit ihrer Session** synchronisiert (`syncTrainingSession`).
   - Remote-Upload: `remoteTrainingSyncService.ts` (`createRemoteTrainingSession`, `createRemoteTrackPointsBatch`, `createRemoteTrackMarkersBatch`, `uploadRemoteMediaFile`).
   - Store `syncStore.ts`: `pending/failed/conflict`-Counts, `syncing`, `progress`, `lastError`, `lastSyncAt`, `onlineStatus`.
   - Provider `SyncProvider.tsx` triggert Sync (**[UNKLAR]** genaue Trigger: App-Foreground / Netzwerkwechsel / Intervall — nicht vollständig gelesen).

2. **AsyncStorage-`PendingTrack`** (für laufende Fährten-Recovery, **hundebasiert**):
   - `trackPersist.ts` (`schedulePersist`/`writePendingNow`/`clearPending`), Schlüssel = `dog_id`; ohne `dog_id` Legacy-Slot.
   - Snapshot in `trackingStore.snapshot()` (Punkte, Marker, `segments`, Such-Metadaten, Liegezeit). Kritische Übergänge sofort (`persistNow`).
   - Absuche-Recovery zusätzlich über SQLite als **autoritative** Quelle (`searchPersist.ts`/`searchRecovery.ts`); AsyncStorage ist Fallback.

## Zentrale Typen/Funktionen

- `PendingTrack` (`trackPersist.ts`) — Recovery-Snapshot inkl. optionaler `segments` (Altdaten ohne → `[]`).
- `LocalMigration` (`lib/localDb/migrations.ts`), `sync_queue`-Item-Form (`entity_type`, `entity_local_id`, `operation`, `priority`, `status`).
- `syncNow`, `syncPendingOperations`, `retryFailedSync`, `updateSyncCounts` (`syncEngine.ts`).

## Tatsächlicher Datenfluss

- Aufnahme schreibt parallel: Zustand-Store, AsyncStorage-Snapshot (`trackPersist`), SQLite (`localTrackRepository`), und beim Abschluss direkt Remote (`trackService.finishTrackRecording`).
- Sync-Engine räumt die SQLite-Queue Richtung Supabase ab, wenn online + eingeloggt.

## Bestehende Abhängigkeiten

- `expo-sqlite`, `@react-native-async-storage/async-storage`, `@react-native-community/netinfo`, `lib/supabase.ts`.

## Aktuelle Regeln

- `docs/00_READ_FIRST.md` §3.3: „Offline First — Internet darf nie Voraussetzung für normales Training sein."

## Inkonsistenzen

- **Zwei Offline-Persistenzsysteme** nebeneinander (SQLite-Queue vs. AsyncStorage-`PendingTrack`) für teils dieselben Fährtendaten. Das widerspricht potenziell „keine doppelte Datenhaltung". Begründung im Code: SQLite = autoritativ, AsyncStorage = Recovery-Fallback — aber die Fährten-Session selbst wird beim Abschluss **direkt remote** geschrieben (`trackService`), nicht über die SQLite-Queue. → Zwei Schreibpfade für Fährten (direkt-remote **und** SQLite/Queue).
- **[UNKLAR]** Ob eine offline gelegte Fährte, deren Abschluss `finishTrackRecording` (direkt remote) offline scheitert, verlässlich über die SQLite-Queue nachsynchronisiert wird, oder nur über den AsyncStorage-Recovery-Pfad wiederhergestellt werden kann.

## Offene Fragen

- Welche genauen Trigger startet `SyncProvider` (Foreground/NetInfo/Intervall)?
- Ist der Fährten-Abschluss (`finishTrackRecording`/`finishTrackRun`) offline-fähig oder erfordert er Online (direkter Supabase-Call)?
- Konflikt-Handling: `syncStore` hat `conflictCount`, aber die Auflösungsstrategie ist **[UNKLAR]** (nicht gelesen).

## Technische Risiken

- Doppelte Schreibpfade (direkt-remote vs. Queue) für Fährten erhöhen das Risiko divergenter/teilweise gespeicherter Sessions bei instabiler Verbindung.
- „best-effort"-Fehlerbehandlung im Recorder kann Sync-Lücken verdecken.

## Mögliche spätere Verbesserungen

- Einheitlicher Offline-Schreibpfad für Fährten (immer über SQLite-Queue → Sync-Engine), statt direktem Remote-Abschluss.
- Dokumentiertes Konflikt-/Retry-Modell.

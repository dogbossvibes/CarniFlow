# ANYVO — Offline-First / Local-First (Phase 1)

Lokale SQLite-DB als primäre Quelle + Sync-Queue + Sync-Engine. Native Deps
(`expo-sqlite`, `@react-native-community/netinfo`) → **neuer Build nötig**, bevor
Offline-First aktiv ist (in Expo Go nicht verfügbar).

## Geliefert (Phase 1)
- **Lokale DB:** `lib/localDb/client.ts` (+ `migrations.ts`, `ids.ts`) — `local_training_sessions`, `local_track_points`, `local_track_markers`, `local_media_files`, `sync_queue`, `local_schema_migrations`.
- **Types:** `features/sync/types/sync.ts`.
- **Repositories:** `features/training/repositories/localTrainingRepository`, `features/tracking/repositories/localTrackRepository`, `features/media/repositories/localMediaRepository`, `features/sync/repositories/syncQueueRepository`.
- **Sync:** `syncStore` (Zustand), `useNetworkStatus` (NetInfo), `remoteTrainingSyncService`, `syncEngine` (Reihenfolge Session→Punkte→Marker→Medien; Track-Points erst nach Session-remote_id), `SyncProvider` (App-Start/Reconnect/Vordergrund, debounced).
- **UI:** `SyncStatusPill`, `OfflineBanner` (Home), `SyncCenter` → `app/sync.tsx` (Profil → Sync-Center).
- **Fährte offline-first (Kern):** `useTrackRecording` persistiert GPS-Punkte **laufend** (Batch alle 25) + Marker in SQLite → crash-/akkusicher. Bei Offline-Finish bleibt die lokale Session `pending` und wird bei Reconnect synchronisiert.
- **Alt-Tabellen konsolidiert:** Feed (`useTrainingFeed`) + Stats (`useTrackStats`) lesen jetzt `training_sessions(type='track')` statt der alten `track_sessions` (doppeltes Fährten-System beseitigt).

## Folgephasen (noch offen)
- **Training/Medien offline-first** vollständig: Unit-Speichern lokal-first + Medien-Upload-Queue (Infrastruktur steht, Pfade noch anbinden).
- **App-Start-Recovery-Dialog** „Nicht abgeschlossene Fährte fortsetzen?" (Daten via trackPersist/SQLite vorhanden).
- **Konflikt-UI** (last-write-wins + `dirty_fields` vorbereitet).
- **Logout-Dialog** „Lokale Daten löschen?" (`wipeLocalData()` vorhanden).
- **Dev Offline-Debug-Screen** (`app/dev/offline-debug.tsx`).
- **track_sessions** Alt-Code (`services/trackingService.ts`, `useTrackSessions`) endgültig entfernen, sobald nichts mehr darauf zeigt.

## Hinweis
Phase 1 braucht einen neuen Dev-/TestFlight-Build (native SQLite/NetInfo). Erst dort lässt sich Offline-Verhalten real testen.

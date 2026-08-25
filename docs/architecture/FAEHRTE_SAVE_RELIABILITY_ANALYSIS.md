# Fährten-Speichern — Reliability-Audit (Save-Lifecycle)

> **Status: ANALYSE / READ-ONLY.** Kein Save-Flow geändert, kein Commit, kein Push.
> Anlass: „Die letzte Fährte wurde offenbar nicht gespeichert." Ziel: exakt herausfinden,
> warum eine abgeschlossene (gelegte) Fährte verloren gehen kann.

## 0. TL;DR — Root Cause

Der Lege-Recorder schreibt beim Beenden zuverlässig in die **lokale SQLite**
(`local_training_sessions`, `local_track_points`, `local_track_markers`, jeweils
`sync_status='pending'`), **enqueued aber NIE eine Sync-Queue-Operation**. Der Sync-Engine
(`syncNow`) arbeitet ausschliesslich die `sync_queue` ab (`getPendingSyncOperations`). Ein
`enqueueSyncOperation({ entityType: 'training_session', … })` existiert nur in
`app/dev/offline-debug.tsx` (Dev-Screen) — **nirgends im echten Lege-Flow**.

Konsequenz: Landet eine Fährte auf dem **lokalen Pfad** (Supabase-Insert war null/fehlgeschlagen),
bleibt sie für immer in SQLite liegen und wird **weder synchronisiert noch angezeigt** — die
Verlaufslisten lesen ausschliesslich Supabase (`getUserTrackSessions`). Für den Nutzer =
„nicht gespeichert".

Der häufigste Auslöser ist eine **Race-Condition, die auch online auftritt** (siehe §3.1):
`createTrackSession` läuft im Hintergrund; wird vor ihrer Auflösung gestoppt, ist
`sessionId = null` und `finish(null)` geht den Lokal-only-Pfad — meldet aber
`saveState='saved'` (trügerisch).

## 1. Beteiligte Dateien (Save-Lifecycle)

| Schicht | Datei | Rolle |
|---|---|---|
| Screen (Legen) | `app/track/legen.tsx` | Start (`begin`) + Stop (`onStop`), Navigation zu `liegen` |
| Recorder | `features/tracking/hooks/useTrackRecorder.ts` | GPS→Puffer, `beginRecording`, `finish` (Hintergrund-Save) |
| Remote-Service | `features/tracking/services/trackService.ts` | `createTrackSession`, `finishTrackRecording`, `saveTrackMarker` (direkt Supabase) |
| Lokal-Repo (Track) | `features/tracking/repositories/localTrackRepository.ts` | `createLocalTrackPointsBatch`, `createLocalTrackMarker` (SQLite, `pending`) |
| Lokal-Repo (Session) | `features/training/repositories/localTrainingRepository.ts` | `createLocalTrainingSession` (SQLite, `pending`), `updateTrainingSyncStatus`, `setTrainingRemoteId` |
| Sync-Queue | `features/sync/repositories/syncQueueRepository.ts` | `enqueueSyncOperation`, `getPendingSyncOperations` |
| Sync-Engine | `features/sync/services/syncEngine.ts` | `syncNow` → nur `sync_queue`, dann `syncTrainingSession` |
| Sync-Trigger | `features/sync/components/SyncProvider.tsx` | App-Start / Reconnect / Foreground → `syncNow` |
| Remote-Sync | `features/sync/services/remoteTrainingSyncService.ts` | Upload lokal→remote (Session + Punkte + Marker) |
| Verlauf/Liste | `app/track/index.tsx`, `app/track/historie.tsx` | Lesen **nur** Supabase (`getUserTrackSessions`) |

## 2. Soll-Lifecycle (wie es gedacht ist)

1. **Start** (`legen.tsx:begin`): sofort haptik + Recorder scharf (`rec.beginRecording`).
   `createTrackSession` (Supabase-Insert `training_sessions` status='active') läuft
   **im Hintergrund** (`.then/.catch`, blockiert die Aufnahme nicht). Ergebnis-ID →
   `sessionIdRef.current` + Store + Registry.
2. **Aufnahme**: `onFix` puffert Linienpunkte; ab 25 Punkten `flushPoints()` → SQLite
   (`local_track_points`). Marker → Store + SQLite + (falls `currentSessionId`) Supabase.
   Voraussetzung SQLite: `localSessionId.current` gesetzt (best-effort in `beginRecording`).
3. **Stop** (`legen.tsx:onStop` → `rec.finish(id)`): synchron stoppen, Liegezeit starten,
   **sofort** zu `liegen` navigieren. Der schwere Save läuft **fire-and-forget** im
   Hintergrund: `flushPoints()`, dann — falls `sessionId` vorhanden —
   `finishTrackRecording` (Bulk `track_points` + `training_sessions`-Summary). `saveState`
   spiegelt `saving`/`saved`/`error`.
4. **Offline-Nachschub (Soll):** Sync-Engine lädt pending lokale Sessions samt Punkten/Markern
   hoch, sobald wieder online.

## 3. Ist-Zustand & Fehlermodi

### 3.1 Race-Condition (tritt auch ONLINE auf) — Hauptverdacht
`createTrackSession` ist bewusst nicht-blockierend. Bei **kurzer Fährte oder langsamem Netz**
ist die Insert-Antwort beim Stop noch nicht da → `sessionIdRef.current === null`.
`onStop` ruft `rec.finish(null)`:

```
if (!sessionId) { store.getState().setSaveState('saved'); return; }   // useTrackRecorder.ts:502
```

→ Nur lokaler Flush, **kein** `finishTrackRecording`, **kein** enqueue, **`saveState='saved'`**
(trügerisch „gespeichert"). Die Fährte erreicht Supabase nie; die Verlaufsliste (nur Supabase)
zeigt sie nicht. **Datenverlust trotz funktionierendem Internet.**

Verschärfung: Löst `createTrackSession` **nach** dem Stop auf, entsteht eine **Geister-Session**
(`status='active'`, 0 Punkte, keine Summary) in Supabase — `finish` lief bereits mit `null`.
Ergebnis: leere/kaputte Fährte in der Liste ODER gar keine.

### 3.2 Lokal-only wird nie synchronisiert (struktureller Kern)
Selbst wenn §3.1 sauber lokal landet: Es wird **keine `sync_queue`-Operation** angelegt.
`syncNow` iteriert nur die Queue → die lokale Session ist verwaist. `getPendingTrackPoints`
etc. werden erst **innerhalb** von `syncTrainingSession` genutzt, das aber nur über einen
Queue-Eintrag erreicht wird. Beleg:

- `enqueueSyncOperation(training_session)` → nur `app/dev/offline-debug.tsx:45`.
- `useTrackRecorder` (Produktivpfad) enqueued nie.

### 3.3 Remote-Finish-Fehler ohne Retry
Ist `sessionId` gesetzt, aber `finishTrackRecording` bricht ab (Netzabbruch nach Stop,
RLS-/Schema-Fehler, Batch mittendrin): `setSaveState('error')`. Der Screen ist aber schon
zu `liegen` navigiert; **niemand reagiert auf `error`**, kein Retry, kein enqueue. Remote-Punkte
verloren (Session-Row existiert evtl. leer). `updateTrainingSyncStatus(local, 'pending')` setzt
zwar SQLite auf pending — hilft aber nichts, da nie enqueued (§3.2).

### 3.4 Totalverlust-Fenster: `localSessionId` selbst best-effort
In `beginRecording` wird `localSessionId` nur gesetzt, wenn `supabase.auth.getUser()` (Netz!)
einen User liefert UND `createLocalTrainingSession` gelingt — beides in `try/catch`. **Offline**
kann `getUser()` scheitern → `localSessionId.current` bleibt `null`. Dann ist `flushPoints()`
ein No-op (`if (!sid) return`) und `createLocalTrackMarker` wird übersprungen. Kombiniert mit
`sessionId=null` (§3.1) → **die gesamte Fährte (Punkte + Marker) wird verworfen** — nicht mal in
SQLite. Totalverlust.

### 3.5 Fire-and-forget + sofortige Navigation
`finish` startet den Save als `void (async () => …)` und navigiert sofort weiter. Wird die App
im Save-Fenster **hart geschlossen/gekillt** (grosse Batches: 500/Chunk remote, 25er-Flush
lokal), ist der Save unterbrochen — **kein** Resume-Mechanismus für den Lege-Save (der
`trackPersist`/`PendingTrack`-Mechanismus dient der **Absuche/Run-Recovery**, nicht dem
garantierten Upload der gelegten Fährte).

### 3.6 Verlauf liest nur Supabase
`app/track/index.tsx` und `historie.tsx` laden über `getUserTrackSessions` (nur
`training_sessions`). Lokale pending-Sessions werden **nicht gemergt** → für den Nutzer
ununterscheidbar von „nicht gespeichert".

## 4. Szenario-Matrix (aus dem Auftrag)

| Szenario | Verhalten heute | Zuverlässig? |
|---|---|---|
| Navigation direkt nach Stop | Save im Hintergrund, sofortige Navigation | ⚠️ nur wenn `sessionId` schon da (§3.1) |
| Langsames Netzwerk | `sessionId` beim Stop oft `null` → Lokal-only, nie gesynct | ❌ (§3.1/§3.2) |
| App im Background | Fire-and-forget-Save kann unterbrochen werden, kein Resume | ⚠️ (§3.5) |
| Kurzzeitig offline | Lokal-only (bestenfalls), nie enqueued/gesynct | ❌ (§3.2) |
| Supabase-Fehler | `saveState='error'`, kein Retry/enqueue | ❌ (§3.3) |
| Doppeltipp Stop | `stoppingRef`/`beganRef`-Guard | ✅ |
| App schliessen nach Aufnahme | kein garantierter Upload-Job; lokal evtl. vorhanden, aber verwaist | ❌ (§3.2/§3.5) |
| OTA/App-State-Wechsel | SyncProvider triggert `syncNow` bei Foreground/Reconnect — findet aber keinen Queue-Eintrag | ❌ (§3.2) |

## 5. Was funktioniert (Happy Path)
Online, stabiles Netz, Fährte lang genug, dass `createTrackSession` vor dem Stop auflöst:
`finish(id)` → `finishTrackRecording` schreibt `track_points` + Summary nach Supabase; die
Liste zeigt die Fährte. Doppeltipp ist abgesichert. Marker mit `currentSessionId` werden sofort
remote gespeichert.

## 6. Empfohlene Fix-Richtungen (NICHT umgesetzt — nur Analyse)
1. **Race entschärfen:** Beim Start immer zuerst eine **lokale** Session anlegen und deren
   `local_id` als führende ID verwenden (Supabase-ID später via `setTrainingRemoteId`
   nachziehen). `finish` nie mit `null` in den „nur-lokal-fertig"-Zweig fallen lassen, ohne zu
   enqueuen.
2. **Enqueue im Produktivpfad:** Bei `finish`/`updateTrainingSyncStatus('pending')` eine
   `enqueueSyncOperation({ entityType:'training_session', operation:'create'|'update' })`
   absetzen, damit `syncNow` die lokale Session inkl. Punkte/Marker hochlädt.
3. **Retry statt stiller `error`:** `saveState==='error'` → enqueue + Sync-Trigger; ggf. Hinweis
   im `liegen`/Verlaufs-UI.
4. **Verlauf mergen:** Liste um lokale `pending`/`failed`-Sessions ergänzen (sichtbarer
   Sync-Status), damit „liegt lokal" nicht wie „weg" aussieht.
5. **`localSessionId` robust:** lokale Session unabhängig von `getUser()`-Netzcall anlegen
   (User-ID aus Auth-Store/Cache), damit Offline nie zum Totalverlust (§3.4) führt.

## 7. Belege (Fundstellen)
- `app/track/legen.tsx:388` `createTrackSession` im Hintergrund; `onStop:527` `id = sessionIdRef.current`; `:530` `rec.finish(id)`.
- `useTrackRecorder.ts:492` `finish`; `:502` `if (!sessionId) … setSaveState('saved'); return;`; `:451-457` `localSessionId` best-effort via `getUser()`.
- `syncEngine.ts:106` `syncNow` nur über `getPendingSyncOperations`; `:33` `syncTrainingSession` (nur via Queue erreichbar).
- `syncQueueRepository.ts:7` `enqueueSyncOperation`; einziger Produktions-naher Caller: `app/dev/offline-debug.tsx:45` (Dev).
- `trackService.ts:345` `getUserTrackSessions` (nur Supabase); `app/track/index.tsx:58`, `historie.tsx:60` konsumieren das.

---
_Real-Device-Reproduktion empfohlen: kurze Fährte bei gedrosseltem Netz legen und sofort
stoppen (§3.1) → prüfen, ob sie im Verlauf erscheint._

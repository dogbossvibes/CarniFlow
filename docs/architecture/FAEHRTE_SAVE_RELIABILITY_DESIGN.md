# Fährten-Speichern — Local-First Reliability Design (Fix-Plan)

> **Status: DESIGN / PLAN.** Kein Code geändert, kein Commit/Push/OTA/Build.
> Baut auf `FAEHRTE_SAVE_RELIABILITY_ANALYSIS.md` (Audit) auf. Ziel: gelegte Fährte geht nie
> verloren; Remote-Erfolg ist NICHT Voraussetzung für Sichtbarkeit im Verlauf. Bestehende
> Local-First-/Sync-Infrastruktur wird maximal wiederverwendet — keine zweite Sync-Architektur.

## A. Heutiger Save-Lifecycle (Ist)
Start (`legen.tsx:begin`) → `rec.beginRecording` (sofort scharf) + `createTrackSession`
(Supabase, **Hintergrund**) → `sessionIdRef`. Aufnahme → Punkte in `local_track_points`
(nur wenn `localSessionId` gesetzt). Stop (`onStop` → `rec.finish(id)`) → **fire-and-forget**
Remote-Save + sofortige Navigation. Verlauf liest **nur** Supabase (`getUserTrackSessions`).

## B. Genaue Verluststelle
`useTrackRecorder.finish:502` `if (!sessionId) { setSaveState('saved'); return; }` → Lokal-only,
**nie enqueued** (kein `enqueueSyncOperation` im Produktivpfad — nur in `app/dev/offline-debug.tsx`).
Sync-Engine iteriert nur `sync_queue` → verwaiste lokale Session. Zusätzlich `localSessionId`
selbst netzabhängig (`getUser()` in `beginRecording:452`) → offline evtl. gar keine lokale Session
(Totalverlust). Verlauf zeigt lokale Sessions nicht.

## C. Heutiger ID-Race
- **Lokale ID** (`local_id`, `newLocalId()` = `Crypto.randomUUID()`) entsteht **spät** in
  `createLocalTrainingSession` (best-effort, nach `getUser()`).
- **Remote-ID** (`training_sessions.id`) entsteht **asynchron** in `createTrackSession`.
- `onStop` navigiert **sofort** mit `sessionIdRef.current`; bei kurzer Fährte/langsamem Netz ist
  diese ID **noch null** → `finish(null)` → Lokal-only-Zweig, aber `saveState='saved'` (trügerisch).
- Bei sofortigem Stop kann also weder Remote- noch (offline) Lokal-ID sicher vorliegen.

## D. Neue Local-First-Architektur (Soll)

### D.1 ID-Lifecycle (Race + Duplikate beseitigt)
```
START (synchron, VOR jedem await):
  clientUuid   = Crypto.randomUUID()          // bare UUID = spätere training_sessions.id
  localSession = createLocalTrainingSession({ user_id: <cached>, dog_id, type:'track',
                    status:'active', started_at, surface_types, weather…, latitude, longitude,
                    payload_json:{ intendedRemoteId: clientUuid } })
  → local_id ist ab jetzt die FÜHRENDE ID (Recorder-Puffer, Marker, Navigation)
  → remoteId ist deterministisch bereits bekannt (= clientUuid), muss NICHT abgewartet werden
```
- Punkte/Marker referenzieren **immer** `session_local_id` (nie null).
- Remote-Insert nutzt **`id: clientUuid`** + **`upsert(onConflict:'id')`** → Retry erzeugt kein
  Duplikat (idempotent, ohne Remote-Migration; Postgres akzeptiert client-seitige UUID-PK, RLS
  greift über `owner_id`).

### D.2 Ablauf
```
START      → lokale Session (führende ID), Status local_only/pending
AUFNAHME   → Punkte/Marker lokal gegen local_id (Puffer + SQLite-Flush wie heute)
BEENDEN    → lokal finalisieren (ended_at, duration, distance, corners/articles, gps_quality,
             segments → in payload_json), lokale Punkte SYNCHRON flushen (await),
             sync_status='pending', saveState='saved_local_pending_sync'
             → enqueueSyncOperation({ entity:'training_session', op:'create', entityLocalId })
             → syncNow() best-effort anstossen; UI zeigt erst JETZT „gespeichert"
REMOTE     → syncEngine.syncTrainingSession: upsert Session (id=clientUuid), Punkte/Marker
             idempotent hochladen, setTrainingRemoteId(local, clientUuid), status='synced'
FEHLER     → lokale Daten bleiben vollständig; status pending/failed; Retry (auto bei
             Reconnect/Foreground via SyncProvider, manuell via retryFailedSync)
```
**Invariante:** Remote-Erfolg ist nie Voraussetzung dafür, dass die Fährte im Verlauf existiert.

## E. Wiederverwendete Infrastruktur (kein Neubau)
- `local_training_sessions` / `local_track_points` / `local_track_markers` (SQLite, Migrationen v1–v6).
- `createLocalTrainingSession` / `updateLocalTrainingSession` / `setTrainingRemoteId`
  (cascadet `session_remote_id` bereits auf Kinder).
- `enqueueSyncOperation` + `sync_queue` + `syncNow`/`syncTrainingSession` + `SyncProvider`
  (App-Start / Reconnect / Foreground-Trigger existieren bereits).
- `remoteTrainingSyncService` (createRemote/updateRemote/points/markers-Batches).
- `getLocalTrainingSessions(userId,{type})` (für Verlauf-Merge, bereits vorhanden).
- Auth aus `session-context` (`user.id` in-memory, `getSession()` lokal) statt `getUser()` (Netz).

## F. Nötige Dateien (Änderungspunkte)
| Datei | Änderung |
|---|---|
| `app/track/legen.tsx` | `begin`: cached `session.user.id` + volle Metadaten an Recorder; `onStop`: neuer SaveState; kein Warten auf Remote-ID |
| `features/tracking/hooks/useTrackRecorder.ts` | `beginRecording(userId, meta)` erzeugt lokale Session **synchron** (kein `getUser()`); `finish` finalisiert lokal + `enqueueSyncOperation` + `syncNow()`; SaveState-Mapping |
| `features/training/repositories/localTrainingRepository.ts` | Finalize-Helper (Summary/Segments → `payload_json`), `intendedRemoteId` speichern (payload_json ODER neue Spalte) |
| `features/sync/services/remoteTrainingSyncService.ts` | `createRemoteTrainingSession`: `id=clientUuid` + `upsert(onConflict:'id')`; volle Spalten aus `payload_json` (distance/corners/articles/gps_quality/laying_duration/track_data.segments); Punkte/Marker idempotent (replace-by-session) |
| `features/sync/services/syncEngine.ts` | `syncTrainingSession`: clientUuid-Pfad, idempotenter Points/Markers-Upload, Finish-Metadaten |
| `features/tracking/store/trackingStore.ts` | `TrackSaveState` erweitern (siehe §I/§9) |
| `app/track/index.tsx`, `app/track/historie.tsx` | Verlauf-Merge lokal+remote + Sync-Badge (P-SAVE3) |
| `features/tracking/services/trackService.ts` | optional Merge-Helper (remote+lokal, dedupe by remote_id) |
| `lib/localDb/migrations.ts` | **optional** v7 `client_uuid`-Spalte (sonst `payload_json`, dann 0 Migration) |
| `features/tracking/hooks/useTrackRecording.ts` | Zwilling zu useTrackRecorder — gleiche Umstellung falls noch genutzt |

## G. Migration nötig?
- **Remote (Supabase): NEIN.** Client-seitige UUID als `training_sessions.id` + `upsert(onConflict:'id')`,
  Punkte/Marker via replace-by-session — kein Schema-Change. (Optionale Härtung mit
  `client_id`-Spalten für Punkte/Marker wäre eine Remote-Migration → nur wenn gewünscht.)
- **Lokal (SQLite): OPTIONAL.** `intendedRemoteId`/Summary/Segments passen in vorhandenes
  `payload_json` → **0 Migration** möglich. Sauberer: additive v7 `client_uuid` (idempotent,
  `alter table add column`).

## H. Sync-Queue-Änderungen (minimal)
- **Kein** Schema-/Engine-Umbau. `enqueueSyncOperation` im Produktivpfad **aufrufen** (heute fehlt der Call).
- `syncTrainingSession` bereits vorhanden; anpassen: (a) Remote-Insert → Upsert mit clientUuid;
  (b) Punkte/Marker idempotent (delete-by-session + insert, da lay-Daten nach Finish immutabel);
  (c) volle Finish-Metadaten aus payload_json mappen.
- Enqueue-Dedupe (optional): vor Insert prüfen, ob offene Op für `entity_local_id` existiert —
  harmlos auch ohne, da Sync idempotent.

## I. Idempotenzstrategie
- **Session:** stabile `local_id` + client-UUID als Remote-PK + `upsert(onConflict:'id')`
  → „Remote OK, lokale ACK unterbrochen" ist bei Retry ein Upsert (kein Duplikat).
- **Punkte/Marker:** Full-Session-Sync = **replace** (`delete from track_points where session_id=? and point_type='lay'` → insert) → wiederholbar ohne Duplikate; danach `updateTrackPointSyncStatus('synced')`.
- **Doppeltipp/Doppel-Retry:** `beganRef`/`stoppingRef` (Screen) + `running`-Guard (syncEngine)
  + Upsert/Replace → weder Datenverlust noch Doppel-Fährten.
- **App-Kill während Pending:** alle Artefakte (Session, Punkte, Marker, Queue-Eintrag) liegen in
  SQLite; nächster Start → `SyncProvider` → `syncNow` → idempotenter Upload. Kein offener Promise nötig.

## J. Auth-/Offline-Strategie
- Lokale Session-Erzeugung **ohne** Netz: `user.id` aus `session-context`/`useSession` (in-memory,
  `getSession()`-basiert) an `beginRecording` übergeben. `supabase.auth.getUser()` (Netz) im
  Recorder **entfernen**.
- Ohne User-ID (unwahrscheinlich, da Fährte Pro-only + eingeloggt): Fallback lokale Session mit
  `user_id` aus letzter bekannter Session; Sync wartet bis Login vorhanden (`syncNow` bricht ohne
  Session sauber ab — bereits so).

## K. Testplan (automatisiert; Muster: gemocktes `getLocalDb` + gemockter `remoteTrainingSyncService`)
1. **Online-Fährte:** lokale Session + Punkte/Marker; nach Sync remote upsert + `status='synced'`.
2. **Offline beim Start:** lokale Session wird ohne `getUser()`/Netz erzeugt (kein Throw).
3. **Offline beim Stop:** finalisiert lokal, `saveState='saved_local_pending_sync'`, Queue-Eintrag da.
4. **Remote-Save schlägt fehl:** lokale Session/Punkte/Marker vollständig, `sync_status='failed'`, im Verlauf sichtbar.
5. **App-Kill direkt nach Stop (simuliert via frische Repo-Reads):** Session + Queue-Eintrag persistiert.
6. **Retry nach Netz-Rückkehr:** `syncNow` → remote synced, `remote_id` gesetzt, Kinder verknüpft.
7. **Doppeltipp Stop:** genau eine lokale Session (beganRef/stoppingRef).
8. **Doppelter Sync-Versuch:** zweiter `syncTrainingSession` upsertet → keine Remote-Duplikate (Insert-Args einmalig/ident).
9. **Remote OK, ACK unterbrochen:** `remote_id` noch null → Retry upsertet auf clientUuid (kein Duplikat).
10. **Sehr kurze Fährte + sofort Stop:** trotz fehlender Remote-ID lokal gespeichert + pending.
11. **Langsames Netz:** Navigation nach Stop verliert lokalen Save nicht (lokaler Flush await vor Navigation).
12. **Punkte/Marker/Winkel vollständig:** Anzahl lokal == aufgenommen; nach Sync remote == lokal.
13. **Background während Pending:** nächster `syncNow` (Foreground/Reconnect) synchronisiert.
14. **Idempotenz Points-Replace:** doppelter Points-Sync → remote-Zeilenzahl konstant (delete+insert).

## L. Real-Device-Testplan (später, manuell)
Flugmodus · stark gedrosseltes Netz · Stop + App sofort schliessen · Background direkt nach Stop ·
wieder online → Verlauf prüfen (Fährte da, dann „synchronisiert") · keine Duplikate · Punkte/
Winkel/Gegenstände vollständig · iPhone + Android.

## M. Empfohlene Commit-Aufteilung
- **P-SAVE1 — Local-first Session + ID-Race:** synchrone lokale Session mit voller Metadaten,
  client-UUID als führende Remote-ID, `getUser()` raus, Puffer/Marker gegen `local_id`,
  Navigation unabhängig von Remote-ID. (+ SaveState-Grundgerüst)
- **P-SAVE2 — Enqueue + idempotenter Remote-Sync/Retry:** `enqueueSyncOperation` im Finish,
  `syncTrainingSession` Upsert + Points/Markers-Replace + volle Finish-Metadaten, Retry-Pfad.
- **P-SAVE3 — Verlauf mit Pending/Failed-Status:** lokal+remote Merge, Sync-Badge, „Fehler ≠ weg".

Trennung durch echten Code bestätigt: P-SAVE1 (Recorder/Screen/localRepo), P-SAVE2 (sync/*),
P-SAVE3 (app/track/index+historie). Reihenfolge strikt P-SAVE1 → 2 → 3.

## N. Risiko
- **Client-seitige UUID als PK:** verifizieren, dass RLS-Insert-Policy `owner_id=auth.uid()` prüft
  (nicht die id) und `id` client-seitig erlaubt ist — sehr wahrscheinlich, **vor P-SAVE2 belegen**.
- **Doppelpfad Übergang:** solange alt (`createTrackSession`/`finishTrackRecording`, direkt) und neu
  (queue) koexistieren, Doppel-Insert vermeiden → in P-SAVE1/2 den direkten Remote-Pfad durch den
  Queue-Pfad **ersetzen**, nicht danebenstellen.
- **payload_json-Vertrag:** Reader (remoteSync) und Writer (localRepo) müssen dasselbe Schema teilen
  (ein Typ, zentral) → Fehlmapping = fehlende Remote-Felder.
- **Punkte-Replace:** `delete`-Recht auf `track_points` per RLS nötig; sonst insert-only + client_id-Migration.
- **useTrackRecording-Zwilling:** falls noch aktiv, gleiche Umstellung, sonst Divergenz.
- Scope-Grenze: **Run/Absuche-Save** (`finishTrackRun`) hat dieselbe Remote-only-Schwäche, ist aber
  NICHT Teil dieses Plans (separater Folgeauftrag; Run hat bereits `trackPersist`-Recovery).

## O. Umsetzung ohne Datenmigration möglich?
**JA.** Remote: 0 Migration (client-UUID-Upsert + Points-Replace). Lokal: 0 Migration via
`payload_json` (optional additive v7 `client_uuid` nur zur Lesbarkeit, idempotent). Keine
Rückwärts-Inkompatibilität; bestehende Fährten unberührt.

---

## P. Verifikation Supabase-Schema & RLS (Quelle: `supabase/production_public_schema_snapshot.sql`)

### P.1 Schema `training_sessions`
- `id uuid DEFAULT gen_random_uuid() NOT NULL` (Zeile 947) → **explizite Client-UUID beim INSERT
  erlaubt** (Default greift nur, wenn `id` weggelassen wird).
- PK: `training_sessions_pkey PRIMARY KEY (id)` (1367) → Upsert-Konfliktziel `id` gültig.
- **Keine Trigger** auf `training_sessions`, **kein** `BEFORE INSERT`-`id`-Override, **kein**
  `FORCE ROW LEVEL SECURITY` → Client-`id` wird nicht überschrieben.
- **NOT-NULL-Pflichtfelder:** `owner_id`, `dog_id`, `category`, `training_type` (Default 'privat'),
  `session_date`. ⚠️ Der lokale Session-Record muss diese führen — heute setzt `beginRecording`
  `dog_id` **nicht** (→ null); in P-SAVE1 zwingend lokal persistieren, sonst NOT-NULL-Verletzung
  beim Remote-Upsert.

### P.2 RLS `training_sessions` (alle FOR `authenticated`)
- INSERT: `WITH CHECK (owner_id = auth.uid())` (2008)
- UPDATE: `USING (owner_id = auth.uid())` (2020) — kein separates WITH CHECK ⇒ Postgres wendet
  USING **auch als WITH CHECK** an (neue Zeile muss ebenfalls `owner_id=auth.uid()`).
- SELECT (2024) / DELETE (2000): `owner_id = auth.uid()`.
- **Fazit Upsert:** INSERT (eigene UUID + owner_id=auth.uid()) erlaubt; bei Konflikt DO UPDATE
  greift UPDATE-USING → nur **eigene** Session wird aktualisiert. Fremde UUID ⇒ USING falsch ⇒
  Update verweigert (Fehler), **kein Überschreiben fremder Sessions**.

### P.3 RLS Child-Tabellen `track_points` / `track_markers` / `track_runs` / `track_engine_sessions`
- Policy „owner via session" `FOR ALL`, **USING und WITH CHECK** =
  `EXISTS (training_sessions s WHERE s.id = child.session_id AND s.owner_id = auth.uid())`
  (2345–2365).
- FK je `session_id → training_sessions(id) ON DELETE CASCADE` (1788–1803).
- ⇒ **INSERT** von Kindern nur gegen **eigene** Parent-Session; **DELETE** (Replace-by-session)
  ebenso owner-scoped. Fremd-Session als FK ⇒ WITH CHECK falsch ⇒ verweigert.

### P.4 Sicherheitsurteil
**CLIENT-UUID SICHER MIT BESTEHENDER RLS: JA.** Ein Client kann keine fremde Session/Child-Daten
überschreiben oder verändern (owner-Bedingung greift bei INSERT/UPDATE/DELETE/SELECT). UUIDs sind
zufällig/unratbar; ein Konflikt mit fremder UUID scheitert sauber (kein Datenabfluss, keine Mutation).

### P.5 Migrations-/Möglichkeits-Matrix
- **A. Remote-Schemaänderung nötig:** NEIN.
- **B. RLS-Änderung nötig:** NEIN.
- **C. Child-Table-Änderung nötig:** NEIN.
- **D. `upsert(onConflict:'id')` möglich:** JA (id = PK; INSERT+UPDATE-Policies vorhanden).
- **E. clientUuid als `training_sessions.id` empfehlenswert:** JA — Voraussetzung: NOT-NULL-Felder
  (v. a. `dog_id`, `owner_id`, `category`, `session_date`) im lokalen Record führen.
- **Kleinste sichere Alternative** (falls doch nicht gewünscht): Client-UUID nur lokal, Remote-`id`
  weiter serverseitig; Idempotenz über additive Spalte `training_sessions.client_id uuid unique`
  (= Remote-Migration + RLS unverändert) und `upsert(onConflict:'client_id')`. Punkte/Marker dann
  via Replace-by-session. Diese Alternative ist NICHT nötig, da P.1–P.4 die id-Variante absichern.

### P.6 Punkte/Marker-Idempotenz (bestätigt umsetzbar)
Replace-by-session (`delete from track_points where session_id=? and point_type='lay'` → insert)
ist durch die Child-Policy (DELETE+INSERT owner-scoped) gedeckt → **keine Remote-Duplikate**,
keine Migration.

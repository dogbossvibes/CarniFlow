# CODEX P0 REVIEW

Unabhaengiger Review gegen den aktuellen Repository-Code. Keine Produktcode-, SQL- oder Migrationsaenderung, kein Commit, kein Push. Remote-Supabase wurde in diesem Codex-Pass nicht direkt kontaktiert; Remote-Aussagen werden daher nur als plausibel/aus Claude belegt, nicht als von Codex bestaetigt, markiert.

## 1. Review Verdict

APPROVED WITH CORRECTIONS

Claudes Analyse ist in den grossen Linien belastbar: fehlende lokale Migrations-Baseline, kanonischer Track-Pfad, AngleKind/SQL-Drift, NEWBIE/CONNECT-Konflikt, Legacy-Datenrisiko und mehrere Offline-Persistenzpfade sind code-seitig nachvollziehbar. Korrekturen sind noetig bei der GPS-P0-Behauptung, bei Teilen der Offline-Matrix und bei der Beweiskraft von Remote-Schema-Aussagen.

## 2. Confirmed Claude Findings

- `supabase/migrations/` existiert lokal nicht. Der pruefende Befehl gegen `./supabase/migrations` liefert keinen Treffer.
- Es gibt 41 Root-SQL-Dateien: `AI_COACH_SETUP.sql`, `AI_EMBEDDINGS_SETUP.sql`, `ANALYTICS_SETUP.sql`, `CALENDAR_MULTI_SETUP.sql`, `CALENDAR_SETUP.sql`, `CAPABILITY_MIGRATE.sql`, `CAPABILITY_MODEL_SETUP.sql`, `CONNECTION_CHAT_MIGRATE.sql`, `CONNECTION_CHAT_SETUP.sql`, `CONNECT_SETUP.sql`, `DOGS_PROFILE_SETUP.sql`, `DOG_COMMANDS.sql`, `DOG_DOCUMENTS_STORAGE.sql`, `DOG_HEAT_CYCLES.sql`, `DOG_HUB_SETUP.sql`, `DOG_PROFILE_SETUP.sql`, `FAEHRTE_SUCHE_SETUP.sql`, `FOUNDER_WEBHOOK_SETUP.sql`, `INTERNAL_TESTER_SETUP.sql`, `MEDIA_SETUP.sql`, `MESSAGES_SETUP.sql`, `OPTIONAL_CLEANUP.sql`, `PHASE_D_POLICIES.sql`, `PREMIUM_SETUP.sql`, `SPARTEN_SETUP.sql`, `SUBSCRIPTIONS_SETUP.sql`, `SUBSCRIPTION_NEWBIE_MIGRATION.sql`, `SUBSCRIPTION_V2_SETUP.sql`, `SUPABASE_USER_LOCALE.sql`, `TRACK_ENGINE_DATA_SETUP.sql`, `TRACK_MARKER_ANGLE.sql`, `TRACK_MARKER_MATERIAL.sql`, `TRACK_MODULE_SETUP.sql`, `TRAINER_FLOW_REPAIR.sql`, `TRAINER_PLAN_SETUP.sql`, `TRAININGPLAENE_SETUP.sql`, `TRIAL_CANCEL_SETUP.sql`, `UMFRAGE_SETUP.sql`, `USER_ENTITLEMENTS_SETUP.sql`, `VISIBILITY_POLICIES.sql`, `VOICE_NOTES_SETUP.sql`.
- `user_entitlements` existiert im Code: `services/entitlementService.ts` liest `supabase.from('user_entitlements')`, und `services/capabilityService.ts` ruft `getActiveEntitlement()` auf. `USER_ENTITLEMENTS_SETUP.sql` definiert die Tabelle lokal als ad-hoc SQL. Claudes Remote-404-Aussage ist plausibel, aber in diesem Codex-Pass nicht eigenstaendig remote bestaetigt.
- `training_sessions(type='track')` ist der aktive Track-Hauptpfad. `features/tracking/services/trackService.ts` erstellt/liest `training_sessions`, `track_points.session_id`, `track_markers.session_id`, `track_runs.session_id`, `track_engine_sessions.session_id` und `training_sessions.track_data`.
- `services/trackingService.ts` ist Legacy-DB-Code fuer `track_sessions`, `track_points.track_id` und `track_articles`. Der einzige lokale Import ist `hooks/useTrackSessions.ts`; dieser Hook wird in `app/`, `features/`, `services/`, `components/` nicht aufgerufen. Code-seitig sind `trackingService.ts` und `useTrackSessions.ts` entfernbar, wenn keine externen/deep dynamic imports ausserhalb des Repo existieren.
- `track_sessions` und `track_articles` sind code-seitig Legacy. Daten-seitig sind sie nicht entfernbar, solange Claudes Remote-Befund von 22 `track_sessions`- und 4 `track_articles`-Zeilen nicht abgeglichen/migriert ist.
- `lib/trackRecorder.ts` ist nicht dead. Es ist kein alter Telefon-GPS-Recorder mehr, aber weiterhin Runtime-relevant als externer BLE-GPS-Puffer ueber `positionStream.ts`.
- `AngleKind` unterstuetzt im Code tatsaechlich `links`, `rechts`, `spitz_links`, `spitz_rechts`, `spitz`, `absatz`, `abriss`. `TRACK_MARKER_ANGLE.sql` erlaubt nur `links`, `rechts`, `spitz`, `absatz`; `abriss`, `spitz_links`, `spitz_rechts` koennten bei aktivem Remote-CHECK nicht persistierbar sein.
- OW/BW haben keine eigenen Codewerte, keine DB-Spalten und keinen eigenen Marker/Event-Typ im aktuellen Code. Sie existieren als Dokumentation/Anforderung, nicht als implementiertes Datenmodell.
- GS ist ueber `MarkerType='gegenstand'`, `MarkerMaterial`, `track_markers.material/found/audio_url/note/position` implementiert. Zusaetzlicher Drift: `MarkerMaterial` enthaelt `duebel`, `metall`, `teppich`, aber `TRACK_MARKER_MATERIAL.sql` erlaubt diese Werte nicht.
- TS/TrackSegment ist implementiert und wird in `training_sessions.track_data.segments` als JSON persistiert; lokal/recovery-seitig liegen Segmente auch im AsyncStorage-Snapshot.
- `planToCapabilities('newbie')` ergibt `{ pro_member: true, trainer_module: false }`. `activatePlan()` schreibt diese Capabilities; `useCapabilities()` macht daraus `isPro=true`, `isTrainerModule=false`.
- `connectEntitlements({ isPro: true, isTrainerModule: false })` ergibt: `canViewFeed=true`, `canCreatePost=true`, `canSendMessage=true`, `canCreateEvent=true`, `canSearchTrainingPartners=true`, `canCreateGroup=false`, `canManageTrainerProfile=false`, `maxFriends=null`.
- Wenn `EXPO_PUBLIC_CONNECT_ENFORCE_ENTITLEMENTS` nicht exakt `true` ist, liefert `effectiveConnectEntitlements()` `ALL_ACCESS`: auch NEWBIE bekommt dann Gruppen, Trainerprofil-Verwaltung und unbegrenzte Freunde.
- Es existieren mehrere Persistenzrollen: Zustand fuer Live-UI, AsyncStorage fuer Recovery/Registry, SQLite fuer lokale Fach-/Recovery-Persistenz, Supabase als Remote-Ziel, `sync_queue` fuer generischen Sync.

## 3. Incorrect Claude Findings

- Claudes GPS-P0-Feststellung "Foreground natives Modul + Background expo-location laufen gleichzeitig und speisen parallel denselben `onFix`" ist fuer den aktiven `useTrackRecorder` zu stark. Nach erfolgreichem `startBackgroundUpdates()` wird `watchRef.current?.remove(); watchRef.current = null;` ausgefuehrt. Es gibt ein moegliches Umschaltfenster und einen Fallback-Fall ohne Background-Berechtigung, aber keinen belegten dauerhaften Parallelbetrieb im aktiven Legepfad.
- Claudes Aussage "kein AppState-Gating" ist isoliert richtig, aber daraus folgt nicht automatisch parallele Daueraufzeichnung, weil der Code explizit den Warmup/Foreground-Watch beim Background-Service-Start abloest.
- P0-06 vermischt in der Matrix teilweise die generische `sync_queue` mit dem aktiven Recorder-Schreibpfad. Der aktive Recorder schreibt Trackpoints direkt via `createLocalTrackPointsBatch()` nach SQLite und final via `finishTrackRecording()` nach Supabase; er enqueued dabei nicht automatisch `sync_queue`-Operationen.
- "Zwei Offline-Modelle" ist als Risiko richtig, aber nicht komplett ein Architekturfehler. Ein Teil ist bewusstes Recovery-Design: Zustand/AsyncStorage halten Crash-Recovery und UI-Lifecycle, SQLite haelt lokale Fachpersistenz fuer Punkte/Marker/Suchpunkte, Supabase bleibt Remote-Ziel.

## 4. Missing Findings

- Material-Constraint-Drift ist P0-nah: UI und Typen erlauben `duebel`, `metall`, `teppich`; lokale SQL-Constraint erlaubt sie nicht.
- Der aktive Recorder setzt lokale `local_training_sessions` auf `synced`, wenn `finishTrackRecording()` erfolgreich war, aber Punkte/Marker koennen trotzdem lokal `pending` bleiben. Falls spaeter eine `sync_queue` fuer diese lokale Session existiert oder erzeugt wird, kann der generische Sync dieselben Kinder erneut hochladen.
- `trackService.saveTrackMarker()` persistiert Marker sofort remote, waehrend `createLocalTrackMarker()` dieselben Marker lokal mit `sync_status='pending'` ablegt. Ohne Remote-ID-Verknuepfung ist das ein konkreter Duplikatpfad, sobald generischer Sync fuer diese lokale Session laeuft.
- Suchpunkte haben Dedup nur bei Recovery (`dedupeSearchPoints()`), nicht als generelles GPS-Source-Dedup im aktiven `onFix`. Distanz-Gates reduzieren, ersetzen aber keine Timestamp-/Source-Idempotenz.
- `useTrackRecording.ts` und `useTrackRun.ts` sind unreferenzierte alternative Implementierungen und sollten separat als Cleanup-Risiko behandelt werden; sie sind nicht der aktive Screen-Pfad.

## 5. Risky Assumptions

- Alle Remote-Aussagen aus Claude, darunter Remote-Migrationshistorie, Row-Counts, `user_entitlements` 404, Spalten-HTTP-Codes und Remote-Tabellenexistenz, sind in diesem Codex-Pass nicht remote verifiziert. Sie sind plausibel, aber fuer Umsetzungsschritte weiterhin durch Dump/psql/service-role zu bestaetigen.
- Root-SQL-Dateien sind keine Quelle der Remote-Wahrheit. Sie belegen lokale Drift, aber nicht, welche CHECK-Constraints remote aktiv sind.
- Legacy-Code kann code-seitig entfernt werden; Legacy-Daten koennen nicht ohne Datenabgleich, Backup, Account-Delete-Pruefung und versionierte Migration entfernt werden.
- NEWBIE als `pro_member=true` kann eine bewusste Produktentscheidung sein. Der Konflikt besteht nur, wenn die CONNECT-Tierbeschreibung "Newbie begrenzt" verbindlich ist.
- Offline-Duplikationsrisiko ist real, aber nicht automatisch Datenverlust. Es braucht Laufzeit-/Sync-Verifikation, welche Queue-Operationen fuer Recorder-Sessions tatsaechlich entstehen.

## 6. ADR Review

| ADR | Claude Status | Codex Status | Urteil | Begruendung |
|---|---|---|---|---|
| ADR-000 | PARTIAL | PARTIAL | AGREE | Kanonischer Track-Runtime-Pfad ist erreicht, aber Legacy-Datenmodell und fehlende Migrations-Baseline bleiben offen. |
| ADR-001 | PARTIAL | PARTIAL | AGREE | Winkel/GS/TS existieren, OW/BW fehlen, AngleKind/Material-Constraints driften. |
| ADR-002 | FAIL | FAIL | AGREE | Keine lokale Migration-Baseline, Root-SQL statt reproduzierbarer DB-Wahrheit, Remote-Schema nicht lokal reviewbar. |
| ADR-003 | NOT VERIFIABLE | NOT VERIFIABLE | AGREE | RLS/Policies/Auth-Flows wurden lokal nicht belastbar verifiziert. |
| ADR-004 | PARTIAL | PARTIAL | AGREE WITH CORRECTION | Quellenabstraktion existiert; Providerwechsel und fehlendes globales Dedup bleiben Risiken. Claudes paralleler Dauerlistener-Befund ist aber zu stark. |
| ADR-005 | PARTIAL | PARTIAL | AGREE | Lifecycle/Recovery existiert, OW/BW fehlen, alternative alte Hooks bleiben als Cleanup-Risiko. |
| ADR-006 | NOT VERIFIABLE | NOT VERIFIABLE | AGREE | Smart Analysis/Edge/AI war nicht belastbar Teil dieses Codex-Reviews. |
| ADR-007 | PARTIAL | PARTIAL | AGREE WITH CORRECTION | Mehrere Persistenzmodelle existieren; teilweise bewusstes Recovery-Design, nicht nur Konflikt. Sync-Idempotenz bleibt offen. |
| ADR-008 | FAIL | FAIL | AGREE | `user_entitlements`-Pfad ist im Code vorhanden, Remote-Existenz unbewiesen/laut Claude fehlend; NEWBIE kollabiert zu Pro. |
| ADR-009 | PARTIAL | PARTIAL | AGREE | Entitlement-Service ist zentral, aber Flag default off und NEWBIE=`isPro` machen CONNECT-Tiers unwirksam. |
| ADR-010 | NOT VERIFIABLE | NOT VERIFIABLE | AGREE | UI/Navigation nicht systematisch geprueft. |
| ADR-011 | PARTIAL | NOT ENOUGH EVIDENCE | CHANGE: NOT VERIFIABLE | Tests wurden lokal nicht ausgefuehrt; aus Dateiexistenz allein folgt keine Strategie-/Coverage-Bewertung. |
| ADR-012 | NOT VERIFIABLE | NOT VERIFIABLE | AGREE | Release/Deployment nicht geprueft. |

## 7. P0 Risk Ranking

| Problem | Severity | Code Evidence | Action |
|---|---|---|---|
| Fehlende Remote-DB-Baseline | BLOCKER | Kein `supabase/migrations/`; 41 Root-SQL-Dateien; Remote-DDL nicht lokal reproduzierbar | Remote schema-only Dump/Baseline als erste versionierte Migration erstellen. |
| AngleKind / SQL-Constraint | BLOCKER | `AngleKind` 7 Werte in `trackingStore.ts`; `TRACK_MARKER_ANGLE.sql` nur 4 Werte; `saveTrackMarker()` schreibt `angle_kind` | Remote-CHECK verifizieren und Constraint/Code angleichen. |
| Material / SQL-Constraint | HIGH | `MarkerMaterial` 8 Werte; `TRACK_MARKER_MATERIAL.sql` 5 Werte | In denselben Constraint-Fix aufnehmen. |
| OW/BW | MEDIUM | Nur Doku-Treffer; keine Codewerte/Spalten/Event-Typen | ADR-Entscheidung vor fachlicher Vollstaendigkeit, aber kein technischer Freeze-Blocker fuer existierende Pfade. |
| NEWBIE Capability-Konflikt | HIGH | `planToCapabilities()` setzt alle Plaene auf `pro_member=true`; `connectEntitlements()` nutzt nur `isPro`; Flag off ergibt `ALL_ACCESS` | Produktentscheidung und Runtime-Modell trennen: Plan/Tier statt nur Pro-Bool. |
| Legacy `track_sessions` | HIGH | `trackingService.ts` Legacy dead; Claude meldet 22 Remote-Zeilen | Code erst nach Datenabgleich entfernen; Daten-DROP erst nach Migration/Backup. |
| Parallele GPS-Listener | MEDIUM | `setTrackFixHandler()` + `startLocationUpdatesAsync()` speisen denselben `onFix`; aktiver Code stoppt aber Foreground-Watch nach erfolgreichem BG-Start | Source-Zustand/Dedup verifizieren, Umschaltfenster absichern, Providerwechsel testen. |
| Offline-Persistenz | HIGH | Store+AsyncStorage+SQLite+Supabase; Marker/Punkte direkt remote und lokal pending; SyncEngine kann lokale Kinder hochladen | SoT und Idempotenz definieren; Remote-IDs/Synced-Status fuer direkt gespeicherte Kinder setzen. |
| `user_entitlements` Remote-Fehlen | HIGH | `entitlementService.ts` referenziert Tabelle; lokale SQL existiert; Remote-404 nur Claude-Beleg | Remote verifizieren; Migration anwenden oder Feature bewusst deaktivieren. |

## 8. Recommended Fix Order

P0-FIX-01: Remote-DB-Baseline erstellen. `pg_dump --schema-only`/Supabase-Dump per autorisiertem Zugriff, dann erste lokale Migration unter `supabase/migrations/`. Keine produktive Schemaaenderung im selben Schritt.

P0-FIX-02: Remote-DDL fuer `track_markers.angle_kind` und `track_markers.material` verifizieren und beide Constraints in einer versionierten Migration an Codewerte angleichen.

P0-FIX-03: `user_entitlements` Entscheidung treffen: Tabelle als Migration bereitstellen oder Lifetime/manuelle Entitlements aus Runtime-Gating entfernen/deaktivieren.

P0-FIX-04: NEWBIE/CONNECT-Modell entscheiden. SubscriptionPlan, `user_capabilities`, Runtime-Capability und CONNECT-Entitlements so trennen, dass NEWBIE-Limits entweder bewusst entfallen oder technisch greifen. Enforce-Flag fuer Zielumgebungen festlegen.

P0-FIX-05: Legacy-Tracking-Daten abgleichen. Beweisen, dass die 22 `track_sessions`/4 `track_articles` migriert oder bewusst verworfen sind; erst danach Legacy-Code und spaeter Legacy-Tabellen entfernen.

P0-FIX-06: Offline-Idempotenz definieren. Direkt remote gespeicherte Marker/Punkte muessen lokale Remote-IDs bzw. `synced`-Status bekommen, oder der Recorder muss konsequent ueber einen einzigen Sync-Pfad laufen.

P0-FIX-07: GPS-Lifecycle pruefen und haerten. Runtime-Logging nach `source/provider`, Dedup gegen ruecklaeufige/identische Timestamps, klarer FG/BG-Umschaltzustand.

P0-FIX-08: OW/BW als fachliche Folgeentscheidung in ADR-001/005 festlegen und dann in TrackEvent/Marker/JSON-Modell implementieren.

P0-FIX-09: Dead Code Cleanup: `services/trackingService.ts`, `hooks/useTrackSessions.ts`, `useTrackRecording.ts`, `useTrackRun.ts` und Legacy-Typen nur nach Daten-/Runtime-Freigabe entfernen.

## 9. Final Recommendation

Ist die Analyse belastbar genug, um mit P0-FIX-01 zu beginnen?

JA.

Empfohlener P0-FIX-01: Remote-DB-Baseline erstellen und als lokale versionierte Migration ablegen.

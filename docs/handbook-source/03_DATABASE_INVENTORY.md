# 03 — Database Inventory (Ist-Zustand)

> Analysebericht. Ist-Zustand. Basiert auf den Root-`*.sql`-Setup-Dateien und den Tabellennamen, die der Client tatsächlich referenziert. **[UNKLAR]** = nicht gegen die laufende Supabase-Instanz verifiziert (nur aus Dateien abgeleitet).

## Zweck

Bestandsaufnahme von Supabase-Schema, „Migrationen" (lose SQL-Dateien), RLS und lokaler SQLite-Struktur.

## Gefundene Dateien

- **Kein** `supabase/migrations/`-Verzeichnis. Schema/Setup liegt als **~50 lose `*.sql`-Dateien im Repo-Root** (z. B. `TRACK_MODULE_SETUP.sql`, `TRACK_ENGINE_DATA_SETUP.sql`, `CONNECT_SETUP.sql`, `CAPABILITY_MODEL_SETUP.sql`, `SUBSCRIPTION_V2_SETUP.sql`, `DOG_HUB_SETUP.sql`, `VISIBILITY_POLICIES.sql`, `PHASE_D_POLICIES.sql`, …).
- Zusätzliche „MIGRATE"-Dateien deuten auf manuelle Nachträge: `CAPABILITY_MIGRATE.sql`, `CONNECTION_CHAT_MIGRATE.sql`, `SUBSCRIPTION_NEWBIE_MIGRATION.sql`, `TRAINER_FLOW_REPAIR.sql`.
- Lokale SQLite-Migrationen (offline): `lib/localDb/migrations.ts` (versioniert, idempotent, Ledger `local_schema_migrations`), Client `lib/localDb/client.ts`.
- Edge Functions: `supabase/functions/` (13, siehe Bericht 09/13/18).

## Remote-Tabellen (`public.*`, aus SQL-`CREATE TABLE` extrahiert)

Kern/Domäne: `profiles`, `subscriptions`, `user_capabilities`, `user_entitlements`, `founder_slots`, `messages`, `calendar_events`.

Hunde: `dog_commands`, `dog_documents`, `dog_goals`, `dog_health_entries`, `dog_heat_cycles`, `dog_vet_appointments`. **[UNKLAR]** Die Basistabelle `dogs` selbst wird vom Client stark referenziert (`services/dogs.ts`, Joins `dog:dogs(name)`), taucht aber in den gegrepten `CREATE TABLE`-Zeilen nicht auf → ihr Setup liegt vermutlich in einer nicht erfassten Datei oder wurde direkt in Supabase angelegt (**muss verifiziert werden**).

Tracking (aktiv): `track_points`, `track_markers`, `track_runs`, `track_engine_sessions`. Die **Session** selbst ist `training_sessions` (Spalten `type='track'`, `track_data jsonb`, `distance_meters`, `laying_duration_seconds`, `corners_total`, `articles_total`, `distractions_total`, `search_duration_seconds`, `average_deviation_meters`, `articles_found` …) — belegt durch `features/tracking/services/trackService.ts`. **[UNKLAR]** `training_sessions` erscheint nicht in den gegrepten `CREATE TABLE`-Zeilen (Setup-Datei nicht eindeutig lokalisiert).

Legacy-Tracking: `track_sessions` (referenziert nur von `services/trackingService.ts` + `types/tracking.ts`; `track_points` hier mit `track_id`/`seq`, im aktiven Pfad dagegen `session_id`/`point_type`). → Zwei-Modell-Konflikt, Bericht 04/11.

AI/Analytics: `ai_insights`, `training_embeddings`, `training_analysis`, `training_recommendations`.

Connect (Community): `connect_profiles`, `connect_dog_profiles`, `connect_posts`, `connect_post_media`, `connect_post_comments`, `connect_post_reactions`, `connect_friendships`, `connect_blocks`, `connect_reports`, `connect_conversations`, `connect_conversation_members`, `connect_messages`, `connect_privacy_settings`, `connect_training_events`, `connect_event_locations`, `connect_event_participants`.

Connections (Trainer↔Kunde, älteres System): `connections`, `connection_invites`, `connection_messages`, `connection_chats`, `connection_permissions`.

Trainings-Pläne/Umfragen: `training_plans`, `trainer_umfragen`, `umfrage_antworten`, `umfrage_einladungen`, `umfrage_termine`.

Voice: `voice_notes`.

> **[UNKLAR]** Weitere vom Client referenzierte Tabellen (z. B. `training_units`, `dogs`, `training_sessions`) sind im Code klar genutzt, aber ihre `CREATE TABLE`-Definition wurde in den Root-SQL nicht eindeutig gefunden → Schema-Quelle unvollständig/verstreut.

## RLS

- RLS/Policies sind in **24 SQL-Dateien** definiert; **131 `CREATE POLICY`-Statements** insgesamt (u. a. `VISIBILITY_POLICIES.sql`, `PHASE_D_POLICIES.sql`, `CONNECT_SETUP.sql`, `CAPABILITY_MODEL_SETUP.sql`, `SUBSCRIPTION_V2_SETUP.sql`).
- **[UNKLAR]** Vollständigkeit/Aktualität der RLS wurde **nicht** je Tabelle auditiert; ob jede Tabelle RLS aktiviert hat, ist offen.
- Serverseitige Sicherungslogik u. a. `public.claim_founder_slot()` (RPC mit `pg_advisory_xact_lock`, referenziert in `features/subscription/plans.ts`) — autoritative Slot-Prüfung liegt in der DB, nicht im Client.

## Lokale SQLite-Struktur (`lib/localDb/migrations.ts`)

Versionen 1–6: `local_training_sessions`, `local_track_points`, `local_track_markers`, `local_media_files`, `sync_queue`, plus V6 `add angle_kind to local_track_markers`. Ledger: `local_schema_migrations`. Spiegelt den **aktiven** Track-Datenpfad (`training_sessions`/`track_points`/`track_markers`), **nicht** das Legacy-`track_sessions`.

## Tatsächlicher Datenfluss

- Remote-Schreibpfade laufen ausschließlich über `lib/supabase.ts`.
- Offline-Schreibpfad: SQLite-Repos (`features/*/repositories/local*`) → Sync-Queue → `remoteTrainingSyncService` → Supabase (Bericht 07).

## Bestehende Abhängigkeiten

- `training_sessions.track_data` (jsonb) trägt heterogene Inhalte: `plan{}`, `segments[]`, `legs[]`, `score` (`trackService.ts`). → Semi-strukturierte Datenhaltung.

## Aktuelle Regeln

- Handbuch: „Neue Ereignisse ausschließlich über TrackEvents, nicht über neue Tabellen" (`docs/faehrte/05_FAEHRTE.md`). Ist-Zustand weicht ab (Teilstrecken in JSON, Winkel/Gegenstände in `track_markers`).

## Inkonsistenzen

- Kein versioniertes Migrations-System / kein Ausführungs-Ledger für Remote-Schema.
- Zwei Track-Session-Tabellen (`training_sessions[type=track]` vs. `track_sessions`).
- Schema-Definitionen für zentrale Tabellen (`dogs`, `training_sessions`, `training_units`) nicht eindeutig auffindbar.

## Offene Fragen

- Welche SQL-Dateien sind produktiv eingespielt (und in welcher Reihenfolge)?
- Wo ist das `CREATE TABLE` für `dogs`/`training_sessions`/`training_units`?
- Hat jede Remote-Tabelle RLS aktiviert?

## Technische Risiken

- Ohne Ledger ist Schema-Drift real und schwer diagnostizierbar; „best-effort"-Fehlerbehandlung im Client (`trackService`) verdeckt fehlende Migrationen zur Laufzeit.
- Heterogenes `track_data`-JSON ohne Schema-Validierung → Feld-Kollisionen möglich (Merge-Logik in `finishTrackRecording`/`saveTrackEvaluation` mildert, garantiert aber nichts).

## Mögliche spätere Verbesserungen

- Einführung `supabase/migrations/` mit Ledger; Bestandsschema per `db pull` erfassen.
- Konsolidierung auf ein Track-Session-Modell.
- JSON-`track_data` gegen ein dokumentiertes Schema validieren.

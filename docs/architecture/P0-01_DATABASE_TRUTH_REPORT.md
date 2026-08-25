# P0-01 — Database Truth Report

**Rolle:** Repository-Analyst (read-only). **Kein** Produktcode, **keine** SQL-Ausführung, **keine** Migration.
**Erstellt:** 2026-07-26
**Remote-Projekt:** `ANYVO` — ref `axkkhyqrjrtbkumaulta` (West EU / Ireland), Postgres `17.6.1.127`

## Verifikationsmethode & Beweiskraft

| Quelle | Zugriff | Beweiskraft |
|---|---|---|
| `supabase migration list --linked` | Remote, read-only (CLI eingeloggt) | **HOCH** — echte Remote-Migrationshistorie |
| `supabase inspect db table-stats --linked` | Remote, read-only | **HOCH** — autoritative Liste existierender Tabellen + Row-Counts |
| PostgREST `?select=<col>&limit=0` mit **Anon-Key** | Remote, read-only, **keine Datenpreisgabe** (limit=0) | **HOCH** für Spalten**existenz** (200 = existiert, 400 `42703` = fehlt) |
| Root-`*.sql`-Dateien | Lokal | **NIEDRIG** für Remote-Zustand — nur „beabsichtigt/angelegt", NICHT als aktueller Remote-Stand behauptet |

> **Nicht** remote-verifizierbar mit den vorhandenen Mitteln (Anon-Key, kein Docker/psql, kein `service_role`-Key):
> vollständige Spalten-DDL, **CHECK-Constraints**, RLS-Policies, Indizes, Trigger, Funktionen/RPCs.
> Diese sind unten als **BLOCKED — REMOTE DDL VERIFICATION REQUIRED** markiert.

---

## 1. Schemaquellen & Migrations-Zustand

- **`supabase/migrations/` existiert NICHT** im Repo.
- **`supabase/functions/`** existiert (13 Edge Functions).
- **41 Root-`*.sql`-Setup-Dateien** (`*_SETUP.sql`, `*_MIGRATE.sql`, …) im Repo-Root — ad-hoc angewandte Skripte, keine versionierte Migrationskette.
- **Remote** hat eine **Migrationshistorie** (`supabase migration list`): erste Einträge ab `20260530175624`, viele weitere. **Spalte „Local" ist durchgehend leer.**

### ⚠️ Kernbefund P0-01-A: Schema-Drift ohne lokale Quelle der Wahrheit
Die Remote-DB wird per Migrationsverlauf verwaltet, aber **keine dieser Migrationen liegt im Repo**. Die Root-SQL-Dateien sind **nicht** dieselbe Quelle und decken sich nicht garantiert mit dem Remote-Stand. Der aktuelle Remote-Zustand ist **nur über Live-Introspektion** feststellbar — genau das wurde hier getan.

---

## 2. Tabellen-Existenz (remote-verifiziert via `table-stats`)

Alle im Auftrag genannten Tabellen — Status **remote**:

| Tabelle | Remote vorhanden | Row-Count (est.) | Bemerkung |
|---|---|---|---|
| `training_sessions` | ✅ JA | 78 | **Kanonisches Ziel** (enthält `type`, `track_data`) |
| `track_sessions` | ✅ JA | **22** | **LEGACY** — existiert parallel, siehe P0-02 |
| `track_points` | ✅ JA | 974 | kanonisch: `session_id` (kein `track_id`) |
| `track_markers` | ✅ JA | 140 | kanonisch: `session_id`, `angle_kind`, `material`, `found` |
| `track_runs` | ✅ JA | 30 | kanonisch: `session_id`, `run_points` (JSON) |
| `track_engine_sessions` | ✅ JA | 4 | kanonisch: `session_id` (**kein `id`**) |
| `track_articles` | ✅ JA | **4** | **LEGACY** — `track_id` (kein `session_id`) |
| `subscriptions` | ✅ JA | 5 | `plan`, `status`, `product_id`, `expires_at`, `trial_ends_at` |
| `user_capabilities` | ✅ JA | 7 | `user_id`, `pro_member`, `trainer_module`, `updated_at` |
| `user_entitlements` | ❌ **NEIN (HTTP 404)** | — | **Tabelle existiert remote NICHT** — siehe P0-01-C |
| `profiles` | ✅ JA | 16 | `plan`, `is_trainer`, `is_internal_tester`, `tester_level` |
| Trainer-Tabellen | ✅ JA | — | `trainer_profiles` (3), `trainer_umfragen`, `coach_relationships` (1), `training_plans`, `shared_trainings` |
| CONNECT-Tabellen | ✅ JA | — | `connections` (2), `connection_invites` (4), `connection_messages` (4), `connection_chats` (2), `connection_permissions` (2) |

Weitere in der Remote-DB vorhandene public-Tabellen (nicht im Auftrag, zur Vollständigkeit): `training_units`, `training_exercises`, `training_comments`, `training_analysis`, `training_media`, `training_recommendations`, `training_embeddings`, `dogs`, `dog_documents`, `dog_heat_cycles`, `dog_goals`, `dog_health_entries`, `dog_vet_appointments`, `calendar_events`, `voice_notes`, `messages`, `ai_insights`, `founder_slots`, `custom_categories`, `umfrage_*`, `trainings`.

---

## 3. Spalten-Verifikation (remote, read-only, ohne Datenpreisgabe)

### 3.1 Track-Kern (Legacy vs. kanonisch)

| Tabelle.Spalte | Remote | Bedeutung |
|---|---|---|
| `track_points.session_id` | ✅ 200 | kanonisch aktiv |
| `track_points.track_id` | ❌ 400 (`42703`) | Legacy-Spalte existiert **nicht** |
| `track_points.point_type` | ✅ 200 | `lay`/`search` |
| `track_markers.session_id` | ✅ 200 | kanonisch |
| `track_markers.track_id` | ❌ 400 | Legacy-Spalte fehlt |
| `track_markers.angle_kind` | ✅ 200 | Winkeltyp (Constraint: siehe P0-03 / BLOCKED) |
| `track_markers.material` | ✅ 200 | Gegenstand-Material |
| `track_markers.found` | ✅ 200 | Gegenstand gefunden |
| `track_markers.distance_from_start` | ✅ 200 | |
| `track_markers.audio_url` | ✅ 200 | Sprachnotiz am Marker |
| `track_runs.session_id` | ✅ 200 | kanonisch |
| `track_runs.run_points` | ✅ 200 | Absuche-Spur als JSON |
| `track_engine_sessions.id` | ❌ 400 | **kein** `id` — PK vermutlich `session_id` |
| `track_engine_sessions.session_id` | ✅ 200 | kanonisch |
| `track_articles.track_id` | ✅ 200 | **LEGACY**-Verknüpfung |
| `track_articles.session_id` | ❌ 400 | fehlt → gehört zum Legacy-Cluster |
| `track_sessions.distance_meters` | ❌ 400 | Legacy hat andere Spaltennamen (SQL: `distanz_m`) |
| `training_sessions.type` | ✅ 200 | Diskriminator `'track'` |
| `training_sessions.track_data` | ✅ 200 | JSON (u. a. `segments`, siehe P0-03) |
| `training_sessions.laying_duration_seconds` | ✅ 200 | |
| `training_sessions.corners_total` / `articles_total` / `distance_meters` | ✅ 200 | Aggregatfelder |

### 3.2 Subscription / Capability

| Tabelle.Spalte | Remote |
|---|---|
| `subscriptions.plan` / `status` / `product_id` / `expires_at` / `trial_ends_at` | ✅ 200 |
| `user_capabilities.user_id` / `pro_member` / `trainer_module` / `updated_at` | ✅ 200 |
| `user_capabilities.plan` | ❌ 400 (**kein Plan-Feld** — Tiers kollabieren zu 2 Booleans, siehe P0-04) |
| `user_capabilities.is_trainer` / `connect_enabled` | ❌ 400 (existieren nicht) |
| `profiles.plan` / `is_trainer` / `is_internal_tester` / `tester_level` | ✅ 200 |

---

## 4. Kritische Befunde

### P0-01-A — Keine versionierten Migrations im Repo
Remote hat Migrationshistorie, lokal `supabase/migrations/` = leer/fehlt. → **Kein reproduzierbarer Schema-Aufbau**, Drift-Risiko, kein Review-Pfad für DB-Änderungen. **P0-Blocker vor Architektur-Freeze.**

### P0-01-B — Zwei Track-Datenmodelle koexistieren remote
`track_sessions` (22) + `track_articles` (4) [Legacy, `track_id`] **und** `training_sessions`+`track_points/markers/runs/engine_sessions` [kanonisch, `session_id`] existieren gleichzeitig mit echten Daten. Detailanalyse: **P0-02**.

### P0-01-C — `user_entitlements` existiert remote NICHT (404)
`USER_ENTITLEMENTS_SETUP.sql` liegt im Repo, die Tabelle ist aber **nicht** in der Remote-DB. `services/entitlementService.ts` fragt sie zur Laufzeit ab → liefert immer `null` (resilient abgefangen). ⇒ **Lifetime-/manuelle Entitlements sind faktisch tot.** Auswirkung: **P0-04**.

### P0-01-D — Root-SQL ≠ Remote-Wahrheit (allgemein)
Root-`*.sql` dürfen nicht als aktueller Remote-Stand gelesen werden. Beispiel: `TRACK_MARKER_ANGLE.sql` definiert eine `angle_kind`-CHECK mit nur 4 Werten — ob diese Constraint remote so aktiv ist, ist **BLOCKED** (siehe unten & P0-03).

---

## 5. BLOCKED — REMOTE DATABASE VERIFICATION REQUIRED

Für folgende Punkte reicht read-only Anon-Introspektion **nicht**; es braucht `service_role`-Key **oder** Docker (`supabase db dump`) **oder** `psql` gegen den Pooler:

1. **CHECK-Constraints** — insb. `track_markers.angle_kind` (Code emittiert 7 Werte, Root-SQL erlaubt 4 → siehe P0-03).
2. **RLS-Policies** je Tabelle (u. a. ob Anon fälschlich Zugriff hat; Legacy-Tabellen-Policies).
3. **Indizes / FKs / Trigger / RPCs** (z. B. `claim_founder_slot()`, `founder_slot_limit()`).
4. **Ob die 22 `track_sessions`-Zeilen** bereits nach `training_sessions` migriert wurden (Daten-Abgleich).
5. **Vollständige Spaltenlisten** aller Tabellen (nur gezielte Existenzchecks erfolgt).

**Empfohlener nächster Schritt (separat, außerhalb dieses Read-only-Passes):**
`SUPABASE_DB_URL=<pooler-url> pg_dump --schema-only` bzw. `service_role`-gestützte Introspektion, um DDL/Constraints/Policies festzuschreiben und daraus die **erste versionierte Migration** (Baseline) zu erzeugen.

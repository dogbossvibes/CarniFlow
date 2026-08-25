# supabase/migrations — Baseline (P0-FIX-01)

> **Status: BLOCKED — REMOTE DATABASE VERIFICATION REQUIRED**
> Dieses Verzeichnis wurde im Rahmen von **P0-FIX-01 (Migrations-Baseline)** angelegt.
> Die eigentliche Baseline-`*.sql` (exakter Remote-DDL) konnte in der aktuellen
> Umgebung **nicht** erzeugt werden — siehe „Warum blockiert". Dieses README ist
> **KEINE** Migration (die Supabase-CLI ignoriert `.md`).

## Ziel von P0-FIX-01
Eine **versionierte Baseline-Migration**, die den **exakten aktuellen Remote-Zustand**
(`public`-Schema inkl. Tabellen, Spalten, **CHECK-Constraints**, RLS-Policies, Indizes,
FKs, Trigger, Funktionen/RPCs) abbildet. Danach dürfen Schemaänderungen **nur noch** als
versionierte Migration erfolgen. Ziel ist ausdrücklich **additiv/nicht-destruktiv** —
**kein** DROP, **keine** Änderung an Produktionsdaten (insb. **nicht** an den 22 `track_sessions`-Zeilen).

## Warum blockiert
Für einen **getreuen** DDL-Dump fehlt in dieser Umgebung jedes geeignete Werkzeug
(read-only geprüft, 2026-07-26):

| Weg | Verfügbar? |
|---|---|
| `supabase db dump` (Docker) | ❌ Docker-Binary nicht installiert |
| `pg_dump --schema-only` | ❌ nicht installiert (kein libpq/Postgres.app) |
| `psql` gegen Pooler | ❌ nicht installiert |
| `service_role`-Key (Management-/DDL-Zugriff) | ❌ nur `anon`-Key in `.env` |
| DB-Passwort für Pooler | ❌ nicht in `supabase/.temp/pooler-url` enthalten |

Was **funktioniert** (und genutzt wurde): `supabase migration list --linked` (CLI ist
eingeloggt) und PostgREST-Existenzchecks mit `anon`-Key (`?select=<col>&limit=0`).
Damit ist **Tabellen-/Spaltenexistenz** verifizierbar, **nicht** aber vollständige DDL/Constraints/RLS.

> **Regel (eingehalten):** Die 41 Root-`*.sql`-Dateien werden **NICHT** als Beweis für den
> aktuellen Remote-Zustand behandelt und dienen **nicht** als Baseline-Quelle. Eine
> handgeschriebene „Baseline" aus diesen Dateien wäre nicht der reale Remote-Stand.

## Verifizierte Remote-Migrations-Inventur (read-only)
`supabase migration list --linked` — **Remote hat 11 getrackte Migrationen**, alle
`Local`-Spalten leer (⇒ lokal fehlt die gesamte Kette):

```
Local | Remote         | Time (UTC)
------|----------------|---------------------
      | 20260530175624 | 2026-05-30 17:56:24
      | 20260530215436 | 2026-05-30 21:54:36
      | 20260530221218 | 2026-05-30 22:12:18
      | 20260530233054 | 2026-05-30 23:30:54
      | 20260530235930 | 2026-05-30 23:59:30
      | 20260601000128 | 2026-06-01 00:01:28
      | 20260601000200 | 2026-06-01 00:02:00
      | 20260601000300 | 2026-06-01 00:03:00
      | 20260601004321 | 2026-06-01 00:43:21
      | 20260601004854 | 2026-06-01 00:48:54
      | 20260601005614 | 2026-06-01 00:56:14
```

**Wichtige Beobachtung / Drift:** Die getrackte Historie **endet am 2026-06-01**. Alle
späteren Schemaänderungen (die 41 Root-`*.sql`, u. a. `TRACK_MARKER_ANGLE.sql`,
`TRACK_MARKER_MATERIAL.sql`, `SUBSCRIPTION_V2_SETUP.sql`, …) wurden offenbar **ad-hoc**
(SQL-Editor / direkt) angewandt und sind **nicht** als Migration getrackt. Die Baseline
muss deshalb den **aktuellen Gesamt-Schemastand** erfassen (echter Dump), **nicht** nur
diese 11 Migrationen erneut abspielen.

## So wird die Baseline erzeugt (nächster, autorisierter Schritt — NICHT read-only)
Einer der folgenden Wege, dann Ergebnis als **erste** versionierte Migration einchecken.
**Nur Schema (`--schema-only`), keine Daten. Kein `db reset`, kein `db push` mit DROP.**

**Option A — Docker + Supabase-CLI (empfohlen, keine Zusatz-Credentials):**
```bash
# Docker Desktop starten, dann:
supabase db dump --linked --schema public -f supabase/migrations/00000000000000_baseline.sql
# optional Rollen/Storage separat: supabase db dump --linked --role-only / --data-only (NICHT für Baseline)
supabase migration list --linked      # Kontrolle
```

**Option B — pg_dump gegen Pooler (libpq installiert, DB-Passwort vorhanden):**
```bash
# PG-Client v17 verwenden (Remote = Postgres 17.6). Passwort NICHT committen.
pg_dump "postgresql://postgres.axkkhyqrjrtbkumaulta:<DB_PASSWORD>@aws-0-eu-west-1.pooler.supabase.com:5432/postgres" \
  --schema=public --schema-only --no-owner --no-privileges \
  -f supabase/migrations/00000000000000_baseline.sql
```

**Option C — service_role/Management-API:** DDL über autorisierten Zugriff exportieren,
identisch als `00000000000000_baseline.sql` ablegen.

### Danach
1. Baseline-`*.sql` **reviewen** (Diff gegen erwartete Objekte; insb. `track_markers.angle_kind`-
   und `track_markers.material`-CHECK — siehe P0-FIX-04).
2. `supabase migration list --linked` → sicherstellen, dass Local==Remote (ggf. `migration repair`).
3. Root-`*.sql` als **historisch/ad-hoc** kennzeichnen/archivieren (separater Schritt, **kein** DROP).

## Abgrenzung
- **Kein** Produktionsschema geändert, **kein** DROP, **keine** Daten berührt.
- Dieses README ersetzt die Baseline **nicht** — es unblockt und dokumentiert nur den exakten nächsten Schritt.
- Betroffener ADR: **ADR-002** (Database Model). Noch **nicht** auf „Accepted" setzen.

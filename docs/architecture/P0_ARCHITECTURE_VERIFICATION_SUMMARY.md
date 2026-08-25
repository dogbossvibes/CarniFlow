# P0 — Architecture Verification Summary

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-26
**Umfang:** P0-01 … P0-06 (Bereichsberichte in diesem Ordner). Remote-DB read-only introspiziert (Projekt `ANYVO` / `axkkhyqrjrtbkumaulta`).
**Nicht** geändert: Produktcode, SQL, Migrationen. Kein Commit/Push.

## Reconciliation mit unabhängigem Review
Ein unabhängiger `docs/architecture/CODEX_P0_REVIEW.md` (lokaler Review, ohne Remote-Zugriff) bestätigt die Kernbefunde und lieferte drei **Korrekturen**, die in die Berichte eingearbeitet wurden (2026-07-26):
1. **P0-05** entschärft: FG-Quelle wird beim BG-Umschalten abgelöst (`watchRef.remove()`), daher **kein** dauerhafter Doppel-Listener — nur ein kurzes Umschalt-Race.
2. **P0-06** präzisiert: Live-Recorder schreibt **direkt** nach SQLite `local_track_points`/`local_track_markers` (nicht via `sync_queue`).
3. **P0-03** ergänzt: zusätzliche **Material-Constraint-Drift** (`duebel/metall/teppich`); zweiter toter Recorder `useTrackRun` (P0-05).
Die Remote-Aussagen in P0-01/02/03/04 (Row-Counts, `user_entitlements` 404, Spaltenexistenz) stammen aus **eigener Live-Read-only-Introspektion** dieser Session; der Codex-Review konnte sie mangels Remote-Zugriff nur nicht gegenprüfen (nicht widerlegen).

## Verlinkte Berichte
- [[P0-01_DATABASE_TRUTH_REPORT]] — Database Truth
- [[P0-02_TRACKING_LEGACY_REPORT]] — Tracking Legacy
- [[P0-03_TRACK_DOMAIN_REPORT]] — Fährten-Domain (Winkel/OW-BW/GS/TS)
- [[P0-04_SUBSCRIPTION_CAPABILITY_REPORT]] — Subscription/Capability
- [[P0-05_GPS_PIPELINE_REPORT]] — GPS Pipeline
- [[P0-06_OFFLINE_TRUTH_REPORT]] — Offline Truth

---

## 1. Kernbefunde (verdichtet)

| # | Befund | Beweiskraft | Schwere |
|---|---|---|---|
| A | **Keine versionierten Migrations im Repo**; Remote hat Migrationshistorie, `supabase/migrations/` fehlt | HOCH (migration list) | **P0** |
| B | **Zwei Track-Datenmodelle** koexistieren remote mit echten Daten (`track_sessions`/`track_articles` [Legacy] vs. `training_sessions`+`track_*`.session_id [kanonisch]) | HOCH | **P0** |
| C | **`user_entitlements` existiert remote NICHT (404)** → Lifetime/manuelle/Founder-Grants tot | HOCH (REST 404 + Code) | **P0** |
| D | **Constraint-Drift Winkel+Material**: `AngleKind` Code=7 / SQL-CHECK=4 (`abriss`/`spitz_*` fehlen); `MarkerMaterial` Code=8 / SQL-CHECK=5 (`duebel`/`metall`/`teppich` fehlen) → evtl. nicht persistierbar (CHECK remote = BLOCKED) | MITTEL (Code+SQL; DDL unbestätigt) | **P0** |
| E | **Newbie = `pro_member=true`**; Tiers kollabieren zu 2 Booleans; CONNECT-Newbie-Limits greifen nie; Enforce-Flag aus → ALL_ACCESS | HOCH (Code+Remote) | **P0/P1** |
| F | **GPS FG→BG-Umschalt-Race** (kurzes Overlap-Fenster beim Wechsel native→expo, kein Source-/Timestamp-Dedup; **kein** dauerhafter Doppel-Listener — FG-Watch wird abgelöst) + Provider-Sprung FG/BG | MITTEL (Code; Laufzeit zu verifizieren) | **P1** |
| G | **Zwei Offline-Modelle**: `sync_queue` vs. Recorder-eigene Persistenz → unklare Source of Truth, Duplikat-Risiko | MITTEL | **P1** |
| H | Dead Code: ~~`services/trackingService.ts`, `hooks/useTrackSessions.ts`~~ **(entfernt, P0-FIX-02)**; verbleibend `hooks/useTrackRecording.ts`, `hooks/useTrackRun.ts` | HOCH | **P2** |
| I | OW/BW dokumentiert, aber nicht im Code/Schema; `docs/Faehrten_OW_BW_Implementation.md` leer | HOCH | **P1** |

---

## 2. ADR-Konformität (PASS / PARTIAL / FAIL / NOT VERIFIABLE)

> „NOT VERIFIABLE" = außerhalb des P0-Umfangs dieses Passes und/oder nur mit `service_role`/DDL/Laufzeit prüfbar.

| ADR | Thema | Status | Begründung (Kurz) |
|---|---|---|---|
| ADR-000 | Current State & Target Architecture | **PARTIAL** | Ziel „kanonisches `training_sessions`" ist im Runtime-Code erreicht, aber Legacy + fehlende Migrations widersprechen dem „aufgeräumten" Zielbild (Befund A/B). |
| ADR-001 | Domain Model | **PARTIAL** | Winkel/GS/TS im Code konsistent modelliert; **OW/BW fehlt** als Typ/Persistenz (Befund I); Winkel-Constraint-Konflikt (D). |
| ADR-002 | Database Model | **FAIL** | Keine versionierten Migrations (A); zwei Track-Modelle (B); `user_entitlements` fehlt (C). Schema ≠ dokumentiertes Modell. |
| ADR-003 | Identity & Authorization | **NOT VERIFIABLE** | RLS/Policies/Auth-Flows read-only nicht prüfbar (kein `service_role`); nicht Teil dieses P0-Passes. |
| ADR-004 | GPS & Tracking Architecture | **PARTIAL** | Saubere Quellen-Abstraktion vorhanden, aber parallele FG/BG-Listener + Provider-Sprünge (F). |
| ADR-005 | Track Recording Lifecycle | **PARTIAL** | Lifecycle (laying/resting/searching/…) + Recovery vorhanden; TS nur als JSON; OW/BW-Ereignisse fehlen; Legacy-Recorder-Reste. |
| ADR-006 | Smart Analysis | **NOT VERIFIABLE** | AI/Insights/Embeddings nicht Teil des P0-Umfangs; Edge Functions/Modelle nicht introspiziert. |
| ADR-007 | Offline First & Synchronisation | **PARTIAL** | Zwei Offline-Modelle nebeneinander (G); SQLite build-abhängig (P0-06-B); Source of Truth teils unklar. |
| ADR-008 | Subscription & Entitlements | **FAIL** | `user_entitlements` fehlt remote (C); Newbie=pro (E); Entitlement-Feature wirkungslos. |
| ADR-009 | Connect Architecture | **PARTIAL** | Zentraler Entitlement-Service sauber gekapselt, aber Enforce-Flag aus + Newbie=pro → Tiers unwirksam (E). |
| ADR-010 | UI & Navigation | **NOT VERIFIABLE** | Nicht Teil des P0-Umfangs (nur punktuell im Label-Task berührt). |
| ADR-011 | Testing Strategy | **PARTIAL** | Umfangreiche Tracking-Unit-Tests vorhanden (204 grün beobachtet); Coverage/CI-Strategie nicht bewertet. |
| ADR-012 | Release & Deployment | **NOT VERIFIABLE** | EAS/Release-Pipeline nicht Teil dieses P0-Passes. |

---

## 3. Priorisierung

### P0 — Blocker (vor Architektur-Freeze zu lösen)
- **A** Migrations-Baseline etablieren (versionierte Quelle der Wahrheit).
- **B** Track-Legacy klären/migrieren (Daten + DROP-Plan).
- **C** `user_entitlements` remote herstellen **oder** Feature bewusst deaktivieren/entfernen.
- **D** Winkel-`angle_kind`-Constraint remote verifizieren & mit Code angleichen.
- **E** Capability/Newbie/CONNECT-Tier-Entscheidung (mind. bewusst festschreiben, siehe Hinweis).

### P1 — Architekturkonsolidierung
- **F** GPS FG/BG-Quellen entkoppeln + Dedup.
- **G** Offline-Modelle konsolidieren (ein Sync-Pfad / klare SoT).
- **I** OW/BW-Repräsentation festlegen (ADR-001/005).

### P2 — Qualität / Cleanup
- **H** Dead Code entfernen (nach P0-02-Bedingungen).
- Leere/veraltete Doku (`Faehrten_OW_BW_Implementation.md`), Root-SQL-Ordnung.

> Hinweis: Diese Analyse **trifft keine** Produktentscheidungen (z. B. „soll Newbie limitiert sein?"). E erfordert eine Produkt-/ADR-Entscheidung; die Fixes unten bereiten sie nur technisch vor.

---

## 4. Fix-Schritte

### P0-FIX-01 — Migrations-Baseline
- **Problem:** Kein `supabase/migrations/`; Remote-Schema nur live introspizierbar → kein reproduzierbarer/reviewbarer DB-Stand.
- **Ziel:** Versionierte Baseline-Migration = exakter aktueller Remote-Zustand; danach jede Änderung nur noch als Migration.
- **Betroffene Dateien:** neu `supabase/migrations/*`; ggf. Ablösung/Archiv der Root-`*.sql`.
- **Betroffene DB-Objekte:** gesamtes `public`-Schema (Tabellen/Constraints/RLS/Indizes/FKs/RPCs).
- **Abhängigkeiten:** `service_role`-Key **oder** Docker (`supabase db dump`) **oder** `psql` gegen Pooler.
- **Risiko:** niedrig (read/dump), sofern kein Reset gefahren wird.
- **Tests:** `supabase migration list` (Local==Remote); Diff-Review der Baseline.
- **Rollback:** rein additiv (Dateien); keine DB-Änderung nötig.
- **ADR:** ADR-002.

**Status (2026-07-26) — TEILWEISE UMGESETZT / DDL-DUMP BLOCKED**
- **Umgesetzt (additiv):** `supabase/migrations/` angelegt mit `README.md` = Repro-Anleitung (Docker / `pg_dump` / service_role) + **verifizierte Remote-Migrations-Inventur** (11 getrackte Migrationen, alle `Local` leer; getrackte Historie endet 2026-06-01 → spätere Root-`*.sql` sind untracked = Drift).
- **Getestet:** `tsc --noEmit` grün; `jest --runInBand` = **322/322** grün; `expo lint` = 3 Errors/72 Warnings **allesamt vorbestehend** (kein Bezug zu P0-FIX-01, README nicht lint-relevant).
- **Weiterhin offen (BLOCKED — REMOTE DATABASE VERIFICATION REQUIRED):** die eigentliche Baseline-`*.sql` (exakter Remote-DDL inkl. Constraints/RLS/Indizes/FKs/RPCs). Grund: kein `pg_dump`/`psql`/Docker/`service_role`/DB-Passwort in dieser Umgebung. Root-`*.sql` **nicht** als Baseline verwendet.
- **Regel eingehalten:** keine DB-/Schemaänderung, kein DROP, keine 22 `track_sessions` berührt, kein Commit/Push.

### P0-FIX-02 — Track-Legacy: Datenabgleich + Entfernungsplan
- **Problem:** `track_sessions` (22) / `track_articles` (4) [Legacy] koexistieren mit kanonischem Modell; keine Migrations-SQL; Entfernbarkeit „NOCH NICHT BEWEISBAR" (P0-02).
- **Ziel:** Beweisen, dass Legacy-Daten in `training_sessions` vorhanden (oder verworfen) sind; dann Dead Code + Tabellen entfernen.
- **Betroffene Dateien:** `services/trackingService.ts`, `hooks/useTrackSessions.ts`, Legacy-Teile `types/tracking.ts`; DROP als Migration.
- **Betroffene DB-Objekte:** `track_sessions`, `track_articles` (+ deren RLS/FK/Trigger).
- **Abhängigkeiten:** P0-FIX-01 (Migrationen); Daten-Abgleich (service_role); `delete-account`-Abdeckung prüfen (GDPR).
- **Risiko:** hoch (Datenverlust bei verfrühtem DROP).
- **Tests:** Zählabgleich Legacy↔kanonisch; Regression Fährten-Flow; `delete-account`-Test.
- **Rollback:** DROP erst nach Backup/Verifikation; Migration reversibel halten.
- **ADR:** ADR-002, ADR-005.

**Status (2026-07-26) — CODE-TEIL UMGESETZT / DB-TEIL BEWUSST OFFEN**
- **Umgesetzt (Dead-Code entfernt, Delete-Safety bewiesen):** `services/trackingService.ts`, `hooks/useTrackSessions.ts` gelöscht. Keine Runtime-/dynamischen/Barrel-Imports, keine Tests, keine Config, 0 Treffer in `app/`.
- **Bewusst erhalten:** `types/tracking.ts` (aktiv: `TrackMap.tsx`, `lib/trackRecorder.ts`), `lib/trackRecorder.ts` (aktiv: `positionStream.ts`) — **kein** Legacy-DB-Pfad.
- **Getestet:** `tsc --noEmit` grün (keine hängenden Importe); `jest --runInBand` **322/322**; `expo lint` 3 Errors/72 Warnings **unverändert vorbestehend**.
- **Weiterhin offen (bewusst, kein Blocker durch diesen Fix):** DB-Legacy `track_sessions` (**22**) + `track_articles` (**4**) bleiben — **DO NOT DELETE — MIGRATION NOT YET VERIFIED**. Kein DROP/DELETE/TRUNCATE, keine Migration ausgeführt. Datenabgleich + `delete-account`-Prüfung + versionierter DROP hängen an P0-FIX-01 (Baseline) und separater Datenmigration.
- **Verdikt „`track_sessions` vollständig entfernbar":** weiterhin **NOCH NICHT BEWEISBAR** (Code-Seite erledigt, Daten-/Schema-Seite offen).
- **ADR-002 bleibt offen** (DB-Baseline/Remote-Schema).

### P0-FIX-03 — `user_entitlements` bereitstellen oder Feature stilllegen
- **Problem:** Tabelle remote 404 → `entitlementService` liefert immer `null`; Lifetime/manuell/Founder-Grants wirkungslos.
- **Ziel:** Entscheidung + Umsetzung: (a) `USER_ENTITLEMENTS_SETUP.sql` als Migration anwenden **oder** (b) Feature/Code bewusst entfernen.
- **Betroffene Dateien:** `services/entitlementService.ts`, `services/capabilityService.ts`; `USER_ENTITLEMENTS_SETUP.sql`.
- **Betroffene DB-Objekte:** `user_entitlements` (+ RLS).
- **Abhängigkeiten:** P0-FIX-01; Produktentscheidung (Lifetime/Founder-Strategie).
- **Risiko:** mittel (schaltet ggf. Grants scharf).
- **Tests:** Capability-Auflösung mit/ohne Entitlement; Founder-Claim-Pfad.
- **Rollback:** Feature-Flag / Migration-Down.
- **ADR:** ADR-008.

### P0-FIX-04 — `track_markers`-Constraints (angle_kind + material) angleichen
- **Problem:** (a) Code emittiert `spitz_links/spitz_rechts/abriss`, Repo-SQL-CHECK erlaubt nur `links/rechts/spitz/absatz`. (b) `MarkerMaterial` enthält `duebel/metall/teppich`, `TRACK_MARKER_MATERIAL.sql` erlaubt nur `stoff/holz/leder/plastik/diverses`. Remote-CHECKs unbestätigt → mögliche Insert-Fehler/Datenverlust.
- **Ziel:** Remote-CHECKs verifizieren und auf die Code-Wertebereiche bringen (bzw. Code/Schema bewusst zusammenführen; `spitz`/`absatz` explizit entscheiden).
- **Betroffene Dateien:** `TRACK_MARKER_ANGLE.sql`, `TRACK_MARKER_MATERIAL.sql` (bzw. neue Migration); `features/tracking/store/trackingStore.ts`, `utils/angleClassify.ts`, `app/track/legen.tsx` (nur Referenz).
- **Betroffene DB-Objekte:** `track_markers.angle_kind` (CHECK), `track_markers.material` (CHECK).
- **Abhängigkeiten:** P0-FIX-01; DDL-Verifikation (service_role/psql).
- **Risiko:** mittel (falsche Constraint kann bestehende Inserts blockieren).
- **Tests:** Insert je AngleKind- und Material-Wert; Regression Winkel-/Abriss-/Gegenstand-Setzen (`legen.tsx`).
- **Rollback:** Constraint-Migration reversibel.
- **ADR:** ADR-001, ADR-002.

### P0-FIX-05 — Capability/Tier-Modell entscheiden & absichern
- **Problem:** Newbie=`pro_member=true`; Stufen nicht unterscheidbar; CONNECT-Newbie-Limits unwirksam; `CONNECT_ENFORCE_ENTITLEMENTS` aus.
- **Ziel:** Produkt-/ADR-Entscheidung technisch abbilden (z. B. Stufen-Feld in `user_capabilities` oder Ableitung aus `subscriptions.plan`); Enforce-Flag-Strategie festlegen.
- **Betroffene Dateien:** `features/subscription/plans.ts` (`planToCapabilities`), `services/capabilityService.ts`, `features/connect/services/connect-entitlements.ts`, `hooks/useCapabilities.ts`.
- **Betroffene DB-Objekte:** `user_capabilities` (ggf. neues Feld), `subscriptions`.
- **Abhängigkeiten:** Produktentscheidung (P0-Blocker E); P0-FIX-01.
- **Risiko:** mittel-hoch (Gating-Änderung kann bestehende Nutzer betreffen).
- **Tests:** Capability-Matrix je Plan; CONNECT-Entitlements mit Flag on/off; Trial-Ablauf.
- **Rollback:** Flag/Feature-gesteuert; Migration-Down.
- **ADR:** ADR-008, ADR-009.

### P1-FIX-06 — GPS FG/BG-Quellen sauber umschalten + Dedup
- **Problem:** Beim Umschalten FG(native)→BG(expo) kurzes Overlap-Fenster (beide speisen `onFix`, kein Source-/Timestamp-Dedup); nach Rückkehr in den Vordergrund wird die bessere native Quelle **nicht** reaktiviert (Provider-Sprung/Qualität). Kein dauerhafter Doppel-Listener (FG-Watch wird abgelöst).
- **Ziel:** Genau eine aktive Quelle je AppState (inkl. Reaktivierung native im Vordergrund); Dedup nach source+monotonem timestamp; Overlap-Fenster schließen.
- **Betroffene Dateien:** `hooks/useTrackRecorder.ts`, `native/backgroundLocationTask.ts`, `utils/positionSource.ts`.
- **Abhängigkeiten:** Laufzeit-Verifikation (Fix-Zähler nach source).
- **Risiko:** mittel (Aufnahme-Kernpfad).
- **Tests:** Unit (Dedup); Feldtest FG↔BG-Wechsel; Punktdichte-Vergleich.
- **Rollback:** hinter Flag.
- **ADR:** ADR-004, ADR-005.

### P1-FIX-07 — Offline-Modelle konsolidieren
- **Problem:** `sync_queue` vs. Recorder-eigene Persistenz; Duplikat-/SoT-Unklarheit.
- **Ziel:** Ein Sync-Pfad bzw. klare Vorrangregeln; SQLite-Verfügbarkeit robust.
- **Betroffene Dateien:** `features/sync/*`, `features/tracking/store/{trackPersist,searchPersist,activeFaehrten}.ts`, `features/tracking/services/trackService.ts`, `lib/localDb/*`.
- **Risiko:** mittel-hoch.
- **Tests:** Netzverlust/Reconnect; keine Duplikate remote; Recovery-Vorrang.
- **ADR:** ADR-007.

### P1-FIX-08 — OW/BW-Repräsentation festlegen
- **Problem:** OW/BW dokumentiert, nicht im Code/Schema; Impl-Doc leer.
- **Ziel:** Als `AngleKind`-Wert **oder** eigenes TrackEvent definieren (Doku-Tendenz: TrackEvent, keine neue Tabelle) — Entscheidung + Persistenzpfad.
- **Betroffene Dateien:** `trackingStore.ts`, `utils/angleClassify.ts`, `track_data`-Schema; `docs/Faehrten_OW_BW_Implementation.md`.
- **Betroffene DB-Objekte:** ggf. `track_markers.angle_kind`-CHECK oder `track_data`.
- **Risiko:** niedrig-mittel.
- **ADR:** ADR-001, ADR-005.

### P2-FIX-09 — Dead Code & Doku-Cleanup
- **Problem:** `services/trackingService.ts`, `hooks/useTrackSessions.ts`, `hooks/useTrackRecording.ts` tot; Legacy-Reste in `types/tracking.ts`; leere Doku.
- **Ziel:** Entfernen (nach P0-FIX-02-Bedingungen), Doku aktualisieren.
- **Risiko:** niedrig.
- **Tests:** Build/TS/Lint grün; keine offenen Importe.
- **ADR:** ADR-000.

---

## 5. Nächster empfohlener Schritt
**P0-FIX-01** zuerst — ohne Migrations-Baseline lassen sich P0-FIX-02/03/04 nicht sicher/reviewbar umsetzen. Dafür einen separaten, **nicht** read-only Pass mit `service_role`/Docker/`psql` einplanen (die in P0-01 §5 gelisteten BLOCKED-Punkte auflösen).

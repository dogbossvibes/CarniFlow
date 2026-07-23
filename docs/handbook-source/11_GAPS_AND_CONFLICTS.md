# 11 — Gaps & Conflicts (Ist-Zustand)

> Analysebericht. Konsolidiert die inhaltlichen Lücken, Widersprüche und technischen Schulden aus den Berichten 00–10 und ergänzt die noch nicht dediziert behandelten Bereiche **Trainerbereich** und **ANYVO Connect**. **[UNKLAR]** = nicht abschließend verifiziert. Keine Codeänderungen außer im Schlussabschnitt.

## Zweck

Eine belegte Liste aller gefundenen Inkonsistenzen und offenen Punkte als Grundlage für Blocker-Entscheidungen im Engineering Handbook.

## Ergänzende Inventur: Trainerbereich

- Dateien: `services/trainerService.ts`, `types/trainer.ts`, `hooks/useTrainer.ts`, `hooks/useTrainerAppointments.ts`, `app/trainer/*` (`index`, `dashboard`, `registrieren`, `edit`, `plaene`, `plan-neu`, `plan/[id]`), `app/(tabs)/hub.tsx`, `app/(tabs)/clients.tsx`, `app/(tabs)/activity.tsx`, `services/__tests__/trainer-flow.test.ts`, `TRAINER_FLOW_REPAIR.sql`, `TRAINER_PLAN_SETUP.sql`.
- Modell (`types/trainer.ts`): `TrainerProfile`, `CoachRelationship` (`status: pending|active|blocked`), `TrainerSummary`, `ClientSummary`, `ActivityItem`, `TrainerSearchResult`. Trainer-Aktivierung über `trainer_module`-Capability (Bericht 09), Tab-Slot exklusiv Hub↔Analyse.
- **[UNKLAR]** Basis-Tabellen des Trainer-Systems: `types/trainer.ts` spricht von `training_units` und „kein FK training_units→profiles"; ob Trainer-Kunden-Beziehungen über `connections` **oder** ein eigenes `coach_relationships` laufen, ist aus den gegrepten SQL nicht eindeutig (`TRAINER_FLOW_REPAIR.sql` deutet auf Reparaturbedarf).

## Ergänzende Inventur: ANYVO Connect

- Dateien: `features/connect/*` (screens, api `connect.repository.ts`, services `connect-entitlements.ts`/`connect-privacy.ts`, hooks, components, types `connect.types.ts`, utils, constants `featureFlag.ts`), `app/connect/*`, `app/connection/[id].tsx`, `app/(tabs)/connect.tsx`, `CONNECT_SETUP.sql` (38 KB), `docs/ANYVO_CONNECT_IMPLEMENTATION.md`, Tests `features/connect/__tests__/*` (3).
- **Feature-Flag AUS per Default:** `CONNECT_ENABLED = process.env.EXPO_PUBLIC_FEATURE_CONNECT_ENABLED === 'true'` (`features/connect/constants/featureFlag.ts`); ohne Flag kein Tab, keine Init, keine Abfragen. Bestätigt durch Memo `connect-step3b-status`.
- DB: eigener `connect_*`-Namensraum (16 Tabellen, Bericht 03).

## Konsolidierte Konflikte (belegt)

1. **Zwei Fährten-/Track-Datenmodelle**
   - Aktiv: `training_sessions(type='track')` + `track_points`/`track_markers`/`track_runs`/`track_engine_sessions` (`features/tracking/services/trackService.ts`).
   - Legacy: `track_sessions` + `track_id`/`seq`/Artikel (`services/trackingService.ts`, `types/tracking.ts`, `lib/trackRecorder.ts`).
   - **[UNKLAR]** ob der Legacy-Pfad noch von Screens/Hooks aufgerufen wird.

2. **Ereignismodell Doku ↔ Code**
   - Doku-Ziel: einheitliches „TrackEvents" (`docs/faehrte/05_FAEHRTE.md`, referenziertes `06_TRACK_EVENTS.md` fehlt).
   - Ist: `track_markers` (Winkel/Gegenstände) + JSON `track_data.segments` (Teilstrecken). Kein `track_events`.
   - OW/BW dokumentiert, aber kein eigener `AngleKind`-Wert → **[UNKLAR]**.

3. **Smart-Analyse-Politik**
   - Doku: „keine KI zur Trainingsanalyse" (`docs/00_READ_FIRST.md` §3.5, `docs/faehrte/15_DECISIONS.md`).
   - Ist: vollständiges KI-Subsystem (`features/ai/*`, Edge Functions `ai-analysis`/`analyze-training`/`generate-coach-summary`/`recommend`/`search-training-memory`, `training_embeddings`/`ai_insights`). Fährten-Analyse selbst ist deterministisch.

4. **Drei Plan-/Access-Vokabulare** (`Profile.plan` vs. `PlanLevel` vs. `SubscriptionPlan`) + drei Berechtigungstabellen (`subscriptions`, `user_capabilities`, `user_entitlements`) + interner Tester. Preis-/Product-ID-Divergenz `plans.ts` ↔ `lib/purchases.ts`.

5. **Zwei „Connection"-Systeme**
   - Alt: `connections`/`connection_invites`/`connection_messages`/`connection_chats`/`connection_permissions` (Trainer↔Kunde, `services/connectionService.ts`, `services/chatService.ts`).
   - Neu: `connect_*` (Community, feature-flagged).
   - Namens-/Konzeptkollision „connection" vs. „connect"; **[UNKLAR]** ob geplant konvergierend.

6. **Zwei Offline-Persistenzsysteme** (SQLite-Queue vs. AsyncStorage-`PendingTrack`) und zwei Schreibpfade für Fährten (direkt-remote via `trackService` vs. SQLite-Sync-Queue). Bericht 07.

7. **Mehrere GPS-Eingangspfade** (natives Precision-Modul via `positionSource`, `backgroundLocationTask`/`expo-location`, externes BLE, Legacy `trackRecorder`) — Spannung zur Regel „genau eine GPS-Engine". Bericht 04.

8. **Doppelte Session-Hooks** (`lib/session-context.tsx` vs. `hooks/useSession.ts`), unterschiedliche Importpfade.

9. **Doppelte Trainings-Typen** (`TrainingSession` vs. `Training` in `types/index.ts`); **[UNKLAR]** `TrainingSession` (`training_sessions`) vs. `TrainingUnit` (`training_units`).

10. **UI-/i18n-Duplikate** (`components/analytics/AICoachCard` vs. `features/ai/components/AiCoachCard`; `components/tracking/TrackMap` vs. `features/tracking/components/TrackingMap`; zwei i18n-Strukturen; hartcodierte Strings). Bericht 08.

## Datenbank-/Migrations-Lücken

- Kein `supabase/migrations/`-Ledger; ~50 lose Root-`*.sql` + „MIGRATE"/„REPAIR"-Dateien.
- `CREATE TABLE` für zentrale Tabellen (`dogs`, `training_sessions`, `training_units`) nicht eindeutig auffindbar. RLS (131 Policies) nicht je Tabelle auditiert.

## Dokumentations-Lücken

- Ziel-Handbuch (`docs/00_READ_FIRST.md`) referenziert 12 Kapitel; real existieren nur teils: `04_GPS_ENGINE.md` (knapp), `05_FAEHRTE.md` (teilweise), `07_SMART_ANALYSE.md`/`15_DECISIONS.md` (Stubs „..."), `01_Architektur.md` (0 Bytes). Fehlend: `01_SYSTEM_ARCHITEKTUR`, `02_CODING_STANDARDS`, `03_DATABASE`, `06_TRACK_EVENTS`, `08_UI_GUIDELINES`, `09_OFFLINE`, `10_TESTPLAN`, `11_RELEASE`.

## Technische Schulden (Sammlung)

- „best-effort"-Fehlerbehandlung verdeckt fehlende Migrationen/Sync-Lücken.
- Umfangreiche **uncommittete Arbeitskopie** (`git status`): u. a. Aktive-Fährten-Registry (`features/tracking/store/activeFaehrten*`, `ActiveFaehrteCard`, `GlobalActiveFaehrtenBar`, `startApproach`), `AI_HANDOFF.md`, viele `docs/`, `app/connect/`, mehrere Root-`*.sql`. Der dokumentierte Stand ist nur teilweise committet → Analyse spiegelt Arbeitskopie, nicht Git-HEAD.
- Secrets/Keys inline (Supabase-Fallbacks, Google-Maps-Key).

## Offene Fragen (Sammlung)

- Legacy `track_sessions` noch aktiv referenziert?
- Gilt „keine KI" global oder nur Fährte?
- Trainer-Beziehung: `connections` vs. eigenes Schema?
- Konvergieren „connection" (alt) und „connect" (neu)?
- Welche SQL sind produktiv eingespielt?

## Technische Risiken (Priorität)

- **Hoch:** Zwei Track-Datenmodelle + Doku-Ereignismodell-Divergenz → Handbuch-Blocker.
- **Hoch:** KI-Politik-Widerspruch → Handbuch-Blocker.
- **Mittel:** Plan-/Access-Fragmentierung → Gating-Fehler.
- **Mittel:** Doppelte Offline-Pfade → Datenkonsistenz bei schlechter Verbindung.
- **Niedrig–Mittel:** Duplikate (Hooks/Komponenten/i18n) → Wartungslast.

## Mögliche spätere Verbesserungen

- Pro Konflikt eine verbindliche Entscheidung im Handbuch treffen (kanonisches Modell festlegen, Legacy deprecaten).
- Migrations-Ledger + `db pull` zur Schema-Wahrheit.
- Fehlende Handbuch-Kapitel aus diesen Inventuren ableiten.

# ANYVO — Architektur und kritische Bereiche

Teil der zentralen Projektübergabe (2026-11-08, T-181). Verwandt:
[Produktkontext](ANYVO_PRODUCT_CONTEXT.md) ·
[Release-Geschichte](ANYVO_RELEASE_HISTORY.md) ·
[Zusammenarbeit](ANYVO_COLLABORATION_RULES.md) ·
[Repository-Inventur](REPOSITORY_INVENTORY.md).

Dies ist eine Übersicht, keine Neufassung. Detailquellen:
- `docs/00_READ_FIRST.md` (Grundprinzipien, verbotene Architektur)
- `docs/adr/ADR-000_Current_State_and_Target_Architecture.md` und `docs/adr/ADR-001_Domain_Model.md`
- `docs/handbook-source/01–11` (Architektur, Domäne, DB, GPS, Fährte,
  Smart-Analyse, Offline/Sync, UI, Abos, Tests/Release, Lücken)
- `docs/faehrte/*`, `docs/04_GPS_ENGINE.md`, `docs/tracking-canonical-*.md`

**Kennzeichnung:**
- **[B]** bestätigt im Code am 2026-11-08
- **[H]** historische Doku
- **[N]** Nutzerangabe
- **[O]** offen

## 1. Stack [B]

| Schicht | Technik |
|---|---|
| App | Expo/React Native, expo-router; auf `main` Expo ~54.0.36, RN 0.81.5. Production iOS teils SDK 58 (Build 59/60, RN 0.88.x laut T-175 [H]) |
| UI | NativeWind 4, eigene Design-Tokens (`constants/`), i18n ohne Paket (`i18n/`) |
| Native | `modules/` (u. a. `anyvo-precision-location`), `plugins/`; `ios/` und `android/` per Prebuild, nicht versioniert |
| Backend | Supabase: Postgres + RLS, Storage, Auth, 14 Edge Functions (`supabase/functions`), 36 Migrationen |
| Abos | RevenueCat (`react-native-purchases`) + Webhooks → Supabase |
| Monitoring | Sentry (`@sentry/react-native`) mit Datenschutz-Opt-out |
| Offline | lokale SQLite-DB + Sync-Queue (`features/sync`) [H] |
| Release | EAS Build/Update; Production-OTA nur über `scripts/update-production.mjs` mit `--environment production` (CLAUDE.md) |

## 2. Grundprinzipien [H: Handbook §3/§4]

- Es gibt eine einzige Quelle der Wahrheit pro Information.
- **Erweitern statt ersetzen.** Keine zweite Hundestruktur, **keine zweite GPS-Engine**,
  keine doppelte Datenhaltung.
- Fachlogik gehört nicht ins UI, kein direkter DB-Zugriff aus Screens,
  keine Magic Numbers.
- Smart-Analyse deterministisch (Doku). Laut Code existiert ein KI-Subsystem, das
  ist ein Widerspruch [O].

## 3. Kritischer Bereich 1: Fährte, GPS und Sensorik

**Regeln** [N][AGENTS.md]:
- **Rohdaten, gefilterte Daten und abgeleitete Analysen bleiben getrennt.**
- Keine Vereinfachung oder Ersetzung funktionierender Trackinglogik ohne
  nachvollziehbare Prüfung und Feldbeleg.
- Schwellen, Enderkennung, Filter, Winkel-, Gegenstands- und Abriss-Algorithmen
  ändern sich nur mit belegtem Anlass.
- Simulation und Unit-Tests ersetzen keinen Feldtest auf echten Geräten.

**Ist-Struktur [B] (Auszug):**
- Aufnahme: `features/tracking/hooks/useTrackRecorder.ts` (Legen),
  `useSearchRecorder.ts` (Absuche), Hintergrund-Task, Live Activity (iOS),
  native Präzisionsortung `modules/anyvo-precision-location`.
- Aktives Datenmodell: `training_sessions(type='track')` mit `track_points`,
  `track_markers`, `track_runs` und `track_engine_sessions` (`features/tracking/services/trackService.ts`).
  Daneben gibt es ein Legacy-Modell `track_sessions` [H: handbook 11 §1]. Ob es
  noch genutzt wird, ist offen [O].
- Lokales GPS-Roharchiv mit sicherer Bereinigung (OTA „GPS-Aufnahme: Zeitordnung und
  lokales Roharchiv“ auf 1.0.6-map49-v1) [B: EAS-Nachricht].
- Geteilte Fährten: `features/track-sharing` (auf `main`) [B]. Gruppentraining,
  Planer, Ablenkungen und Übertragung (`features/tracking-exchange`,
  `-planner`, `-distractions`, `-transfer`) gibt es **nur auf den Production-Linien**,
  nicht auf `main` [B].
- Bei der SDK-58-Migration (`dbb23a7f`) bekamen die Recorder nur Typ-Anpassungen [B].

**Pflichtprüfung:** `/anyvo-tracking-review`. Bei jeder Änderung Lifecycle prüfen
(Hintergrund, App-Kill, Resume, Permission-Verlust, Offline, mehrere Hunde,
Altformate) und einen Feldtest-Beleg erbringen.

## 4. Kritischer Bereich 2: Abos, Berechtigungen, RLS

- Die Kette RevenueCat → Webhook (`revenuecat-webhook`, `revenuecat-webhook-google`)
  → `subscriptions` → `user_capabilities` (`pro_member`, `trainer_module`) bzw.
  `user_entitlements` (`lifetime`) muss stimmen [B].
- NEWBIE-Quotas werden serverseitig erzwungen (`claim_newbie_quota`,
  `newbie_quota_limit`). Der Client ist in Production fail-closed [H: DECISIONS].
- NEWBIE: 1 Fährte pro Monat. Das ist die Nutzerentscheidung vom 2026-11-08 und
  entspricht dem Code. Ob die Server-Migration auf Production angewendet ist,
  ist offen [O] (siehe Produktkontext).
- RLS: Autorisierung, Mandanten- und Hundeisolation, Trainer-Freigaben und
  Storage-Policies laufen serverseitig. Ein Client-Gate allein genügt nie.
  Testfälle liegen in `supabase/local/*.sql` und `scripts/qa/*-staging-rls.mjs` [B].
- Der Remote-Zustand (Migrationsstand, Policies, deployte Functions) ist nicht geprüft [O].
- Pflichtprüfung: `/anyvo-security-review`; Sandbox-Kauf, Restore und Kündigung
  auf beiden Plattformen.

## 5. Kritischer Bereich 3: Kundendaten und Persistenz

- Bestehende Kundendaten (Hunde, Trainings, Fährten mit Geometrie, Markern und
  Gegenständen, Gesundheit, Termine, Dokumente, Medien) dürfen nie verloren gehen.
- Altformate, Offline-Einträge und Entwürfe bleiben lesbar (AGENTS.md „Kundendatenerhalt“).
- Migrationen werden nur lokal und reviewbar vorbereitet. Production-Migrationen
  brauchen eine ausdrückliche Freigabe.

## 6. Kritischer Bereich 4: Release und Runtimes

- Es laufen fünf Production-Runtimes parallel, alle aus Release-Linien ausserhalb
  von `main` (siehe Release-Geschichte).
- Jedes OTA muss zur nativen Runtime passen. Native Änderungen erfordern einen Build.
  Das prüft `scripts/check-native-changes.mjs`.
- Ein Supabase-Staging-Leak wird durch `scripts/guard-prod-supabase.mjs` verhindert.

## 7. Bekannte Architektur-Widersprüche [H: handbook 11, gekürzt]

1. Zwei Fährten-Datenmodelle (aktiv und Legacy).
2. Event-Modell in der Doku (`TrackEvents`) und im Code (`track_markers` + JSON-Segmente)
   passen nicht zusammen.
3. Smart-Analyse ist laut Doku ohne KI, im Code gibt es ein KI-Subsystem.
4. Drei Plan-Vokabulare und drei Berechtigungstabellen.
5. Zwei Connection-Systeme (alt `connections*`, neu `connect_*` hinter Flag).

Diese Punkte sind dokumentiert, aber nicht entschieden. Nicht beiläufig auflösen.

# 12 — Analysis Summary (Ist-Zustand)

> Abschlussbericht der Repository-Analyse als Grundlage für das ANYVO Engineering Handbook. Fasst die Berichte 00–11 zusammen. Keine Codeänderungen. **[UNKLAR]** = noch zu verifizieren.

## 1. Wichtigste Architekturmerkmale

- **Expo SDK 54 / RN 0.81.5 / React 19**, New Architecture + React Compiler + typed routes aktiviert.
- **Expo Router** (dateibasiert) mit rollen-/flag-gesteuerten Tabs (Hub↔Analyse exklusiv, Connect feature-flagged).
- **Supabase** als Backend (Auth PKCE, Postgres+RLS, Storage, 13 Edge Functions) über einen Singleton-Client (`lib/supabase.ts`).
- **State gemischt:** Zustand (Live-/Recording-State, v. a. Tracking), React Query (Server-State), Context (Session).
- **Fährtenmodul ist das Herzstück** (größtes Feature, meiste Tests): eigener Recorder, GPS-Engine mit nativem Precision-Modul + Fallback, Hintergrund-GPS, Live Activities, Recovery, deterministische Smart Analyse.
- **Offline-First** über SQLite + Sync-Queue **und** AsyncStorage-Recovery (zwei Mechanismen).
- **Natives Eigenmodul** `anyvo-precision-location` (iOS Swift / Android Kotlin Raw GNSS).
- **Abos** über RevenueCat + serverseitiges Founder-Slot-Locking.

## 2. Bestätigte Single Sources of Truth

- **Hund = `dog_id` (`dogs.id`).** Keine zweite Hundestruktur im Code; Registry/Tracking referenzieren `dog_id`, kopieren das Modell nicht. (`types/index.ts` `Dog`, `features/tracking/store/trackingStore.ts`, `activeFaehrten.ts`.)
- **Supabase-Client** als einzige Netzwerk-Backend-Fassade (`lib/supabase.ts`).
- **Query-Client** zentral (`lib/queryClient.ts`).
- **Founder-Limit** autoritativ serverseitig (`claim_founder_slot()` RPC).
- **Fährten-Teilstrecken-Logik** zentralisiert in einem Modul (`features/tracking/utils/trackSegments.ts`).
- **GPS-Engine-Verantwortung** klar getrennt (Positionen only) — konform zu `docs/04_GPS_ENGINE.md` (Marker/Segmente liegen außerhalb der Engine).

## 3. Doppelte / konkurrierende Strukturen (belegt)

- **Track-Datenmodell:** `training_sessions[type=track]` (aktiv) vs. `track_sessions` (legacy).
- **Ereignismodell:** `track_markers` + JSON `track_data.segments` (Ist) vs. „TrackEvents" (Doku-Ziel).
- **Analyse:** deterministische Smart Analyse vs. reales KI-Subsystem (`features/ai/*` + Edge Functions).
- **Abos/Access:** `Profile.plan` vs. `PlanLevel` vs. `SubscriptionPlan`; `subscriptions`/`user_capabilities`/`user_entitlements`.
- **Beziehungen:** altes `connections/connection_*` vs. neues `connect_*`.
- **Offline:** SQLite-Queue vs. AsyncStorage-`PendingTrack`; direkt-remote vs. Queue-Schreibpfad.
- **GPS-Eingänge:** Precision-Modul / `backgroundLocationTask` / externes BLE / Legacy-Recorder.
- **Kleinere Duplikate:** `useSession` (2×), `TrainingSession`/`Training`, i18n-Strukturen, `TrackMap`/`AICoachCard`.

## 4. Dokumentierte Zielarchitektur (aus vorhandenen Unterlagen)

Aus `docs/00_READ_FIRST.md` (Handbuch-Rahmen) und `docs/faehrte/*`, `docs/04_GPS_ENGINE.md`:
- Single Source of Truth; „Erweitern statt Ersetzen"; Offline First; plattformneutral iOS/Android.
- **Deterministische Smart Analyse, keine KI** zur Trainingsanalyse.
- Keine zweite Hundestruktur; **keine zweite GPS-Engine**; keine Fachlogik im UI; keine direkten DB-Zugriffe aus Screens; keine Magic Numbers.
- Fährte: eine Fährte = ein Hund; Lebenszyklus geplant/legen/ruhend/absuchen/abgeschlossen; **alle Ereignisse über TrackEvents, keine neuen Tabellen**; GPS nur beim Legen/Absuchen; OW/BW als reine Ereignisse (BW-Standard 5 s).
- Verbindlicher Workflow inkl. iOS/Android-Prüfung, Tests, Abschlussbericht, kein Commit/Push.

## 5. Abweichungen zwischen Code und Dokumentation

| Doku-Vorgabe | Ist-Zustand | Beleg |
|---|---|---|
| „TrackEvents", keine neuen Tabellen | `track_markers` + JSON `segments`, kein `track_events` | `trackService.ts`, `trackSegments.ts` |
| Keine KI zur Trainingsanalyse | KI-Subsystem aktiv | `features/ai/*`, `supabase/functions/*` |
| Genau eine GPS-Engine | mehrere GPS-Eingangspfade | Bericht 04 |
| Ein Hundemodell (erfüllt) | erfüllt | — |
| Keine doppelte Datenhaltung | 2 Offline-Systeme, 2 Track-Modelle | Bericht 07/11 |
| Referenzierte Handbuch-Kapitel | größtenteils fehlend/Stub | `docs/faehrte/*` |

## 6. Blocker für das Engineering Handbook

1. **Ereignismodell entscheiden:** Ist-Struktur (`track_markers` + JSON) als kanonisch festschreiben **oder** echtes `track_events` einführen. Ohne Entscheidung ist `06_TRACK_EVENTS.md` nicht schreibbar.
2. **KI-Politik klären:** Gilt „keine KI" global oder nur für die Fährten-Smart-Analyse? Betrifft `05/06/07_SMART_ANALYSE` und `features/ai/*`.
3. **Track-Session-Modell konsolidieren:** `training_sessions[type=track]` vs. `track_sessions` — eines als kanonisch, das andere deprecaten.
4. **Plan-/Access-Modell vereinheitlichen:** ein Vokabular + eine autoritative Berechtigungsquelle.
5. **DB-Wahrheit herstellen:** Migrations-Ledger + Verifikation, welche Root-`*.sql` produktiv sind; Auffinden der `CREATE TABLE` für `dogs`/`training_sessions`/`training_units`.
6. **OW/BW-Repräsentation** im Datenmodell festlegen (fehlt als eigener Typ).
7. **Git-Stand:** Große uncommittete Arbeitskopie — Handbuch muss auf einen definierten, committeten Stand aufsetzen.

## 7. Aussagen, die sicher sind

- Frameworks/Versionen, Ordnerstruktur, Provider-Baum, Navigationsstruktur (aus gelesenen Dateien).
- `dog_id` als einzige Hundereferenz.
- Aktiver Fährten-Datenpfad nutzt `training_sessions[type=track]` + `track_*`-Tabellen + JSON `segments` (vollständig gelesen).
- Teilstrecken-/Winkel-/Segment-Logik und Konstanten (`trackSegments.ts`, `trackingStore.ts`).
- Abo-Pläne/Capabilities-Logik und Founder-Modell (`plans.ts`, `purchases.ts`, `capabilities.ts`).
- Sync-Engine-Ablauf und lokale SQLite-Migrationen (`syncEngine.ts`, `lib/localDb/migrations.ts`).
- Existenz + Default-AUS von Connect (`featureFlag.ts`).
- Test-/Build-/Release-Konfiguration (`package.json`, `eas.json`, `app.json`).
- iOS-Simulatorlauf bestätigte, dass der aktuelle Code die Fährten-/Legen-Screens rendert (siehe `AI_HANDOFF.md`, Screenshots).

## 8. Aussagen, die noch verifiziert werden müssen [UNKLAR]

- Ob der Legacy-`track_sessions`-Pfad (`services/trackingService.ts`) noch aufgerufen wird.
- Verbleib der `CREATE TABLE`-Definitionen für `dogs`, `training_sessions`, `training_units`.
- Welche Root-`*.sql` produktiv eingespielt sind; RLS-Vollständigkeit je Tabelle.
- Ob im Produktions-Build das native Precision-Modul aktiv ist oder der `expo-location`-Fallback läuft.
- Welche GPS-Quelle die autoritativen Aufnahme-Fixes liefert (Precision-Modul vs. `backgroundLocationTask`).
- Offline-Fähigkeit des Fährten-Abschlusses (`finishTrackRecording`/`finishTrackRun`).
- Verhältnis `user_entitlements` ↔ `user_capabilities` ↔ `subscriptions`; Android-IAP-Konfiguration.
- Trainer-Beziehungsschema (`connections` vs. eigenes); Konvergenz „connection"/„connect".
- Politik-Reichweite „keine KI"; Modelle/Provider der KI-Edge-Functions (Deno-Code nicht gelesen).
- Konfliktauflösung in der Sync-Engine; genaue Sync-Trigger in `SyncProvider`.
- i18n-Zielstruktur und Scope von Französisch.
- Ob Screens direkt auf `supabase` zugreifen (Regelverstoß) — nicht flächig auditiert.
- Existenz einer CI-Pipeline.

## 9. Empfohlene nächste Schritte (nach Freigabe)

- Blocker 1–7 als Entscheidungsvorlagen aufbereiten.
- Offene [UNKLAR]-Punkte gezielt verifizieren (Grep über `app/**`, `supabase db pull`, Lesen der Edge-Function-Sourcen, Prüfen des committeten Git-Stands).
- Erst danach das verbindliche Handbuch (`01`–`11`, `15`) aus diesen Inventuren ableiten.

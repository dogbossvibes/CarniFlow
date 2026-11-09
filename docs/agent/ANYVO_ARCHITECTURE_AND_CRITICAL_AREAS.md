# ANYVO — Architektur und kritische Bereiche

Teil der zentralen Projektübergabe (2026-11-08, T-181; erweitert 2026-11-09). Verwandt:
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
- **[B]** bestätigt im Code (2026-11-08 bzw. 2026-11-09)
- **[H]** historische Doku
- **[N]** Nutzerangabe
- **[O]** offen / Vermutung

**Codebasis dieser Fassung (2026-11-09):** Die Abschnitte 8–17 beschreiben die **Live-Kundenquelle iOS Build 57**
(`anyvo-release-ios57-faehrten-label-20261107`, Commit `d11fcb37`, Runtime `1.0.6-map49-v1`, Expo ~54 / RN 0.81.5).
Abweichungen von **Build 60** (`3bb78943`, Runtime `1.0.8-sdk58-v1`, Expo ^58 / RN 0.88.1) sind mit **[B60]** markiert.
Die produktiv deployten Abo-Functions sind **nicht in git**; ihr Code wurde read-only gesichtet (Abschnitt 11).
Pfade sind relativ zur Repo-Wurzel.

## 1. Stack [B]

| Schicht | Technik |
|---|---|
| App | Expo/React Native, expo-router; auf `main` Expo ~54.0.36, RN 0.81.5. Production iOS teils SDK 58 (Build 59/60, RN 0.88.x laut T-175 [H]; Build 60: Expo ^58.0.23, RN 0.88.1 [B]) |
| UI | NativeWind 4, eigene Design-Tokens (`constants/`), i18n ohne Paket (`i18n/`) |
| Native | `modules/` (`anyvo-precision-location`, `anyvo-motion`, `anyvo-resting-activity`), `plugins/`; `ios/` und `android/` per Prebuild, nicht versioniert |
| Backend | Supabase: Postgres + RLS, Storage, Auth, Edge Functions (`supabase/functions`: 13 in git auf Build 57), Migrationen (`main`: 30 nummerierte; Build-57-Linie: 32; Production angewendet: 32, siehe Release-Historie Abschnitt 6) |
| Abos | RevenueCat (`react-native-purchases`) + Webhooks/`subscription-sync` → Supabase |
| Monitoring | Sentry (`@sentry/react-native`, `lib/monitoring.ts`) mit Datenschutz-Opt-out (AsyncStorage `crash_reporting_enabled`) |
| Offline | lokale SQLite-DB (`lib/localDb`) + Sync-Queue (`features/sync`) [B] |
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
  noch genutzt wird, ist offen [O]. Neu [B]: `track_engine_sessions` wird auf Build 57 nur noch
  **gelesen** (`getTrackSessionById`); der schreibende Pfad `useTrackRecording.ts`
  (`finishTrackRecording`/`saveTrackEngineData`) wird von keinem Screen mehr importiert.
- Lokales GPS-Roharchiv mit sicherer Bereinigung (OTA „GPS-Aufnahme: Zeitordnung und
  lokales Roharchiv“ auf 1.0.6-map49-v1) [B: EAS-Nachricht; Code: `features/tracking/storage/*`].
- Geteilte Fährten: `features/track-sharing` (auf `main`) [B]. Gruppentraining,
  Planer, Ablenkungen und Übertragung (`features/tracking-exchange`,
  `-planner`, `-distractions`, `-transfer`) gibt es **nur auf den Production-Linien**,
  nicht auf `main` [B].
- Bei der SDK-58-Migration (`dbb23a7f`) bekamen die Recorder nur Typ-Anpassungen [B];
  Build 57 → 60 ändert in beiden Recordern je nur 2 Zeilen [B60].

**Pflichtprüfung:** `/anyvo-tracking-review`. Bei jeder Änderung Lifecycle prüfen
(Hintergrund, App-Kill, Resume, Permission-Verlust, Offline, mehrere Hunde,
Altformate) und einen Feldtest-Beleg erbringen. Details: Abschnitte 8, 9, 15, 16.

## 4. Kritischer Bereich 2: Abos, Berechtigungen, RLS

- Die Kette RevenueCat → Webhook (`revenuecat-webhook`, `revenuecat-webhook-google`)
  → `subscriptions` → `user_capabilities` (`pro_member`, `trainer_module`) bzw.
  `user_entitlements` (`lifetime`, `active_lifetime`, …) muss stimmen [B].
  **Präzisierung [B]:** Produktiv läuft nicht der git-Webhook, sondern ein serverseitiger
  Reconcile, der RevenueCat selbst liest (Abschnitt 11).
- NEWBIE-Quotas werden serverseitig erzwungen (`claim_newbie_quota`,
  `newbie_quota_limit`). Der Client ist in Production fail-closed [B: `services/quotaService.ts`].
- NEWBIE: 1 Fährte pro Monat. Das ist die Nutzerentscheidung vom 2026-11-08 und
  entspricht dem Code (`NEWBIE_QUOTA = { dog: 1, training: 2, track: 1 }`). Ob die
  Server-Migration auf Production angewendet ist, ist offen [O] (siehe Produktkontext).
- RLS: Autorisierung, Mandanten- und Hundeisolation, Trainer-Freigaben und
  Storage-Policies laufen serverseitig. Ein Client-Gate allein genügt nie.
  Testfälle liegen in `supabase/local/*.sql` und `scripts/qa/*-staging-rls.mjs` [B].
- Der Remote-Zustand (Migrationsstand, Policies, deployte Functions) ist nicht vollständig geprüft [O].
  Die Live-DB enthält nachweislich RPCs, die in git fehlen (Abschnitt 10/11).
- Pflichtprüfung: `/anyvo-security-review`; Sandbox-Kauf, Restore und Kündigung
  auf beiden Plattformen.

## 5. Kritischer Bereich 3: Kundendaten und Persistenz

- Bestehende Kundendaten (Hunde, Trainings, Fährten mit Geometrie, Markern und
  Gegenständen, Gesundheit, Termine, Dokumente, Medien) dürfen nie verloren gehen.
- Altformate, Offline-Einträge und Entwürfe bleiben lesbar (AGENTS.md „Kundendatenerhalt“).
  Beispiele im Code [B]: `normalizeSubscriptionPlan` (`beginner_trial` → `newbie`),
  `trackPersist.loadPending` migriert den Legacy-Key, `getPlanSubscription` toleriert fehlende Spalten.
- Migrationen werden nur lokal und reviewbar vorbereitet. Production-Migrationen
  brauchen eine ausdrückliche Freigabe.

## 6. Kritischer Bereich 4: Release und Runtimes

- Es laufen fünf Production-Runtimes parallel, alle aus Release-Linien ausserhalb
  von `main` (siehe Release-Geschichte).
- Jedes OTA muss zur nativen Runtime passen. Native Änderungen erfordern einen Build.
  Das prüft `scripts/check-native-changes.mjs`.
- Ein Supabase-Staging-Leak wird durch `scripts/guard-prod-supabase.mjs` verhindert.
  Zusätzlich bricht `lib/supabase.ts` beim Start ab, wenn `EXPO_PUBLIC_BACKEND_ENV` und
  Projekt-Ref nicht zusammenpassen [B].

## 7. Bekannte Architektur-Widersprüche [H: handbook 11, gekürzt]

1. Zwei Fährten-Datenmodelle (aktiv und Legacy).
2. Event-Modell in der Doku (`TrackEvents`) und im Code (`track_markers` + JSON-Segmente)
   passen nicht zusammen.
3. Smart-Analyse ist laut Doku ohne KI, im Code gibt es ein KI-Subsystem.
4. Drei Plan-Vokabulare und drei Berechtigungstabellen.
   Bestätigt [B]: `profiles.plan` (`free`/`premium`), `subscriptions.plan`
   (`newbie`/`active`/`founder_active`/`trainer`) + Legacy `tier`, `user_capabilities`; dazu
   `user_entitlements` und das Tester-Flag in `profiles`.
5. Zwei Connection-Systeme (alt `connections*`, neu `connect_*` hinter Flag
   `EXPO_PUBLIC_FEATURE_CONNECT_ENABLED`).

Diese Punkte sind dokumentiert, aber nicht entschieden. Nicht beiläufig auflösen.

---

## 8. Datenfluss Fährte: Aufnahme, Persistenz, Upload [B]

**Screens:** `app/track/legen.tsx` (Legen) → `app/track/liegen.tsx` (Liegezeit) → `app/track/run.tsx`
(Absuche) → `app/track/[id].tsx` / `app/track/replay/[id].tsx` (Detail/Replay).

**Positionsquelle (gemeinsam für Legen und Absuche):**
- `features/tracking/utils/positionSource.ts` → `startPositionSource()`. Reihenfolge: natives Modul
  über `positionStream.ts`, bei fehlendem Modul oder Fehler `expo-location`. Der QA-Schalter
  `getLocationSourceMode() === 'legacy'` erzwingt den reinen expo-location-Pfad.
- `modules/anyvo-precision-location` (`index.ts`, iOS `AnyvoPrecisionLocationManager.swift`,
  Android `AnyvoPrecisionLocationModule.kt`): `startPrecisionTracking`, `stopPrecisionTracking`,
  `requestTemporaryFullAccuracy` (iOS-Purpose-Key `TrackingDogSportPrecision`), `isRawGnssSupported`.
  iOS nutzt `CLLocationManager` mit modusabhängigem Profil (u. a. `kCLLocationAccuracyBestForNavigation`,
  `distanceFilter = None`, `pausesLocationUpdatesAutomatically = false`, `allowsBackgroundLocationUpdates`)
  und `startUpdatingHeading`. Android nutzt den System-`LocationManager` und liefert zusätzlich
  Raw-GNSS-Measurements und GNSS-Status (Events `onGnssMeasurement`, `onGnssStatus`).
- Externes BLE-GPS: `lib/externalGps.ts`, `lib/trackRecorder.ts` (eigener Pfad) [O: Umfang nicht geprüft].
- Wrapper: `features/tracking/native/precisionLocationClient.ts`, `motionClient.ts`.

**Legen (`useTrackRecorder.ts`):**
1. `startWarmup()` lädt QA-Modi (`hydrateQaModes`), fragt Foreground-Permission, fordert
   temporär volle Genauigkeit an, pinnt Engine-/Quellmodus (`pinQaTrackingModes`) und startet die Positionsquelle.
   Bewusst kein `getCurrentPositionAsync`, nur `getLastKnownPositionAsync` (Kommentar: es würde auf iOS
   den laufenden Watch beenden).
2. `beginRecording()` (LOCAL-FIRST): stabile `localId` vor jedem Netz-Call, Reset aller Puffer,
   `registerLaySession` / Session-Runtime (`features/tracking/engine/laySessionRuntime.ts`),
   `beginGpsCapture` (Roharchiv), `startFaehrteActivity()` (iOS Live Activity),
   `createLocalTrainingSession()` in SQLite.
3. Hintergrund: `Location.requestBackgroundPermissionsAsync()` erst nach der In-App-Offenlegung
   `BackgroundLocationDisclosure` (in `legen.tsx`). Bei „Immer“: `bindBackgroundLaySession`,
   `startBackgroundUpdates()` (`features/tracking/native/backgroundLocationTask.ts`, Task
   `anyvo-faehrte-bg`, `BestForNavigation`, 1 s, Android-Foreground-Service mit Notification,
   iOS blaue Pille). Danach wird der Vordergrund-Watch abgelöst. Ohne „Immer“ läuft der Vordergrund-Watch weiter.
4. Fix-Pfad: Vordergrund und Hintergrund-Task liefern beide an `deliverLayFix` bzw.
   `deliverBackgroundLocations` → `createLayProcessor` (`features/tracking/engine/layProcessingSession.ts`).
   Punkte gehen über `createBufferedPointWriter` → `createLocalTrackPointsBatch` (SQLite `local_track_points`).
   Marker gehen über `createLocalTrackMarker` / `saveTrackMarker` mit `markerWriteBarrier`.
5. `finish()`: `beginFinalizeLaySession` (keine neuen Fixes), `confirmer.flush` rettet den letzten Winkel,
   `evaluateStopFlush`, `flushPoints`, `finalizeLocalTrainingSession(status:'completed')` → `saveState='saved'`
   gilt **auch offline** als Erfolg. Danach `enqueueSyncOperation({entityType:'training_session', operation:'create'})`
   und `syncNow()` (best-effort).

**Absuche (`useSearchRecorder.ts`, `app/track/run.tsx`):** eigene Positionsquelle (gleiche Factory),
Suchpunkte über `features/tracking/store/searchPersist.ts` (`enqueueSearchPoint`/`flushSearchPoints`),
Run-Zustand über `searchRunState.ts`/`searchRecovery.ts`. Remote landet der Run in `track_runs.run_points`.
`run.tsx` reiht die Session ebenfalls in die Sync-Queue ein (Z. 605, 1088).

**Upload (`features/sync/services/syncEngine.ts` → `remoteTrainingSyncService.ts`):**
`training_sessions.upsert(onConflict:'id')` → `deleteRemoteLayTrackPoints` + `createRemoteTrackPointsBatch`
(Chunks à 100) → `deleteRemoteTrackMarkers` + Batch-Insert (Fallback Einzel-Insert) → `upsertRemoteTrackRun`.
Das ist ein idempotentes „Replace by session“, aber **nicht transaktional**: Bricht der Upload zwischen
Delete und Insert ab, ist der Remote-Stand bis zum nächsten Retry unvollständig [B; Risiko].

**Diagnostik (lokal, ohne Backend-Upload):**
- `features/tracking/utils/backgroundLayDiagnostics.ts`: koordinatenfreie Events pro Session in AsyncStorage
  (`anyvo.bgLayDiag.v1::…`; z. B. `persistAttempt`, `resume`, `taskRegistered`, Permission-Status).
- `features/tracking/services/supportDiagnosticsService.ts`, `supportProvenanceStore.ts`: Kunden-Support-Diagnose
  aus lokalen Daten. QA-Export (`qaTrackExportService.ts`) teilt JSON über `expo-sharing`.
- Freischaltung über `profiles.can_use_internal_tracking_diagnostics`
  (`services/diagnosticsAccessService.ts`; Migration `20261008190000_internal_tracking_diagnostics_access.sql`
  mit Schutztrigger; Grants über `supabase/operations/*`).

## 9. GPS/IMU: Rohdaten vs. abgeleitete Daten, Winkelerkennung [B]

| Ebene | Ort | Inhalt |
|---|---|---|
| Roh (lokal) | `features/tracking/storage/gpsCapture.ts`, `rawCaptureRepository.ts`, `rawMeasurementJournal.ts`, `sqliteRawRecording.ts`; eigene DB (`gpsCaptureDb.ts`) | jeder empfangene Fix mit `measuredAtMs`/`receivedAtMs`, Quelle, foreground/background, Timing-Disposition. Pro Konto (`gpsCaptureScope`, Epoch bei Kontowechsel), Limit 1 Mio. Datensätze pro Owner mit **explizitem Fehler statt Verdrängung**. Wird nicht hochgeladen. |
| Gefiltert (Linie) | `layProcessingSession.ts` | Gates: `MAX_ACCURACY_M=45`, `MAX_SPEED_MPS=12`, `MIN_STEP_M=2.0`, EMA `0.4` (Linie) bzw. `0.6` (Live-Puck), Startanker per Median (≥4 Fixes ≤20 m, `START_LOCK_MAX_MS=12000`). Ergebnis: `local_track_points` → `track_points`. |
| Abgeleitet | Marker, Segmente, Kontinuität, Score | `track_markers` (inkl. `angle_kind` links/rechts/spitz/absatz), Summary-Felder in `training_sessions`, `segments`/`layContinuity`/`manualAngleGeometry`. |

**IMU:** `modules/anyvo-motion` (iOS `CMMotionManager` ~20 Hz intern, `CMPedometer`, optional
`CMMotionActivityManager`) → `motionClient.onSample` liefert `headingDelta`, `rotationMagnitude`,
`accelerationMagnitude`, `stepDelta`, `cadence`, `movementState`. Im Recorder landet das in `MotionEvidenceBuffer`
(`utils/motionTurnEvidence.ts`). Nur aktiv im Engine-Modus `current`. Ohne Modul läuft der reine GPS-Pfad
(es gibt kein Android-Motion-Modul im Repo).

**Winkel/Turns (nur im Legen-Pfad, live):**
- Geometrie: `utils/legacyCornerDetection.ts` (`legacyDetectCorner`; Schenkel ≥4 m, Spitz 30–60°, 90° = 75–115°,
  Scheitel-Fix ≤20 m) und `utils/shortLegCornerDetection.ts`, aufgerufen in `layProcessingSession.ts`.
- Bestätigung: `utils/cornerConfirmation.ts` (`createCornerConfirmer`, `feedCornerBuffer`), Zonen-Gate
  `turnAwareLineGate.ts`.
- Fusion GPS + IMU: `utils/turnFusion.ts` (`fuseTurns`, `associateLiveTurn`, `nearestCompatibleTurnEvidence`).
- Abschluss: `stopFlushCorner.ts` (Winkel am Ende), `manualAngleGeometry.ts` (manuelle Winkel),
  `specialAngleGeometry.ts`.
- Absuche: Abweichung/Abriss in `utils/offTrack.ts`, `searchFix.ts`, `searchGeometry.ts`.
- Daneben existieren `engine/turnDetection.ts`, `engine/trackingSessionEngine.ts`, `engine/trackFusionEngine.ts`.
  Ob sie im Live-Pfad laufen, ist nicht geprüft [O].

## 10. Supabase-Client, Tabellen, RLS [B]

**Client (`lib/supabase.ts`):** `createClient` mit AsyncStorage als Session-Speicher, `persistSession`,
`autoRefreshToken`, `flowType:'pkce'`, `detectSessionInUrl:false`. Erzwingt HTTPS, kanonischen
`*.supabase.co`-Host und den passenden Projekt-Ref je `EXPO_PUBLIC_BACKEND_ENV` (production/staging).
Bei `AppState` aktiv/inaktiv werden `startAutoRefresh`/`stopAutoRefresh` umgeschaltet.

**Vom Client berührte Tabellen (Auszug, nach Häufigkeit):** `training_sessions`, `profiles`, Gesundheit
(`dog_health_*`, `dog_vet_appointments`, `dog_deworming_entries`, `dog_health_access_grants`), Läufigkeit
(`dog_heat_*`), `calendar_events`, `dogs`, `dog_documents`, `subscriptions`, `user_capabilities`,
`track_points`, `track_markers`, `track_runs`, `track_engine_sessions` (lesend), `track_shares`, `track_feedback`,
`voice_notes`, `training_units`, `training_plans`, `trainer_profiles`, `connections`, `connection_permissions`,
`connection_invites`, `connect_*`, `trainer_umfragen`/`umfrage_*`, `training_comments`, KI-Tabellen
(`ai_insights`, `training_analysis`, `training_recommendations`, `training_embeddings`).
**RPCs:** `claim_newbie_quota`, `newbie_quota_status`, `founder_slots_status`, `redeem_trainer_code`,
`redeem_connection_invite`, `search_anyvo_people`, `get_profile_display_names`, `check_username_available`,
`shared_track_display`, `list_received_health_dogs`, `list_shared_dog_weights`, `track_transfer_v2`.
**Storage-Buckets (Client):** `training-photos`, `training-videos`, `training-audio`, `dog-avatars`,
`dog-documents`; Anzeige über Signed URLs (`lib/mediaUrl.ts`). `services/mediaService.ts` enthält noch
`getPublicUrl` [O: bei privaten Buckets wirkungslos].

**Wo RLS in git definiert ist:**
- `supabase/migrations/` (32 Dateien auf Build 57): Policies u. a. in `…_user_entitlements`,
  `…_dog_deworming_entries`, `…_health_domain`, `…_health_access_grants` (33 Policies),
  `…_track_sharing_feedback` (13), `…_profiles_least_privilege_access`, `…_trainer_profiles_entitlement`
  (Insert nur mit `is_trainer_module(auth.uid())`), `…_training_plans_entitlement`,
  `…_health_vaccination_medication_history`.
- Ältere Basis-Policies stehen in den **Root-SQL-Dateien** (`CAPABILITY_MODEL_SETUP.sql`,
  `SUBSCRIPTION_V2_SETUP.sql`, `CONNECT_SETUP.sql` (48 Policies), `TRACK_MODULE_SETUP.sql`, `MEDIA_SETUP.sql`,
  `VISIBILITY_POLICIES.sql` u. a.). Sie sind keine Migrationen. Die rekonstruierte Production-Schemabasis liegt in
  `supabase/local/baseline.sql` (nur lokal/CI).
- **Live-DB ≠ git [B]:** Die deployten Functions rufen `subscription_client_v1`, `subscription_owned_state_v1`,
  `subscription_reconcile_lease_v1` und `subscription_apply_owned_v1`. Keine davon liegt in git. Die App ruft
  die Function `notify-comment`, die ebenfalls nicht in git liegt.

**RLS und Schreibrechte live [B 2026-11-09, nur lesend geprüft]:** Die Live-Policies und
Tabellenrechte für die Abo- und Berechtigungstabellen sowie für die Verbindungs-Tabellen
wurden geprüft. Es gibt einen **offenen Sicherheitsbefund (P0)**. Die Details stehen nur
lokal bei der Nutzerin (Backup-Ordner, `SICHERHEITSBEFUND_RLS_2026-11-09_PRIVAT.md`) und
kommen erst nach der Behebung in dieses öffentliche Dokument.

Grundsatz: Plan- und Berechtigungsspalten dürfen nur vom Server (Service-Role/RPC)
geschrieben werden, nie direkt vom Client.

## 11. RevenueCat und Abo-Synchronisation [B]

**Client:**
- `lib/purchases.ts`: lädt `react-native-purchases` defensiv, Keys `EXPO_PUBLIC_REVENUECAT_IOS_KEY`/`_ANDROID_KEY`.
  `ensurePurchasesConfigured(uid)` über `purchaseAccountAdapter.ts` (configure mit `appUserID = Supabase-UID`,
  sonst `logIn`). **Nie anonym.** `purchaseAccountGuard.ts` bricht bei Kontowechsel mit `IAP_ACCOUNT_CHANGED` ab.
  Funktionen: `getPackages`, `buyPackage` (Android mit `oldProductIdentifier`/`WITH_TIME_PRORATION`),
  `restorePurchases`, `getCurrentStoreSubscription` (Cache invalidieren), `getManagementURL`.
  Aufgerufen wird `configurePurchases(uid)` in `app/(tabs)/_layout.tsx`.
- `app/premium.tsx` → `choose(plan)`: prüft Tester, Konto (`getUser` = aktuelle UID), frischen Store-Stand,
  `canSwitchPlanInApp` (iOS: Active↔Trainer erlaubt; Android nur Upgrades; Founder wird nicht mehr verkauft,
  der Zweig ist laut Kommentar tot). Nach `buyPackage` folgt `activatePlan()`, nach Restore ebenso.
- `services/subscriptionService.ts` → `activatePlan`: Bei **bezahlten** Plänen ausschliesslich
  `syncSubscriptionAuthority` (keine Client-Writes). Nur bei **NEWBIE** schreibt der Client selbst
  `subscriptions`, `user_capabilities` und `profiles`.
- `services/subscriptionAuthorityService.ts`: ruft `supabase.functions.invoke('subscription-sync', { body: {} })`
  (keine UID, kein Plan, kein Receipt als Autorität), 3 Versuche, 12-s-Timeout, Kontoprüfung vor und nach jedem Call.
  Erfolg nur bei `version===1`, `verified===true`, bezahltem Plan mit Rang ≥ gewünschtem Plan und
  `expiresAt` in der Zukunft. Sonst `SUBSCRIPTION_SYNC_PENDING`. Ein verifiziertes `newbie` für einen Marker
  älter als 24 h ergibt `SUBSCRIPTION_INACTIVE` und löscht den Marker.
- `services/pendingSubscriptionSync.ts`: Marker pro Konto in AsyncStorage (`@anyvo/subscription-sync/v1/<uid>`;
  Plan, Nonce, `retryAt`, `createdAt`; ohne Receipt), Lock pro UID, Retry-Fenster 60 s.
- `hooks/useSubscriptionSyncRecovery.ts` (gemountet in `lib/session-context.tsx`): retry bei App-Vordergrund,
  NetInfo-Reconnect, neuem Marker und Timer (1–60 s). Das kauft nie erneut.
- **Gating-Hooks:** `hooks/useCapabilities.ts` → `services/capabilityService.getMyCapabilities` (vereint
  `user_capabilities`, Fallback `profiles.plan/is_trainer`, `isTrialLapsed`, `user_entitlements` über
  `resolveEffectiveCapabilities`, internes Tester-Flag). Das liefert `isPro`, `isTrainerModule`, `can(cap)`.
  `hooks/usePlan.ts` (Legacy, `isPro || profile.isPremium`), `hooks/useAccess.ts` (`lib/entitlements/getUserAccess.ts`),
  `lib/planLimits.ts` (Legacy `free/premium`). Capability-Matrix: `features/subscription/plans.ts`.

**Deployter Server (nicht in git; read-only gesichtet):**
- `subscription-sync`, `revenuecat-webhook`, `revenuecat-webhook-google` sind je 3 Zeilen auf
  `_shared/handlers.ts` + `_shared/runtime.ts` (`ownedRuntime`).
- `syncHandler`: nur POST, JWT über `auth.getUser` **mit bestätigter E-Mail**, Body leer (≤256 Zeichen),
  `reserve` über RPC `subscription_client_v1('reserve_sync')` (Vermutung: Rate-Limit), dann `reconcile([uid])`.
- `webhookHandler`: `Authorization` muss exakt `RC_WEBHOOK_SECRET` sein. `TEST` → ok, **`SANDBOX`-Events werden
  ignoriert**. UIDs kommen aus `app_user_id` bzw. `transferred_from/to` (≤50). Event-Plan und -Ablauf werden
  **nie** als Beleg genutzt, das Event ist nur Auslöser.
- `reconcileOwned` (`_shared/reconcile.ts`): Konten-Menge stabilisieren (≤4 Runden, ≤50 UIDs), Leases pro UID
  (`subscription_reconcile_lease_v1`), frischer Provider-Beweis (RevenueCat V2 `customers/subscriptions/entitlements/products`
  + V1 `subscribers`, nur GET, 8-s-Timeouts), Beweis-Ablauf 15 s, `planOwnership` (`_shared/ownership.ts`) prüft
  Aliase, Receipt-Bindungen und Revisionen sowie die **V1/V2-Übereinstimmung**, dann `subscription_apply_owned_v1`.
  `normalizer.ts` mappt nur die drei Produkt-IDs (+ verifizierte Aliase), keine Sandbox, kein implizites Lifetime.
- **Fail-closed:** Jeder Fehler (Auth, Shape, Provider, Lease belegt, V1≠V2, unbekanntes Produkt,
  `SUBSCRIPTION_OWNERSHIP_ENABLED != 'true'`) ergibt HTTP 503 `SUBSCRIPTION_SYNC_PENDING`. Es wird nichts
  geschrieben, der Client bleibt `pending` und versucht es weiter. RevenueCat wiederholt Webhooks bei 503
  [O: Retry-Verhalten von RevenueCat nicht im Code belegt].
- **Abweichung git ↔ deployed:** `supabase/functions/_shared/revenuecat-webhook.ts` (git) schreibt direkt aus dem
  Event-Payload in `subscriptions`/`user_capabilities`/`profiles` und ruft `claim_founder_slot`/`lapse_founder_slot`.
  Ein Deploy aus git würde die Server-Autorität **zurückdrehen**. Die deployten Dateien gehören in die Versionierung [O].

## 12. Trainer Connect [B]

- **Kundenseite „Meine Trainer“** (`app/trainer/index.tsx`): bewusst **ohne Capability-Gate** für alle Pläne
  (Tests `features/subscription/__tests__/phase10MeineTrainerPaywall.test.ts`). `app/trainer/_layout.tsx` ist ein
  reiner Stack. Verbinden geht per Code oder Suche (`redeemTrainerCode`, `searchTrainers`).
- **Server:** `redeem_trainer_code` (security definer, `TRAINER_FLOW_REPAIR.sql`) prüft nur Login, Code, Selbstverbindung
  und Duplikat. Es legt `connections(status:'accepted', connection_type:'trainer_client')` und `connection_permissions` an.
  **Keine Plan-Prüfung.** Ergebnis: **NEWBIE und ACTIVE können einen Trainer hinzufügen** (Client und Server).
  Fallback in `services/trainerService.ts`: Fehlt die RPC, macht der Client einen direkten Insert.
- **Trainerseite** (nur `trainer_module`): `app/trainer/dashboard.tsx`, `plaene.tsx`, `edit.tsx`, `registrieren.tsx`,
  `plan-neu.tsx` mit eigenem `isTrainerModule`-Gate. `app/(tabs)/clients.tsx` leitet Nicht-Trainer nach `/trainer` um.
  Serverseitig: `trainer_profiles_insert` und `training_plans` verlangen `is_trainer_module()`.
- **Freigaben:** `connection_permissions` (`view_trainings/statistics/videos/dogs/appointments` Default true,
  `view_health`/`view_private_notes` Default false). Änderung über `updatePermission` nur durch den Owner (RLS).
  Gesundheit läuft separat über `dog_health_access_grants`.
- Fährten teilen: `services/trackShareService.ts` (`track_shares`, `track_feedback`, RPC `shared_track_display`).
  Die CTA „Trainer verbinden“ in `app/track/[id].tsx` führt nach `/trainer`.
- **Connect (neu):** `features/connect/services/connect-entitlements.ts`. In Production (`!__DEV__`) erzwungen:
  Posts/Events/Partnersuche nur `isPro`, Gruppen/Trainerprofil nur `isTrainerModule`, NEWBIE max. 25 Freunde.
- Hinweis: Ob ACTIVE Trainer hinzufügen *darf*, ist eine Produktentscheidung. Der Code erlaubt es für jeden
  eingeloggten Nutzer. Gilt eine andere Regel, ist das ein Gating-Bug [N/O].

## 13. Authentifizierung und Session [B]

- `services/auth.ts`: E-Mail/Passwort (`signInWithPassword`, `signUp` mit `emailRedirectTo` und `role` in den
  Metadaten), Passwort-Reset (`resetPasswordForEmail` → Recovery-Redirect), Reauth/Update von Passwort und E-Mail,
  **Sign in with Apple** nativ (`expo-apple-authentication` → `signInWithIdToken`), **Google OAuth**
  (`signInWithOAuth` mit `skipBrowserRedirect` → `WebBrowser.openAuthSessionAsync` → `exchangeCodeForSession(code)`,
  Single-Flight `googleOAuthInFlight`).
- `app/auth/callback.tsx`: PKCE-Code einmalig tauschen (Schutz gegen Doppelaufruf), sonst auf eine bestehende
  Session warten, Fehler → `/(auth)/login`. Weitere Routen: `app/auth/forgot-password.tsx`, `recovery.tsx`.
- `lib/session-context.tsx`: Bootstrap mit `getSession()` (8-s-Sicherheits-Timeout), `onAuthStateChange` setzt
  Session, GPS-Archiv-Konto (`setGpsCaptureAccount`, Epoch-Wechsel bei `SIGNED_OUT`), Diagnose-Session und
  Locale-Sync. `PASSWORD_RECOVERY` → `/auth/recovery`. Mountet `useSubscriptionSyncRecovery`.
- `signOut()` ruft nur `supabase.auth.signOut()` auf. Lokale SQLite-Daten, das GPS-Archiv und AsyncStorage
  bleiben auf dem Gerät. Das Archiv ist pro Owner gekapselt [B]; ob alle lokalen Tabellen owner-gefiltert
  gelesen werden, ist offen [O].

## 14. Edge Functions und Webhooks [B]

| Function | In git | Zweck / Hinweise |
|---|---|---|
| `subscription-sync` | **nein** (nur deployed) | Server-Reconcile des eigenen Abos (Abschnitt 11) |
| `revenuecat-webhook` | ja, **weicht ab** | deployed: Reconcile-Auslöser, Secret-Header; git: payload-vertrauender Alt-Handler |
| `revenuecat-webhook-google` | ja, **weicht ab** | wie oben (Play-Store-Projekt), dasselbe Secret |
| `claim-founder-active` | ja | Founder-Slot über RPC `claim_founder_slot` (limitiert, Angebot eingestellt) |
| `delete-account` | ja | löscht Storage-Ordner `<uid>/` in 5 Buckets (best-effort), KI-Tabellen, `dogs`, `connections`, dann `auth.admin.deleteUser` (Rest per CASCADE) |
| `ai-analysis` | ja | KI-Trainingsanalyse (Anthropic, Key serverseitig), JWT-Prüfung |
| `analyze-training` | ja | KI-Analyse einer Einheit (Anthropic), JWT-Prüfung |
| `generate-coach-summary` | ja | Coach-Zusammenfassung aus `training_units` (Anthropic) |
| `recommend` | ja | 1–3 KI-Empfehlungen; ohne Key leere Liste [O: Sicherheitsprüfung offen, siehe lokaler Befund] |
| `generate-training-embedding` | ja | Embeddings → `training_embeddings` |
| `search-training-memory` | ja | Vektorsuche über RPC `match_training_embeddings` [O: Sicherheitsprüfung offen, siehe lokaler Befund] |
| `transcribe-voice-note` | ja | OpenAI-Transkription → `voice_notes.transcript` |
| `notify` | ja | Push-Versand mit Service-Role [O: Sicherheitsprüfung offen, siehe lokaler Befund] |
| `notify-appointment` | ja | Push an Umfrage-Eingeladene (Service-Role) [O: Sicherheitsprüfung offen, siehe lokaler Befund] |
| `notify-comment` | **nein** | wird von der App aufgerufen, Quelle fehlt in git [O] |

`supabase/config.toml` setzt kein function-spezifisches `verify_jwt`. Der Live-Wert ist offen [O].

## 15. Offline-Verhalten [B]

- **Lokale DB** `lib/localDb` (`client.ts`, `migrations.ts`): `local_training_sessions`, `local_track_points`,
  `local_track_markers`, `local_media_files`, `sync_queue`, `local_track_transfer_sync`, Object-Review-Cache/-Outbox,
  Ablenkungen, Pläne, Exchange-Tabellen. Getrennt davon die GPS-Roh-DB.
- **Queue** `features/sync/repositories/syncQueueRepository.ts`: Status `pending/failed/conflict/completed`,
  `attempts` werden gezählt. **Kein Max-Attempts-Limit und kein Backoff im Code.**
  `local_missing`/`transfer_conflict` → `conflict` (kein Retry).
- **Auslöser** `features/sync/components/SyncProvider.tsx` (in `app/_layout.tsx`): App-Start (inkl. Retry der
  `failed`-Einträge), Reconnect (debounced), Vordergrund (inkl. Retry der `failed`-Einträge). Manuell: `app/sync.tsx`.
- **Offline-fähig:** Fährten (Legen/Absuche), Medien (`entity_type:'media_file'`), Track-Transfer/Review-Outbox.
- **Nur online** (direkte Supabase-Calls): normale Trainings (`services/training.ts`), Hunde, Gesundheit, Kalender,
  Trainer/Connect, Abo-Sync.
- **AsyncStorage:** Pending-Track (`features/tracking/store/trackPersist.ts`, pro Hund, best-effort), Lay-Diagnostik,
  Abo-Marker, Crash-Opt-out, QA-Präferenzen. Der React-Query-Cache ist **nicht persistiert** (`lib/queryClient.ts`).
- **Lücke (Vermutung, Feldtest nötig):** Beim Kaltstart offline schlägt `getMyCapabilities` fehl. Dann ist
  `isPro = false`, `legen.tsx` ruft `claimNewbieQuota('track')` auf, das in Production fail-closed `error` liefert.
  Damit könnten **auch zahlende Nutzer offline keine neue Fährte starten**, und NEWBIE grundsätzlich nicht.

## 16. App-Wechsel und Resume [B]

- **Recorder:** Die `AppState`-Listener in `useTrackRecorder.ts` und `useSearchRecorder.ts` sind ausdrücklich
  „observation only“. Sie starten, stoppen und stellen nichts wieder her. Bei `background`/`inactive` flushen sie
  das Roharchiv (`rawCapture.flush`). Bei `active` schreiben sie Diagnose-Events (`foreground`, `resume`,
  `taskRegistered`, Permission-Status).
- **Hintergrund-Kontinuität** kommt aus dem Location-Task (`anyvo-faehrte-bg`, Android-Foreground-Service
  `killServiceOnDestroy:false`) und dem nativen Modul (`allowsBackgroundLocationUpdates`), nicht aus AppState.
  `serializeBackgroundTransition` (`utils/backgroundTransitionQueue.ts`) serialisiert Start und Stop.
- **Nach App-Kill:** Wiederaufnahme über Pending-Track/lokale Session (`store/trackRecovery.ts`, `utils/layRecovery.ts`,
  `services/trackRecoveryService.ts`, `components/TrackResumeCta.tsx`, `ActiveFaehrtenSelfHeal.tsx`,
  `GlobalActiveFaehrtenBar.tsx`); `beginRecording({resume})` prüft Session, Hund und Status `laying`.
- **Liegezeit:** Zeitstempel-basiert (`layStartedAt`), Live Activity/Notification (`modules/anyvo-resting-activity`,
  `native/liegezeitLiveActivity.ts`, `restingActivityReconcile.ts`). Verlassen-Schutz in `app/track/liegen.tsx`:
  Build 57 über `navigation.addListener('beforeRemove')`, **[B60]** über `usePreventRemove` + `repeat()`
  (SDK 58 hat `beforeRemove` entfernt).
- **Sync/Session:** `SyncProvider` und `useSubscriptionSyncRecovery` reagieren auf `active`. `lib/supabase.ts`
  schaltet den Token-Refresh nach AppState.

## 17. Berechtigungen und Datenschutz [B]

- **Standort:** expo-location-Plugin mit iOS/Android-Background-Location und Android-Foreground-Service.
  Android-Permissions: `ACCESS_FINE/COARSE/BACKGROUND_LOCATION`, `FOREGROUND_SERVICE(_LOCATION)`.
  `NSLocationTemporaryUsageDescriptionDictionary` für temporär volle Genauigkeit. Foreground-Permission beim
  Warmup, Background erst nach der Offenlegung `BackgroundLocationDisclosure` und nur, wenn erneut fragbar.
- **Bewegung:** `NSMotionUsageDescription` (iOS). Android blockiert `ACTIVITY_RECOGNITION`.
- **Medien:** Fotos über `expo-image-picker` (Kamera-Permission aus, `CAMERA` blockiert), Mikrofon (`expo-audio`,
  Spracherkennung), Kalender/Erinnerungen, Bluetooth (externes GPS, `react-native-ble-plx` Background central),
  Face ID (App-Sperre), Push (`lib/push.ts`, Token in `profiles.push_token`).
- **Kontolöschung:** `app/(tabs)/profile.tsx` → `services/auth.deleteAccount()` → Function `delete-account` → `signOut`.
  Storage-Löschung ist best-effort (max. 1000 Dateien pro Ordner-Listing; Unterordner [O]). **Lokale Daten
  werden nicht gelöscht:** `wipeLocalData()` (`lib/localDb/client.ts`) wird nur von `app/dev/offline-debug.tsx`
  aufgerufen [Risiko]. `app/konto-loeschen.tsx` ist eine Info-Seite.
- **Monitoring:** Sentry mit Opt-out. Diagnostik koordinatenfrei; QA-Exporte nur mit Diagnose-Freischaltung.
- `app.json` enthält einen Google-Maps-Android-Key im Klartext [O: Einschränkung des Keys prüfen].

## 18. Build 57 vs. Build 60 — wesentliche Unterschiede [B60]

`git diff d11fcb37 3bb78943`: 77 Dateien, überwiegend SDK-58-Anpassungen (`package.json`, Patches
`scripts/patch-expo-task-manager.cjs` / `patch-react-native-maps.cjs`, `StyleSheet.absoluteFillObject` ersetzt,
`newArchEnabled`/`edgeToEdgeEnabled` aus `app.json` entfernt, Runtime `1.0.8-sdk58-v1`).
Fachlich: `liegen.tsx` Verlassen-Schutz (Abschnitt 16), `app/(tabs)/training.tsx` (+58 Zeilen UI), Recorder
und native Module nur je 2 Zeilen, keine Änderungen an Abo-, Sync- oder Trainer-Services.
`react-native-purchases` ^10.2.2 → ^10.16.0, expo-location/-sqlite/-task-manager auf 58.x.

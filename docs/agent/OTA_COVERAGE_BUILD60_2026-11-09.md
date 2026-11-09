# OTA-Abdeckung Build 60 – Erstbefund 2026-11-09

Erzeugt mit `node scripts/check-ota-coverage.mjs --platform ios --candidate 3bb7894364f26429c7e2a9f8e8e22dd70cf03817` (neueste Production-OTA auf Build 60, Runtime `1.0.8-sdk58-v1`). Nur lesend.

Geprüft wurden alle 260 iOS-Production-OTAs aus `docs/agent/ota-ledger.json`. „Offen“ heißt: die App-relevante Änderung dieser OTA ist im Kandidaten weder als Vorfahre noch inhaltlich (Reverse-Apply, auch ohne Kontext) auffindbar. Das kann echt fehlen **oder** später bewusst anders umgesetzt worden sein – jede offene Zeile braucht eine Entscheidung (nachziehen oder in `docs/agent/ota-coverage-exceptions.json` begründet ausnehmen). Keine Ausnahme wurde automatisch eingetragen.

## Übersicht je Runtime (iOS)

| Runtime | offen | geprüft |
|---|---|---|
| `1.0.1` | 19 | 66 |
| `1.0.2` | 2 | 26 |
| `1.0.3` | 4 | 46 |
| `1.0.4` | 1 | 42 |
| `1.0.5` | 6 | 9 |
| `1.0.5-motion-v2` | 7 | 9 |
| `1.0.5-motion-v3` | 3 | 7 |
| `1.0.5-motion-v4` | 27 | 31 |
| `1.0.5-map49-v1` | 0 | 4 |
| `1.0.6-map49-v1` | 0 | 17 |
| `sdk58-customer-ios-v1` | 1 | 1 |
| `1.0.8-sdk58-v1` | 0 | 2 |

**Kernaussagen**

- Alles, was auf **Build 57 (App Store, `1.0.6-map49-v1`)** ausgeliefert wurde, ist in der neuesten Build-60-OTA enthalten (0 von 17 offen).
- Die größte Lücke betrifft **`1.0.5-motion-v4`** (TestFlight Build 55, 22.–29.10.): Training-Hub/Apportierholz, Läufigkeit, Hundedashboard, Trainingshistorie, App-Start-Logo, Fährtenkarte/-oberfläche u. a.
- Tracking-/GPS-/Recorder-Änderungen alter Runtimes sind laut Schutzregel (Build-58-Fährtenbasis) **keine** automatisch nachzuholenden Pakete; sie brauchen trotzdem eine dokumentierte Ausnahme.
- `sdk58-customer-ios-v1` (Build 59): „keep training unit cards opaque“ fehlt in Build 60 – prüfen, ob für SDK58 nötig.

## Offene OTAs (neueste zuerst)

| Datum | Runtime | OTA | betroffene Dateien |
|---|---|---|---|
| 2026-11-04 | `sdk58-customer-ios-v1` | fix(ui): keep training unit cards opaque on iOS 59 | `components/training/UnitListCard.tsx` |
| 2026-10-29 | `1.0.5-motion-v4` | Fährtendiagnose: persönlichen Zugriff nach Verbindungsfehler zuverlässig erneut prüfen | `components/DiagnosticsAccessSync.tsx`, `services/diagnosticsAccessService.ts` |
| 2026-10-29 | `1.0.5-motion-v4` | Hundedashboard: Hinweise und Termine direkt öffnen; eigene Termine explizit abschließen od | `app/training-hub.tsx`, `components/calendar/EventActionsSheet.tsx`, `features/dogs/DogHubScreen.tsx` |
| 2026-10-29 | `1.0.5-motion-v2` | Trainingserfassung: Tastatur und Scrollende erreichbar; Daten, Tracking und LiveShare erha | `app/unit/document.tsx` |
| 2026-10-29 | `1.0.5` | Trainingserfassung: Tastatur und Scrollende erreichbar; Daten, Tracking und LiveShare erha | `app/unit/document.tsx` |
| 2026-10-29 | `1.0.5-motion-v4` | Fährtenansicht: Gegenstände und beide Spuren; begrenzte persönliche Bewegungsdiagnose | `features/tracking/components/TrackingMap.tsx`, `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/utils/cornerWindowAudit.ts`, `features/tracking/utils/qaMotionCapture.ts` +2 |
| 2026-10-29 | `1.0.5-motion-v4` | Satellitendiagnose: klare iOS-Verfügbarkeit; Tracking, LiveShare und Abo-Wiederherstellung | `features/tracking/components/PositionQualityDiagnostics.tsx`, `features/tracking/utils/gnssConstellations.ts`, `features/tracking/utils/positionDiagnostics.ts`, `modules/anyvo-precision-location/src/AnyvoPrecisionLocation.types.ts` |
| 2026-10-28 | `1.0.5-motion-v4` | App-Start: Startlogo nach erstem Root-Layout ohne Tippen ausblenden | `app/_layout.tsx`, `hooks/useDismissStartupSplash.ts` |
| 2026-10-28 | `1.0.5-motion-v4` | Fährtenstart: Vorschau und Genauigkeit, Schweizer Karte mit sichtbarem Schließen | `app/track/legen.tsx`, `features/tracking/components/SwissMapTest.tsx`, `features/tracking/components/WarmupMapPreview.tsx`, `i18n/de-CH.ts` +4 |
| 2026-10-28 | `1.0.5-motion-v4` | Fährten-Diagnose: Messabstände und separate Schweizer Kartenvorschau | `app/dev/precision-location-test.tsx`, `features/tracking/components/PositionQualityDiagnostics.tsx`, `features/tracking/components/SwissMapTest.tsx`, `features/tracking/utils/positionDiagnostics.ts` +1 |
| 2026-10-28 | `1.0.5-motion-v4` | Fährtenkarte: Standard, Satellit und Hybrid auswählbar | `app/track/[id].tsx`, `features/tracking/components/MapLayerButton.tsx`, `features/tracking/components/TrackReplayMap.tsx`, `features/tracking/components/TrackingMap.tsx` |
| 2026-10-28 | `1.0.5-motion-v4` | Fährtenaufnahme: verspätete Marker nach Stop und Abschluss abweisen | `features/tracking/hooks/useTrackRecorder.ts` |
| 2026-10-28 | `1.0.4` | Fährtenkarte: klare Übersicht, Kartentypwechsel und kompakte Richtungsmarker | `app/track/[id].tsx`, `features/tracking/components/TrackMapSummary.tsx`, `features/tracking/components/TrackingMap.tsx` |
| 2026-10-28 | `1.0.5-motion-v4` | Fährtenkarte: klare Übersicht, Kartentypwechsel und kompakte Richtungsmarker | `app/track/[id].tsx`, `features/tracking/components/TrackMapSummary.tsx`, `features/tracking/components/TrackingMap.tsx` |
| 2026-10-26 | `1.0.5-motion-v4` | Fährtenkarte: durchgezogene Spuren, kompakte Marker und keine Maßstäbe | `app/track/[id].tsx`, `app/track/legen.tsx`, `features/tracking/components/TrackingMap.tsx` |
| 2026-10-26 | `1.0.5-motion-v4` | Fährten: lokal bestätigte Spitzwinkel, begrenzte Zusatzprüfung und konsistente Diagnose | `features/tracking/engine/layProcessingSession.ts`, `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/utils/localDirectionConfirmation.ts`, `features/tracking/utils/turnFusion.ts` |
| 2026-10-26 | `1.0.5-motion-v4` | fix(tracking): improve saved track comparison line clarity for iOS 55 | `features/tracking/components/TrackComparisonLines.tsx` |
| 2026-10-26 | `1.0.5-motion-v4` | Fährte legen: klare Vorbereitung und verständlicher GPS-Status; Planauswahl, Tracking und  | `app/track/legen.tsx`, `features/tracking/hooks/useTrackRecorder.ts`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts` +3 |
| 2026-10-26 | `1.0.5-motion-v4` | Fährtenansicht: sichere Planauswahl und vollständig sichtbarer Diagnosestatus; Tracking un | `app/dev/precision-location-test.tsx`, `features/tracking-planner/LayPlanControl.tsx`, `features/tracking-planner/i18n.ts` |
| 2026-10-26 | `1.0.5-motion-v4` | Fährte: klare Pause und erweiterte Diagnose; Läufigkeitsprognose und Kalender; LiveShare e | `app/track/legen.tsx`, `components/dogs/HomeHeatCard.tsx`, `features/tracking/engine/layProcessingSession.ts`, `features/tracking/hooks/useTrackRecorder.ts` +10 |
| 2026-10-24 | `1.0.5-motion-v4` | Läufigkeit: Übersicht, Verlauf und tägliche Beobachtungen; bestehende Daten und Tracking e | `app/dog-health-record/[id].tsx`, `components/dogs/DogHeatCard.tsx`, `components/dogs/HealthHeatSection.tsx`, `components/dogs/HomeHeatCard.tsx` +3 |
| 2026-10-24 | `1.0.5-motion-v4` | Legen: separate gelb gestrichelte Planlinie; Tracking und LiveShare erhalten | `app/track/legen.tsx`, `features/tracking-planner/LayPlanControl.tsx`, `features/tracking-planner/i18n.ts`, `features/tracking-planner/useLayPlan.ts` +1 |
| 2026-10-24 | `1.0.5-motion-v4` | Training: kompakter Hub und Apportierholz-Icon; Tracking und LiveShare erhalten | `components/ui/ApportierholzIcon.tsx`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts`, `i18n/locales/en.ts` +2 |
| 2026-10-24 | `1.0.5-motion-v4` | Fährten: Trainingsfoto entfernt; Aktionen direkt erreichbar, Tracking und LiveShare erhalt | `app/track/index.tsx` |
| 2026-10-24 | `1.0.5-motion-v4` | Neue Fährtenoberfläche und App-Ton; geprüftes Tracking und LiveShare erhalten | `app/track/[id].tsx`, `app/track/index.tsx`, `assets/audio/anyvo-greeting.mp3`, `assets/images/tracking-field-hero.jpg` +9 |
| 2026-10-23 | `1.0.5-motion-v4` | Fährten: geprüfte kurze Winkelpaare und weniger unnötige Langspur-Prüfungen; LiveShare ble | `features/tracking/utils/shortLegCornerDetection.ts`, `features/tracking/utils/turnFusion.ts` |
| 2026-10-23 | `1.0.5-motion-v4` | GPS-Schutz: verworfene Fixes beeinflussen akzeptierte Messungen nicht; LiveShare bleibt er | `features/tracking/engine/layProcessingSession.ts`, `features/tracking/hooks/useSearchRecorder.ts` |
| 2026-10-23 | `1.0.5-motion-v4` | Gemeinsam trainieren: geprüfte zeitlich begrenzte Standortfreigabe mit sicherem Widerruf | `features/tracking-exchange/live/GroupTrainingScreen.tsx`, `features/tracking-exchange/live/components/GroupPositionsMap.tsx` |
| 2026-10-23 | `1.0.5-motion-v4` | Trainingshistorie vor Übernahme frisch prüfen; verspätete Antworten sicher verwerfen | `app/unit/document.tsx`, `services/trainingContext.ts` |
| 2026-10-23 | `1.0.5-motion-v4` | GPS-Start abgesichert; Trainingsvorlagen und sichtbares Bearbeiten; bestehende Funktionen  | `app/track/legen.tsx`, `app/track/run.tsx`, `app/training-hub.tsx`, `app/training-journal.tsx` +17 |
| 2026-10-22 | `1.0.5-motion-v4` | Fährtenauswertung: beide gespeicherten Spuren sichtbar; Tracking, Journal und Home erhalte | `app/track/[id].tsx`, `features/tracking/components/TrackComparisonLines.tsx`, `features/tracking/components/TrackingMap.tsx` |
| 2026-10-21 | `1.0.5-motion-v3` | Training journal: prepare, document observations, retain next-session reminders and separa | `app/unit/document.tsx`, `components/training/ExerciseIdentityList.tsx` |
| 2026-10-21 | `1.0.5-motion-v3` | Exercise choices: one picker, existing variant identity preserved, explicit rename; all pr | `app/unit/document.tsx`, `components/training/ExerciseIdentityList.tsx` |
| 2026-10-20 | `1.0.5-motion-v3` | Journal and preparation: focus/resume refresh, complete note display, explicit history and | `app/training-journal.tsx`, `app/unit/document.tsx`, `components/training/SelectedExerciseCard.tsx` |
| 2026-10-20 | `1.0.5` | Joker and rubber materials: scoring-safe objects, stable recovery, guidance and transfer c | `features/tracking/components/TrackingMap.tsx`, `features/tracking/hooks/useTrackRecorder.ts` |
| 2026-10-20 | `1.0.5-motion-v2` | Joker and rubber materials: scoring-safe objects, stable recovery, guidance and transfer c | `features/tracking/components/TrackingMap.tsx`, `features/tracking/hooks/useTrackRecorder.ts` |
| 2026-10-18 | `1.0.5-motion-v2` | Build52: new sharing and groups hub, first steps and contextual help; native motion, R2 tr | `app/help-center.tsx`, `app/help.tsx`, `app/track/[id].tsx`, `app/track/index.tsx` +28 |
| 2026-10-18 | `1.0.5` | Calendar editing and keyboard forms, saved angles, transparent logo and dog training docum | `app/training-hub.tsx`, `components/calendar/CreateEventModal.tsx`, `components/calendar/EventActionsSheet.tsx`, `components/calendar/RescheduleModal.tsx` +15 |
| 2026-10-18 | `1.0.5-motion-v2` | Calendar editing and keyboard forms, saved angles, transparent logo and dog training docum | `features/tracking/components/TrackingMap.tsx`, `features/tracking/utils/mapMarkerGroups.ts`, `features/tracking/utils/trackDetailMap.ts` |
| 2026-10-18 | `1.0.5-motion-v2` | Appointment editing and keyboard forms; saved angles and object labels; transparent logo;  | `app/training-hub.tsx`, `components/calendar/CreateEventModal.tsx`, `components/calendar/EventActionsSheet.tsx`, `components/calendar/RescheduleModal.tsx` +10 |
| 2026-10-18 | `1.0.5-motion-v2` | Tracking diagnosis: clarify standard GPS mode and simplify comparison settings | `app/dev/precision-location-test.tsx` |
| 2026-10-17 | `1.0.5-motion-v2` | Tracking support: record actual end events and distinguish incomplete observations | `features/tracking/utils/qaTrackExport.ts`, `features/tracking/utils/supportDiagnostics.ts` |
| 2026-10-15 | `1.0.5` | Subscription account safety: verified server purchase and restore, protected account chang | `app/premium.tsx`, `services/subscriptionAuthorityService.ts` |
| 2026-10-15 | `1.0.5` | Group tracking tasks: explicit invitations, accepted reference, reviewed return and revoca | `features/tracking-exchange/groups/GroupTasksScreen.tsx` |
| 2026-10-15 | `1.0.5` | Training documentation: atomic saves, exercise history and private follow-up focus | `app/unit/document.tsx`, `app/unit/summary.tsx`, `components/training/ExerciseIdentityList.tsx`, `components/training/SelectedExerciseCard.tsx` +8 |
| 2026-10-09 | `1.0.3` | Heat history dismissal and HelpSheet scrolling | `components/help/HelpSheet.tsx` |
| 2026-10-08 | `1.0.3` | fix: medication calendar dates and sync single flight | `app/dog-health-record/[id].tsx`, `components/ui/DateField.tsx` |
| 2026-10-04 | `1.0.3` | feat(tracking): add customer track diagnosis and sharing | `app/track/[id].tsx`, `app/track/run.tsx`, `features/tracking/components/SupportDiagnosticsRow.tsx`, `features/tracking/components/TrackResumeCta.tsx` +10 |
| 2026-09-30 | `1.0.3` | feat(updates): add customer update experience | `features/updates/whatsNew.ts`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts`, `i18n/locales/en.ts` +2 |
| 2026-09-16 | `1.0.2` | feat(track): analytics v3, object context and final-corner fix | `app.json`, `app/(tabs)/profile.tsx`, `app/_layout.tsx`, `app/dev/precision-location-test.tsx` +57 |
| 2026-09-11 | `1.0.2` | Diagnostics only: trainer connect runtime (7fe9eb8) | `app/trainer/index.tsx`, `services/connectionService.ts`, `services/trainerService.ts` |
| 2026-09-07 | `1.0.1` | feat(dog): add document training action to dog detail (d9b5a87) | `app/dog/[id].tsx`, `features/dogs/DogHubScreen.tsx` |
| 2026-09-04 | `1.0.1` | Button-Textabstand verbessert | `app/(tabs)/dogs.tsx`, `app/(tabs)/home.tsx`, `app/dog-backpack/[id].tsx`, `app/dog-heat-calendar/[id].tsx` +17 |
| 2026-09-04 | `1.0.1` | Dokumenten-CTA mit besserem Abstand | `components/dogs/DogDocumentsCard.tsx` |
| 2026-09-04 | `1.0.1` | Dokumenten-CTA ohne Plus-Icon | `components/dogs/DogDocumentsCard.tsx`, `i18n/de-CH.ts`, `i18n/gsw-CH.ts`, `i18n/locales/en.ts` +2 |
| 2026-09-04 | `1.0.1` | Kommando-Karten: Long-Press- und Swipe-Aktionen | `.gitignore`, `STAGING_DEPLOY_RUN.sql`, `app/(tabs)/profile.tsx`, `app/add-dog.tsx` +83 |
| 2026-08-27 | `1.0.1` | fix(tracking): correct fullscreen safe area | `app/track/[id].tsx`, `features/tracking/components/TrackingMap.tsx` |
| 2026-08-27 | `1.0.1` | feat(i18n): add French Italian and English localization | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx`, `app/sync.tsx` +30 |
| 2026-08-27 | `1.0.1` | fix(tracking): keep fullscreen control above native map | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx`, `app/track/[id].tsx` +20 |
| 2026-08-27 | `1.0.1` | tracking: trajectory turn engine | `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/trajectory/trajectoryTurnEngine.ts` |
| 2026-08-27 | `1.0.1` | feat(tracking): fullscreen saved track map | `app/dog-heat-calendar/[id].tsx`, `app/dog-heat-new.tsx`, `app/dog-heat/[id].tsx`, `app/dog/[id].tsx` +37 |
| 2026-08-27 | `1.0.1` | feat(dogs): add heat cycle calendar and phase timeline | `.gitignore`, `STAGING_DEPLOY_RUN.sql`, `app/dog-health/[id].tsx`, `app/dog-heat-calendar/[id].tsx` +63 |
| 2026-08-27 | `1.0.1` | tracking: interactive logbook map | `app/dog-heat-new.tsx`, `app/dog-heat/[id].tsx`, `app/dog/[id].tsx`, `app/language.tsx` +34 |
| 2026-08-25 | `1.0.1` | dogs: heat cycle phases, observations and editing | `STAGING_DEPLOY_RUN.sql`, `app/dog-health/[id].tsx`, `app/dog-heat-new.tsx`, `app/dog-heat/[id].tsx` +60 |
| 2026-08-23 | `1.0.1` | tracking: track completion and evaluation fixes | `app/track/[id].tsx`, `features/tracking/hooks/useTrackEndGuidance.ts`, `features/tracking/services/trackHistoryService.ts`, `features/tracking/services/trackService.ts` +2 |
| 2026-08-22 | `1.0.1` | tracking: recall and GPS geometry hotfix | `features/tracking/hooks/useTrackRecorder.ts`, `features/tracking/utils/angleDiagnostics.ts` |
| 2026-08-22 | `1.0.1` | fix(prod): restore production supabase after tracking ota | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx`, `features/auth/recovery.ts` +5 |
| 2026-08-21 | `1.0.1` | fix(prod): restore production supabase after tracking ota | `app/auth/recovery.tsx`, `app/membership.tsx`, `app/premium.tsx`, `features/auth/recovery.ts` +5 |
| 2026-08-02 | `1.0.1` | Build 38 manual search start and picker display fixes | `app/track/legen.tsx`, `app/track/run.tsx`, `features/tracking/engine/startApproach.ts`, `features/tracking/hooks/useStartPointApproach.ts` +2 |
| 2026-08-02 | `1.0.1` | Build 38 tracking, forms and Google sign-in fixes | `app/dog-health/[id].tsx`, `app/dog-heat/[id].tsx`, `app/track/legen.tsx`, `app/track/run.tsx` +1 |

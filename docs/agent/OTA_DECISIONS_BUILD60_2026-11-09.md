# Entscheidungsliste OTA-Abdeckung Build 60 – 2026-11-09

Grundlage: `OTA_COVERAGE_BUILD60_2026-11-09.md` (70 offene iOS-OTAs gegen die neueste Build-60-OTA). OTAs mit gleicher Nachricht auf mehreren Runtimes sind zusammengefasst → **65 Entscheidungen**. Die Einordnung ist automatisch (Dateipfade, Datei vorhanden ja/nein) und eine **Empfehlung, keine Entscheidung**. Nichts wurde ausgenommen oder nachgezogen.

**So entscheiden:** je Zeile *nachziehen* (als Paket für Build 60 beauftragen) oder *ausnehmen* (Eintrag in `docs/agent/ota-coverage-exceptions.json` mit Begründung, `decidedBy`, Datum; Gruppen-IDs stehen in der Zeile). Bei Abschnitt 5 reicht ein Eintrag je Runtime (`runtimeVersion`).

| Abschnitt | Anzahl |
|---|---|
| 1. Wahrscheinlich in Build 60 fehlend | 11 |
| 2. Prüfen – Dateien vorhanden, Änderung nicht erkennbar | 19 |
| 3. Empfehlung ausnehmen – alte Fährten-/GPS-Logik | 8 |
| 4. Empfehlung ausnehmen – Diagnose/Entwicklerwerkzeuge | 6 |
| 5. Empfehlung ausnehmen – alte Runtimes 1.0.1–1.0.4 (Aug–Okt) | 21 |

## 1. Wahrscheinlich in Build 60 fehlend (11)

Mindestens eine Datei dieser OTA gibt es in Build 60 gar nicht. Hier ist am ehesten etwas verloren gegangen.

| Datum | Runtime(s) | OTA | in Build 60 nicht vorhandene Dateien | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-10-18 | `1.0.5-motion-v2` | Build52: new sharing and groups hub, first steps and contextual help; native motion, R2 tracking and support r | `app/track/sharing.tsx`, `features/help/helpLayout.ts`, `features/tracking-sharing/SharingScreen.tsx` +6 | `e04317fd` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5-motion-v4` | GPS-Start abgesichert; Trainingsvorlagen und sichtbares Bearbeiten; bestehende Funktionen erhalten | `components/training/TrainingTemplateButton.tsx`, `features/tracking/utils/startFixFreshness.ts`, `features/training/documentation/historyDate.ts` +1 | `faceddf5` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5-motion-v4` | Trainingshistorie vor Übernahme frisch prüfen; verspätete Antworten sicher verwerfen | `services/trainingContext.ts` | `dcf2b737` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-24 | `1.0.5-motion-v4` | Neue Fährtenoberfläche und App-Ton; geprüftes Tracking und LiveShare erhalten | `assets/images/tracking-field-hero.jpg`, `features/tracking-sharing/SharingScreen.tsx`, `features/tracking-sharing/SharingView.tsx` +1 | `78ac55df` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-24 | `1.0.5-motion-v4` | Legen: separate gelb gestrichelte Planlinie; Tracking und LiveShare erhalten | `features/tracking-planner/LayPlanControl.tsx`, `features/tracking-planner/useLayPlan.ts` | `2e8615b1` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-motion-v4` | Fährte: klare Pause und erweiterte Diagnose; Läufigkeitsprognose und Kalender; LiveShare erhalten | `features/tracking/utils/qaPipelineDiagnostics.ts` | `68c115e3` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-motion-v4` | Fährtenansicht: sichere Planauswahl und vollständig sichtbarer Diagnosestatus; Tracking und LiveShare erhalten | `features/tracking-planner/LayPlanControl.tsx` | `a9c12517` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.4`, `1.0.5-motion-v4` | Fährtenkarte: klare Übersicht, Kartentypwechsel und kompakte Richtungsmarker | `features/tracking/components/TrackMapSummary.tsx` | `810575b5`, `8fcb0b4f` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-motion-v4` | Fährtenkarte: Standard, Satellit und Hybrid auswählbar | `features/tracking/components/MapLayerButton.tsx` | `c898c1ad` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-motion-v4` | Fährtenstart: Vorschau und Genauigkeit, Schweizer Karte mit sichtbarem Schließen | `features/tracking/components/SwissMapTest.tsx`, `features/tracking/components/WarmupMapPreview.tsx` | `8053504c` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-motion-v4` | App-Start: Startlogo nach erstem Root-Layout ohne Tippen ausblenden | `hooks/useDismissStartupSplash.ts` | `8d8919bb` | ☐ nachziehen ☐ ausnehmen |

## 2. Prüfen – Dateien vorhanden, Änderung nicht erkennbar (19)

Die Dateien existieren, aber die Änderung dieser OTA ist nicht auffindbar. Entweder fehlt sie oder sie wurde später anders umgesetzt.

| Datum | Runtime(s) | OTA | in Build 60 nicht vorhandene Dateien | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-10-15 | `1.0.5` | Training documentation: atomic saves, exercise history and private follow-up focus | – | `68f5bfac` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-15 | `1.0.5` | Group tracking tasks: explicit invitations, accepted reference, reviewed return and revocation | – | `d2dbeccc` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-15 | `1.0.5` | Subscription account safety: verified server purchase and restore, protected account changes | – | `babff0e7` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-18 | `1.0.5-motion-v2` | Appointment editing and keyboard forms; saved angles and object labels; transparent logo; dog training documen | – | `9275eeab` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-18 | `1.0.5`, `1.0.5-motion-v2` | Calendar editing and keyboard forms, saved angles, transparent logo and dog training documentation; field R2 d | – | `db69a8c7`, `88b84a59` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-20 | `1.0.5-motion-v3` | Journal and preparation: focus/resume refresh, complete note display, explicit history and legacy source suppo | – | `0b336b13` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-21 | `1.0.5-motion-v3` | Exercise choices: one picker, existing variant identity preserved, explicit rename; all previous production fu | – | `23dcdc9b` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-21 | `1.0.5-motion-v3` | Training journal: prepare, document observations, retain next-session reminders and separate dog drafts | – | `085e8b8f` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-22 | `1.0.5-motion-v4` | Fährtenauswertung: beide gespeicherten Spuren sichtbar; Tracking, Journal und Home erhalten | – | `358061e3` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5-motion-v4` | Gemeinsam trainieren: geprüfte zeitlich begrenzte Standortfreigabe mit sicherem Widerruf | – | `374a28f9` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-24 | `1.0.5-motion-v4` | Fährten: Trainingsfoto entfernt; Aktionen direkt erreichbar, Tracking und LiveShare erhalten | – | `4c55a132` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-24 | `1.0.5-motion-v4` | Training: kompakter Hub und Apportierholz-Icon; Tracking und LiveShare erhalten | – | `b00124eb` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-24 | `1.0.5-motion-v4` | Läufigkeit: Übersicht, Verlauf und tägliche Beobachtungen; bestehende Daten und Tracking erhalten | – | `62f4bbd0` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-motion-v4` | Fährte legen: klare Vorbereitung und verständlicher GPS-Status; Planauswahl, Tracking und LiveShare erhalten | – | `4e6abe7b` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-motion-v4` | fix(tracking): improve saved track comparison line clarity for iOS 55 | – | `1f5aad54` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-motion-v4` | Fährtenkarte: durchgezogene Spuren, kompakte Marker und keine Maßstäbe | – | `062abf85` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-29 | `1.0.5`, `1.0.5-motion-v2` | Trainingserfassung: Tastatur und Scrollende erreichbar; Daten, Tracking und LiveShare erhalten | – | `ec80870a`, `76827060` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-29 | `1.0.5-motion-v4` | Hundedashboard: Hinweise und Termine direkt öffnen; eigene Termine explizit abschließen oder absagen | – | `87dd058e` | ☐ nachziehen ☐ ausnehmen |
| 2026-11-04 | `sdk58-customer-ios-v1` | fix(ui): keep training unit cards opaque on iOS 59 | – | `574f82ad` | ☑ nachgezogen am 2026-11-10: Port `1c379884` in Build-60-OTA `b70e294d` (Release-Karte #44); Ausnahme zurückgenommen |

## 3. Empfehlung ausnehmen – alte Fährten-/GPS-Logik (8)

Überwiegend Tracking-Engine/Recorder alter Runtimes. Laut Schutzregel ersetzt die Build-58-Fährtenbasis diese Stände; sie werden nicht automatisch nachgeholt.

| Datum | Runtime(s) | OTA | in Build 60 nicht vorhandene Dateien | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-08-23 | `1.0.1` | tracking: track completion and evaluation fixes | – | `2a01a93a` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | tracking: trajectory turn engine | `features/tracking/trajectory/trajectoryTurnEngine.ts` | `44e81e0c` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-20 | `1.0.5`, `1.0.5-motion-v2` | Joker and rubber materials: scoring-safe objects, stable recovery, guidance and transfer contracts; existing p | – | `24c826dd`, `9925c3cf` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5-motion-v4` | GPS-Schutz: verworfene Fixes beeinflussen akzeptierte Messungen nicht; LiveShare bleibt erhalten | – | `f28a7944` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-23 | `1.0.5-motion-v4` | Fährten: geprüfte kurze Winkelpaare und weniger unnötige Langspur-Prüfungen; LiveShare bleibt erhalten | – | `2408f10f` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-26 | `1.0.5-motion-v4` | Fährten: lokal bestätigte Spitzwinkel, begrenzte Zusatzprüfung und konsistente Diagnose | `features/tracking/utils/localDirectionConfirmation.ts` | `7c054caf` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-motion-v4` | Fährtenaufnahme: verspätete Marker nach Stop und Abschluss abweisen | – | `b63be15e` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-29 | `1.0.5-motion-v4` | Fährtenansicht: Gegenstände und beide Spuren; begrenzte persönliche Bewegungsdiagnose | `features/tracking/utils/cornerWindowAudit.ts` | `20a40a68` | ☐ nachziehen ☐ ausnehmen |

## 4. Empfehlung ausnehmen – Diagnose/Entwicklerwerkzeuge (6)

Diagnose- und Testansichten für Feldtests. Für Kunden nicht nötig; bei Bedarf separat neu beauftragen.

| Datum | Runtime(s) | OTA | in Build 60 nicht vorhandene Dateien | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-08-22 | `1.0.1` | tracking: recall and GPS geometry hotfix | – | `06180554` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-17 | `1.0.5-motion-v2` | Tracking support: record actual end events and distinguish incomplete observations | – | `301e4fe5` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-18 | `1.0.5-motion-v2` | Tracking diagnosis: clarify standard GPS mode and simplify comparison settings | – | `7ac19f4c` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-28 | `1.0.5-motion-v4` | Fährten-Diagnose: Messabstände und separate Schweizer Kartenvorschau | `features/tracking/components/SwissMapTest.tsx`, `features/tracking/utils/positionTimingDiagnostics.ts` | `56c8f685` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-29 | `1.0.5-motion-v4` | Satellitendiagnose: klare iOS-Verfügbarkeit; Tracking, LiveShare und Abo-Wiederherstellung erhalten | `features/tracking/utils/gnssConstellations.ts` | `ba355515` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-29 | `1.0.5-motion-v4` | Fährtendiagnose: persönlichen Zugriff nach Verbindungsfehler zuverlässig erneut prüfen | – | `838e8cc5` | ☐ nachziehen ☐ ausnehmen |

## 5. Empfehlung ausnehmen – alte Runtimes 1.0.1–1.0.4 (Aug–Okt) (21)

Frühe OTAs, deren Code seither mehrfach überarbeitet wurde. Vorschlag: nach Stichprobe gesammelt pro Runtime ausnehmen.

| Datum | Runtime(s) | OTA | in Build 60 nicht vorhandene Dateien | Gruppen | Entscheidung |
|---|---|---|---|---|---|
| 2026-08-02 | `1.0.1` | Build 38 tracking, forms and Google sign-in fixes | – | `8abde02c` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-02 | `1.0.1` | Build 38 manual search start and picker display fixes | – | `ed746533` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-21 | `1.0.1` | fix(prod): restore production supabase after tracking ota | `features/auth/recovery.ts`, `lib/diagnostics.ts` | `04e15f7d`, `687107bf` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-25 | `1.0.1` | dogs: heat cycle phases, observations and editing | `STAGING_DEPLOY_RUN.sql`, `legal-web/assets/auth-confirm.js`, `legal-web/auth/confirmed.html` +5 | `15886d6b` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | tracking: interactive logbook map | – | `34bfa1a9` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | feat(dogs): add heat cycle calendar and phase timeline | `STAGING_DEPLOY_RUN.sql`, `legal-web/assets/auth-confirm.js`, `legal-web/auth/confirmed.html` +5 | `85ac64f1` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | feat(tracking): fullscreen saved track map | – | `5c826802` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): keep fullscreen control above native map | `features/auth/recovery.ts`, `lib/diagnostics.ts` | `b77d2aaf` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | feat(i18n): add French Italian and English localization | `features/auth/recovery.ts`, `lib/diagnostics.ts` | `cf0fa71a` | ☐ nachziehen ☐ ausnehmen |
| 2026-08-27 | `1.0.1` | fix(tracking): correct fullscreen safe area | – | `f5d5e792` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Kommando-Karten: Long-Press- und Swipe-Aktionen | `STAGING_DEPLOY_RUN.sql`, `features/auth/recovery.ts`, `legal-web/assets/auth-confirm.js` +7 | `e2e54646` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Dokumenten-CTA ohne Plus-Icon | – | `eedd1bef` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Dokumenten-CTA mit besserem Abstand | – | `01febd77` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-04 | `1.0.1` | Button-Textabstand verbessert | – | `54abc413` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-07 | `1.0.1` | feat(dog): add document training action to dog detail (d9b5a87) | – | `15f9dcef` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-11 | `1.0.2` | Diagnostics only: trainer connect runtime (7fe9eb8) | – | `b1773fd2` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-16 | `1.0.2` | feat(track): analytics v3, object context and final-corner fix | – | `f2b3c185` | ☐ nachziehen ☐ ausnehmen |
| 2026-09-30 | `1.0.3` | feat(updates): add customer update experience | – | `9bd0fd96` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-04 | `1.0.3` | feat(tracking): add customer track diagnosis and sharing | – | `fce1c140` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-08 | `1.0.3` | fix: medication calendar dates and sync single flight | – | `0218a4a4` | ☐ nachziehen ☐ ausnehmen |
| 2026-10-09 | `1.0.3` | Heat history dismissal and HelpSheet scrolling | – | `ca90fbc0` | ☐ nachziehen ☐ ausnehmen |

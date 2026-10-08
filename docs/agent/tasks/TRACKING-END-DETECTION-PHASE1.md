# TRACKING-END — Phase 1: Enderkennung / finaler Gegenstand

| Feld | Wert |
|---|---|
| Task-Zuordnung | `TRACKING-END`, Chat `02 – TRACKING – GPS / Fährten / Analyse`; keine neue T-ID reserviert |
| Ziel | Belegte Fehler im bestehenden Ende-/Gegenstandspfad korrigieren, gemeinsame Regeln erhalten |
| Datum | 2026-10-07, Europe/Zurich |
| Worktree | `/Users/moyo/canisflow-worktrees/anyvo-fix-tracking-end-detection` |
| Branch | `fix/tracking-end-detection` |
| Basis und finaler HEAD | `41e51734053fbc9c04c5de527edd6bf464cce66e` (unverändert; lokale Änderungen) |
| Verantwortlicher Agent | Codex, Primary Agent; keine parallelen Subagents |
| Status | Lokal implementiert; Verifikation siehe unten; Geräteabnahme OPEN |
| Review-Status | NONE — unabhängiges Review ausstehend |
| Commit(s) | Keine |

## Preflight und Ownership

Geltende AGENTS.md sowie CURRENT_STATE, SESSION_HANDOFF, TASKS, DECISIONS, ANYVO_MASTER_STATUS, Agent-README und WORKTREES gelesen. Root, registrierten Worktree, Branch, HEAD, Status und gemeinsame Basis geprüft. Ziel-Worktree war sauber; keine fremden Änderungen und kein anderer Writer festgestellt. Der vorhandene Arbeitsplatz wurde verwendet, nicht neu angelegt. `agent:status` und tatsächliches Git mit dem älteren Handoff abgeglichen; dessen Branch-/Integrationsabschnitte sind teilweise historische Snapshots.

Background-Lay `fd0c727`, Accuracy-aware Search `6b103c1` und Maßstab `f74ec87` sind bereits Vorfahren der Basis. Keine erneute Implementierung. Ledger nennt T-64 als nächste ID, ordnet diesen Task aber keiner T-ID zu. Deshalb eigener Bericht unter dem bestehenden Arbeitsplatznamen, ohne globalen Ledger zu ändern oder T-64 blind zu beanspruchen.

ACTIVE_WORK.md und PLATFORM_STATUS.md fehlten im Feature-Snapshot. Während dieser Arbeit wurden die inzwischen vorhandenen Dateien im kanonischen main **nur gelesen**; dortiger HEAD wurde `cd8cd8274300350ea309fb2634add79d5bb5509d` (Dokumentationsfortschritt). ACTIVE_WORK bestätigt diese Worktree-/Branch-Zuordnung. Der Platform-Bericht dokumentiert selbst seinen vorherigen Git-Snapshot. Keine Dateien aus main übernommen oder überschrieben. Feature-Basis unverändert.

Expo: package.json/package-lock deklarieren SDK 54; vorhandene main-Dependencies Expo 54.0.36, expo-location 19.0.8. Vor Produktänderungen die offiziellen [SDK-54-Dokumentation](https://docs.expo.dev/versions/v54.0.0/) und [Location-API](https://docs.expo.dev/versions/v54.0.0/sdk/location/) gelesen. Keine Installation, Versionsänderung oder native Konfigurationsänderung.

## Scope / Tabu

Nur bestehende Endbestätigung, letzter Gegenstand, lokale Timer-/Queue-Lifecycle-Isolation und deren Tests. Enderkennung meldet das Ende; das Beenden und Speichern bleiben Nutzeraktionen. Keine zweite Engine, keine neuen Datenfelder oder Schwellen. GPS-Zulassung, Fusion, Stationary-/Corner-Parameter, Search-Projektion, Hundemodell, Accuracy-aware Score, Background-Ownership, Unmount-/Process-death-Recovery, Replay/Distanz, Multi-Dog-Darstellung, Bedienung, Backend, RLS und Release-Konfiguration bleiben unverändert. `sources/` read-only.

Globale Agent-Dateien, main, andere Tasks und vorhandene fremde ACTIVE_WORK.md nicht verändert. Dieser Bericht ersetzt den taskbezogenen Handoff; SESSION_HANDOFF/TASKS/CURRENT_STATE/WORK_LOG bleiben gemäß Worktree-Regel der späteren Integration vorbehalten.

## Rekonstruierter Aufruf- und Datenfluss

1. `precisionLocationClient` liefert native oder Expo-Fallback-Fixes an den einmal abonnierten Search-Recorder. `evaluateSearchFix` prüft vorhandene Accuracy-/Geschwindigkeitsregeln. Die Position für Anzeige/Annäherung ist von der geometrisch zugelassenen Spur zu unterscheiden.
2. Fusion klassifiziert den Fix. Die Spur unterdrückt unter anderem Stillstand/Ausreißer nach vorhandenen Regeln; `admitsEndHandlerFix` lässt belastbare **echte Handler-Fixes einschließlich stationary** zu und verwirft `gps_outlier`, `low_confidence`, `stale_fix` im aktuellen Fusion-Pfad. Historischer build40-Pfad unverändert. Separate End-EMA kann bei Stillstand zum realen Ziel konvergieren; keine Hundeschätzung als Endbeweis.
3. End-Fix und Dwell werden vor dem geometrischen MIN_SEGMENT-Return verarbeitet. Cursor-/Schenkel-Fortschritt, Distanz und Score bleiben in der vorhandenen Projektion. Virtueller Hund liegt mit dem bestehenden 1/5/10-m-Leinenoffset auf der Referenz; er bestätigt das Ende nicht.
4. Dwell verlangt die vorhandenen 6 s, niedrige Geschwindigkeit, begrenzten Drift, Referenznähe, ausreichende Accuracy und zulässige Fixabstände. Gefunden nur durch diese Evidenz oder bewusste manuelle Aktion. Frühere überlaufene Gegenstände werden nach bestehender Fortschrittsmarge `missed`; der letzte bleibt bis zur Endbestätigung `pending`. `user_removed` bleibt entfernt.
5. Screen `run.tsx` übergibt die echte zugelassene Endposition, Handler-Fortschritt, Schenkel-Flag, Wartephase und den letzten noch offenen Gegenstand innerhalb der vorhandenen 3 m um das Ende. Guidance ist erst bei aktiver, START_LOCKED-Suche aktiv. Pause und Session-/Run-ID werden jetzt explizit weitergereicht.
6. Zentraler `trackEndBlocker`: Referenz > 1 m, aktive Suche, keine Gegenstandswartephase/Grace, letzter Schenkel oder Handler-Fortschritt ≥ 90 %, echte Handler-Enddistanz im accuracyabhängigen Radius 1.5–3 m, beobachtete Annäherung und mindestens zwei verschiedene Innen-Fixes über mindestens 800 ms. Offene frühere Gegenstände blockieren bewusst nicht. Alle Parameter unverändert.
7. Vorhandene 1200-ms-Grace gewährt dem letzten Gegenstand Zeit. Aktive Dwell bleibt auch darüber hinaus ein Blocker. Der Hook prüft bei Timerablauf dieselbe Evidenz erneut; Timer erzeugt keinen Fix. Für verspätete Timer/UI-Neuauswertungen gilt ausschließlich die vorhandene Fusion-Frischegrenze (5000 ms), keine neue Gap-Regel.
8. `stepTrackEnd` wechselt einmal auf reached/completed. Einmalige Haptik, Voice mit bestehender Priorität 10 und `onFired`: Store `noteSearchEndFired`, Recorder `confirmEnd`. Pending wird missed, nicht found. `recording` bleibt true. Voice-Queue prüft die aktuelle Situation bei Ausgabe erneut; alter Run, Unmount oder Pause invalidieren den Auftrag. Vorhandene Gegenstands-/Voice-Prioritäten unverändert; reale Audio-Reihenfolge ist Geräte-QA.
9. Store hält hundebezogenen SearchRunState mit gefundenen/automatischen/entfernten IDs, endFired und Fortschritt. Recovery rekonstruiert bekannte Status; bei endFired bleiben offene Gegenstände nun missed. End-Historie/Grace sind Runtime-Zustand, werden nicht neu persistiert. AsyncStorage schreibt best-effort sofort bei Ereignissen bzw. gedrosselt bei Fortschritt; SQLite-Punktpuffer verwendet bestehende Batch-/Retry-Pfade.
10. Manuelles `handleFinish`: synchroner Doppelklick-Guard → Recorder stop/Flush → bestehende Analytics → lokales `finalizeLocalTrackRun` (payload_json.run, Lay-Payload erhalten) → erst nach lokalem Erfolg Store/Registry-Aufräumen und Navigation → bestehende Sync-Queue. Lokaler Fehler hält Recovery offen. Kein neuer Auto-Finalize-Call. Separater Recovery-Kurzpfad `endSearch` hat weiterhin die dokumentierte Analytics-/Score-Lücke; keine Offline-Rekonstruktion erfunden.

Zusätzlich gelesen: guidanceEngine, autoDwell, referenceObjectStatus, searchGeometry/canonicalArc, searchFixQuality, trackFusionEngine, motionClient/native Precision, voiceEvents/Haptikservice, trackingStore/searchRunState, trackPersist/searchPersist/searchRecovery/trackRecovery, lokale Run-Payload/Repositories, Recovery-Service, Navigation und relevante Feld-/Hook-/Screen-Tests.

## Belegte Ursachen und minimale Korrekturen

Alle neuen Reproduktionen sind **synthetisch**; kein neuer Feldexport oder Geräte-PASS behauptet. Regressionen wurden vor Produktänderungen gegen den unveränderten Code ausgeführt. Historische F-61/F-102-Tests sind zusätzlich erhalten, aber kein neuer Feldtest.

| Fehler / Reproduktion vor Fix | Ursache | Korrektur / Regression |
|---|---|---|
| Annäherung → Innen-Fix 2000 → Außen-Fix 3000 → erneut verspäteter Fix 2000 baut den Innen-Streak neu auf | Nur Gleichheit mit unmittelbar letztem Zeitstempel ausgeschlossen | Monotonie `tMs <= lastFixMs` ignorieren; endFixConfirmation-Regression |
| Gefundener Gegenstand schreibt das Ende der Grace bei jeder Neuauswertung neu | Terminal-Guard erst nach Gegenstands-/Dwell-Zweigen | Terminaler Grace-Zustand unveränderlich; finalObjectEndGrace-Regression |
| Letzter Dwell ist bestätigt, activeObjectWait bleibt im selben Fix true; manuell gefunden ohne nächsten Fix bleibt ebenfalls blockiert | startedMs auch bei accepted als Wartephase gezählt; manuelles Finden leert Dwell nicht | Nur unbestätigte Dwell zählt; eigene Dwell bei manuell gefunden löschen, andere offene Dwell erhalten; realer Recorder + End-Hook getestet |
| Neuer Start übernimmt vorheriges Warte-Flag; confirmEnd erscheint erst beim nächsten Snapshot; Resume mit endFired setzt offene letzte Gegenstände wieder pending | Fehlender Reset/Snapshot und fehlende Ableitung aus bestehendem endFired | Wartephase beim Start leeren, confirmEnd veröffentlicht sofort, Resume nutzt bestehendes statusAtConfirmedEnd; Integrationstests |
| Grace läuft bei unveränderten Props ohne weiteren Fix nicht ab | Kein Timer/Hook-Wakeup; reine Helper-Tests verdecken den Fehler | Ein aufräumbarer Timer, erneute bestehende State-Machine-Auswertung; keine zusätzliche Fix-Evidenz; Hook-Regression ohne Prop-Update |
| Alte Voice kann nach Unmount/Runwechsel ausgegeben werden; identischer Endpunkt übernimmt Once-/Fixzustand; Pause wird vom Hook nicht berücksichtigt | Kein Mount-/Run-Guard und kein expliziter Run-Reset | Mount-/Generation-/Session-/Run-Validierung, runbezogener onceKey, Pause blockiert Evaluation/Ausgabe; echte Voice-Queue mit Speech-Mock |
| Neue Timerlösung könnte bei stark verspätetem JS-Wakeup oder beliebigem Screen-Rerender alte Evidenz freigeben | Frische war nur bei Fix-Zulassung geprüft | Regression während Umsetzung zuerst rot; vorhandene Fusion-Frischegrenze für Grace-Zeitfortschritt und Wakeup wiederverwendet |

Vor-Fix-Regressionen: beide Helper-Regressionen FAIL; Recorder-/End-Hook-Reproduktionen 10 FAIL / 2 PASS; Lifecycle-/Queue-Reproduktionen 8 FAIL / 12 PASS. Zusätzliche Queue-Kontrollen für aktive Dwell und Bewegung vom Ziel prüfen die erhaltene bestehende Revalidierung. Pause verbraucht keine zweite Endansage; eine bereits ungültig verworfene Voice wird nicht nachträglich neu erzeugt.

## Geänderte Dateien

- `app/track/run.tsx`: nur drei zusätzliche Hook-Eingaben, keine UI-Änderung.
- `features/tracking/hooks/useSearchRecorder.ts`: Dwell-Freigabe, Start-/Resume-Status, confirmEnd-Snapshot.
- `features/tracking/hooks/useTrackEndGuidance.ts`: bestehende Grace-Wakeup, Run-/Unmount-/Pause-Isolation und Queue-Validierung.
- `features/tracking/utils/endFixConfirmation.ts`: verspätete/duplizierte Zeitstempel.
- `features/tracking/utils/finalObjectEndGrace.ts`: terminaler Zustand.
- Bestehende Tests `endFixConfirmation.test.ts`, `finalObjectEndGrace.test.ts`, `app/track/__tests__/run-guidance-activation.test.ts` erweitert.
- Neue Hook-Tests `trackingEndFinalObject.test.tsx`, `useTrackEndGuidance.lifecycle.test.tsx`.
- Dieser Aufgabenbericht.

## Tests / Verifikation

Feature enthält keine node_modules. Paket-Lock ist identisch mit main; vorhandene Dependencies wurden **read-only** verwendet. Keine Installation/Symlinks/Repository-Konfigurationsänderung. Jest mit `NODE_PATH=/Users/moyo/canisflow-worktrees/anyvo-main/node_modules` und absolutem vorhandenen Jest-Binary, jeweils `--runInBand --watchman=false --silent`. TypeScript/ESLint nutzen temporäre Konfigurationen unter `/private/tmp`, die lediglich Expo-/Dependency-Auflösung auf diesen vorhandenen Bestand richten; produktive tsconfig/eslint.config bleiben unverändert.

| Prüfung | Tatsächliches Ergebnis |
|---|---|
| Unveränderte Baseline: trackEnd, endFixConfirmation, finalObjectEndGrace, useSearchRecorder.endFixAdmission | PASS: 4 Suites / 22 Tests |
| Unveränderte Baseline: Screen-, Guidance-/Recovery-/Store-/Voice-/Gegenstands- und echte historische Feldregressionen | PASS: 32 Suites / 281 Tests |
| Nach Fix: gezielte 7 Suites (beide neuen Hooks, beide Helper, trackEnd, EndFixAdmission, Screen-Aktivierung) | Erster Lauf PASS: 7 Suites / 62 Tests; abschließender Lauf nach Erweiterung der Queue-Kontrollen PASS: 7 Suites / 70 Tests |
| Erweiterte letzte Queue-Prüfung: useTrackEndGuidance.lifecycle | PASS: 1 Suite / 24 Tests (12 pro Platform-Mock) |
| Breiter Tracking-/Screen-Lauf: `jest features/tracking app/track ...` | Abgeschlossen (541.711 s): 208 Suites PASS / 1 FAIL; 2560 Tests PASS / 1 FAIL. Einziger Fehler: unveränderter Live-Activity-Test liest fehlende lokale node_modules-Datei; kein Produktfehler. Lauf vor letzter Erweiterung der Queue-Kontrollen |
| Gezielter Wiederholungslauf des einzigen breiten Fehlers: restingLiveActivityV2 | PASS: 1 Suite / 30 Tests. Feature-Test und Feature-Konfiguration explizit gewählt; cwd main nur für unveränderte relative Datei-Reads, vorhandene Dependency-Datei dort verfügbar. Git-Diff zwischen den beiden HEADs enthält ausschließlich die beiden Agent-Dokumente, also identische gelesene Produkt-/Native-Dateien |
| TypeScript: `tsc --noEmit --project /private/tmp/anyvo-tracking-end-typecheck.json` | PASS, Exit 0, keine TypeScript-Fehler; vollständige Repository-TS/TSX-Prüfung mit identischer Strict-/Expo-Basis und temporärer Dependency-Auflösung |
| ESLint: 10 geänderte Produkt-/Testdateien mit temporärer Resolver-Konfiguration | PASS, Exit 0: 0 Fehler / 3 vorhandene Warnungen in run.tsx (effectiveId-Abhängigkeit, ungenutzte Disable-Direktive, showRecoveryDialog-Abhängigkeit), außerhalb des geänderten Abschnitts |
| `git diff --check`, finaler Scope/Status/HEAD | PASS; nur 5 Produktdateien, 5 Testdateien und eigener Bericht geändert/neu. HEAD unverändert. Kanonischer main-Worktree bei Abschluss sauber, keine eigenen Änderungen dort |

Die Testzahlen überlappen; nicht zu einer Anzahl unabhängiger Tests addieren. Erster npx-Jest-Versuch scheiterte an fehlendem lokalen jest-expo. Erste TSC-/ESLint-Versuche scheiterten an der Dependency-Auflösung (unter anderem React-Deklarationen bzw. expo/tsconfig.base). Keine dieser Fehlversuche als PASS gezählt. Temporäre Auflösung korrigiert, ohne Produktcode wegen Umgebung anzupassen. Einige Shell-/Installationsversuche wurden von der Tool-Policy abgelehnt; kein Ausweichen in globale Installation. Keine vollständige App-Suite, weil Scope Tracking/Run ist.

Abschließender gezielter Befehl (aus Feature-Root): `NODE_PATH=/Users/moyo/canisflow-worktrees/anyvo-main/node_modules /Users/moyo/canisflow-worktrees/anyvo-main/node_modules/.bin/jest features/tracking/utils/__tests__/trackEnd.test.ts features/tracking/utils/__tests__/endFixConfirmation.test.ts features/tracking/utils/__tests__/finalObjectEndGrace.test.ts features/tracking/hooks/__tests__/useSearchRecorder.endFixAdmission.test.tsx features/tracking/hooks/__tests__/trackingEndFinalObject.test.tsx features/tracking/hooks/__tests__/useTrackEndGuidance.lifecycle.test.tsx app/track/__tests__/run-guidance-activation.test.ts --runInBand --watchman=false --silent`.

Live-Activity-Wiederholung (nur read-only, cwd main): vorhandenes Jest-Binary mit `--config /Users/moyo/canisflow-worktrees/anyvo-fix-tracking-end-detection/package.json --runTestsByPath /Users/moyo/canisflow-worktrees/anyvo-fix-tracking-end-detection/features/tracking/native/__tests__/restingLiveActivityV2.test.ts --runInBand --watchman=false --silent`, gleicher NODE_PATH. Kein gesamter grüner Wiederholungslauf behauptet: der breite ursprüngliche Lauf hatte den genannten Umgebungsfehler; ausschließlich diese Suite gezielt erneut geprüft.

## iOS / Android: Code, Native, Release und Geräte-QA

| Ebene | iOS | Android |
|---|---|---|
| Gemeinsamer Code | Identische TS-End-/Recorder-Hooks | Identische TS-End-/Recorder-Hooks |
| Automatisierte Plattform-Prüfung | `Platform.OS = ios`: Dwell, manuelles Finden, Recovery, Run-Isolation, Once/Haptik, Pause, Timer und Voice-Queue | Dieselben Szenarien mit `Platform.OS = android` |
| Native Eingangspfade | Precision Swift oder Expo-Fallback, Motion Swift vorhanden | Precision Kotlin oder Expo-Fallback; Motion-Modul hat keinen Android-Implementationspfad, vorhandener gps_only-Fallback |
| Native Änderung | Keine | Keine |
| Back/Lifecycle | Navigation/Unmount unverändert | usePreventRemove bleibt während recording aktiv; Endmeldung hebt diesen Guard nicht auf. Kein neuer Back-Handler |
| Geräteprüfung | OPEN: Endzustand/finaler Gegenstand, reale Haptik/Audio, App-Wechsel/Screen-off, Pause/Resume, Hund-/Sessionwechsel | OPEN: dieselben Fälle plus Hardware-Back und tatsächlicher nativer/Fallback-Sensorpfad |
| Release-Parität | Dokumentierte 1.0.4/Build49-Linie; live nicht neu abgefragt | Dokumentierte 1.0.3/Build44-Linie; live nicht neu abgefragt |

Platform-Mocks beweisen Hook-/Queue-Verhalten, nicht native Sensoren, OS-Timer-Suspendierung oder reale Audio-/Haptikausgabe. UI unverändert; keine neue Dark-Mode-/Touch-/Accessibility-Oberfläche zu prüfen. App-Wechsel benötigt Geräteprüfung, insbesondere verzögerte JS-Timer. Der synthetische Stale-Wakeup-Test ist kein Background-Abnahmetest.

Nur JS/TS verändert, keine neue native API oder Abhängigkeit: **für diese Korrekturen kein zusätzlicher Native-Build erforderlich**, sofern das Zielbinary die bereits benutzten Module/Runtime besitzt. Tatsächliche OTA-Zielkompatibilität **UNKLAR / separat frisch zu verifizieren**: Repo-Runtimeziel 1.0.4 gegenüber dokumentierter Android-Production 1.0.3; Native- und Release-Parität dürfen nicht aus gemeinsamen TS-Tests gefolgert werden. Keine Versions-/Buildnummer korrigiert, kein Bundle exportiert, kein EAS-/Store-Releasezugriff in dieser Aufgabe.

## Continuity — heutiger Zustand und offene Entscheidungen

Keine neue Gap-Schwelle oder Segmentsemantik implementiert. Folgende Tabelle beschreibt vorhandenen Code, keine Bewertung unbekannter Bewegung als tatsächlich gelaufen.

| Fall | Kartenlinie / Segmentierung heute | Distanz heute | Fortschritt / Score heute | Endbestätigung heute | Recovery heute | Offene Entscheidung |
|---|---|---|---|---|---|---|
| Kurze native Lieferpause | Search-Punkte bilden vorhandene Polyline; keine allgemeine automatische Gap-Segmentierung | Nur vorhandene zugelassene Geometrie; Verbindung aufeinanderfolgender Punkte kann eine unbekannte Bewegung überbrücken | Cursor/Score nur bei verarbeiteten Fixes; zwischen Lieferungen keine Messung | Historie bleibt Runtime; Grace-Timer nur mit bereits ausreichender, noch frischer Evidenz | Bestehende Puffer unverändert | Wann ist Verbindung zulässig, wie kennzeichnen, welche Beiträge zu Distanz/Score/Endbeweis? |
| Längere Aufzeichnungslücke | Keine neue Gap-Trennung; Roh-/Replay-Pfade behalten ihre jeweilige vorhandene Linie | Bestehende Segment-/Punktdistanz; keine belastbare Aussage zur unbekannten Bewegung | Monotoner Cursor bleibt; keine Rekonstruktion fehlender Samples | Alte Historie nicht durch neue Gap-Policy gelöscht; veralteter Grace-Wakeup allein löst nicht aus | Persistierte Punkte/RunState können fortgesetzt werden | Segmentierung, Distanz-Ausschluss, Fortschritts-/Score-Zeitfenster und vollständiger Evidenzreset zuerst festlegen |
| Pause / Resume | Pausierte Fixes werden nicht als Search-Geometrie verarbeitet; keine neue Search-Gap-Segmentierung | Keine Pausenpunkte; Anschluss nach Resume folgt bestehendem Geometriepfad | Zustand bleibt; keine neue Score- oder Dauer-Semantik | Während Pause weder Grace-Auslösung noch Voice; Historie/Once bleiben; Grace-Startzeit bleibt nach bestehender Regel erhalten | In-memory Resume; gespeicherter RunState unverändert | Pause als Segmentgrenze? Unbekannte Wegstrecke? Grace-Zeit einfrieren oder neu beginnen? |
| Screen-Unmount | Search-Positionsabo wird entfernt; vorhandene Punkte bleiben | Keine neuen Hook-Punkte | Runtime stoppt; keine neue Hintergrund-Ownership | Timer beendet, ausstehende alte End-Voice ungültig | Bestehende Store/SQLite-Recovery; Lay-Recorder-Unmount stoppt weiter seine Session | Abdeckung/Segment-/Evidenzregeln beim späteren Wiederaufnehmen; nicht hier ändern |
| Prozessneustart | Nur persistierte Punkte, keine erfundenen Zwischenpunkte | Recovery hat vorhandene Punktdistanz | Persistierter maxCursor/RunState; Recovery-Kurzabschluss hat bekannte Analytics-Lücke | endFired verhindert Wiederholung; transiente Fixhistorie/Grace neu; rekonstruierte offene Status missed bei endFired | Hundebezogener Pending-Slot + SQLite; in-memory Lay-Runtime deckt vollständigen Restart nicht automatisch ab | Segmentgrenze, fehlender Weg, Score-/Endbeweis und Persistenz-Erfolgsschwelle beschließen |
| Session-/Hundwechsel | Separate vorhandene Referenz/Run-Punkte; keine neue Overlay-/Farbregel | Vorhandene Sessionbindung | Neuer Start setzt vorhandene Runtime-/Runwerte; Hunde-Slots getrennt | Explizite Session-/Run-Identität löscht transiente Historie/Grace/Once; alte Voice ungültig | Bestehende Registry/Pending-Zuordnung | Übergreifende Persistenz-/Lieferreihenfolge separat auditieren, keine automatische Verbindung |
| Abgeschlossen / abgebrochen | Bestehende abgeschlossene Daten unverändert | Gespeicherte Werte unverändert | Bestehendes Ergebnis/Lifecycle; Suchversuch verwerfen ist von Fährte abbrechen getrennt | Endmeldung ≠ Abschluss; manuell finalisiert; neue Absuche eigenes Once | Bestehende completed/cancelled/completed_without_app-Regeln und bewusstes Wiederöffnen | Ob/wie weiterer Versuch segmentiert und bewertet wird, ohne historische Fährten umzuschreiben |

## Verbleibende Risiken / offene Punkte

- **Background-Abnahme Build49 OPEN:** bekannte iOS-OTA Runtime 1.0.4, Commit `fd0c727a4d252e531dc95ad9592040265cf12418`, Group `79175057-4da7-4314-bf7f-ae7f0ccd738b`, Update `01a115cd-3e88-7611-b4bd-8321716cba59`. Nicht frisch aus EAS gelesen. Installierte Geräte-ID und Screen-off-Diagnose nach genau dieser OTA fehlen. Ältere Owner-/Feld-PASS beweisen diese Abnahme nicht.
- Keine neue Continuity-Policy. Insbesondere Fixhistorie über längere Lücken, Grace-Zeit über Pause und unbekannte Wegverbindung bleiben Produktfragen; davon abhängige Änderungen ausgelassen. Ablehnung stale Fixes bleibt in den bestehenden Zulassungspfaden; kein neues globales Timeout für sämtliche End-/Voice-Pfade eingeführt.
- Persistenz schreibt Ereignisse best-effort; kein neues atomisches End-/Gegenstands-Transaktionsmodell. `flushSearchPoints` wartet im vorhandenen Pfad bei bereits laufendem Flush nicht auf dessen Abschluss; reset während einer fehlgeschlagenen laufenden Batch und die in-flight-Reihenfolge von Pending-Writes benötigen ein getrenntes Persistenz-Audit. Hier reine Codebeobachtung, keine neue reproduzierte Fehlerfreigabe und kein allgemeiner Persistenzfix.
- Recovery-Kurzabschluss `endSearch` nutzt weiterhin Null-/Leerwerte für Score/gefunden/Analytics und kann lokale Fehler best-effort behandeln; laufender regulärer Finish-Pfad hat den vorhandenen synchronen Race-Guard und lokale Erfolgsschwelle. Keine automatische Finalisierung hinzugefügt, kein Beleg für einen zusätzlichen End-Finalize-Race in den ausgeführten Tests.
- Reale Reihenfolge Gegenstandsvoice (Priorität 6) versus Endvoice (10), nativer Speech-onStart, Haptikpräferenzen und OS-Suspendierung bleiben Geräte-QA. Kein neuer Voice-Queue-Algorithmus.

## Vereinbarte Folgephasen — nur Roadmap

| Phase | Erhaltener Auftrag für später |
|---|---|
| A. Background Build49 | Installierte OTA-ID, Screen-off-Feldaufnahme, Persistenz und Resume per Diagnoseexport belegen |
| B. GPS-/Satellitenqualität | speedAccuracy und Richtungsgenauigkeit nativ bis interne Position erhalten; vorhandene Qualität für Warm-up/Startempfehlung, schwacher Empfang kein neuer harter Startblocker |
| C. Android GNSS | Satellitenstatus/Raw-GNSS und Verbraucher auditieren; empfangene versus verwendete Satelliten unterscheiden; zuerst Diagnose, keine neue Positionslösung/Filter ohne Feldbelege |
| D. Shelly Remote | Locked-screen-Machbarkeit iOS/Android prüfen; BTHome garantiert keinen Background-Empfang, Klickbelegung Entwurf; Dedup, eindeutige Session, ACK erst nach erfolgreicher Speicherung |
| E. Gemeinsame Event-Eingabe | Touch/Shelly/später Watch verwenden dieselben vorhandenen fachlichen Aktionen; Architektur erst prüfen, keinen TrackEventController voraussetzen |
| F. Externes GNSS / NMEA | Vorhandenen externen Positionspfad wiederverwenden, konkrete Geräte/Transporte prüfen; Rohdaten, Messqualität und Analyse trennen |
| G. Watch / Planer | Apple Watch/Wear OS später; Ebenen geplant/gelegt/gesucht, optional Satellitenkarte, Gelände, Wind und Schrittzahl |
| H. Analyseideen | DTW, Heatmap, Kreiselerkennung anhand echter ANYVO-Aufnahmen bewerten |
| I. Separate UI-Aufgaben | Marker-Kollisionen Winkel/Gegenstand/Ende und gewünschtes Swipe-to-stop getrennt bearbeiten |

Keine Folgephase begonnen; keine zusätzlichen Worktrees, Controller, Datenmodelle oder Produktfunktionen angelegt.

## Integrations-Notiz / MASTER-EINTRAG zum manuellen Übernehmen

Keine Integration in diesem Auftrag. Nach unabhängigem Review und eigener Freigabe T-ID mit dem Ledger abstimmen; erst der Integrations-Agent aktualisiert globale Status-/Handoff-Dateien. Plattformdateien anderer Aufgaben nicht überschreiben.

**Datum:** 2026-10-07. **Thema:** Tracking Phase 1 — Enderkennung / finaler Gegenstand. **Status:** lokal implementiert und geprüft, uncommitted; Geräte-QA OPEN. **Enthalten:** deterministische Freigabe bestätigter/manueller letzter Gegenstände, unmittelbarer missed-Snapshot/Recovery-Ableitung, monotone End-Fix-Identität, stabile Grace, vorhandene Timer-Neuauswertung, Run-/Pause-/Unmount-Voice-Isolation; gemeinsame JS/TS-Logik. **Tests:** gezielt 7/70 PASS; breit 208 Suites/2560 Tests PASS, ein Dependency-Dateifehler, betroffene Suite separat 1/30 PASS; TypeScript PASS, ESLint 0 Fehler/3 bestehende Warnungen, diff-check PASS. **Production betroffen:** nein, nichts veröffentlicht. **Offen:** unabhängiges Review, reale iOS-/Android-QA, Build49-Post-OTA-Abnahme, Continuity-/Persistenzentscheidungen, Runtime-/Native-/Release-Parität. **Nächster Schritt:** lokale Änderung reviewen und konkrete Geräteaufnahme mit Binary-/OTA-ID prüfen; Integration/Release separat beauftragen.

Kein Commit, Push, Merge, OTA, Build, Release oder DB-Eingriff. STOP nach Abschluss dieser Phase.

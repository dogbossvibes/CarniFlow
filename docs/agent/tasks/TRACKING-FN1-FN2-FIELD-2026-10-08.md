# FN1/FN2 – Feldauswertung vom 08.10.2026

Status: drei belegte Fehler lokal korrigiert und geprüft, uncommitted. Die anschließend vom Nutzer bestätigte Sollfolge belegt zusätzlich eine unzureichende Winkelerkennung (F4), noch nicht korrigiert. Keine Veröffentlichung oder vollständige Feldabnahme.

## Auftrag und Arbeitsstand

- Direkter Menschenauftrag im Werkstatt-Chat verifiziert: Turn `01a11d32-f69a-7b11-9138-667547bc76de`, Nachricht `01a11d33-19c8-7973-bbc6-3442c596598b`: zwei neue Fährten FN1/FN2 analysieren und Fehlerbehebung im zuständigen Chat anordnen.
- Verantwortlich für diesen Kandidaten: 02 Tracking. 03 hat Quellen-/Lifecycle-Fragen unabhängig lesend geprüft. 07 ist zu separaten UI-Punkten informiert. Integration/Release bleibt bei 01.
- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-tracking-fn1-fn2-field`.
- Branch: `fix/tracking-fn1-fn2-field`.
- Basis und HEAD: `28355badd869b1bf4f022c2c1c13a0c0b2636eca`, exakt der in beiden Aufnahmen protokollierte veröffentlichte Code. Vor der Bearbeitung sauber.
- Die zuvor übergebenen Continuity- und Android-P0-Kandidaten bleiben unverändert eingefroren. Dieser Bericht bescheinigt weder deren Integration noch deren Geräteabnahme.
- Keine Änderungen an main, globalen Statusdateien, Dependencies, nativen Projekten, Store-Konfiguration oder Datenbank. Keine Installation, kein Commit, Push, Merge, Build oder OTA.

## Originale, Identität und Zuordnungsgrenzen

Originale wurden nur gelesen. Die zwei QA-Exporte enthalten relative Geometrie und pseudonyme Kennungen; ihre exakten Bytes werden als Regressionseingaben unter `features/tracking/utils/__tests__/fixtures/field20261008/` aufbewahrt. Der vorhandene Privacy-Validator bestätigt das Fehlen absoluter Standortdaten. Die Testprojektion um den künstlichen Ursprung 0/0 ist keine Rekonstruktion des Aufnahmeorts.

| Kennung in diesem Bericht | Original im Downloads-Verzeichnis | SHA-256 | Sichtbare Distanz |
| --- | --- | --- | --- |
| A = FN1 (bestätigt) | `anyvo-track-qa-2026-10-08-2133-qa-9ca60ac3.json` | `7792fb56fc1a216680cda91bb78a6d11daf5673db6d3d8d85da1acf2723e6e8a` | 19 m |
| B = FN2 (bestätigt) | `anyvo-track-qa-2026-10-08-2138-qa-80049c56.json` | `aeea5644a5976c7b7673234fbe2c0b73be18dd9576f4182885eff663df53073a` | 34 m |

Zusätzlich vollständig als Bildmaterial geprüft: `IMG_5713.PNG` bis `IMG_5723.PNG`, einschließlich 5718. Video `ScreenRecording_10-08-2026 21-39-20_1.MP4`: Metadaten und gezielt extrahierte Frames des 137,67-s-Videos geprüft, insbesondere Suchstart, laufende Suche, manueller Stop bei etwa 64–65 s, Bewertung bei 67 s, Speichern bei 68 s, Übersicht und Diagnose. Der Audiotrack wurde nicht abgehört. Aus QA-Flags wird deshalb kein akustischer oder haptischer Geräte-PASS abgeleitet.

Beide Aufnahmen protokollieren für Legen und Suchen:

| Feld | Wert |
| --- | --- |
| Plattform / Binary | iOS 1.0.4, Build 49 |
| Runtime / Channel / Launch | `1.0.4` / `production` / `ota` |
| Update-ID | `01a11cb4-9c3e-7b21-aa6e-288745209c95` |
| Source-Commit | `28355badd869b1bf4f022c2c1c13a0c0b2636eca` |
| Auswahl | Engine `current`, Quelle `precision` |
| Native Module | Precision und Motion vorhanden |

**Nachtrag aus direkter Nutzerantwort: Uhrzeiten und Sollfolgen sind bestätigt.** FN1: rechts → links → Ende. FN2: spitz rechts → spitz links → rechts → links → Ende. Der Nutzer bestätigt, das Laufschema der Diagnoseseite tatsächlich gelaufen zu sein. Das stimmt mit den Winkelfolgen in `fieldTestProfiles.ts` überein. Die Dateien selbst enthalten keine FN-Namen und im Video ist kein Feldprofil ausgewählt; die Zuordnung beruht jetzt ausdrücklich auf der menschlichen Bestätigung. Exakte Scheitelzeitpunkte/-koordinaten oder Gradmessungen wurden damit nicht geliefert. Frühere gleich benannte Fixtures bleiben andere Läufe.

Zeitdarstellung: Export-Dateinamen verwenden lokale Startzeit; Kandidatenlogs verwenden UTC. Am 08.10.2026 entspricht `19:33:50 UTC` lokal `21:33:50 Europe/Zurich`; `19:38:38/46 UTC` entspricht `21:38:38/46`. JSON-Fix-, Voice- und Recorderzeiten haben teilweise verschiedene relative Nullpunkte. Ihre Zahlen dürfen nicht ohne Zeitbasisabgleich voneinander abgezogen werden.

## Prüfung des Datenflusses

Geprüft wurden JSON-Struktur und sämtliche Knoten programmatisch, anschließend die relevanten Streams, Diagnosen, Bilder und Zustandsübergänge gegen den tatsächlichen Code. Schema ist v2/minor10, erfasste Daten sind nicht als abgeschnitten gekennzeichnet. Die Analyse unterscheidet Rohfixes, zugelassene Fixes, Detektorpunkte, Zeichenlinie, gespeicherte Punkte und Search-Replay. Ein kleinerer Zeichensatz ist kein Beleg für verlorene Rohdaten.

Produktpfade:

1. `useTrackRecorder` startet den Lay-Stream und übergibt die Ownership nach erfolgreichem Hintergrundstart an den Expo-Task.
2. `backgroundLocationTask` → `laySessionRuntime` prüft Session und Startzeit; Verarbeitung und Persistenz sind getrennte Stufen.
3. `layProcessingSession`/`turnFusion` erzeugen die Detektor-/Liniengeometrie und Winkelmarker. Richtung kann belegt sein, während die Schärfe unbestimmt bleibt.
4. `useSearchRecorder` verwendet die gespeicherte Referenz, eigene Zulassung/Filterung, Fortschritt und Endbestätigung. Search-Run und dichteres Replay bleiben getrennt.
5. `buildTrackDetailMap` zeigt gespeicherte Lay-Geometrie sowie Search-Replay. `TrackingMap` rendert Fährte in Hundefarbe und Suchspur blau.
6. Die Übersichtsstatistik bezieht eine gespeicherte manuelle Bewertung; diese ist nicht identisch mit dem laufenden GPS-Score.

### Datenmengen und Distanzen

| Messgröße | A | B |
| --- | ---: | ---: |
| Lay-Aufnahmedauer laut Recorder | 40,945 s | 55,576 s |
| Zeitraum der gespeicherten Lay-Punkte | 26,000 s | 46,999 s |
| Rohfixes | 41 | 56 |
| Zugelassene Fixes laut QA-Stufe | 32 | 49 |
| Detektorpunkte | 20 | 35 |
| Linienpunkte / gespeicherte Punkte | 11 / 11 | 18 / 18 |
| Rohpfadlänge | 31,23 m | 48,61 m |
| Detektorpfadlänge | 18,86 m | 37,70 m |
| Zeichenlinienlänge laut QA | 19,24 m | 35,27 m |
| Kanonisch gespeicherte Distanz | 18,58 m | 33,61 m |
| Search-Run / Replay / Roh / Filter, Punkte | 10 / 14 / 24 / 22 | 14 / 23 / 33 / 32 |
| Search-Run / Replay, relative Pfadlänge | 17,57 / 21,32 m | 28,52 / 37,80 m |

Die sichtbaren 19/34 m passen zur gerundeten kanonischen Distanz. Rohpfadlängen enthalten GPS-Bewegung einschließlich Drift und dürfen nicht als tatsächlich gegangene Distanz ausgegeben werden. Kleine Unterschiede der hier aus gerundeten Relativkoordinaten nachgerechneten Längen sind kein Datenverlustnachweis. Die Unterschiede zwischen kanonischer Distanz und Zeichenlinie bleiben dokumentiert; keine Distanzformel wurde geändert.

Legen: Rohfixe in beiden Fällen ungefähr 1 Hz, keine größere Rohzeitlücke. Gespeicherte Linienpunkte liegen teilweise 6 s (A) bzw. 8 s (B) auseinander. Der Startanker teilt einen Zeitstempel mit einem Punkt. Suche: größte Rohfixabstände etwa 2 s, Run-Abstände dagegen 7/6 s. Das sind verschiedene Verarbeitungsstufen und kein belegter 7-/8-s-Recorderausfall. Ein unauffüllbarer Replay-Abstand in B (2,58 m / 1 s) belegt ebenfalls keinen längeren Ausfall. Keine neuen Lücken wurden nachträglich erfunden.

Start: UI-Lock nach ungefähr 1,635/0,852 s; Bewegungs-/Geometrie-Lock nach 9,870/7,143 s, gestützt durch etwa 3,745/4,045 m GPS-Verlagerung, zu diesem Zeitpunkt ohne Schrittdelta. Kein Fallback protokolliert. Das erklärt einen Teil des Unterschieds zwischen Aufnahmedauer und gespeichertem Punktzeitraum; ohne vermessenen tatsächlichen Startpunkt keine räumliche Genauigkeitsabnahme.

### Quellen, Berechtigungen und Hintergrund

| Ereignis | A | B |
| --- | ---: | ---: |
| Hintergrundstart erfolgreich | 64 ms | 85 ms |
| Vordergrundstream entfernt | 64 ms | 85 ms |
| Erste Quellenbeobachtung/Empfang | 96 ms | 91 ms |
| Task-Callbacks | 42 | 57 |
| Persistiert | 11 | 18 |
| Session-Mismatch-Zähler | 1 | 1 |
| Task-/Persist-/Flush-Fehler, fehlender Handler | jeweils 0 | jeweils 0 |

Tatsächlich beobachtete Lay-Quelle: `expo / expo-location-task / background`. Search-Quelle: `native / ios_core_location / foreground`. Das ist im veröffentlichten Code ein bewusster Ownership-Wechsel, kein Nachweis eines versehentlichen Precision-Ausfalls. `deliveryChannel=background` bezeichnet den Zustellkanal, nicht den App-Zustand.

Beide Aufnahmen protokollieren nur aktive App bzw. foreground; `background`, `inactive`, `resume` jeweils 0. Berechtigungen granted. Die Anzeige eines nach Stop inaktiven nativen Moduls als „Background erlaubt Nein“ belegt hier keinen Permissionfehler.

03 hat diese Bewertung unabhängig lesend bestätigt und die Diagnosegrenze präzisiert: `backgroundSessionMismatch` fasst mehrere Dropgründe zusammen. `fix_before_session_start` ist als Gate vorhanden, aber der konkrete Grund der beiden gezählten Drops fehlt im Export. Ein alter gecachter Fix ist plausibel, **nicht bestätigt**. Zudem erfasst `firstFix` über die UI-Bridge auch Empfang eines später verworfenen Fixes; 96/91 ms sind kein Nachweis des ersten persistierten Punkts. Folgeauftrag: Reasoncodes getrennt exportierbar machen, ohne Zulassungsgates zu lockern.

**Keine neue Locked-screen-, App-Wechsel-, Search-Background- oder Build49-Hintergrundabnahme.** Aus diesen Originalen ergibt sich kein belegter neuer Native-Fix-/Buildbedarf.

## Befunde und lokale Korrekturen

### F1 – 0 gelegte Gegenstände werden zu 3 Sollgegenständen (P1, lokal korrigiert)

Beide Fährten enthalten null gelegte Gegenstände. Das Video zeigt während B dennoch `0/3`. Ursache: `laidObjects.length || model.objects` in `useSearchRecorder` ersetzt die gültige Null durch den Regelwerks-Sollwert. Betroffen sind Anzeige, Rückgabewert und der Gegenstandsanteil des bestehenden Suchscores.

Änderung: Bei vorhandener gültiger Referenz ist deren tatsächliche Gegenstandszahl maßgeblich, einschließlich Null. Freie Suche ohne gültige Referenz behält den bisherigen Modell-Fallback. Nichtleere Referenzen behalten ihre tatsächliche Anzahl. Der schon vorhandene Null-Gegenstand-Zweig der Scoreberechnung wird damit erreichbar; es gibt keine neue Scoregewichtung.

Regressionen prüfen bekannte Referenz mit 0 bis durch `stop()`, freie Suche ohne Referenz mit unverändertem Modellziel 3 und eine Referenz mit 2 Gegenständen. Auf den unveränderten Produktdateien der gemessenen OTA schlägt der 0-Fall mit „Expected 0 / Received 3“ fehl; die beiden Kontrollfälle bestehen. Mit Korrektur bestehen alle drei.

### F2 – Unbestimmte Winkelschärfe wird als 90° bezeichnet (P2, lokal korrigiert)

A speichert einen Linkswinkel. B speichert links und rechts. Beim ersten Winkel in B lautet die fusionierte Evidenz: `kind=links`, `sharpness=unresolved`, `directionSource=motion_override_low_geometry`, geometrischer Innenwinkel 5,2°, Genauigkeit ungefähr 11,86 m bei kurzen Schenkeln von ungefähr 6,48/3,43 m, Motion-Drehung ungefähr +104,5°. Die Richtung ist damit separat entschieden; die geometrische Schärfe ist ausdrücklich unbestimmt.

`links/rechts` sind persistierte Richtungstypen und können diese unbestimmten Fälle enthalten. Die globale Badge-Zuordnung `links → 90 L`, `rechts → 90 R` erfindet daher eine numerische Aussage. Korrektur: `L/R` für diese generischen Richtungen, `SL/SR` für explizit als spitz klassifizierte Marker. Markerpositionen, Detektor, Fusion, Zulassung und Koordinaten bleiben unverändert. Die globale generische Kennzeichnung gilt auch für ältere Marker, deren Typ allein keine exakte Gradangabe garantiert.

Der neue Test verwendet B als echte Regressionseingabe und prüft den unbestimmten Fusionseintrag samt 5,2°-Wert, ehrliches Badge und unveränderte explizite Spitztypen. Auf dem ursprünglichen Labelcode schlägt er mit „Expected L / Received 90 L“ fehl.

Die Live-Kandidatenansicht und das finale Fusionsergebnis sind unterschiedliche Rechenstände: A etwa 76,1° live / 78,4° final, B rechts etwa 88,6° live / 98° final. Diese numerische Abweichung allein belegt keinen verletzten Snapshot-Vertrag. Die bestätigte vollständige Winkelfolge zeigt dagegen reale Auslassungen und fehlende Spitzklassifikation, siehe F4. Offen bleibt eine bessere Persistenz/Anzeige der Schärfe-Evidenz; der kleine Badge-Fix behauptet keine wiederhergestellte Winkelgenauigkeit.

### F3 – Zweiter Verlaufseintrag bekommt keine GPS-Vorschau (P2, lokal korrigiert)

Auf `IMG_5720` und im Video besitzt die ältere 19-m-Fährte einen GPS-Platzhalter, obwohl ihre 11 Punkte im Export und Detail vorhanden sind. Ursache: Die Übersicht lud ausschließlich die Geometrie der jüngsten Zeile und reichte nur ihr diese Punkte weiter.

Änderung: Die zwei sichtbaren Verlaufseinträge erhalten jeweils ihre eigene Vorschau. Die Hero-Ansicht verwendet weiterhin die neueste. Eigentümer-/Hund-Prüfung, Filterung und Generation-Guard gegen verspätete Ergebnisse bleiben erhalten. Pro Aktualisierung werden höchstens zwei Vorschauen geladen. Ein werfender Remote-Aufruf verhindert den bereits geprüften lokalen GPS-Fallback nicht mehr; Fehler einer Zeile verhindern die andere nicht.

Tests: getrennte Geometrien für beide Zeilen, keine Abfrage der dritten, lokaler Offline-Fallback, Eigentümer-/Hund-Isolation, tatsächliche Zuordnung im Screen und verspätete Antwort nach Hundwechsel. Bei vollständig fehlgeschlagenem Datenzugriff bleibt die bisherige neutrale Nichtverfügbarkeitsdarstellung; es gibt keine erfundene Ersatzlinie.

### F4 – Bestätigte Winkel fehlen in Detektor/Fusion (P1, reproduziert, Fix OPEN)

| Lauf | Vom Nutzer bestätigte Sollfolge | Gespeichert | Offline-Replay des unveränderten Detektors mit vorhandenen Motion-Samples | Feldabnahme |
| --- | --- | --- | --- | --- |
| FN1 | R → L | L | L | FAIL: erster Rechtswinkel fehlt |
| FN2 | SR → SL → R → L | L → R | L → R | FAIL: erster Spitzrechts- und letzter Linkswinkel fehlen; Spitzlinks-Schärfe unbestimmt |

Die Zuordnung der verbliebenen FN2-Marker zu zweitem/drittem Sollwinkel folgt Reihenfolge, relativer Weggeometrie und Motion-Richtung; genaue vermessene Scheitelpositionen fehlen. Eine globale Links/Rechts-Vertauschung ist hierdurch nicht belegt. Gegenstands-Sollzahlen aus alten Profiltexten wurden nicht automatisch in diese Aufnahmen übertragen.

Reproduktion: Original-Detektorpunkte ohne neue Glättung in eine künstliche lokale Projektion überführen, ihre exportierten `cumDistM` und relativen Zeitstempel behalten; überlappende vorhandene Motion-Kontexte anhand `evaluatedAtMs + dtMs` deduplizieren; produktives `fuseTurns` mit Trailing- und richtungsbezogenem Episode-Lookup ausführen. Erwartete Winkel dienen ausschließlich dem nachgelagerten Vergleich, niemals als Eingang der Fusion. Ergebnis exakt die beiden gespeicherten Folgen. Damit entsteht die Lücke vor Persistenz/Kartenanzeige.

Reproduktionsartefakte im Projektspiegel: `outputs/TRACKING-FN1-FN2-CORNER-AUDIT.cjs` und `.json` enthalten den tatsächlich ausgeführten read-only Probe-Code und dessen vollständige Ergebnisse einschließlich Fensterpaaren. Node-Aufruf aus diesem Worktree mit verfügbaren bestehenden TypeScript-Dependencies; der Probe transpiliert ausschließlich die geladenen lokalen TS-Module im Arbeitsspeicher und ändert keine Produktdatei. Die enthaltenen Vergleichspaare außerhalb aktueller Rescue-Grenzen sind Diagnose, keine implementierte Rettung.

Lokalisierte Gates:

- **FN1 erster Rechtswinkel:** Am Detektorpunkt 3 (ca. 12 s Rohzeitbasis) existiert ein stabiles Vorherfenster mit 2,08 m, aber kein Nachherfenster. Punkt 4 (ca. 16 s) besitzt ein stabiles Nachherfenster von 7,36 m, aber kein Vorherfenster. Zwischen beiden liegen 1,07 m; der Ein-Segment-Split-Apex-Pfad erlaubt höchstens 1,00 m. Das Paar 3→5 liegt mit 1,91 m zwar unter dem Zwei-Segment-Weglimit, verletzt aber die Monotonie (erster Übergang ca. −45,5° entgegen der Gesamtdrehung). Die getrennten Schenkel deuten auf etwa 80–83° Rechtsdrehung. Ein bloß auf 1,07 m zugeschnittener Grenzwert wäre noch kein allgemeingültiger Fix.
- **FN2 erster Spitzrechtswinkel:** Frühe Punkte 1–5 scheitern am Vorherfenster. Der Detektorpuffer beginnt erst etwa bei Rohzeit 7 s; vor der ersten Ecke verbleiben kurze und richtungsstreuende Belege. Rohfixes davor existieren, gehören jedoch zur Startbestätigung und sind bisher keine zugelassene Detektorgeometrie. Sie dürfen nicht ungeprüft als zusätzliche Wegstrecke oder Marker eingefügt werden. Start-Lock/Detektor-Anlauf und robustere Fensterbildung müssen gemeinsam geprüft werden.
- **FN2 Spitzlinkswinkel:** Ecke und Linksrichtung wurden bestätigt; Schärfe bleibt bei schwacher GPS-Geometrie und Beinahe-Umkehr ausdrücklich unbestimmt. Motion liefert Richtung, keine belastbare Spitzklassifikation. Nur ein Labelwechsel löst diese fachliche Abweichung nicht.
- **FN2 letzter Linkswinkel:** Vorherfenster bis Punkt 25 und Nachherfenster ab Punkt 28 sind stabil (5,85/7,04 m, Richtung ca. 78,0°/349,5°). Dazwischen liegen drei Segmente über 2,21 m mit überschießenden Richtungen; das passt nicht zum höchstens zwei Segmente umfassenden monotone-transition Rescue. Der Endexport enthält eine unabhängige Linksdrehung als IMU-only bei etwa 41,867 s, die mangels akzeptierter GPS-Ecke absichtlich nicht persistiert wurde. Ein End-/Persistenzfehler erklärt den fehlenden Winkel nicht.

**Diagnostiklücke:** `layProcessingSession.ts` exportiert Kandidaten-Motion nur nach erfolgreicher Richtungsgeometrie (`headingDeltaDeg != null`). Genau frühe `no_window_before/after`-Fälle fehlen dadurch. Die rekonstruierbaren Kontexte beginnen für FN1 erst bei 16,055 s (72 Samples), für FN2 bei 17,115 s (140 Samples); FN2 besitzt darin eine bis 4,25 s große Kontextlücke. Das sind Exportlücken, kein Beleg für ausgefallenen Core-Motion-Sensor. Der IMU-only-Eintrag zum letzten Winkel beweist zudem, dass im Gerät mehr Motion-Evidenz vorhanden war als im rekonstruierten Kandidatensamplebestand. Aus fehlenden Export-Samples darf keine fehlende reale Drehung geschlossen werden.

Nächster verbindlicher Arbeitsumfang für 02, mit Rückmeldung an 00/01:

1. QA-Motion auch für abgelehnte Geometriekandidaten zeitlich begrenzt und datensparsam sichern; Umfang/Trunkierung, relative Zeitbasis und Reset bei Sessionwechsel testen. Diagnose darf keine Marker erzeugen oder Tracking-Entscheidungen beeinflussen.
2. Anlaufverlust vor der ersten Ecke und verteilte GPS-Scheitelereignisse isoliert untersuchen. Eine mögliche Rettung muss reale Vorher-/Nachhergeometrie und passende unabhängige Bewegungsevidenz verlangen. Keine Sollprofil-Injektion, kein freies IMU-only-Marking, keine Koordinatenbegradigung.
3. Neue FN1/FN2-Sollfolgen als explizite Abnahmekriterien aufnehmen; vorhandene Feldläufe sowie Geradeaus/Handydrehen, Stillstand/Drift, Kurven, Zickzack, kurze Schenkel, fehlende Motion, widersprechende Richtung, Doppelerkennung und Stop-Tail als Gegenproben. Schärfe ehrlich unbestimmt lassen, wenn sie nicht belegt werden kann; dann Spitzabnahme weiter OPEN statt PASS.
4. Erst nach belegtem Nutzen ohne neue Falschpositive einen separaten Algorithmus-Patch übergeben. Diese Änderung nicht still in die drei geprüften F1–F3-Korrekturen mischen. Gerätewiederholung bleibt für einen Feld-PASS erforderlich; ein Sensordaten-Replay ist keine neue Geräteaufnahme.

Diese FN1/FN2-Aufnahmen erfüllen die gewünschte Winkelqualität noch nicht. Die erfolgreichen Softwaretests des vorliegenden kleinen Kandidaten dürfen nicht als bestandenes Laufprotokoll dargestellt werden.

## Weitere Einordnungen und offene Aufträge

| Thema | Beleg / Bewertung | Zuständigkeit und nächster Schritt |
| --- | --- | --- |
| Ende A | Genau ein Endevent bei 25,203 s Suchzeit; QA markiert Voice/Haptik ausgelöst. Finaler Handlerabstand 0,362 m bei Radius 1,599 m, 7 stabile Fixe bei 2 erforderlichen. Manueller Stop bei ca. 31,9 s. | 02: kein neuer belegter Fehler; akustische/haptische Geräteabnahme nicht behauptet. |
| Ende B | Kein Endevent. Letzter zugelassener Handlerabstand 1,748 m bei Radius 1,5 m, 0 stabile Kandidaten, `handler_distance`. Manuell bei 44,462 s beendet. | 02: vorhandene Endregel hat nicht bestätigt. Ohne weitere frische Fixe im Radius kein Beleg für hängende Enderkennung. Kein Threshold-Fix. |
| Zwei Linien | Hundefarbene gelegte Fährte und blaue Suchspur/Replay, keine doppelt gemalte Roh-/Filterlinie. | 07 informiert: Legende soll beide erklären, auch Vollbild prüfen; Geometrie unverändert lassen. Noch nicht implementiert. |
| 100 Punkte nach Stop | Video ca. 67 s zeigt ausdrücklich manuelle Bewertung 100/Vorzüglich, ca. 68 s wird gespeichert. `defaultLegs` belegt bei vorhandener Suchgeometrie volle Abschnittswerte vor; `legsFromSession` liefert diese, solange keine manuelle Bewertung existiert. Live-Score davor ca. 73. | 07 informiert: getrennte UX-Semantik „noch nicht manuell bewertet“ prüfen; gespeicherte Nutzerbewertungen nicht überschreiben. Noch nicht umgesetzt. Kein Beleg, dass GPS automatisch 100 errechnet. |
| 0 min im Verlauf | Feld ist `lying_time_minutes`, nicht Suchdauer. Video zeigt vor B nur 12 s Liegezeit. | Rundung auf 0 plausibel; Beschriftung als Liegezeit klarer machen. Kein Datenverlustnachweis. |
| Diagnose-Textüberlagerung | `IMG_5715`: lange Quellenlabels/„Kein Lege-Stream aktiv“ überlagern sich. | 07 informiert; noch nicht implementiert. Quellenwerte und Tracking-Logik nicht ändern. |
| Ein Start-Mismatch pro Aufnahme | Aggregierter Zähler ohne konkreten Reasoncode; cached fix unbewiesen. | 02/03: spätere eng begrenzte Diagnostikverbesserung; keine Lockerung der Sessionprüfung. |
| Quiron/Acker/0 m | Andere ausgewählte Hundedaten in 5719 bzw. kurz nach Save im Video. | Nicht als fehlerhafte FN1/FN2-Speicherung ausgeben. |
| FN-Namen / tatsächliche Winkel | Uhrzeiten und Folgen vom Nutzer ausdrücklich bestätigt. | F4: Detektorauslassungen reproduziert, Algorithmus-Fix und vollständige Feldabnahme OPEN. |

07 hat bestätigt, diese Punkte nicht parallel zu editieren: aktuell eigener anderer Menschenauftrag, Export-/Continuity-Adapter bereits separat an 01 übergeben. Die hier genannten UI-Punkte sind offene Folgearbeit, kein fertiger UI-Patch. Keine ungerechtfertigte Weitergabe an Backend/Sync; dafür wurde aus diesen Daten kein Fehler belegt.

## Prüfungen

- Reale Eingaben: beide Original-JSONs strukturell verarbeitet, 11 Screenshots gelesen, Video visuell über relevante Frames geprüft; Audio nicht abgehört.
- Erste Fixture-Testfassung verwendete den falschen Replay-Eingabepfad des Tests und wurde auf den produktiven Vertrag `track_data.run.replay_points` korrigiert. Dieser Testaufbaufehler ist kein Produktfehler.
- Gezielter Korrekturlauf: 6 Suites / 116 Tests PASS, keine Skips. Enthält Preview-Service, Search-Recovery, neue Feld-Fixtures, Angle-Types, Track-Event-Integrity und Search-Guidance-Pipeline.
- Negative Baseline-Orakel: exakt die zwei eigenen Produktdateien temporär mit HEAD-Inhalt geprüft und im `finally` bytegetreu zurückgestellt. Zwei erwartete Fehler (0→3, unbewiesenes 90 L), zwei Kontrollfälle PASS, zehn wegen Testnamenfilter nicht ausgeführt. Diese Zahlen nicht zu den positiven Tests addieren.
- Nach Nutzerbestätigung zusätzliches reales Detektor-Replay: FN1 nur L statt R/L, FN2 nur L/R statt SR/SL/R/L. **Zwei Feld-Sollvergleiche FAIL**, kein Release-/Geräte-PASS für die Winkelerkennung. Diese fachlichen Abnahmefehler sind getrennt von den unten genannten bestandenen Regressionstests ausgewiesen.
- Angrenzender Abschlusslauf: 8 weitere Suites / 42 Tests PASS (Übersicht einschließlich beider Zeilen/Hundwechsel, TrackSketch, Detail-Map, Sketch-Geometrie, manuelle Bewertung, History-Score, Search-Engine-Matrix und End-Fix-Zulassung). Keine Überschneidung mit den 6 Suites oben: zusammen 14 gezielte Suites / 158 Tests PASS. Kein vollständiger Repository-Testlauf behauptet.
- Vollständiges TypeScript: PASS. ESLint für alle geänderten TS-/TSX-Dateien: 0 Fehler, 8 vorhandene Warnungen an unveränderten Zeilen (Importstil im Pipeline-/Recovery-Test, überflüssige alte Disable-Direktive im Kartenbaustein). Neuer/angepasster Übersichtstest separat ohne Fehler/Warnungen. `git diff --check`: PASS.
- Vorhandene Dependencies ausschließlich über eigenen temporären Symlink lesend verwendet; keine Installation und keine fremde Dependency-Änderung.
- Tests sind synthetische und aufgezeichnete Eingaberegressionen. Kein behaupteter neuer iOS-/Android-Geräte-PASS.

## Übergabe und Freigabegrenzen

Der Kandidat besteht aus kleinen JS/TS-Änderungen und Tests. Keine neue native API oder Schemaänderung. Technische OTA-Eignung muss 01 auf der tatsächlichen Integrationsbasis und je Runtime frisch prüfen; ein Feldtest gegen Build49 beweist keine Android-Kompatibilität einer Veröffentlichung.

01 soll diesen separaten Patch erst nach Abschluss der hier dokumentierten Prüfungen übernehmen, mögliche Überschneidungen mit Continuity kontrolliert auflösen und relevante Tests auf dem integrierten Stand wiederholen. Keine Rücknahme der ehrlichen Gap-/Score-/Resume-Semantik des separat eingefrorenen Continuity-Kandidaten. Insbesondere `useSearchRecorder` und Vorschau-Service nicht durch eine ältere Vollversion ersetzen. Dieser Auftrag erteilt keinen zusätzlichen Release-, Build- oder Datenbankauftrag.

Dateiliste (14 Dateien):

- Produkt: `app/track/index.tsx`, `features/tracking/hooks/useSearchRecorder.ts`, `features/tracking/services/trackPreviewService.ts`, `features/tracking/utils/angleClassify.ts`; zusätzlich ausschließlich aktualisierte Badge-Kommentare in `features/tracking/components/TrackingMap.tsx`.
- Tests: `app/track/__tests__/overview-preview.test.tsx`, `features/tracking/__tests__/searchGuidancePipeline.test.ts`, `features/tracking/hooks/__tests__/useSearchRecorder.recovery.test.tsx`, `features/tracking/services/__tests__/trackPreviewService.test.ts`, `features/tracking/utils/__tests__/trackEventIntegrity.test.ts`, neu `features/tracking/utils/__tests__/field20261008.test.ts`.
- Neue Fixtures: `features/tracking/utils/__tests__/fixtures/field20261008/qa-9ca60ac3.json`, `features/tracking/utils/__tests__/fixtures/field20261008/qa-80049c56.json`.
- Dieser Bericht: `docs/agent/tasks/TRACKING-FN1-FN2-FIELD-2026-10-08.md`.

Übergabe-Artefakte im Projektspiegel unter `outputs/`: `TRACKING-FN1-FN2-FIELD-CANDIDATE.patch` und gleichnamige `.json`-Manifestdatei mit Basis, Patch-Hash und SHA-256 jedes enthaltenen Dateistands. Der erste Entwurf mit SHA-256 `fa06a017c7c4c085627eeacbd07dff925b407026bf44c7f3bb20fb11f6b7b417` wurde vor Übergabe nach Eingang der Nutzerbestätigung zurückgezogen und als `.withdrawn-ground-truth.patch` archiviert. Nur den erneuerten Kandidaten samt aktualisiertem Bericht verwenden. Patch gegen den eigenen Endstand rückwärts trocken prüfen; keine Änderungen im Integrations-Worktree automatisch anwenden.

Restliche Roadmap (Continuity-Integration, Gegenstandskorrekturen, GPS/Shelly-Geräteprüfung, Planer/Verleitungen, Watch/Wear und gemeinsames Training) wird durch diesen Feldbericht nicht als abgeschlossen markiert.

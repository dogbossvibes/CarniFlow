# Journal – alle Sparten / Aktualisierung (Chat 07, 2026-10-20)

## Auftrag und Quelle

Werkstattauftrag: Bei „Alle Sparten“ fehlen laut Nutzer Trainings, insbesondere Schutzdienst. Screenshot und Text wurden nur gelesen; keine Kundendaten in Testfixtures übernommen. Chat 07 ist alleiniger Writer. Der direkte Nutzerauftrag in der Werkstatt, fertige Änderungen auf GitHub zu committen und zu pushen, gilt für diese Fehlerkorrektur. Keine OTA, Builds oder DB-Schreibzugriffe.

Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-journal-all-disciplines`
Branch: `fix/journal-all-disciplines`
Basis: `49a578453a7bf6c7d8d5f41a88dc6c21f9d378fa` (kumulative iOS-52-Joker-Quelle einschließlich Hilfe/Sharing; keine Aussage über deren aktuelle Auslieferung). Der finale Commit ergibt sich aus Git; dieser Bericht wird mit dem Fix committed.

## Befund und Reproduktion

Der bestehende gemeinsame Feed liest abgeschlossene `training_units` mit Übungen, ältere `training_sessions` und GPS-Sessions. Normale Sessions werden unabhängig von ihrer Sparte übernommen. GPS-Sessions werden einmal als Fährte aufgenommen; aktive GPS-Sessions bleiben ausgeschlossen. Aufgelöste Fehler einer Quelle führen zu einem Queryfehler; vorhandene Querydaten bleiben bei einem fehlgeschlagenen Refresh erhalten.

`filterFeed` schließt bei leerem Spartenfilter keine Sparte aus. Das 25er-Fenster wird nach den Filtern angewendet; „Mehr laden“ erreicht ältere Trainings. Regressionen mit neuer Schutzdienst-Einheit, älterem Schutzdienst-Training und GPS-Fährten sowie Schutzdienst hinter 25 Fährten bestanden bereits vor dem Produktfix. Ein Schutzdienst-Chip im Screenshot belegt dessen Vorhandensein im geladenen Feed, aber weder das Datum des vermissten Trainings noch die Vollständigkeit der sichtbaren Karten.

**Belegter Aktualisierungsfehler:** Das Journal registrierte keinen Navigationsfokus-/Resume-Refresh. Die Stackroute kann gemountet bleiben; der gemeinsame QueryClient deaktiviert Window-Focus-Refetch und verweist ausdrücklich auf gezieltes Nachladen in RN-Screens. Bei Rückkehr zu dieser Route können zwischenzeitlich extern erstellte oder nach einem Fehler noch nicht geladene Trainings fehlen, bis manuell aktualisiert oder die Route neu gemountet wird. Auch der Klick auf „Alle Sparten“ filtert nur den alten Cache. Die neue Fokusregression scheiterte vor dem Produktfix (1 fehlgeschlagen, 11 bestanden).

**Grenze:** Dieser belegte Fehler ist eine mögliche Erklärung der Meldung. Dass er genau das im Screenshot vermisste Kundentraining erklärt, wurde nicht nachgewiesen. Kein Live-Kontozugriff, keine konkrete fehlende Eintrags-ID und keine native Sichtprüfung. Aus der Screenshotoberkante allein lässt sich ein echter Datenausschluss nicht beweisen. Kein erfundener endgültiger Ursachenbeweis für die ursprüngliche Meldung.

## Änderung

Nur `app/training-journal.tsx` erhält Produktänderungen: Bei jedem Navigationsfokus den bestehenden Feed neu laden; während die Route fokussiert ist auch bei App-Rückkehr. Ohne angemeldeten Owner kein Refetch und kein Listener. Listener beim Verlassen entfernen. `cancelRefetch: false` verhindert das Abbrechen gemeinsam genutzter laufender Requests. Bestehende Daten, Filter, Fehleranzeige, manuelles Aktualisieren und Pagination bleiben erhalten.

Keine Änderungen an Datenquellen, Status-/Spartenmapping, historischen Formaten, Tracking, Auth, RLS, Trainer Connect, Abos oder Persistenz. Keine Datenkorrektur und keine Migration. Fremde Worktrees und globale Koordinationsdokumente unverändert.

## Prüfungen

- Vorher: neue Fokusregression FAIL; 11 bestehende/neue Screen-Prüfungen PASS. Eine zunächst ungenaue Testhilfe zählte auch den Sparten-Chip als GPS-Karte; vor der maßgeblichen Reproduktion auf Kartenlabel mit Punkt eingegrenzt.
- Final: sechs relevante Jest-Suites, 82 Tests PASS. Feed-Mischung, alle Sparten, Filterwechsel, Pagination, Gesten/Navigationsverträge, Fokus/Resume/Cleanup, Quellfehler und Cache-Erhalt bei Offlinefehler.
- Vollständiger TypeScript-Check PASS; zwei anfängliche Typfehler in neuen Tests behoben, danach unveränderter Check erneut bestanden.
- ESLint für alle vier geänderten/neuen Code-/Testdateien PASS (0 Fehler/Warnungen).
- `git diff --check` PASS.

## Offene Abnahme

Native iOS-/Android-Darstellung und reales Navigations-/Resume-Verhalten bleiben ungeprüft. Der ursprünglich vermisste Eintrag muss bei späterer Abnahme mit Datum/ID, erwarteter Quelle und geladenem App-Stand abgeglichen werden. Server-Max-Rows/umfangreiche Livehistorien sind hier nicht unabhängig verifiziert; die vorhandenen Reader und ihre Grenzen wurden nicht erweitert. Eine endgültige Abnahme der konkreten Nutzermeldung ist deshalb offen. Kein Publish im Journalauftrag.

## Ergänzung: Revier-Vorhistorie und Übungsnotizen (20.10., direkte Nutzerfehlermeldung)

Nutzer meldet, dass zuvor eingegebene Inhalte nicht sichtbar sind, und fragt nach weiteren Fehlern. Die zuvor weitergeleiteten Screenshots wurden gesichtet; das neue MP4 ist vorhanden, aber AVFoundation konnte an fünf Zeitpunkten keine Frames dekodieren. Keine Videosichtung behauptet. Keine weiteren privaten Inhalte aus Aufnahmen in Tests übernommen.

Belegte Lücken: Die Einheiten-Detailansicht ließ `exercise.notes` vollständig weg; die Trainingsvorbereitung zeigte Übungsnamen, aber keine Übungsnotizen. Eine erneute normale Übungsauswahl erzeugt eine neue Identität; der historische Hinweis erscheint dann selbst bei einem früheren gleichnamigen Eintrag nicht. Eine Namensgleichheit darf weiterhin keine automatische Identitätszuordnung auslösen.

Korrektur: Detailansicht und Vorbereitung zeigen vorhandene Übungsnotizen. Im aufgeklappten Bereich der neu ausgewählten Übung werden frühere gleichnamige Einträge derselben Sparte aus der bereits owner-/hundgebundenen Historie als explizite Auswahl angeboten (je fünf, weitere per Mehr). Name dient nur zum Auffinden von Kandidaten. Erst der konkrete Klick verknüpft mit dem gewählten Originaldatensatz; vorhandene stabile Identität wird erhalten, Legacyzeilen werden über Originaleinheit und Übungs-ID referenziert. Keine Verknüpfung während Editieren, Speichern oder nach bestätigtem Remoteabschluss. Der Klick erhält heutige Notiz, Bewertung, Durchführungsstatus und Dauer. Keine alte Bewertung/Notiz wird in heutige Ergebnisse kopiert. Bestehender Speichervertrag und Schema unverändert.

Zwei neue Screenregressionen reproduzierten den Fehler vor dem Fix (2 FAIL, 32 PASS), danach PASS: gespeicherte Übungsnotiz in der Vorbereitung; direkte historische Auswahl bei erhaltener heutiger Notiz und unverändertem heutigem Speicherpayload. Vorhandene Modelltests decken Identitätsbindung, Namensambiguität und Legacyursprung ab. Final acht relevante Suites / 126 Tests PASS; vollständiger Typecheck, ESLint aller fünf geänderten Codedateien und Diffprüfung PASS.

Weiter offen: endgültige Abnahme der konkreten Kundeninhalte, native Sicht-/Videoabnahme, Aktualisierung der Formularhistorie bei Rückkehr, historische `training_sessions` in der Vorbereitung sowie Vereinfachung der doppelten allgemeinen/übungsspezifischen Schwerpunktfelder. Diese Punkte werden nicht als behoben ausgewiesen. Für Journal-Pagination ist ein tatsächlicher Datenausschluss weiter unbewiesen. Kein Live-Speichern, keine DB-, Build-, Store- oder OTA-Aktion. Der neue Fix wird mit eigenem Folgecommit auf derselben Auftragsbranch normal nach GitHub gesichert.

## Gesamtauftrag zur OTA-Auslieferung (direkte Nutzerfreigabe 20.10.)

Direkter Nutzerauftrag in07: „bitte alles beheben und als ota an neues build und das aktuelle im appstore und google store“. Er beantwortet die bisher offene Umfangsfrage: die bekannten engen Journal-/Formularlücken abschließen und über01 an neuen iOS-TestFlightbuild sowie tatsächlich aktuelle App-Store-/Google-Play-Binaries ausliefern. Keine Freigabe für neue Native-/Storebinaries oder DB-Mutation; Geräteprüfungen weiter zurückgestellt. 01 ermittelt die aktuellen Zielversionen/Runtimes frisch, erhält vollständigen Sourcefreeze und veröffentlicht erst nach eigenen Gateprüfungen.

Abgeschlossene Ergänzungen:
- Neues rein lesendes `services/trainingPreparation.ts` kombiniert die bisherigen nach Owner/Hund/Sparte gefilterten Units mit bestehenden nicht-GPS-Legacysessions. Derselbe bestehende Feedadapter normalisiert alte Notizen/Titel; stabile clientseitige Namespaces verhindern kollidierende Quell-IDs. Original-IDs und Quelle bleiben für die bestehende Detailroute erhalten. Historische Daten werden nicht geändert. Explizite Wiederverwendung erhält einen neuen Ergebnisdatensatz, niemals ein Überschreiben der alten Session.
- Beide Quellen werden serverseitig vor der jeweiligen 101er-Grenze gefiltert, anschließend gemeinsam datiert sortiert und auf 100 begrenzt; Überlaufhinweis bleibt erhalten. Fehler einer Quelle sind Fehler, keine angeblich vollständige Teilhistorie. Zusätzliche clientseitige Owner-/Hund-/Sparten-/Statusprüfung erhält die bisherige Isolation.
- Formularhistorie lädt beim Navigationsfokus und Resume neu; Listener entfernt sich bei Blur. Scope- und Versionsprüfung verwirft alte Account-/Hund-/Request-Antworten. Vorhandene Historie und Entwurf bleiben bei Fehlern erhalten. Kein History-Reload setzt ausgewählte Übungen oder neue Notizen/Bewertungen zurück.
- Eindeutige optionale Labels für Übungsbeobachtung, nächsten Übungsschritt und allgemeine Trainingsnotiz. Der allgemeine Sparten-Schwerpunkt ist unter Details; nichtleere bestehende Eingaben bleiben auch eingeklappt sichtbar. Kein bisheriger Fokusinhalt wird gelöscht. Fünf neue Schlüssel in de/gsw/en/fr/it, freundlichere bisherige Verlaufsmeldung.
- Journal zeigt „N von insgesamt M Trainings angezeigt“ passend zu den aktiven Filtern. Bestehende chronologische Sortierung und Mehr-laden-Funktion bleiben erhalten. Kein Datenausschluss des konkreten Screenshots behauptet.

Prüfungen des finalen Gesamtstands: 15 relevante Jest-Suites mit 230 Tests PASS; vollständiger Typecheck, ESLint der neuen/geänderten Dateien und Diffprüfung PASS. Neu abgedeckt sind zwei Datenmodelle, Legacyöffnung, Source-ID-Kollision, Isolation/Trackausschluss, 100/101-Grenze, beide Quellfehler, Navigationsfokus/Blur/Resume, überholte Resumeantwort und Erhalt vorhandener Daten/Eingaben bei anschließendem Offlinefehler. Bestehende atomic-/Retry-/Draft-/Speicher-, Journal-/Gesten-/Feed- und Übersetzungstests enthalten. Zwischenzeitliche Tests mussten die neue Detailsposition des allgemeinen Schwerpunktfeldes und einen AppState-Testmock berücksichtigen; keine Tests durch geänderte Timeouts geschönt.

Quellabschluss und tatsächliche OTA-IDs werden separat unter `outputs/training-journal-complete-07-2026-10-20/` beziehungsweise in01s Releasebeleg gebunden. Dieser Codebericht ist kein Nachweis einer Veröffentlichung. Grenzen: keine native Sicht-/Screenreader-/Kundenkonto-/Videolaufzeitabnahme, tatsächliche Kundennotiz nicht aus Live-DB gelesen; nicht behaupten, dass alle möglichen ANYVO-Fehler behoben sind. Die frühere Liste offener Formularpunkte oben beschreibt den damaligen Stand und wird durch diesen Abschnitt abgelöst. Keine native/DB/Tracking-/Auth-/Abo-/Trainerrechteänderung.

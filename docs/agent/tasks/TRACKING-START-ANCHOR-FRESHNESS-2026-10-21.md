# Tracking: tatsächliches Alter der Startanker-Fixes prüfen

## Scope und Ursache

Getrennte, kleine Korrektur aus dem beauftragten GPS-/Start-Audit. Basis des
isolierten Commits: `422f32105a0cd963437a49d9e54c6f5dfe65456d` auf
`fix/tracking-field-incident-20261021` im eigenen Tracking-Worktree.

`createLayProcessor.handleStartLock()` setzte `now = raw.t` und prüfte dann
`raw.t <= now && now - raw.t <= START_FIX_MAX_AGE_MS`. Dadurch war die
Altersprüfung immer erfüllt. Über den tatsächlichen Hook reproduziert:
vier jeweils 10 Sekunden alte bzw. 10 Sekunden zukünftige Fixes erzeugten
einen Startanker. Der vorhandene Test prüfte nur, dass keine Bewegung/Linie
freigegeben wurde; die Ankerbildung selbst war damit nicht abgesichert.

Der zunächst dreizeilige Guard verhinderte zwar die Ankerbildung aus solchen
Fixes, genügte aber nicht bei bereits vorhandenem Anker. Der unabhängige Review
belegte zusätzlich: Zukunftszeit konnte den Fallback vorzeitig auslösen;
eine zulässige verzögerte Messung verschob die 12-s-Grenze; native
Millisekundenbruchteile wurden fälschlich ausgeschlossen.

Der finale Guard trennt deshalb zwei Uhren. Empfangszeit `Date.now()` steuert
Altersprüfung, 12-s-Timeout, Bewegungsfenster und Diagnostikhorizont. Die Messzeit
bleibt für Anker-/ersten Linienpunkt und folgende GPS-Punkte erhalten, damit
zulässige verzögert zugestellte Fixes nicht zeitlich umgeordnet werden.
Zeitungeeignete Fixes blockieren auch mit vorhandenem Anker die Freigabe und
werden nicht als bestätigte Bewegung/Fallback dokumentiert. Der gleiche
trunkierte Millisekunden-Bucket ist wie beim bestehenden Motion-Guard zulässig;
eine echte Zukunftstoleranz wird nicht eingeführt. Zugehörigkeit zur laufenden
Aufnahme sowie die bisherigen Grenzen von 5 Sekunden und 12 Sekunden bleiben
erhalten. GPS-Genauigkeits-/Speed-Grenzen und Winkelverfahren unverändert.

## Produktdateien und Regressionen

- `features/tracking/engine/layProcessingSession.ts`: Zeitbezüge ausschließlich
  innerhalb des Start-Locks konsistent getrennt; neue Blockerdiagnose bei
  ungeeigneter Fixzeit. Nachfolgende normale Linienverarbeitung unverändert.
- `features/tracking/hooks/__tests__/useTrackRecorder.startup.test.tsx`:
  elf zusätzliche Fälle für alte/zukünftige Fixes, vor der Session liegende
  Daten, exakte/überschrittene 5-s-Grenze, verspätete Batch-Fixes und einen
  anschließenden korrekten frischen Anker, Future-Fallback, echten 12-s-Bound,
  Millisekundenbruchteile und erhaltene Messzeit/Quellreihenfolge der Linie.
  Vorhandene Erwartungen unverändert.
- Dieser eigene Bericht. Keine native Änderung, neue API oder Datenbankänderung.

## Nachweise

- RED über kopierte echte Hook-Suite ohne Produktänderung: 2 Tests FAIL,
  33 bewusst gefiltert. Separater Modelllauf anschließend 40 Tests PASS.
- Produktprüfung der Vorstufe: **5 Suiten / 189 Tests PASS**. Im ersten Aufruf
  war zusätzlich ein nicht existierender Testpfad angegeben: die fünf realen
  Suiten bestanden, der zusätzliche Pfad verursachte ENOENT. Der korrigierte
  Aufruf mit exakt den fünf vorhandenen Pfaden bestand vollständig.
- Nach den unabhängigen Clock-Befunden: echte Hook-Suite 44 Tests PASS; mit den
  separaten v3-Intervallregressionen zusammen 2 Suiten / 66 Tests PASS.
- Finaler gemeinsamer Lauf: **44 Suiten / 716 Tests PASS**, alle 13 betroffenen
  Codedateien während des Laufs hashgleich. TypeScript PASS; ESLint 0 Fehler,
  2 vorbestehende Warnungen; `git diff --check` PASS. Die gemeinsamen Zahlen
  überlappen mit den Vorläufen und dem getrennten P1-Paket.
- Zwei tatsächliche Processor-Replays der originalen, begrenzten Quiron-/Yam-
  Mitschnitte PASS. Quiron bleibt vollständig gleich. Bei Yam löst der korrekte
  Empfangs-Timeout mit der simulierten 200-ms-Zustellung den Fallback einen
  Quellfix früher aus. Das ändert nur die erste Linienpunktzeit um ca. -1 s,
  startet den Detektor einen Punkt früher (158 statt 157) und verschiebt dessen
  Ursprung: Turnindizes +1, interne Detektordistanzen jeweils +0,3870718567 m
  (gerundete Markerlabels +0,4 m). Linienkoordinaten und -anzahl, kanonische
  Gesamtdistanz, Winkelarten, Klassifizierung/Confidence, Scheitelzeiten/-orte,
  Callbackzeiten, Abschnitte und Markerkoordinaten bleiben gleich. Es wird
  ausdrücklich keine vollständige Bitgleichheit des Clock-Fixes behauptet.
- Separater Replay ohne Clock-Fix mit denselben neuen P1-Verbrauchern bleibt
  über alle genannten Felder bitgleich zur vorherigen geprüften Basis. Damit
  ist die begrenzte Änderung auf den korrigierten Startzeitbezug eingegrenzt.

Belege unter `outputs/tracking-field-incident-02-2026-10-21/angle-analysis/`:
`STARTUP-FRESHNESS-AUDIT.*`, `STARTUP-FRESHNESS-CANDIDATE-FULL.*`,
`STARTUP-FRESHNESS-PRODUCT-VALID.*`, `STARTUP-FRESHNESS-INCIDENT-REPLAY*` und
`STEP-AND-CLOCK-FINAL-*`, `P1-ONLY-REPLAY*` sowie
`STEP-AND-CLOCK-FINAL-REPLAY-COMPARISON.json`. Der separate Freeze bindet die
drei eigenen Dateien sowie diese Nachweise. Originale Kundendaten bleiben
außerhalb des Commits.

## Grenzen und Auslieferung

Diese reproduzierte Schutzlücke beweist nicht, dass sie die konkreten
GPS-Empfangsprobleme vom 21.10. verursacht hat. Eine schnellere erste
Satellitenposition oder eine erfolgreiche reale Ansatz-Erkennung wird nicht
behauptet. Die drei offenen Yam-Winkel und historische native Kartenanzeige
sind hier nicht korrigiert.

Der Guard ist JS-/TS-basiert. Eine OTA braucht dennoch die separate aktuelle
Runtime-/Releaseprüfung durch Chat 01. Die Basiskette enthält den nativen
Schrittübergabe-Kandidaten, dessen separater P1-Verbraucherbefund noch gelöst
und unabhängig abgenommen werden muss; diese Sicherung gibt ihn nicht frei.
Vorangegangene native/FN1/Veto/R2-Quellen bleiben erhalten. Keine globale
Statusdatei oder `main` verändert, kein Push/Merge/OTA/App-Build/DB-Eingriff.

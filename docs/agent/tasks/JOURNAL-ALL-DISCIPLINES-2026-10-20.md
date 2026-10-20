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

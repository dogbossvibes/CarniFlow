# Persönlicher Diagnosezugang auf Android Runtime 1.0.3

- Verantwortlich: Chat 05. Eigene Isolation `anyvo-android-personal-diagnostics`, Branch `feat/android-personal-diagnostics`.
- Exakte Basis: `6f7018e4bfa39281750f7b116b7260e36b0d0d8c`, bereits mit Tracking-UX. Ursprünglicher Diagnoseumfang: `5608c0191453ea3b3aacd28906c2672819ce4de3`.
- Publisher bleibt Chat 01. Dessen Worktree wurde nur gelesen, nie editiert. Dessen nachfolgender Commit `e0586d64e359d2b87091a9e8106164cac9d5aee2` betrifft ausschließlich den Replay-Screen-Test, keine Produktdatei; diese Datei ist nicht Teil dieses Deltas.
- Die persönliche Datenbankberechtigung ist bereits separat live geprüft. Dieser Auftrag enthält ausschließlich JS/TS, zugehörige Tests und diesen Bericht; keine Migration, Policy, Grants, Dependency-/Runtime-/Nativeänderung oder Veröffentlichung.

## Problem und Änderung

Die Android-Basis besitzt die ältere Inline-Verarbeitung in `useTrackRecorder` und den direkten Hintergrund-Callback. Die iOS-Fassung setzt dagegen eine sessiongebundene Lay-Pipeline und Hintergrundzähler voraus. Eine pauschale Konfliktauflösung hätte die Android-Verarbeitung ungewollt ersetzt.

Der Transfer erhält den vorhandenen Android-Fixpfad, Geometrie, Filter, Distanz, Winkel, Persistenz, Callback-Registrierung und die 30-Sekunden-Bündelung der Hintergrundquelle. Die native Hintergrunddatei ist bytegleich zur Basis; `layProcessingSession`, Session-Runtime und `backgroundLayDiagnostics` werden nicht eingeführt.

- Gemeinsame persönliche Authority für Menü, Route, QA-Einstellungen und Export. Serverseitige Standardverweigerung vorausgesetzt; kein Tester-/Abo-Fallback. Nicht persistierte 60-Sekunden-Berechtigung mit Account-/Generationsprüfung und serverseitigem Refresh.
- Lokale QA-Präferenzen nur accountgebunden und nach Freigabe wirksam. Entzug, Abmeldung, Accountwechsel und Ablauf sperren weitere Beobachtung/Exporte. Angefangene Streams behalten Engine/Quelle bis zum regulären Stop, einschließlich Übergang zur bestehenden Hintergrundquelle.
- Additive QA-Beobachtung erfasst nur tatsächlich vorhandene Aufnahmeidentität, Quellen- und AppState-Ereignisse. Beobachterfehler dürfen keine Aufnahme verhindern. Keine zusätzlichen GPS-/Sensorquellen oder Hintergrundberechtigungsabfragen.
- Das bisher QA-abhängige Stop-Flush-Verhalten wird beim Start festgehalten, damit ein Entzug die laufende Aufnahme nicht nachträglich verändert. Das ist Erhaltung bestehenden Verhaltens, kein neuer allgemeiner Rollout des QA-Stop-Flush.
- Android-QA-Export meldet `backgroundLayDiagnosticsStatus: unavailable`; es gibt auf dieser Basis keine entsprechenden Hintergrundzähler/Timeline. Keine erfundenen Werte. Alte Sessions ohne Aufnahmebelege bleiben `missing`. Zusätzliche QA-Felder ändern die vorhandenen exportierten Fährtenwerte nicht.
- Export erlaubt ausschließlich eigene Sessions, bindet vorbereitete Exporte an die aktuelle Freigabe und prüft erneut vor Share/Clipboard sowie nach Dateischreiben. Der normale Kunden-Supportpfad bleibt offlinefähig und enthält keine interne Aufnahmeidentität.

## Tatsächliche Prüfung

- **59 Suiten / 576 unterschiedliche Tests bestanden**, in seriellen Gruppen und gezielten Wiederholungen, kein behaupteter einzelner Gesamtlauf: Recorder 2/17; Authority/Export/Support/Evidence 11/126; übrige Regressionen 45/428; Quellenprüfung 1/5.
- Neuer Android-Test verwendet die tatsächliche `backgroundLocationTask`-Callback-Implementierung und tatsächliche Authority/Präferenzen. QA aus/an liefert identische Punkte, Distanz und Marker für dieselbe Fixfolge einschließlich schlechter Genauigkeit und Sprung. Entzug/Logout/Accountwechsel/Lease-Ablauf schließen QA, ohne Quelle neu zu starten oder zu stoppen; Punkte werden weiter verarbeitet. Quelle/Engine bleiben bis Stop festgelegt. Bestehender Stop-Flush bleibt bei gestarteter QA auch nach Entzug erhalten.
- Search-Regressionssuiten und Quellenbesitz prüfen beide Quellen, Geometrie, Recovery, Cursor-/Endverhalten und QA→Support bei Entzug. Exportprüfungen decken fremde Accounts/Sessions, verzögerte Reads, serverseitigen Entzug, Regrant und Entzug während Dateischreiben ab. Bestehende Support- und Nutzerexporttests bestanden.
- Ein neuer Test hatte zunächst eine unvollständige Stop-Flush-Fixture; ersetzt durch einen Spy auf die echte Funktion. Recorder-Gruppe danach 17/17 bestanden. Zwei ältere Legacy-Quellentests setzten ungeschützte globale QA-Einstellungen voraus und ließen Streams offen; jetzt explizite Accountfreigabe/Hydration und Cleanup, ergänzt um verweigerten Legacy-Override. Finale Quellengruppe 5/5 bestanden.
- Vollständiger `npm run typecheck`: **Exit 0**. Erster Versuch meldete fehlende bestehende PDF-Pakete im zunächst verknüpften main-Dependency-Verzeichnis. Finaler Lauf verwendet die vollständigen vorhandenen Dependencies des Android-Release-Worktrees; keine Installation oder Manifeständerung.
- ESLint für alle 44 geänderten/neuen Code- und Testdateien: 0 Fehler. Fünf neu entstandene Import-/Unused-Warnungen in den zwei angepassten Tests behoben; gezielter Abschlusslint dieser Dateien ohne Warnung. Verbleiben 23 bereits vorhandene Profil-Warnungen. `git diff --check` bestanden. Temporärer Dependency-Symlink nach Prüfungsabschluss entfernt; kein Bestandteil des Deltas. Gezielte Abschlusswiederholung der zwei bereinigten Tests: 12/12 bestanden.
- Logs: `/private/tmp/android-personal-diagnostics-recorder.log`, `android-personal-diagnostics-security.log`, `android-personal-diagnostics-regression.log`, `android-personal-diagnostics-source.log`, `android-personal-diagnostics-typecheck-final.log` (letzte vier jeweils ebenfalls unter `/private/tmp/`). Der breite Regression-Log enthält die anfänglichen zwei Legacy-Fehler; der separate finale Quellenlauf ist deren Korrekturbeleg.

## Grenzen und Integration

- Keine Geräteabnahme, kein Android-Build/Store/OTA, kein Push oder main-Merge durch Chat 05. Finale Integration, frischer Production-Preflight und Veröffentlichung ausschließlich durch Chat 01.
- Offline/Hintergrund kann eine Freigabe ohne Refresh nach 60 Sekunden ablaufen. QA endet dann konservativ; produktive Aufzeichnung läuft weiter. Ein sofortiger Offline-Serverentzug wird nicht behauptet. Export braucht frische Serverbestätigung; bereits an das Betriebssystem übergebene Inhalte können nicht zurückgerufen werden.
- Keine neue iOS-Pipeline oder neue Continuity-Arbeit mit diesem Transfer vermischen. In Android nur dieses Delta auf die geprüfte Basis übernehmen, nicht zusätzlich den ursprünglichen `5608c01` pauschal cherry-picken.

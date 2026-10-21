# Einheitliche Übungsauswahl – 07 – 2026-10-21

## Auftrag und Ausgangslage

Nutzer meldet mehrfaches „Revieren“ samt automatisch sichtbaren Speichern-Feldern im Dokumentationsformular und beauftragt die Korrektur. Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-journal-all-disciplines`, Branch `fix/journal-all-disciplines`, Basis `cebf579a7fa4382e97b8ed50651c7d69320d143d`. Anfangs sauber; temporärer eigener node_modules-Link nur für Prüfungen.

## Ursache und Änderung

Das Formular zeigte Registry und Vorlagen getrennt. Vorlagen erzeugten beim erneuten Auswählen jeweils neue Identitäten. „Mehr anzeigen“ öffnete zusätzlich alle Umbenennungsfelder. Die neue gemeinsame Auswahl gruppiert gleichnamige Einträge ausschließlich für die Darstellung. Bei mehreren gespeicherten Identitäten wählt der Nutzer eine konkrete Variante; Identitäten werden weder gelöscht noch zusammengeführt. Verfügbare aktuelle Hundehistorie liefert Datum und Übungsnotiz als Kontext. Ein einzelner gespeicherter Eintrag wird bei Auswahl wiederverwendet. Vorlagen ohne Registry-Eintrag behalten das bestehende Neuanlegen. Explizites Erstellen eigener Übungen bleibt verfügbar.

Umbenennen ist eine separate Aktion mit einem Editor, idempotentem Retry und synchronem Doppeltipp-Schutz. Fehler erhalten den Text. Während des Registry-Ladens oder nach Lesefehlern bleibt die automatische Vorlagenauswahl gesperrt; Retry ist verfügbar. Account-/Spartenwechsel blenden alte Registry/Editor-Daten sofort aus und ignorieren verspätete Antworten. Archivierte/fremde Einträge werden nicht angeboten. Bestehende Trainings-/Notiz-/Bewertungsdaten und geplante/trainierte Semantik bleiben erhalten. Keine Schema- oder DB-Änderung.

## Selbst ausgeführte Prüfungen

- Vorher: sechs neue Interaktionstests scheitern gegen die alte Oberfläche.
- Abschließend: 17 Suites / 246 Tests PASS, inklusive UI, Speichern bestehender Identität ohne neuen Registry-Insert, Accountwechsel, Netzwerkfehler/Retry, Journal, Historie und i18n.
- TypeScript `--noEmit`: Exit 0.
- ESLint für alle zehn geänderten/neuen Code-/Test-/Sprachdateien: Exit 0, keine Warnungen.
- `git diff --check`: PASS.
- Zwischenlauf: zwei bestehende Custom-Sheet-Tests scheiterten bei gesperrtem explizitem Hinzufügen während Registry-Laden; explizites Hinzufügen davon entkoppelt und Tests anschließend PASS. Ein neuer History-Test verwendete zunächst zyklische React-Serialisierung; Test auf sichtbare Texte korrigiert und vollständiger Lauf anschließend PASS. Kein Produktfehler im letzten Lauf.

Evidenz: `outputs/training-exercise-choice-07-2026-10-21/verification.json` im übergeordneten Projektordner, einschließlich Quellhashes und gesicherter Testlogs.

## Auslieferungsgrenze

Gerätetests zurückgestellt. Diese neue Korrektur ist nicht als OTA veröffentlicht. Der bestehende FINAL-FREEZE-V2 und die vorherigen Veröffentlichungsnachweise wurden nicht verändert. Keine Migration, keine Kundendatenkorrektur, kein Build, Merge oder Store-Release.


## Nachprüfung: Original-Timeout und begründete Test-Setup-Korrektur

Die unabhängige Prüfung fand keine neuen Produktfehler, reproduzierte aber im ersten bestehenden No-Dogs-Test die ursprüngliche 5000-ms-Grenze. Der zunächst mit 30000 ms wiederholte Reviewer-Lauf galt anschließend ausdrücklich nur als Diagnose und nicht als Release-PASS. Alte Nachweise bleiben erhalten.

07 reproduzierte den Timeout in isolierten HEAD- und Parent-Snapshots mit gleichem vorhandenen iOS53-Abhängigkeitsverzeichnis. Der unabhängige Parent-Vergleich von 02 bestätigt denselben Fehler auch vor dem neuen Picker-Delta. Das CPU-Profil zeigt im ersten async React-Flush das verzögerte Laden der RN-Jest-Mocks Modal/AppContainer und TouchableOpacity/Animated samt Babel-Transformation; daraus wird kein Produkt-Performancefehler abgeleitet. Die Diagnose erfolgte in temporären Kopien, ohne Änderungen der Produktdateien. Profiling-/Lastüberlappung ist dokumentiert.

Korrektur: Sieben Zeilen im Test lösen die unveränderten RN-Preset-Primitives bereits beim Testmodul-Setup auf. Keine neuen Ersatz-Mocks, kein vorgezogener Product-Render, keine Timeoutänderung, kein Skip und keine abgeschwächte Assertion. Dadurch misst der erste Interaktionstest nicht zusätzlich erstmals anfallende Framework-Modultransformationen.

Selbst ausgeführt: isolierter neuer Cold-Lauf mit `--no-cache` und Original5000ms: 39/39 PASS, No-Dogs-Test3795ms; anschließend kompletter Cold-Lauf17Suites/246Tests PASS. Vollständiger Typecheck Exit0, ESLint aller zehn Code-/Test-/Sprachdateien Exit0 ohne Warnungen, diff-check PASS. Die sieben produktiven Quellpfade bleiben SHA256-identisch zu29ce528. Eigenes temporäres node_modules-Symlink nach Prozessende entfernt. Kein Build/OTA/DB/Storevorgang durch07. Neue unabhängige Prüfung und Release-Kandidatengates weiterhin Aufgabe00/01/02.

Hashgebundene Evidenz: `outputs/training-exercise-choice-07-2026-10-21/TIMEOUT-DIAGNOSIS-07.json` im Projektordner; Unterordner `timeout-diagnosis` enthält rohe Resultate, Logs und komprimierte CPU-Profile. Diagnosefehler (ein erster Cold-Befehl im unveränderten statt korrigierten Temp-Verzeichnis) ist transparent aufgeführt; der tatsächlich korrigierte Cold-Lauf wurde danach separat ausgeführt und bestanden.

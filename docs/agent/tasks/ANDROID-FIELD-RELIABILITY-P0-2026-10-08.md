# Android: Feldzuverlässigkeit / P0-Prüfung – 08.10.2026

## Ergebnis und Freigabestatus

Die Prüfung reproduziert drei Datenintegritätsfehler des bisherigen Android-JavaScript-Standes. Die sechs bestandenen Charakterisierungstests sind Fehlernachweise, keine erfolgreich geprüften Korrekturen und keine Geräteabnahme. Produktcode wurde in diesem Prüf-Worktree nicht geändert. Die Korrekturen liegen bei Chat 02; ihr gezielter Transfer auf den bisherigen Android-Recorder und die Prüfung beider Android-Runtimes bleiben offen. Native Buildvorbereitung und Veröffentlichung liegen bei Chat 01.

Ein neuer nativer Build allein behebt diese JavaScript-Fehler nicht. Für diesen Prüfstand kann deshalb weder „P0 behoben“ noch „Release vollständig abgenommen“ bestätigt werden.

## Bezugsstand und Isolation

- Branch: `feat/android-field-reliability-qa`.
- HEAD/Basis: `3f44b1d2793c7241ac2305fc6e05418ab1c07069`.
- Worktree: `/Users/moyo/.codex/.chatgpt-projects/g-p-6a5d2be17420819195ad86f465dbea47/anyvo-android-field-reliability-qa`.
- Dieser Stand ist laut Release-Chat die Quelle des veröffentlichten Android-OTAs für Runtime 1.0.3: Gruppe `cb43ecf1-e6a0-48bf-809b-279747e3b045`, Update `01a11cbc-f2e2-7682-bdbf-fab77020b1f5`, veröffentlicht am 08.10.2026 um 20:18:27 Uhr Zürich. Diese Zuordnung stammt aus den Release-Belegen; kein neuer EAS-Abgleich durch diese Prüfung.
- Keine Änderungen an `sources/`, fremden Worktrees, Tracking-Filtern, Backend, Migrationen oder Release-Konfiguration. Keine eigenen Commits, Pushes, Merges, Builds oder Veröffentlichungen.
- Die bereits abgeschlossene native Diagnostik bleibt ein separater Patch: `/private/tmp/ANYVO-ANDROID-TRACKING-DIAGNOSTICS-2026-10-08.patch`, SHA-256 `6dd50fd05a7953ab8132bc42b95a9f2b59234f3839d83416e0fc101012e06842`.

## Reproduzierte Fehler und Grenzen

| Fall | Beleg am bisherigen Android-Stand | Auswirkung / Korrekturbedarf |
| --- | --- | --- |
| Paralleler Suchpunkt-Flush | `searchPersist.ts` gibt bei bereits laufendem Write sofort Erfolg zurück, obwohl dieser später fehlschlägt. | Erfolg darf erst nach dem zugehörigen dauerhaften Write bestätigt werden. Chat 02 hat einen sitzungsgebundenen Writer mit gemeinsam abgewartetem In-flight-Promise in Arbeit. |
| Sessionwechsel während fehlgeschlagenem Suchpunkt-Write | Der alte Batch wird nach Reset auf Session B erneut gepuffert und unter B geschrieben. | Punkte aus A können B zugeordnet werden. Retry und Puffer müssen ihre ursprüngliche Session behalten. In Chat 02 bereits berücksichtigt; Android-Transfer noch zu prüfen. |
| Letzter Punkt-Write beim Beenden schlägt fehl | `useTrackRecorder.finish()` setzt nach dem abgefangenen Fehler dennoch `saved`. | Erfolgsmeldung kann fehlende SQLite-Punkte verdecken. Abschluss muss den Flush-Erfolg prüfen; Chat 02 hat dafür bereits einen fehlerschlagenden Abschluss in Arbeit. |
| Hintergrundberechtigung verweigert | Vordergrund erlaubt, Hintergrund verweigert und `canAskAgain=false`: Aufnahme beginnt ohne Hintergrunddienst und ohne erneute Anfrage. | Vordergrundbetrieb muss erkennbar sein; kein belastbares Screen-off-Versprechen. Dies ist eine Betriebsgrenze, kein Beleg für einen tatsächlichen Geräteverlust. |
| Hintergrund-Handler nach Prozessneustart fehlt | Ein Task-Aufruf mit leerem globalen Handler bindet sich nicht an eine Sitzung und schreibt den Batch nicht. | Handler und Sitzungsbindung müssen Wiederaufnahme/headless Ausführung berücksichtigen. Test simuliert fehlende Bindung, keinen echten Android-Prozessneustart. |
| Kurzer Batch vor Finish/Unmount | Weniger als 25 angenommene Punkte werden nicht in SQLite geschrieben; auch Unmount löst im bisherigen Hook keinen Flush aus. | SQLite-Tail ist noch nicht dauerhaft. Die echte Zustand-Persistenz schreibt zusätzlich zeitverzögert nach AsyncStorage; sie ist in der Hook-Fixture gemockt. Deshalb kein Nachweis eines vollständigen Verlusts aller Persistenzwege. |

Weitere Codebefunde: Die bisherige Absuche nutzt eine Vordergrundquelle. AppState-Beobachtung im Recorder liefert Diagnostik, ersetzt aber weder eine erneute Berechtigungsprüfung noch eine dauerhafte Sitzungsbindung. Vorhandene Sync-Wiederholung bei Start, Reconnect und Resume ist vorhanden; sie stellt die GPS-Aufnahme nicht wieder her. Die SQLite-Konfiguration verwendet WAL und Foreign Keys. Der vorhandene Android-Erklärdialog vor der Berechtigungsanfrage soll erhalten bleiben.

## Verifikation

Gemeinsamer finaler Lauf am unveränderten Produkt-Basisstand:

```sh
./node_modules/.bin/jest --runInBand --silent \
  features/tracking/hooks/__tests__/useTrackRecorder.androidFieldReliability.test.tsx \
  features/tracking/store/__tests__/androidFieldPersistence.characterization.test.ts
```

Ergebnis: **2 Suites, 6 Tests bestanden**, 26,421 Sekunden. Damit sind die oben beschriebenen bisherigen Verhaltensweisen reproduziert. Diese Tests erwarten absichtlich den fehlerhaften bzw. eingeschränkten Basiszustand; sie dürfen nicht als gewünschter Produktvertrag übernommen werden. Für den Fix sind die Erwartungen in echte Regressionstests umzuwandeln.

ESLint für beide neuen Testdateien und `git diff --check` liefen im selben Prüflauf mit Exit-Code 0. Der vollständige TypeScript-Lauf (`tsc --noEmit --incremental false`) endete ebenfalls mit Exit-Code 0 und ohne Fehlerausgabe. Die Testabhängigkeiten wurden nur über einen eigenen temporären Symlink verwendet; keine Änderungen an fremden Dependencies. Der Symlink wurde nach Abschluss der Prüfungen entfernt.

`adb devices -l` lieferte keine verbundenen Geräte. Keine reale Abnahme für Screen-off, Doze, Prozessneustart, Berechtigungswechsel, Offline-Persistenz, Kauf oder Restore wurde durchgeführt.

## Zuständigkeiten und nächste erforderliche Nachweise

1. Chat 02: Writer-/Abschlusskorrekturen und Hintergrund-Sitzungsbindung fertigstellen; gezielt auf Android übertragen. Die neuere iOS-Processor-Pipeline darf nicht pauschal den bisherigen Android-Hook ersetzen. Verzögerte Start-/Stop-Antworten müssen an den Aufnahmelauf gebunden bleiben.
2. Chat 01: Native TaskManager-Korrektur im tatsächlich kompilierten Artefakt nachweisen. SDK 54 kann vorgefertigte Maven-AARs verwenden; ein erfolgreicher Source-Patchcheck allein beweist nicht die Binärkorrektur. Buildvorbereitung erzwingt derzeit Source-Build für `expo-task-manager` und `unimodules-app-loader`; native Prüfung läuft noch.
3. Release: Nach geprüftem Android-Transfer einen passenden OTA-Kandidaten für Runtime 1.0.3 und den neuen nativen Stand 1.0.4 vorbereiten. Die bestehende Veröffentlichung enthält diese neue Continuity-Arbeit noch nicht. Keine neuen Änderungen ungeprüft in einen laufenden Build injizieren.
4. Geräte-QA: Screen-off/Doze, sichtbarer Vordergrund-Fallback bei verweigerter Hintergrundberechtigung, Resume/Prozessneustart, Offline-Abschluss und Wiederholung fehlgeschlagener Writes, Sessionwechsel ohne Punktvermischung sowie Kauf/Restore separat prüfen. Production-Abnahme bleibt offen.

## Offizielle Grundlagen

- [Expo SDK 54 Location](https://docs.expo.dev/versions/v54.0.0/sdk/location/): Vordergrund-Watcher, Hintergrund-Task und Berechtigungen sind getrennte Mechanismen; beendete Prozesse und Herstellerverhalten benötigen eigene Prüfung.
- [Android-Standortberechtigungen](https://developer.android.com/develop/sensors-and-location/location/permissions): Vordergrund- und Hintergrundzugriff getrennt behandeln.
- [Android Doze und App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby): Energiesparzustände müssen in der Geräteabnahme berücksichtigt werden.
- [Android Foreground Service: Location](https://developer.android.com/develop/background-work/services/fgs/service-types#location): Nativer Service-Typ und Laufzeitberechtigung bleiben Bestandteil des Build-Preflights.

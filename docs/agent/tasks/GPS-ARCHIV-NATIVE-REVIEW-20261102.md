# Paket A: unabhängige Archivprüfung und Native-/Downgrade-Abgleich

Stand: 2. November 2026. Ergänzt den historischen Bericht `TRACKING-ZEITDIAGNOSE-ARBEITSSTAND.md`; dessen offene zweite Archivprüfung und Vermutung eines iOS-Konfigurationsfehlers werden durch diesen Nachweis aktualisiert.

## Ausgangspunkt und Umfang

Worktree `anyvo-bmad-tracking-timing-20261101`, Branch `fix/gps-arrival-ordering-review-20261102`, Ausgangscommit `29ee7f23990121bbd306b17dccb7c28ed20e96a5`. Vor Beginn keine offenen Änderungen an versionierten Dateien; lokale Ausgaben und `node_modules` blieben erhalten. Keine Kundendaten verändert. Die Korrekturen betreffen nur die Roharchiv-Zuordnung und deren Tests. GPS-Filter, Winkel-/Gegenstandserkennung, Hauptschema, Originalfährten und Live-Share werden durch diesen Nachtrag nicht verändert.

## Reproduzierte Fehler und Korrekturen

Die unabhängige Prüfung fand vier konkrete Lücken. Neue Regressionen schlugen vor der jeweiligen Korrektur fehl:

1. Nach einer älteren Hauptdaten-Löschung konnte eine Löschung über die lokale ID ein unter der Remote-ID gespeichertes Archiv übersehen. Die Suche berücksichtigt nun beide gespeicherten Identitäten und sperrt sämtliche gefundenen Aliasse.
2. Ein Archiv ohne geklärte Elternzuordnung konnte nach späterer Elternlöschung weiterhin gelesen werden. Ein ungeklärter Bezug verweigert jetzt die Ausgabe (`RAW_PARENT_UNRESOLVED`), erhält aber die Originaldaten für Wiederherstellung. Eine nachgewiesene Zuordnung wird dauerhaft festgehalten.
3. Ein älterer Writer mit noch unbekanntem Elternbezug konnte eine inzwischen vom Reader festgestellte Zuordnung überschreiben, wenn ein Remote-Alias wiederverwendet wurde. Die Zuordnung erfolgt jetzt transaktional nur einmal; abweichende bekannte Identitäten werden abgewiesen.
4. Eine Löschung während der letzten asynchronen Elternprüfung konnte bereits gelesene Koordinaten zurückgeben. Gefundene Aliasse werden synchron invalidiert; die abschließende Generations-/Statusprüfung erfolgt nach der Elternabfrage.

Dateien: `gpsCapture.ts`, `gpsCapture.test.ts`, `useTrackRecorder.arrivalArchive.test.tsx`, `gpsCaptureSessionContext.test.tsx`, neuer Test `gpsCaptureDowngrade.test.ts` mit historischer SQL-Fixture. Die Recorder-/Provider-Testfixtures stellen jetzt tatsächlich existierende Elternfährten dar; Tests für fehlende Eltern bleiben separat bestehen.

Unabhängige Nachprüfung durch den bestehenden Review-Agenten `edge_review`: alle vier Befunde geschlossen, eigene 30 Archiv-/Downgrade-Tests bestanden, keine weiteren konkreten Fehler im geprüften Diff. Dies ist eine Codeprüfung, kein Gerätetest.

## Native-Abgleich mit dem tatsächlichen Build 57

- EAS-Build `442f7bc3-14f8-4ec0-9cf3-138a3dd6f79d`, Source `17443616b5bad6d5a524804e48cc84a2cf9ef4c9`.
- Tatsächliche IPA: Bundle `com.anyvo.app`, Version **1.0.6**, Build **57**, Expo-Runtime **1.0.6-map49-v1**.
- IPA-SHA256: `7342b1b6b43c3fcbff025f6001afce875f0d9649104769a72ad1e094e8e02374`.
- ExpoSQLite/NativeDatabase/NativeStatement sind im App-Binary enthalten. Das ist ein Artefaktnachweis, keine Ausführung aller nativen Methoden auf dem iPhone.
- Build-Source und Paket-A-Lockfile: Expo `54.0.36`, expo-sqlite `16.0.10`, expo-updates `29.0.19`; keine neuen nativen Abhängigkeiten oder Moduländerungen.
- **Korrektur der früheren Einschätzung:** Die globale App-Version `1.0.4` ist hier kein Runtime-Mismatch. Die plattformspezifische iOS-Konfiguration überschreibt sie mit Version `1.0.6` und Runtime `1.0.6-map49-v1` und stimmt mit der IPA überein. Kein künstlicher Versionswechsel erforderlich.

Der SQLite-Testadapter des neuen Downgrade-Tests öffnet wie die installierte Expo-SQLite-Implementierung für jede exklusive Transaktion eine neue Verbindung und führt BEGIN/COMMIT/ROLLBACK aus. Fremdschlüsselprüfung auf dieser Verbindung wird sowohl ein- als auch ausgeschaltet getestet. Grundlage: installierter Quellcode sowie [offizielle SDK-54-SQLite-Dokumentation](https://github.com/expo/expo/blob/sdk-54/docs/pages/versions/v54.0.0/sdk/sqlite.mdx). Keine Aussage über eine tatsächliche iOS-API-Ausführung aus Node-Tests ableiten.

## Rückwechsel: nachgewiesene Grenze und geprüfter Lösungsweg

Ein unverändertes altes Bundle kennt die neue Datei `anyvo_gps_arrivals_v1.db` nicht. Die unveränderten historischen Wipe-Anweisungen aus Build-57-Source und OTA `4a139455…` lassen deren Daten deshalb zurück. Das wird ausdrücklich als Regressionstest nachgewiesen, nicht als erfolgreicher Löschvorgang gewertet. Ein bereits installiertes altes Bundle kann durch dieses neue Paket nicht rückwirkend repariert werden.

Ein unterstützter Rückwechsel muss die Archiv-Lösch-/Accountpfade behalten und nur die Aufnahmeänderung zurücknehmen. Dafür wurde der isolierte Prüfcheckout `anyvo-gps-rollback-audit-20261102` auf dem bisherigen Live-Commit `4a13945539c6bc60f623bb8888f3abc3dd95fdec` vorbereitet. Er enthält ausschließlich die 15 hierfür nötigen Speicher-/Lösch-/Accountdateien. Keine neuen Rohaufnahmen werden gestartet. Recorder, Lege-Engine, Winkelalgorithmus, Hauptmigrationen, Native-Quellen und Release-Konfiguration entsprechen der bisherigen Basis. Der unabhängige Prüfer hat diese Trennung und die Übernahme der korrigierten Speicherdateien kontrolliert.

Vier Suiten mit **41 Tests bestanden** im Rückwechsel-Prüfcheckout; TypeScript bestanden. Abgedeckt: echte zwei SQLite-Dateien, Originaldaten und Mess-/Empfangszeiten, historischer Wipe versus neuer Wipe, Löschung nur des aktuellen Suchversuchs, lokale/Remote-IDs und Accountgrenzen. Die historische Wipe-Fixture stimmt bytegleich mit beiden Quellständen überein; SHA256 `9d42a7400ae61e24b5702b847eef284547a1a4edc9ad9fed71e92f6d31be6065`.

Dieser Checkout ist **kein direkt veröffentlichbarer Rollback**: Nach zwischenzeitlichen Releases muss der Rückwechsel auf dem dann aktuellen Produktionsstand integriert werden, damit T115/Kartenkorrekturen und andere freigegebene Änderungen erhalten bleiben. Keine automatische Löschung unbekannter Archive und kein Rückschluss aus einer leeren Suchlinie auf eine Löschabsicht.

## Verifikation und verbleibende Freigabegrenzen

Abschließender vollständiger Lauf: **537 Suiten, 535 bestanden / 2 fehlgeschlagen; 6.216 Tests, 6.214 bestanden / 2 fehlgeschlagen**, keine ausgelassenen Tests. Die beiden Fehler sind dieselben bereits auf dem unveränderten Ausgangsstand reproduzierten Fehler: `evaluation-screen-consistency.test.ts` (veraltete genaue Aufrufform) und `productionNativeContract.test.ts` (Build-49-Erwartung gegenüber bestehender Build-57-Konfiguration). Sie wurden nicht durch Abschwächung von Tests verdeckt und sind vor der finalen Release-Abnahme zu bewerten. TypeScript bestanden; Lint Exit 0, keine Fehler und 87 bestehende Warnungen; `git diff --check` bestanden. Der vollständige Lauf enthält die neuen Regressionen; Einzeltestzahlen nicht hinzuaddieren.

Nachweise liegen unter `outputs/archive-native-audit/`, insbesondere Red/Green-Logs, `full-final.json`, `full-final.log`, `typecheck.log`, `lint.log`, `native-compatibility.json`, `rollback-manifest.json`, `rollback-cleanup-only.patch` und Build-57-Artefaktnachweis. Diese lokalen Nachweise enthalten keine neuen Kundendaten; die IPA ist kein Bestandteil des Commits.

Offen bleiben reale Gerätetests: SQLite/Lifecycle bei Bildschirmsperre und App-Wechsel, Recovery, Accountwechsel, Löschung und unterstützter Rückwechsel auf eigenen Testfährten; außerdem Speicher-/Akkuverhalten. Gleichzeitig aktive JS-Runtimes sind nicht durch diesen Node-Test nachgewiesen. Datenbankübergreifende Löschung ist nicht atomar; ein dauerhaft hängender nativer Aufruf hat weiterhin keinen Watchdog. Die Primärspeicherung bleibt unabhängig vom Archivabschluss. Bei Problemen keine Originaldaten oder historischen Zuordnungen erraten.

Die zweite Archivprüfung und der Native-Artefaktabgleich sind abgeschlossen. Das allein ist keine Production-Freigabe. Integration/Preflight erfolgen mit Chat 01 in der bestehenden Reihenfolge T115 → Karten → GPS. Keine parallele OTA aus diesem Arbeitscheckout. Pakete B und C bleiben separate Aufgaben.

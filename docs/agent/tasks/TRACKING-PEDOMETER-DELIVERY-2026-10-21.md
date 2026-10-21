# Tracking: native Schrittübergabe und nachvollziehbare Diagnose

## Auftrag und Arbeitsstand

Der Nutzer hat am 21.10. den Plan zur Stabilisierung des neuen TestFlight-Stands
bestätigt. Zuerst native Übergabe und Diagnose isoliert korrigieren, bestehende
Lay-/Search-Optimierungen erhalten; weitere Yam-/GPS-/Ansatz-/Kartenfehler
getrennt prüfen und anschließend über Chat 01 unabhängig abnehmen.

- Worktree: `anyvo-tracking-field-incident-20261021`
- Branch: `fix/tracking-field-incident-20261021`
- Basis: `12c436564be3d3f00e7248e29b13a0e99e9ee065`, vor Beginn sauber.
- Status: lokal implementierter, uncommitteter nativer Kandidat; unabhängige
  Prüfung angefordert. Kein App-Build, keine Integration oder Veröffentlichung.
- Chat 02 ist Writer; Chat 01 bearbeitet parallel ausschließlich seine
  separaten Journal-Releasequellen und übernimmt den Tracking-Review separat.

## Belegter Datenfluss und Fehler

`AnyvoMotionManager` verarbeitet Sensoren und Timer seriell und bindet die
Callbacks an ihre Laufgeneration. `MotionSensorState.recordPedometer()` nimmt
kumulative Schritte an. Bisher erhöhte das den Zählerstand, aber `emit()` löschte
`pendingSteps` auch bei einem leeren/veralteten Device-Motion-Fenster, dessen
Rückgabe `nil` war. Manager/Expo senden dann kein Ereignis. Die nächste gültige
Motion-Nachricht konnte die bereits verbrauchten Schritte nicht mehr enthalten.

Der bisherige native Test erwartete dieses Verhalten ausdrücklich. Seine eine
betroffene Erwartung wurde für den korrigierten Vertrag von 0 auf 2 Schritte
geändert; die weiteren vorhandenen Erwartungen bleiben erhalten. Neue Fälle
prüfen Fehler-, Zeit-, Mehrfachzustellungs- und Laufgrenzen.

Der historische Store-/TestFlight-Quellvergleich sowie die ursprünglichen
Diagnosen sind separat in `outputs/tracking-field-incident-02-2026-10-21/angle-analysis/`
gebunden. Die Yam-/Quiron-Exporte enthalten nicht die nötige native Provenienz,
um das Auftreten dieses Pfads oder seine Häufigkeit im Feld nachzuweisen.

## Korrigierter Vertrag

1. Jede positive kumulative Schritt-Differenz bleibt mit eigenem Quellintervall
   ausstehend. Leere oder veraltete Motion-Fenster verbrauchen sie nicht.
2. Jede Charge verfällt unabhängig nach der bestehenden Grenze von 2 Sekunden
   seit ihrem Quell-Endzeitpunkt. Spätere Updates, auch Null-Deltas, frischen sie
   nicht auf. Zu spät empfangene Schritte erhöhen nur die Bilanz, keine Evidenz.
3. Übergabe genau einmal mit einem echten, frischen Motion-Fenster, dessen
   Messende mindestens so neu ist wie das Quellende. Vorher bleiben die Schritte
   ausstehend. Fehlende Motion wird nicht durch Nullrotation/Stillstand ersetzt.
4. Ein Pedometerfehler verwirft ausstehende Evidenz und Kadenz. Der bisherige
   kumulative Zeit-/Zählerstand bleibt als Reihenfolgegrenze erhalten; alte
   Callbacks können ihn nicht überschreiben. Stop/Start trennt alles vollständig.
5. `qualityVersion: 3` ergänzt die Bilanz Quelle = übergeben + ausstehend +
   verworfen. Zwei gesonderte Zeitfelder beschreiben die Abdeckung der gerade
   übergebenen kumulativen Deltas. Das sind keine Zeitstempel einzelner Schritte
   und kein Beleg dafür, dass alle Schritte genau an einer Winkelspitze lagen.

Das tatsächliche Schrittangebot an bestehende Start-/Fusion-Logik kann durch die
Korrektur vollständiger werden. Deshalb folgt aus unveränderten GPS-/Winkel-
Schwellen ausdrücklich keine garantierte Gleichheit künftiger Feld-Ergebnisse.

## Diagnose und Kompatibilität

Der reale Lay-Hook reicht im freigeschalteten QA-Modus die bisher verlorenen
nativen Qualitätsfelder in den bestehenden begrenzten Motion-Puffer weiter.
Eine explizite Allowlist entfernt absolute Zeitwerte und die native Laufkennung;
alle Zeitbezüge sind relativ zum Motion-Messende. Zähler, Quellalter und
Intervalllängen bleiben von den für Fusion verwendeten Messwerten getrennt.

Kandidatenkontexte werden wie bisher begrenzt und können abgeschnitten sein.
Sie sind kein vollständiger Sensorstream. Neue Exporte mit Provenienz melden
Schema 2.13. Alte Aufnahmen werden nicht aufgefüllt. Alte Binaries ohne diese
Felder oder mit Qualitätsversion 2 bleiben kompatibel; Android erhält keine
neue native Quelle.

Unter Profil → Entwickler & Diagnose → Fährten-Diagnose zeigt der geschützte
Bereich Version, verworfene Fenster und Schrittbilanz. „Sensorstatus
aktualisieren“ liest eine native Momentaufnahme, ohne einen Sensor zu starten
oder Einstellungen zu ändern. Alte Antworten nach erneutem Aktualisieren oder
Unmount werden ignoriert. Die Anzeige ist kein historischer Fährtenzähler.

## Prüfungen

- 25 relevante Jest-Suiten / 483 Tests PASS; ergänzend die vorhandene
  Motion-Evidenz-Benchmark-Suite mit 28 Tests PASS. Zusammen 26 unterschiedliche
  Suiten / 511 Tests. Frühere gezielte 43 Tests überlappen und werden nicht addiert.
- TypeScript PASS; ESLint 0 Fehler, 1 vorbestehende Hook-Dependency-Warnung;
  `git diff --check` PASS.
- Swift-Kernprüfung: 28 Fälle / 104 Assertions PASS. Der portable lokale Runner
  kompiliert die tatsächliche Produktdatei und verwendet mechanisch dieselben
  vorhandenen/neuen Testkörper mit lokalen Assertions. Die RED-Baseline mit
  bisherigem Produktkern und ursprünglichem bisherigen Testkörper lieferte
  27 Fälle / 98 Assertions / 21 fehlgeschlagene Assertions in neuen Liefer- und
  Metadatenprüfungen.
- **Kein XCTest-/iOS-SDK-PASS:** `swift test` scheitert auf diesem Rechner am
  fehlenden XCTest-Modul der reinen CommandLineTools-Installation. Das ist kein
  fehlgeschlagener fachlicher Assertionstest und darf nicht als vollständiger
  nativer Testlauf ausgewiesen werden. Die lokalen Cache-/Sandboxprobleme beim
  ersten Versuch wurden getrennt protokolliert. Kein SDK/Toolchain-Upgrade.
- Vollständiger nativer XCTest-/CoreMotion-/Expo-Linktest im passenden Xcode/CI
  bleibt vor einem neuen Binary erforderlich. Geräte-/Background-/Resume- und
  tatsächliche Winkelgenauigkeit bleiben OPEN.

Prüfdateien, Testausgaben, RED-Baseline und portable Runnerquellen liegen unter
`outputs/tracking-field-incident-02-2026-10-21/angle-analysis/PEDOMETER-*` und
`native-pedometer-core/`. Der Source-Freeze bindet die Produkt-/Testdateien per
SHA-256; der Abschlussnachtrag bindet zusätzlich diesen Bericht.

## Erhalten und separat offen

Die bereits geprüften R2-Ladeschutz-, FN1- und Motion-Veto-Korrekturen bleiben
enthalten. `turnFusion.ts`, seine Veto-Regression und die FN1-Sektorregression
sind bytegleich zur Basis. Keine Änderung an GPS-Zulassungsgrenzen,
Winkelgeometrie/-Schwellen/-Gewichten, Enderkennung, Continuity, Score,
Aufnahmepersistenz, Kartenlinien oder Datenbankschema.

Noch offen: die drei Yam-Winkel, langsamer erster stabiler GPS-Fix,
Ansatz-Erkennung, ursprüngliche Ursache der fehlenden historischen Kartenlinie.
Ein zusätzlich separat reproduzierter Startanker-Altersfehler wird außerhalb
dieses eingefrorenen Sensor-Kandidaten vorbereitet: der vorhandene Guard
vergleicht den Fixzeitpunkt mit sich selbst. Das beweist noch keine Ursache
des konkreten Feldvorfalls und ist hier nicht still mitimplementiert.

## Auslieferung

Die Swift-Korrektur benötigt einen neuen iOS-Build. Die additive JS-Diagnose
kann ältere Binaries lesen, ergänzt dort aber keine nativen Daten. Chat 01 muss
nach unabhängigem Review die aktuelle Zielbasis, den passenden Runtime-Vertrag
und die native Build-Prüfung festlegen. Dieser Worktree ist keine automatisch
freigegebene Production-Releasequelle. Tracking bleibt bis zur Abnahme HOLD.
Keine Änderung an `main` oder globalen Statusdateien; kein Commit, Push, Merge,
OTA, EAS-App-Build, TestFlight-/Store-Submit oder DB-Eingriff in dieser Umsetzung.

## Dokumentationsabgleich

Apple beschreibt Live-Pedometerdaten als kumulativ ab dem angefragten Startdatum:
[startUpdates(from:withHandler:)](https://developer.apple.com/documentation/coremotion/cmpedometer/startupdates(from:withhandler:)).
Der angeforderte Expo-v54-Index und die v54-Pedometerseite leiten aktuell auf
`latest` um; daraus wurden keine neuen SDK-Annahmen übernommen. Die installierte
Expo-54-Bridge und bestehende Quellen bleiben maßgeblich; keine Abhängigkeit
oder Berechtigung wurde geändert.

# BW/OW/GW und gerichteter Abriss — Chat 02

Stand 2026-10-14: lokal implementiert und geprüft, uncommitted. Keine Veröffentlichung durch Chat 02.

## Auftrag und Arbeitsplatz

BW/OW/GW behalten ihren Fachtyp und erhalten zusätzlich links, rechts, spitz links oder spitz rechts. Abriss erhält eine ausdrückliche Links-/Rechtswahl. Originalaufzeichnungen bleiben erhalten. Keine neue GPS-Erkennung oder neue Schwellenwerte.

Worktree `anyvo-tracking-special-angle`, Branch `fix/tracking-special-angle-direction`, Basis/HEAD `a2361efea416badc118206f517a98875569f9561`. Vorher sauber. Separat von den Kamera- und Verleitungspaketen; deren aktuelle Reviewbefunde müssen unabhängig korrigiert werden. Canonical main und globale Statusdokumente nicht geändert.

## Umsetzung und Datenfluss

- Legen → Winkel → GW/OW/BW/Abriss → Richtung. BW/OW/GW bieten vier Geometrievarianten sowie die bestehende Ableitung aus der aufgezeichneten Spur. Abriss bietet links/rechts. Die abschließende Auswahl setzt den Marker an der dann aktuellen Position. Zurück/Abbruch setzt nichts; ein mehrfach eintreffender Bestätigungstap wird abgefangen.
- Fachtyp und Geometrie sind getrennte Felder. Ausdrückliche Auswahl trägt `geometrySource: manual`, Ableitung aus vorhandener Fusion `gps`. Unzureichende oder mehrdeutige Evidenz bleibt `unresolved`; ein Abriss wird nicht aus einer benachbarten GPS-Ecke abgeleitet.
- Metadaten gehen vom Recorder in Store/Pending und vorhandenes SQLite-Marker-JSON. Bei Finish werden alle Fachmarker klassifiziert und mit der Session gespeichert. Normaler Remote-Sync übernimmt jetzt `manualAngleGeometry` in `track_data`; diese Felder gingen vorher dort verloren.
- Neue Session-Metadaten werden anhand Typ/Position/Bogenlänge zugeordnet, unabhängig von gewechselten lokalen/Cloud-UUIDs. Doppelte Keys werden nicht als eindeutig behandelt. Historische Metadaten behalten ihren validierten Ordinalvertrag einschließlich bisheriger 100er-Grenze und nullable Koordinaten/Distanz. Historische gleichartige Marker ohne stabile Identität können nach einer fremden Umordnung nicht rückwirkend sicher identifiziert werden.
- Map- und Zählprojektion vermeidet die doppelte Darstellung genau eines passenden geometrischen Markers neben einem BW/OW/GW (Position UND Bogenlänge maximal 3 m, kompatible Richtung/Schärfe, eindeutige Zuordnung). Mehrdeutige, gegensätzliche oder spätere Durchgänge werden nicht zusammengelegt. Originalmarker werden weder gelöscht noch überschrieben.
- BW/OW/GW zählen als Winkel; Abriss und Absatz nicht. Die analytische Einordnung übernimmt die separat bekannte Geometrie, ohne den Fachtyp zu ändern. Unbekannte Schärfe bleibt unbekannt. Kartenbadges zeigen z. B. BW SL bzw. A R; das native Markerbild wird bei geänderter Beschriftung erneut aktualisiert.
- Details, Legen, Liegen, Absuche, SQLite-Recovery und Transfer-Recovery verwenden dieselben geprüften Metadaten. Beim Import wird ausschließlich eine zusätzliche lokale Zuordnung erzeugt; die autorisierte Transferreference und ihre Identität bleiben unverändert.

## Übertragungsgrenze

Der vorhandene Transfer V1 akzeptiert für BW/OW/GW genau acht Geometriefelder. Interne `markerKey`/`geometrySource` werden daher vor der Übergabe entfernt; Richtung, Schärfe und vorhandene Qualitätsdaten bleiben erhalten. Nullable/mehrdeutige Legacy-Marker behalten beim Import ihren validierten Ordinalvertrag und die Richtung im Marker-JSON.

Ein neu gerichteter Abriss ist in V1 nicht ausdrückbar. Das Senden einer solchen Fährte wird VOR einem verlustbehafteten RPC mit verständlicher Meldung abgebrochen. Lokales Legen, Speichern, normaler Sync, Öffnen und Absuchen sind davon getrennt. Eine vollständige Konto-Übergabe gerichteter Abrisse ist damit NOCH OFFEN. Chat 05 hat einen separaten lokalen V2-Validator vorbereitet; keine Installation, kein Live-DB-Eingriff und keine V2-Sendung dieses Pakets. V2 benötigt einen kompatiblen Reader und gesonderte Serverfreigabe/-abnahme.

## Prüfungen

- Breite betroffene Regression: 51 Suites / 513 Tests PASS (vor den abschließenden Legacy-/Snapshot-Regressionen).
- Nachlauf für Marker-Snapshot, SQLite-Persistenz, Wiederherstellung und Import: 5 Suites / 58 Tests PASS.
- Letzter Nachlauf nach dem unabhängigen Legacy-Befund: 5 Suites / 87 Tests PASS, einschließlich echter SQLite-Import-/Reload-Fälle für nullable Koordinaten, nullable Distanz, doppelte Keys sowie mehrfachen UI-Tap.
- TypeScript `tsc --noEmit`: PASS auf finalem Produktstand.
- ESLint: 0 Fehler, 10 Warnungen; kein automatischer Fix außerhalb des Scopes.
- `git diff --check`: PASS. Exakte Patch-/Dateihashes im eigenen Übergabemanifest; Patch wird vor Übergabe rückwärts geprüft.
- Chat 05: unabhängiger Legacy-Befund reproduziert, korrigiert und erneut geprüft; scoped Finding resolved. Separater Bericht `outputs/SPECIAL-ANGLE-05-CLIENT-REVIEW-2026-10-14.json`. Tests überlappen; Zahlen nicht addieren. Der erste Review war während laufender Änderungen; finale Hashbindung gesondert angefragt.

Keine GPS-Rohdaten, Fusion-/Zulassungsschwellen, Recorder-Ownership, Distanzberechnung oder physische Spur verändert. Auswertungsklassifikation/Zählprojektion ändert sich ausdrücklich wie beschrieben. Keine native Funktion, kein SQLite-Schemadelta, kein Cloud-DDL erforderlich für diesen Clientumfang.

## Offen / Veröffentlichung

Geräte-/Feld-QA (iOS und Android, native Marker, tatsächlicher Lauf und Sprach-/Haptikverhalten) OPEN; kein Geräte-PASS behauptet. Kein frischer Live-Cloud-Roundtrip für neue Geometrie, keine gerichtete Abriss-Kontoübergabe. OTA-Eignung des TS/JS-Scopes ersetzt keinen Runtime-/Bundle-Preflight.

Chat 01 ist alleiniger Publisher für iOS/Android Runtime 1.0.4 unter der bestehenden Nutzerfreigabe. Er muss den eingefrorenen Patch unabhängig prüfen, Konflikte zu Kamera/Verleitung getrennt integrieren und Plattform-Preflight durchführen. Keine Veröffentlichung dieses Pakets durch Chat 02. Kein Commit, Push, Merge, Build, Store- oder Live-DB-Schritt ausgeführt.

## MASTER-Vorlage (nicht in globale Dokumente geschrieben)

2026-10-14 · BW/OW/GW/Abriss · lokal implementiert/geprüft · Fachtyp + Geometrie, gerichteter Abriss, Persistenz/Sync/Recovery, eindeutige Anzeigeprojektion, V1-Kompatibilität · breite 51/513 PASS, Nachläufe überlappend 5/58 und 5/87 PASS, TypeScript PASS, ESLint 0/10, diff-check PASS · Production nicht durch02 verändert · Offen: finale unabhängige Paketabnahme/01-OTA, Geräte-/Cloud-QA, V2-Übergabe gerichteter Abrisse.

## Nachprüfung R2 — tatsächlicher Kartenpfad

Chat 01 reproduzierte, dass der frühe Spezialmarker-Pfad in TrackingMap keine Beschriftung weitergab. Der unabhängige unveränderte Parent-Map-Repro bestand nach der Korrektur für BW/OW/GW/Abriss (1 Suite / 4 Tests). Die Beschriftung wird jetzt auch an die spezialisierten Marker weitergereicht; bei unbekannter Abrissrichtung bleibt das bisherige Kreuz erhalten.

Der ergänzte eigene Parent-Map-Test entdeckte außerdem eine veraltete Memo-Abhängigkeit: Die Markeranzeige wurde nur bei geänderter Anzahl aktualisiert. Sie berücksichtigt nun Änderungen am Markerarray, sodass Richtungsänderungen nach Finish oder Recovery bei gleicher Anzahl sichtbar werden. Der native Snapshot wird weiterhin bei geänderter Beschriftung aktualisiert. Keine Transfer-/DB-/Recorderänderung gegenüber dem vorherigen Winkelpaket. Der unabhängige Transportreview von Chat 05 bleibt für seinen unveränderten Scope gültig; dies ist keine Freigabe des gesamten neuen UI-Pakets.

Der neue R2-Gesamtpatch ersetzt den bisherigen Winkelpatch. Der alte Patch bleibt als Nachweis erhalten. Veröffentlichung weiterhin ausschließlich nach unabhängigem Recheck durch Chat 01; Geräte-QA bleibt OPEN.

Finale R2-Abnahme lokal: 4 Suites / 48 Tests PASS einschließlich aller vier unveränderten externen Parent-Map-Fälle und der eigenen Markerupdate-/Maßstabsregressionen. Stabile leere Markerdefaults erhalten die Tick-Memoisierung. Letzte Änderung nach diesem Lauf: ausschließlich Typassertion im Test für die schmale projektinterne ReactTestInstance-Deklaration, ohne Laufzeitänderung. Abschließender vollständiger TypeScript-Lauf PASS (`--noEmit --incremental`, Buildinfo ausschließlich in /private/tmp). ESLint für das R2-Delta: 0 Fehler / 1 bestehende Warnung; vorheriger gesamter Paketscope 0/10. Diff-check und rückwärtige Patchprüfung PASS.

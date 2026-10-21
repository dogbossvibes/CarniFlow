# Fährten-Feldmeldung 21.10.2026

Historischer Stand R1 (unabhängiger Review verlangte Nachbesserung; R2 folgt unten):
Untersuchung offen. Ein unabhängig reproduzierter Detail-Ladefehler ist
lokal korrigiert und geprüft; er ist noch keine bewiesene Ursache der Feldmeldung.
Keine Veröffentlichung, kein nativer Build, keine Installation und kein Rollback.

## Arbeitsplatz und Quelle

- Owner: bestehender Chat 02; Backend-Aggregate ausschließlich durch Chat 05,
  Koordination durch 00, Publisher bleibt 01.
- Worktree: `anyvo-tracking-field-incident-20261021`.
- Branch: `fix/tracking-field-incident-20261021`.
- Basis/HEAD: `3ac4e095454c69575a0e878d6d127fa96b7cba94`, unverändert.
- Beide Nutzerdateien identifizieren iOS 1.0.5 (53), Runtime
  `1.0.5-motion-v3`, Production-OTA
  `01a15dc9-3ad1-72df-af9d-f6368b8ba825` und diese Release-Quelle.
- Dateien und Kundendaten unverändert erhalten. Keine Rohkoordinaten in
  Chat, Report oder externen Diensten. Lokale Experimente bleiben außerhalb
  des Produkt-Diffs und werden nicht mit veröffentlicht.

## Belegte Beobachtungen

| QA-Aufnahme | Rohfixes | Nach GPS-Qualitätsprüfung | Linie / SQLite | Gespeicherte Distanz | Akzeptierte Winkel |
|---|---:|---:|---:|---:|---|
| qa-2b076716 | 443 | 432 | 56 / 56 | 97,42 m | rechts, spitz rechts |
| qa-86f5437a | 40 | 33 | 10 / 10 | 18,02 m | links |

`acceptedFixes` bezeichnet die Qualitätszulassung vor der Linienverdichtung;
es ist nicht die Anzahl persistierter Linienpunkte. Die Hintergrunddiagnose
meldet keine Genauigkeits-/Sprungverwerfungen und keine fehlgeschlagenen
Punkt-Writes. 377 beziehungsweise 24 `distance_gate`-Fälle sind Verdichtung,
keine pauschal verworfenen GPS-Fixes. Rohzeitlücken sind höchstens 2 bzw. 1 s.
Die Finish-Capture-Linien bewahren `breakBefore` und haben beide keine Grenze.
Der Export der persistierten `points` lässt diese Metadaten dagegen weg.

05 hat am 21.10.2026 um 10:46:18 UTC beide Remote-Sessions intern eindeutig
über denselben QA-Hash gefunden: 56/10 Legepunkte, 6/1 Marker, jeweils ein Run.
Die Zeitspannen entsprechen den lokalen Exporten. Dies beweist den späteren
Serverstand; weder einen früheren erfolgreichen Client-SELECT noch bereits die
geometrische Gleichheit der Koordinaten. Die eng begrenzte relative
Geometrie-/Continuity-Aggregatprüfung durch 05 ist noch offen.

Beim kleineren Versuch kam der erste als ausreichend genau protokollierte
Warmup-Fix nach rund 43,7 s. Der Geometriestart folgte dem Scharfschalten nach
8,4 s; beim größeren Versuch nach 12,4 s mit Bewegungs-Fallback. Die kleine
Ansatzannäherung meldete zeitweise über 80 m horizontale Unsicherheit und
bestätigte den Ansatz nach etwa 40 s. Die größere meldete am Ende der
Annäherung noch rund 20,7 m Abstand zum gespeicherten Ansatz und wurde nach
78 s manuell übersteuert. Diese Werte erklären die protokollierten Zustände,
beweisen aber keine physisch richtige Position oder tatsächliche Laufstrecke.

## Vergleiche und Grenzen

13 zentrale GPS-/Start-/Recorder-/Detektor-/Fusion-/Karten-Dateien sind zwischen
den aktuellen Store49- und TestFlight53-OTA-Quellen bytegleich. Die tatsächlich
eingebauten nativen Quellen sind separat verglichen: gleicher Core-Location-
Manager, Unterschiede im Motion-Modul und im nativen Karten-Child-Schutz.
Die Build-/Sourcezuordnungen stammen aus der zuvor geprüften MASTER-Evidenz;
02 hat dafür in diesem Incident keine frische EAS-Abfrage behauptet.

Zwei lokale Rohdaten-Replays vor/nach dem letzten P1-Glättungsfix liefern jeweils
dieselbe kanonische Distanz und dieselbe Linienpunktzahl. Motion wurde dabei
in beiden Varianten ausgeschaltet; deshalb kein vollständiger Live-Replay und
keine Simulation des GPS-Empfangs. Die größere Aufnahme weicht damit um rund
0,85 m vom Live-Wert ab; dies ist kein Datenverlustnachweis. Eine Rücknahme
dieses P1-Fixes bringt im geprüften Replay keine zusätzliche Distanz.

Zwei weitere Prüfungen reichen sämtliche 10/56 gespeicherten Punkte durch das
reale Detail-Kartenmodell bis zur Polyline-Geometrie. Zwei Komponentenprüfungen
übergeben dieselben 10/56 Koordinaten an die native Polyline-Schnittstelle.
Die native Kartenansicht selbst wurde dabei gemockt: kein nativer Render-PASS.

Ein weiterer GPS-Kandidat der großen Aufnahme wird von 0,617 durch schwache
Motion-Evidenz auf 0,589 abgesenkt und als `low_evidence` abgelehnt. Ob dort
physisch ein Winkel lag, ist unbestätigt. Keine Erkennungsschwelle gelockert und
keine Ecke aus fehlender Evidenz erfunden. Für den vollständigen Vergleich zur
Store-Version fehlt eine zeitlich vergleichbare Store-Feldaufnahme. Die
gemeldete schlechtere Nutzererfahrung bleibt ernst zu nehmende Feldmeldung.

## Isolierte lokale Schutzkorrektur

`getTrackSessionById` ignorierte Fehler der Punkt-, Marker- und Run-Abfragen.
Ein Timeout lieferte dadurch `{ data: erfolgreicheTeilsession, error: null }`
mit scheinbar leerer Spur/Marker-/Suchliste. Der Detail-Screen nutzte damit
seinen vorhandenen vollständigen SQLite-Fallback nicht.

Die drei kritischen Abfragefehler werden nun ausdrücklich als Fehler
zurückgegeben. Bestehende Aufrufer können lokal laden oder erneut versuchen;
ein fehlgeschlagener Lesezugriff wird nicht zu einer scheinbar leeren Aufnahme.
Erwartete leere Ergebnislisten und optionale alte Engine-Daten bleiben erlaubt.
Keine Änderungen an Aufnahme, Filtern, Schwellen, Sensoren, GPS-Quelle,
Distanz, Persistenz, Synchronisations-Writes oder Datenbank.

Vorher: drei gezielte Fehler-Reproduktionen scheiterten, weil der Service den
Fehler verschwieg. Nachher: 5 Suiten / 78 Tests bestanden, einschließlich
Detail-Laden, Vorschau, lokalem Detail, Kartenmodell und Recovery. Vier neue
Fälle im bestehenden Service-Test, darunter die optionale Engine-Verfügbarkeit.
Die sechs lokalen Incident-Experimente sind davon getrennt und überlappen
nicht mit diesen 78 Tests. TypeScript bestanden; ESLint 0 Fehler / 1 bereits
vorhandene Import-Warnung im Test; `git diff --check` bestanden.

## Offen und nächster Schritt

1. Relative Remote-Geometrie und Boundary-Metadaten durch 05 abgleichen.
2. Sichtbares Kartenbild gegenüber vollständiger JS-/Servergeometrie abgrenzen;
   nativen Render-/Mount-/Rückkehrpfad des tatsächlichen TestFlight-Builds prüfen.
3. Native Sensorqualitätsunterschiede anhand tatsächlicher Ereignisse prüfen;
   die vorhandenen QA-Felder enthalten nicht alle nativen Freshness-Metadaten.
4. Gewünschte Laufstrecke und sichtbare Live-/Nach-Speichern-Lücke aus der
   bereits gestellten Nutzerfrage zuordnen. Fehlende Antwort nicht erfinden.
5. Unabhängiger Review der kleinen Schutzkorrektur; Incident und Release-HOLD
   bleiben bis zur Quellen-/Ursachenklarheit offen. Kein Gesamt-Fix-/Feld-PASS.

Lokale Evidenz: `outputs/tracking-field-incident-02-2026-10-21/` im Chat-Projekt;
Original-Proof und nachfolgende Präzisierung als getrennte Versionen erhalten.


## Revision R2: Abschlussprüfung getrennt vom Geometrieladen

Stand: lokal umgesetzt und geprüft, unabhängiges Nachreview noch offen. Der
Feldincident und die Auslieferungssperre sind weiterhin offen.

01 hat R1 mit einem belegten P1 zurückgegeben: Ein erfolgreicher entfernter
Suchabschluss konnte bei gleichzeitig fehlerhafter Punkt-/Markerabfrage durch
`data:null` verloren gehen. Ein älterer eigener lokaler Pending-Stand wurde
anschließend als wieder fortsetzbar beurteilt. Die acht synthetischen
Assertions mit den tatsächlichen Service-/Recovery-Quellen sind als
R1-Evidenz erhalten; R1 wird nicht veröffentlicht.

R2 ergänzt eine kleine, gesonderte Abschlussabfrage über Parent und Suchläufe.
GPS-/Markerabfragen beeinflussen diese Abschlussinformation nicht. Der neue
`useTrackCompletion`-Hook bindet Ergebnisse an Konto, Hund, Session, Route und
Versuch. Sowohl Auswertung als auch Hundeprofil verwenden ihn. Sie unterscheiden
bestätigten Abschluss, bestätigten offenen bzw. remote fehlenden Datensatz,
Laden und unbekannten Abschluss. Unbekannt ergibt eine erneute Ladeoption,
keine historische Wiederaufnahme. Späte Antworten aus einer alten Auswahl oder
einem alten Konto werden verworfen.

Die Auswertung zeigt vorhandene eigene lokale Geometrie weiterhin an, auch
wenn remote nicht vollständig geladen werden kann. Der lokale Fallback wird
in diesem Aufrufer zusätzlich auf Session und Eigentümer begrenzt; dies ist
keine behauptete allgemeine Auth-Prüfung aller älteren lokalen Lesepfade.
Vorhandene aktive lokale Fährten-/Offline-Karten und Pending-Daten bleiben
unverändert. Bewusste Änderung: Bei unbekanntem Serverabschluss wird eine
historische Fährte aus dem Hundeprofil offline bis zur erneuten Prüfung nicht
wieder geöffnet. Ein nachweislich fehlender Remote-Datensatz erlaubt weiterhin
die bestehende lokale Recovery. Es werden keine Daten verändert oder entfernt.

Tests: 7 Suiten / 105 Tests bestanden, keine übersprungenen Tests und keine
Timeout-Erhöhung. Die beiden tatsächlichen React-Aufrufer werden gerendert,
der neue Hook und die bestehende Abschlusslogik werden dabei ausgeführt.
Abgedeckt: Punkt-/Markerfehler bei Remote-Abschluss, Parent-Run-Abschluss,
unbekannter Run-Read, Offline-Anzeige, erneutes Laden, bestätigte Abwesenheit,
bestätigte offene Fährte, fremder lokaler Eigentümer sowie späte Konto-/Routen-
und Auswahlantworten. Ein Profiltest bestätigt die weiterhin sichtbare aktive
Offline-Karte. Native Karten-/Geräteausführung bleibt ausdrücklich ungetestet.
Die früheren sechs Incident-Experimente und 78 R1-Tests sind eigene historische,
teilweise überlappende Prüfungen; Zahlen nicht addieren.

05s inzwischen eingefrorene Serverprüfung ist durch 02 anhand aller sieben
Dateihashes abgeglichen: Die große Fährte enthält 56 gültige verschiedene
Legepunkte, 21,692/53,743 m relative Ausdehnung und 100,708 m geordnete
Polylinienlänge, passend zu den gerundeten lokalen Exportmaßen. Die kleine
enthält zehn gültige verschiedene Positionen, aber zwei Anfangspunkte mit
gleichem Zeitstempel (lokal ebenfalls belegt, Abstand etwa 3,044 m). Deren
geordneter Geometrievergleich wurde deshalb zu Recht nicht behauptet. Beide
Remote-Boundary-Listen sind leer. Kein Nachweis des damaligen Client-Ladens,
keine authentifizierte Kunden-API-Abnahme, keine Datenbankänderung. Weitere
Kundenabfragen sind nicht beauftragt.

Aktuelle Produktänderungen: Detail-Screen, Hundeprofil-Panel, gemeinsamer
Abschluss-Hook und Track-Leseservice. Tests in drei Dateien, dieser Bericht.
Keine Änderungen am Recorder, an Filtern, Sensoren, Fusion oder Schwellen.
TypeScript-/Lint-/Whitespace-Abschlusswerte stehen im separaten R2-Freeze.
Kein Commit, Push, Merge, OTA, Build, Installieren oder Zurücksetzen.

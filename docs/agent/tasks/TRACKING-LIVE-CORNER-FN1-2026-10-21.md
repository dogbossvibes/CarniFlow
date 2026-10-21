# Live-Winkelerkennung: begrenzte GPS-Übergangsepisode

## Umfang und Abgrenzung

Eigener Folgeumfang auf `fix/tracking-field-incident-20261021`, Basis
`1b2dee534debac7409016c2b8584c1db2ed9a310`. Der bereits unabhängig geprüfte
Detail-Lade-/Recovery-Schutz in diesem Basiscommit bleibt unverändert.

Dieser Umfang korrigiert einen nachgewiesenen Ablehnungsmechanismus bei einer
kurzen GPS-Winkelepisode. Er erklärt weder sämtliche gemeldeten Feldprobleme
noch den Unterschied zwischen realem Store- und TestFlight-Verhalten.
Veröffentlichungsstopp bleibt bestehen; keine OTA oder neuer nativer Build.

## Befund und Reproduktion

Direkte Nutzerpräzisierung zum kleinen Feldlauf vom 21.10.: FN1 ohne
Gegenstände. Das vorhandene unabhängige Feldprofil verlangt rechts, danach
links. Der Export enthält nur den automatisch bestätigten Linkswinkel.

Ein Nachspiel mit dem echten Recorder-Kern reproduziert vor der Änderung nur
links. Die GPS-Geometrie besitzt passende Vorher-/Nachher-Schenkel und eine
unabhängige Rechtsdrehung im vorhandenen Motion-Kontext. Die alte
`monotoneTransition`-Regel verwirft jedoch bereits eine kurz zurückschwankende
Richtung der beiden Übergangssegmente. Diese Forderung ist strenger als eine
räumlich weiterhin vorwärts verlaufende Kurve.

Die neue synthetische Reproduktion enthält keine Kundendaten: nordwärts
gerichteter Schenkel, zwei kurze Übergangssegmente mit Richtungen 60° und 35°,
danach ostwärts gerichteter Schenkel. Mit passender Motion muss genau rechts
entstehen. Vor Produktänderung scheitert dieser Test mit null Winkeln statt
rechts. Spiegelung und negative Varianten stehen in derselben Testdatei.

## Änderung

Einzige Produktdatei: `features/tracking/utils/turnFusion.ts`.

Die beiden Übergangssegmente müssen innerhalb des gemessenen Drehsektors samt
der bereits bestehenden Randtoleranz bleiben. Eine kleine relative
Richtungsschwankung ist zugelassen; der Rücksprung bleibt auf die Summe der
beiden bestehenden Streuungstoleranzen begrenzt. Größere Richtungsumkehr wird
weiter abgelehnt, auch wenn beide Segmente innerhalb des Drehsektors liegen.

Unverändert sind insbesondere maximal zwei Übergangssegmente, die bestehende
2,5-m-Episodengrenze, GPS-Fenster, Mindestpunkte, Fit-/Streuungs-/Konzentrations-
und Confidence-Kriterien sowie die unabhängige gleichgerichtete
Motion-Bestätigung. Ein Bewegungssensor allein erzeugt keinen Winkel.
Linien-/Distanzberechnung, Aufnahme-Ownership, Persistenz, Search, Gegenstände,
Ende, native Module und Backend wurden nicht geändert.

Ein erster ausschließlich sektorbasierter Prototyp wurde verworfen: Er
bestand 397 Prüfungen, akzeptierte jedoch einen bestehenden Zickzack-Gegenfall
fälschlich. Dieser Gegenfall und seine ursprüngliche Assertion blieben
unverändert. Die zusätzliche Begrenzung des relativen Rücksprungs erhält
diesen Schutz. Eine bloße Erweiterung der Segmentzahl half im Feldnachspiel
nicht und wurde nicht übernommen.

## Tatsächlich ausgeführte Prüfungen

- Neue synthetische Positivreproduktion vor Produktänderung: erwartetes RED
  (null Winkel statt rechts; sieben andere Fälle damals nicht ausgewählt).
- Neue und bestehende Episoden-Gegenfälle nach Begrenzung: 2 Suiten, 18 Tests
  bestanden. Darin Rechts-/Linkssymmetrie, fehlende/widersprechende Motion,
  gerade Strecke mit Handydrehung, räumliche Grenze, Sektorüberschreitung,
  großer Rücksprung und fehlende Schenkel.
- Abschließend 17 gezielte Suiten / 400 Tests bestanden, null fehlgeschlagen
  oder übersprungen. Enthalten sind bestehende Feld-, Fusion-, Motion-,
  Drift-, Umkehr-, Stop-Flush-, Liniengate- und Recorder-/Runtime-Regressionen.
  Originalfristen, `runInBand`, kein Cache, keine gelockerten Assertions.
- Separates lokales Nachspiel des aktuellen FN1-Mitschnitts im echten
  Recorder-Kern: vorher nur links, nachher rechts und links. Beide Callbacks
  erfolgen nach synchroner Markerübernahme. Die kanonische Distanz bleibt
  in beiden Varianten exakt `18.024525799604927` m; jeweils zehn Linienpunkte.
  Der Test und sein lokales Quellenvergleichsmodul sind außerhalb des
  Produktdiffs archiviert und werden nicht eingecheckt.

Zahlen der verschiedenen Prüfläufe überlappen und werden nicht addiert.
TypeScript-/ESLint-/Diff-Ergebnisse sind im zugehörigen eingefrorenen
Prüfmanifest gebunden; keine daraus abgeleitete native Geräteabnahme.

## Aussagegrenzen und offene Arbeit

Das lokale Feldnachspiel verwendet nur die vorhandenen begrenzten,
vollständig erhaltenen Kontextfenster des kleinen Mitschnitts. Identische
überschneidende Beobachtungen werden zusammengeführt; gerundete relative
Koordinaten und Sensorwerte ersetzen keinen vollständigen nativen Rohstrom.
Kein Kundenmitschnitt, Standort oder Sensor-Rohdatensatz gehört zu diesem
Commitumfang.

Marker-/Callback-Nachweis ist kein Nachweis tatsächlich sichtbarer nativer
Marker, ausgelieferter Haptik oder hörbarer Sprache. Die vier vom Nutzer in
der größeren Fährte nachgetragenen Sollwinkel, das neue Video und die
historische fehlende Linienanzeige bleiben getrennte offene Prüfpfade.
Auch langsame GPS-Bereitschaft und Ansatzprobleme werden durch diesen
begrenzten Winkel-Fix nicht als erledigt erklärt.

Nächster Schritt: unabhängiges Quellenreview dieses getrennten Umfangs durch
Chat 01; weitere Feldanalyse durch Chat 02. Kein Commit dieses Folgeumfangs,
Push, Merge, OTA, Build, Geräteinstallation oder DB-Eingriff aus diesem Bericht.

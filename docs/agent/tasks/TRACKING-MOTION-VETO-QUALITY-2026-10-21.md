# GPS-Winkel: unzuverlässige Motion darf keine GPS-Ecke verwerfen

## Umfang

Isolierter Folgeumfang auf `fix/tracking-field-incident-20261021`, Basis
`12267514e735b520d1c51f436cb5f29adb33cb08`. Der unabhängig geprüfte
FN1-Übergangsschutz und der darunterliegende R2-Detail-Ladeschutz bleiben
erhalten. Einzige Produktänderung: `features/tracking/utils/turnFusion.ts`.
Keine Änderungen an GPS-Zulassung, Schwellen der GPS-Geometrie, Glättung,
Distanz, Persistenz, Search, Gegenständen, Ende, nativen Modulen oder Backend.

## Belegter Fehler

Die Split-Apex-Paarung liest neben der GPS-Geometrie eine Motion-Richtung.
Bisher konnte jede verfügbare Gegenrichtung die GPS-Paarung verwerfen, selbst
wenn `evidence=0` und kein verwertbares Bewegungsindiz vorlag. Gleichgerichtete
Motion durfte dagegen erst ab der bestehenden Qualität 0,5 bestätigen. Diese
Asymmetrie machte unzuverlässige Handyrotation zu einer harten Sperre.

Die vorhandenen begrenzten Kontextdaten am vom Nutzer eingezeichneten
Yam-Spitzlinkswinkel zeigen genau diesen Fall: gegenläufiges Geräte-Yaw,
aber Motion-Evidenz null. Das ist keine unabhängige Widerlegung der GPS-Ecke.
Ein neues synthetisches Beispiel mit GPS-Split-Apex scheitert vor Änderung
erwartungsgemäß: kein Winkel statt rechts. Es enthält keine Kundendaten.

## Korrektur und Grenzen

Eine Gegenrichtung darf erst ab derselben bereits für Bestätigung verwendeten
Motion-Qualität 0,5 sperren. Schwächere Motion bleibt neutral und erhält keinen
Confidence-Bonus. Die schwächere Zwei-Segment-Episode braucht weiterhin
zuverlässige gleichgerichtete Motion; GPS allein genügt dafür nicht.
Zuverlässiger Richtungswiderspruch bleibt eine Sperre. Motion allein erzeugt
weiter keinen GPS-Winkel. GPS-Kriterien werden nicht gelockert.

## Tatsächlich geprüfte Ergebnisse

- Synthetische Positivreproduktion vor Produktänderung: ein erwarteter Fehler,
  sieben damals nicht ausgewählte Fälle; unveränderte Produktquelle.
- Abschließend 18 gezielte Suiten / 409 Tests bestanden, null Fehler oder
  übersprungene Fälle. Neun neue Fälle prüfen schwache/starke Gegenrichtung,
  Links-/Rechtssymmetrie, fehlenden schwachen Bonus, gerade Strecke mit
  Handydrehung und weiterhin erforderliche Zwei-Segment-Bestätigung. Bestehende
  Feld-, Drift-, Umkehr-, Schärfe-, Episoden-, Recorder-/Runtime- und
  Liniengate-Gegenfälle bleiben unverändert.
- Zusätzlich zwei lokale, zeitlich geordnete Nachspiele mit echtem
  Recorder-Kern: Quiron bleibt rechts → links. Bei Yam entsteht zusätzlich
  spitz links; bisherige rechts und spitz rechts bleiben vollständig gleich
  einschließlich Position, Klassifikation, Confidence und Callbackzeit.
  Kein doppelter Winkel. Callbacks erfolgen nach synchroner Markerübernahme.
- Pro Variante bleiben kanonische Distanz, sämtliche Linien-/Detektorpunkte,
  abgeschlossene Spurabschnitte und Continuity-Zustand exakt gleich. Quiron:
  18,024525799604927 m / zehn Linienpunkte; Yam: 96,5732735885691 m / 56 Punkte.
  Diese nachgespielte Yam-Distanz ersetzt nicht die Feldanzeige 97,42 m:
  gerundete relative Eingaben und begrenzter Kontext sind kein Originalstrom.
- TypeScript, ESLint der beiden Code-/Testdateien und `git diff --check`
  bestanden. Original-Testfristen, ein Worker, kein Cache; keine gelockerten
  bestehenden Assertions. Prüfläufe überlappen und werden nicht addiert.

Das lokale Nachspiel nutzt ausschließlich tatsächlich erhaltene gerundete
Motion-Beobachtungen: Quiron 100, Yam 1.224 unterschiedliche Samples.
Identische Überschneidungen werden zusammengeführt; Konflikte null. Die bei
Yam nicht mitgeschnittenen früheren Fenster werden nicht ergänzt. Ringpuffer
und vorhandener Evidenzcache werden durch den tatsächlichen Processor
verwendet. Testeingaben und Nachspielhilfen bleiben außerhalb des Commits.

## App Store gegenüber TestFlight

Die Nutzerbeobachtung „App Store funktioniert, neuer TestFlight-Stand schlechter“
bleibt maßgeblich. Das App-Store-Bild identifiziert Version 1.0.4, aber nicht
die damals tatsächlich laufende OTA oder den Modus. Native Buildquellen 49/53
unterscheiden sich insbesondere bei Motion; die ausgewählten aktuellen
OTA-JavaScript-Pfade sind bytegleich. Keine dieser Quellenaussagen widerlegt
die Beobachtung oder beweist allein die gesamte Ursache.

Der zusätzliche lokale Buildquellenvergleich bindet Konfiguration,
GPS-/Motion-Swiftquellen, kritische Lockfile-Versionen und frische von Chat 01
gelesene EAS-Metadaten. Er ersetzt keine Prüfung beider signierter Binaries
oder desselben Feldlaufs. Ein pauschaler nativer Rollback ist nicht abgeleitet.

## Offen und Übergabe

Unabhängiges Quellenreview dieses Umfangs durch Chat 01 steht aus.
Die beiden unteren vom Nutzer markierten Yam-Winkel haben einen getrennt
nachgestellten Dichte-/Fensterfehler und bleiben offen. Auch der obere
Rechtswinkel, die physische Anzeige/Haptik/Sprache, langsame GPS-Bereitschaft,
Ansatzerkennung und historische Linienanzeige sind nicht pauschal erledigt.
Kein Gesamtincident-PASS aus diesem begrenzten Ergebnis.

Incident-HOLD gilt unverändert: keine Integration, OTA, nativer Build,
TestFlight-/Store-Veröffentlichung, Installation oder DB-Aktion. Nach Review
nur isolierte Quellensicherung gemäß bestehender Humananweisung; Push allein
koordiniert durch Chat 00. Messdaten, Hilfen und Outputs nicht einchecken.

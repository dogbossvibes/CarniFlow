# Build 59: Inhaltsabgleich vom 04.11.2026

## Geprüfte Quelle und Grenze

TestFlight 1.0.7 (59), Expo SDK58, Buildquelle
`00376126dbcf537d8a96131a1e6aed548dba8a02`, Runtime
`sdk58-customer-ios-v1`. Diese Bestandsaufnahme ist kein vollständiger
Funktionskatalog. Sie korrigiert die zu weitgehende frühere Aussage, sämtliche
freigegebenen Verbesserungen seien enthalten. Keine Produktänderung und keine
Veröffentlichung aus diesem Inhaltsabgleich.

## Nachweislich nicht übernommen

Das Paket `d67773bec61fcc4999496db1095daf5da07776d2` wurde am 24.10.2026
für iOS55/Runtime `1.0.5-motion-v4` veröffentlicht (OTA-Group
`b00124eb-f81e-443b-a137-efb09c35a36a`). Der lokale historische Abschlussbeleg
liegt unter `outputs/ios55-training-hub-release-01-20261024/FINAL-RELEASE-RESULT.json`
im ANYVO-Projektarbeitsbereich; Quelländerungen und Freigabe sind außerdem in
`docs/agent/tasks/TRAINING-HUB-DESIGN-2026-10-24.md` dieses Commits dokumentiert.

- Kompakter Trainingseinstieg ohne großes Hero-Foto.
- Größerer Timer-Aufruf und hervorgehobene Fährtenkarte.
- Überarbeitetes Apportierholz-SVG mit breiten Holzenden.
- Zugehörige Trainingshinweise und Bezeichnungen in fünf Sprachdateien.

`app/(tabs)/training.tsx` und `components/ui/ApportierholzIcon.tsx` in Build59
sind bytegleich mit dem Stand VOR diesem Paket. Die Trainingsdatei entspricht
noch `a87aad32` vom 04.08.2026. SHA256 der Build59-Trainingsdatei:
`86bb46691d6badf30dbba8048296ae4eca430922974e04e70d0b404a18f1bdb4`;
kompakte Fassung:
`a8548489610a9f4b6966c5f8f35e36469c73be6859088a9c1ffcbe28c0d36500`.
Im deutschen Build59-Sprachstand fehlt `training.timerHint`; die Fährtenkarte
heißt weiterhin `Fährte (GPS)`. Der Screenshot passt damit zur Buildquelle;
er belegt keinen Cache- oder fehlgeschlagenen Installationsfehler.

## Enthalten beziehungsweise getrennt zu behandeln

- SDK58, OTA-Aktivierung und die native Kundenkonfiguration sind nachgewiesen.
- Die gezielten T174-/T177-/T178-Übernahmen haben eigene gebundene Prüfnachweise
  in den bisherigen SDK58-Abschlussberichten. Das belegt diese Pakete, keine
  darüber hinausgehende Gesamtinventur.
- Die geführte Trainingsdokumentation ist im Quellstand vorhanden: drei Schritte
  `prepare`, `observe`, `next` in `app/unit/document.tsx`. Der alte Einstieg
  bedeutet daher nicht, dass sämtliche Trainingsverbesserungen fehlen.
- Die später separat beauftragte Korrektur der roten/gläsernen Trainingskarten
  ist kein Bestandteil des ursprünglichen Build59-Bundles. Ihre Umsetzung und
  mögliche OTA-Auslieferung werden von 07/Werkstatt/01 separat nachgewiesen.

## Noch offen

Vorrangige Nutzerentscheidung: Das Fährtensystem von SDK58-Build58 bleibt
erhalten. 714 Dateien der in `RELEASE_COMPLETENESS.md` genannten Bereiche sind
zwischen erfolgreicher Build58-Quelle `6722b88f` und Build59-Quelle `00376126`
identisch. Abweichende ältere Trackingstände sind daher keine automatisch
nachzuholenden UI-Pakete. Ein gesamter alter Branch darf nicht integriert werden.

Eine vollständige, plattformbezogene Inventur aller freigegebenen und zuvor
ausgelieferten Pakete samt Übernahmebelegen für SDK58 fehlt. Weitere Auslassungen
sind deshalb weder ausgeschlossen noch pauschal bewiesen. Android bleibt bis
zur iPhone-Abnahme zurückgestellt. Tatsächlicher OTA-Empfang und native
Live-Activity-Geräteabnahme sind separate offene Geräteprüfungen.

Vor einem Gesamtfreigabe-PASS ist die Inventur nach
[RELEASE_COMPLETENESS.md](RELEASE_COMPLETENESS.md) abzuschließen. Die fehlenden
Trainingsänderungen betreffen JS/SVG/Sprachdateien; ihre Übernahme kann nach
Integration, Prüfung und unverändertem nativen Kompatibilitätsnachweis
grundsätzlich OTA-fähig sein. Dieser Befund allein erteilt keine OTA-Freigabe.

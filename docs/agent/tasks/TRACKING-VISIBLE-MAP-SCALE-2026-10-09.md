# Sichtbarer Kartenmaßstab und Fährtenmarkierungen — 2026-10-09

## Auftrag und Ownership
Nutzer: „Kartenmaßstab plus Markierungen auf der Fährte“, beim Legen und Absuchen.
02 ist einziger Implementierungs-Writer im isolierten Worktree `anyvo-tracking-visible-map-scale`, Branch `fix/tracking-visible-map-scale`, Basis/HEAD `fe68e1290161f12838bde6480d7868147b295995`. Keine fremden/globalen Statusdateien geändert. 01 bleibt Integrator/Committer/Publisher; C1 und Kalibrierung sind separate, weiterhin gesperrte Pakete.

## Belegte Ursache
Die bisherige OTA vom 08.10. stellte den Mount-/Layoutpfad des Linienmaßstabs wieder her. `run.tsx` übergab die Referenzlinie; `legen.tsx` tat dies nicht. Ein eigener, plattformübergreifender Kartenrandmaßstab fehlte. Bei großem Ausschnitt blendete die Dichtesteuerung die Linienmarkierungen vollständig aus; die dunklen Querstriche waren auf Luftbildern schwach sichtbar. Keine neue Geräte-Reproduktion behauptet.

## Umsetzung
- Beide aktiven Karten bekommen einen kontrastreichen metrischen Maßstabsbalken links unten oberhalb ihrer Metrikleiste. 1/2/5-Abstufung in m/km; Karte statt GPS-Accuracy ist seine Grundlage.
- `coordinateForPoint` liest zwei Punkte an der tatsächlichen Balkenposition. Eine dritte Projektion prüft die gewählte gerundete Breite (3 % Darstellungsabweichung); ungültige/unverfügbare Projektion zeigt einen neutralen Wartezustand statt einer erfundenen Distanz. Keine Behauptung einer GPS-Messgenauigkeit.
- RN-Layoutpunkte auf beiden Plattformen; Android-native maps1.20.1 konvertiert intern mit density, daher kein zusätzliches PixelRatio. Rotation/Neigung und Breitengrad gehen über den nativen Projektor ein.
- Generation-Invalidierung bei Bewegung, Layoutwechsel, Background und Unmount schützt vor verspäteten Ergebnissen. Nach fertigem Regionswechsel 80-ms-Verzögerung; höchstens zwei zusätzliche Versuche bei Projektionsfehlern, keine Endlosschleife. Resume aktualisiert neu.
- Legen übergibt seine aufgezeichnete Linie inklusive `breakBefore`. Search verwendet weiterhin unverändert `snapData.laidPoints`. Meterwerte akkumulieren nur gemessene Abschnitte; Tangenten und Querstriche interpolieren nicht über Lücken. Keine neue Recorder-/Continuity-Semantik.
- Querstriche weiß mit dunkler Kontur; Zahlen 12 pt statt9.5. Bestehende Dichte-/Sichtbarkeitsgrenzen bleiben (max180 geometrische Ticks, je2Polylines für Kontur; max30Labels). Übersicht darf kleine Ticks ausblenden, Kartenbalken bleibt unabhängig davon.
- Unterer Overlay-Stack dynamisch: Metriken →8pt→ Maßstab →8pt→ bestehende Fortschritts-/Teilstreckenkarten. Metrik- und Balkenhöhe werden tatsächlich gemessen. Skizzenansicht reserviert keinen Maßstab. Keine scheinmetrische Skizzenanzeige.
- Fünf bestehende Sprachdateien ergänzt; de-DE erbt vorhandenen deutschen Basiskatalog.

## Review und Prüfungen
07 identifizierte zunächst eine P2-Überdeckung: Fortschrittsgruppe und Lay-Teilstreckenkarte lagen bei festem bottom88 über dem neuen Balken. 02 korrigierte beide durch den gemeinsamen dynamischen Stack. Gezielter unabhängiger Recheck angefordert; Ergebnis im zugehörigen Freeze-Beleg.

Lokal: 6 Suiten /87 Tests PASS; zusätzlich überlappende Android-Mocks4/54 PASS. Vollständiger Typecheck PASS. ESLint0Fehler/9Warnungen; alle9 gegen dieselben HEAD-Dateien als vorbestehend geprüft. `git diff --check` PASS. Tests decken Projektion/Datumsgrenze/Breitengrad/ungültige Werte, begrenzte Retries, späte Ergebnisse, Background/Resume/Unmount, Dichte, Lücken/Fractionaldistanzen, Marker-/Hundefarb-Overlay-Erhalt und unteren Stack ab. Native Tests werden durch diese synthetischen Tests nicht ersetzt.

## Grenzen / Release
Keine native Abhängigkeit, Permission, Konfiguration, SQL, Recorder-/Fusions-/Winkel-/Score-/Speicheränderung. Kein eigener Commit, Push, Merge, OTA, Build oder Store-Schritt. Plattform-Baselines müssen durch01 frisch gegen EAS geprüft und separat integriert/gebündelt werden; bloße Patch-Anwendbarkeit ist kein Release-PASS.

Offen: installierte native MapKit/GoogleMaps-Prüfung bei SmartFollow, Pitch/Rotation/Zoom, großer Schrift und Screenreader; reale Kartenprojektion, Bedienbarkeit, dicht belegte kleine Karten und Performance langer Fährten. Kein Geräte-/Feld-PASS behauptet. Andere ausstehende Pakete nicht mit dieser UI-Korrektur veröffentlichen oder deren Gates umgehen.

## Quellen
- Expo SDK54: https://docs.expo.dev/versions/v54.0.0/sdk/map-view/
- maps1.20.1: https://github.com/react-native-maps/react-native-maps/blob/v1.20.1/docs/mapview.md (coordinateForPoint, Region-Events, showsScale nurAppleMaps)
- Installierte Version1.20.1: `lib/MapView.js`, `android/src/main/java/com/rnmaps/maps/MapModule.java:233`.

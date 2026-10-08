# Tracking: ehrliche Vorschau, Wiederaufnahme im Hundeprofil und Hundefarbe

Stand: 2026-10-08 · Chat 02 · lokaler Implementierungs-/Prüfbericht.

## Auftrag und Arbeitsplatz

Nutzer: tatsächliche letzte Fährte unter Training → Fährte GPS ansprechend und
wahrheitsgemäß zeigen; Wiederaufnahme wieder im Hundeprofil zugänglich machen;
Fährtenfarbe im Hundeprofil wählen und in Meine Hunde sowie Karten/Layern nutzen;
offene Ideen aus IGPTrack/TrackMaster einordnen.

- Worktree: `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-preview-recovery-colors`
- Branch: `feat/tracking-preview-recovery-colors`
- Basis: `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`; vor eigener Arbeit sauber.
- Eigener Worktree, keine fremden Dateien überschrieben. Shared main und globale
  Statusdateien unangetastet. Vorhandene main-Dependencies nur für Prüfungen lesend
  eingebunden; keine Installation/Lockfileänderung.
- Sauberer Commit autorisiert durch direkte Nutzerfreigabe im MASTER, Turn
  `01a11bfe-33dc-78b1-b572-4dade9512e46`. Chat 01 ist alleiniger OTA-Publisher.
- Frühere separate Übergaben: Export/Tempo/Design C `469c5af1345c81607febb7a8f58096fd1d4ce04d`,
  Shelly-Hilfe `53ecb207c5c452a3dc542ae43b379b0a2897f5b9`. Nicht Teil dieses Diffs.

## Belegte Ursachen und Umsetzung

### Letzte Fährte / Skizze

`TrackSketch` zeichnete ohne GPS eine feste, aus Winkel-/Gegenstandszahlen gebildete
Ersatzgeometrie. Schon 0 Winkel erzeugten eine schräge Linie; zusätzliche Punkte
stellten keine tatsächlich gespeicherten Gegenstände dar. Die Übersicht lud die
letzte Geometrie nur remote; lokale, noch nicht synchronisierte Fährten erhielten
somit diese Ersatzzeichnung. Die Kennzahlen lagen als absolutes Overlay auf der Spur.

Jetzt zeichnet die gemeinsame Skizzenkomponente ausschließlich übergebene, gültige
GPS-Positionen und echte Marker. Ohne Punkte: neutraler Platzhalter/Hinweis; eine
Position: ein Punkt, keine erfundene Strecke. Projektion nordorientiert und
seitenverhältnistreu, über die Datumsgrenze stabil. Ungültige Punkte und explizit
übergebene Unterbrechungen verbinden keine Linien. Keine neue automatische
Zeitlücken-/Distanz-/Continuity-Regel.

Die letzte Fährte lädt eine zu Nutzer, Hund und Session gehörende lokale Geometrie
auch vor der Synchronisation/offline. Verfügbare Remote-Geometrie bleibt vorrangig;
fehlende Remote-Punkte können durch die eigene lokale Session ergänzt werden.
Keine Mischung fremder Sessions oder nachträgliche Distanz-/Scoreberechnung.
Kartenkopf, Skizze, Quellenhinweis und Kennzahlen sind eigene Layoutbereiche.
Lange Titel können umbrechen; die Spur liegt nicht hinter Statistikfeldern.
Tap öffnet die bestehende Detailkarte/Auswertung. Die letzte Verlaufskachel nutzt
bereits geladene Punkte; andere Kacheln ohne Punktdaten behaupten keine Geometrie.
Unbekannte Winkel-/Gegenstandszahlen werden nicht mehr in erfundene Nullwerte verwandelt.
Verspätete Ladeantworten werden bei Hund-, Nutzer- oder Fokuswechsel verworfen.

### Wiederaufnahme im Hundeprofil

Die bestehende Recovery-Engine war vorhanden. Das Hundeprofil zeigte jedoch primär
einen Registry-Eintrag weit unten; ein ausdrücklicher Abbruch entfernt genau diesen
Eintrag. Das lokale Wiederöffnen blieb dadurch praktisch nur in der Auswertung auffindbar.

Neuer Bereich **Fährten & Fortsetzen** direkt unter der Hundeidentität:
aktive Fährte wie bisher öffnen; zusätzlich eigene lokal gespeicherte Fährten ohne
lokalen Suchabschluss auswählen, einschließlich ausdrücklicher Abbrüche. Ältere
Kandidaten bleiben über eine kompakte Auswahl erreichbar. Die existierende
`TrackResumeCta` und Recovery-Engine entscheiden erneut vor jeder Aktion; Session-ID,
Hund, Legepunkte, Marker und vorhandene Suchzustände bleiben erhalten. Kein neuer
Quota-Claim und keine neue Session. Bekannte finale Remote-Suchläufe werden gesperrt.
Offline gelten wie bisher die verfügbaren lokalen Belege; kein erfundener Cloud-Abgleich.

Account-ID wird bei Profilaktionen in die bestehenden Recovery-Prüfungen gereicht;
Verwerfen/Abschließen prüfen ebenfalls die lokale Eigentümerschaft. Doppeltippen,
Speicherfehler, alte Bestätigungsdialoge und verspätete Navigation nach Unmount sind
abgesichert. Nicht sicher fortsetzbare Zustände werden im Profil verständlich erklärt.

**Unveränderte Grenzen:** Die Wiederaufnahme setzt verwertbare gespeicherte Daten
voraus. Unterbrochenes LEGEN lässt sich vom bestehenden Recorder nach vollständigem
Prozessverlust nicht allgemein rekonstruieren (`laying_not_supported`). Auch eine
Absuche wird nicht aus unvollständigen SQLite-Punkten neu erfunden. Endgültige
Suchabschlüsse und „Ohne App abgeschlossen“ werden nicht automatisch wieder geöffnet.
Das ist die Wiederherstellung des bestehenden Zugangs, keine neue universelle
Continuity-/Recorder-Recovery-Semantik. Gelöschte oder nie gespeicherte Daten bleiben
nicht wiederherstellbar.

### Hundefarbe

Der vorhandene semantische Schlüssel `dogs.track_overlay_color_key` bleibt die
serverseitige Quelle. Keine neue Tabelle, Spalte, Policy oder native Abhängigkeit.
Auswahl im Hundeprofil direkt aufklappbar; zusätzlich vorhandene Bearbeitungsseite.
Bestehende Palette plus Automatisch, Haken/Radiozustand und mindestens 44/48-pt-Ziele.
Ein Save schreibt nur das Farbfeld. Bei Fehlern kein vorgetäuschter Erfolg. Alte
Serverstände ohne Feld zeigen eine deaktivierte Auswahl mit Erklärung.

Senkrechter Farbstreifen in **Meine Hunde**, zugehörige gelegte Linie und Startmarker
in Lege-/Such-/Detailkarten, Skizzen sowie Replay. Vorhandene andere Fährten bleiben
jeweils an die Farbe ihres eigenen Hundes gebunden; Namen/Legende bleiben sichtbar.
Suchspur und Analyse-/Segmentfarben behalten ihre Bedeutung. Farbe ist eine
Zuordnung zur Session des Hundes, kein Beleg für einen Empfänger am Hund.
Bestätigte Farben werden minimal nach Nutzer/Hund in AsyncStorage zwischengespeichert
und bei Fokus aus dem vorhandenen Hundeprofil aktualisiert; offline bleibt die zuletzt
bestätigte Farbe erhalten. Keine GPS-Fix-getriebenen Netzwerkanfragen.

**Production-Schema read-only bestätigt durch Chat 05:** 2026-10-08, Turn
`01a11c57-325c-7582-956a-7590669767ba`. `text`, nullable, kein Default;
Constraint **`dogs_track_overlay_color_key_chk`** validiert; erlaubt NULL und
orange/violet/pink/yellow/blue/cyan/lime, entsprechend vorhandener Migration
`20261005120000_dogs_track_overlay_color_key.sql`.
[Live-Prüfabfrage](https://supabase.com/dashboard/project/axkkhyqrjrtbkumaulta/sql/53314bca-97f5-4dd7-96e8-4dd01e288f8b).
Keine Schema- oder Datenänderung durch diese Prüfung. Keine neue Migration erforderlich.

## Prüfungen

- Vollständiges `tsc --noEmit --incremental false`: **PASS**, einschließlich finalem
  Erklärungstext und zugehöriger Regression. Keine TypeScript-Diagnosen.
- ESLint kompletter Änderungsscope: 0 Fehler, 10 vorhandene Warnungen (Edit-/Lege-/
  Run-Screen, vorhandener Replaytest und Map-Disable). Finale Wiederholung ebenfalls PASS.
- 24 verschiedene relevante Suites in sechs seriellen Gruppen: **230 Tests PASS**.
  Gruppen: 37 / 88 / 20 / 31 / 29 / 25 Tests, je vier Suites, keine Überschneidung.
- Danach letzter verständlicher Nicht-verfügbar-Hinweis: **2 Suites / 35 Tests PASS**,
  einschließlich einer zusätzlichen Regression. Diese Zahlen überlappen mit obigen Tests.
- Ein großer gemeinsamer Lauf endete nach fünf bestandenen Suites mit Node-SIGSEGV
  (Prozesscode -11), ohne gemeldete fehlgeschlagene Testassertion. Kein PASS für diesen
  abgebrochenen Sammellauf; alle vorgesehenen Suites danach in kleinen Prozessen geprüft.
- Reale `TrackSketch`-Komponente als SVG gerendert und PNG visuell geprüft: keine
  GPS-Punkte, Einzelposition und gespeicherte Beispielgeometrie mit echten Markern.
  QA-Artefakt `/private/tmp/anyvo-preview-sketch-qa.png`; Beispielwerte, keine Geräteaufnahme.
- UI-Renderer prüft getrennten Statistikbereich, fehlende/lokale Geometrie, Hundwechsel,
  Profil-Recovery, fehlerhafte Farbsaves und deaktivierte Auswahl ohne Schemafeld.
- GPS-Tests: Datumsgrenze, Nordausrichtung/Seitenverhältnis, ungültige Punkte, explizite
  Lücken, Einzelpunkt und 150.000 Punkte ohne Spread-Stacküberlauf.
- Recovery-Tests: Neustart/Abbruch, ursprüngliche IDs, keine Quota-/Sessionduplikate,
  Finalabschluss, Account-/Hundgrenzen, Doppeltippen, Unmount und alter Bestätigungsdialog.
- Bestehende Referenzlayer, Maßstab, Replay-/Suchpfad und Farbpalette: Regressionen PASS.
- `git diff --check`: PASS; vor Commit erneut prüfen.

Keine echte iOS-/Android-Geräteabnahme behauptet. Offene Geräteprüfung: Nutzerpfad
Training → Fährte GPS, Offline-Aufnahme → Übersicht, lange Namen/große Schrift,
Hundeprofil → Wiederöffnen/Fortsetzen, Farbwahl → Rückkehr in Legen/Layer/Replay,
VoiceOver/TalkBack, Appwechsel. Hintergrund-/Build49-Feldabnahme bleibt unabhängig OPEN.

## Integration und OTA

Shared JS/TS, vorhandene Bibliotheken und vorhandenes Production-Farbfeld: kein
neues Binary allein für diesen Scope erforderlich. Keine Expo-Konfigurations-,
Runtime-, Permission-, Dependency-, native oder Backendänderung im Diff.

An Chat 01 als separater Commit übergeben. Dort auf tatsächliche aktuelle iOS- und
Android-OTA-Basen übertragen; Health und Export C erhalten, insbesondere bei
`DogHubScreen.tsx`, `app/dog/[id].tsx`, `app/track/[id].tsx`, Replay und Sprachdateien.
Gemeinsamer finaler Integrationscheck/Bundles/Runtimeprüfung vor Veröffentlichung.
Kein Publish von dieser älteren main-Basis; dieser Worktree ist kein Release-Kandidat.
Keine Integration, kein Push, keine OTA, kein nativer Build oder Store-Schritt hier.

## Offene Ideen aus den zwei anderen Apps

Nein, nicht alles wurde umgesetzt. Status unterscheidet vorhandene ANYVO-Funktion,
implementierten Kandidaten und noch offene Produkt-/Hardwarearbeit:

| Bereich | Belegter Stand / verbleibender Umfang |
| --- | --- |
| Enderkennung / Gegenstandsübergänge | Phase 1 separat veröffentlicht; Geräte-/Background-Abnahme weiterhin offen. |
| GPS-/Satellitenqualität | Erhaltung vorhandener JS-Qualitätsfelder und Diagnose separat ausgeliefert; zusätzliche Android-native Felder benötigen passendes Binary. Keine erfundenen Satellitenwerte. |
| Replay / Heatmap / Tempo / Export | Replay/Analyse vorhanden; individuelle Tempoauswertung und PDF Design C/GPX/JSON in separatem Commit469c5af an01. Keine Gleichsetzung des ANYVO-Scores mit DTW. |
| Gegenstandskorrekturen | Bestehende manuelle Bewertung/Auto-Erkennungskorrekturen sind kein vollständiger, nachvollziehbarer Änderungsverlauf mit Neuberechnung und geräteübergreifender Historie. Weiter offen. |
| Verleitungsfährten | Vorhandene Plan-/Teilstreckenmerkmale ersetzen keine getrennt aufgenommenen Kreuzungslinien mit eigenen Wetterdaten. Offen. |
| Shelly | Interne Vordergrunddiagnose und separate Hilfe; produktive Marker-/Winkel-/Endsteuerung, Firmware-/Hardware- und Sperrbildschirmnachweis offen. |
| Apple Watch / Wear OS / Siri | Vollständige Steuerung vom Handgelenk und zusätzliche Sprach-/Systemaktionen bleiben eigener nativer Ausbau. |
| Konkrete externe GNSS-Geräte | Quellen-/NMEA-/BLE-Grundlagen sind keine bestätigte Garmin-GLO-2-/Columbus-P-7-Pro-Abnahme. Geräteintegration und reale Hundeposition offen. |
| Live-Share | Anonyme Sitzung mit automatischer 2-h-Löschung noch kein fertig belegter ANYVO-Produktumfang. Backend-/Datenschutzkonzept und Umsetzung offen. |
| Planer / Vorlagen | Vorhandene Fährtenparameter sind kein vollständiger Kartenplaner mit getrennten Plan-/Lege-/Suchlayern und wiederverwendbaren Vorlagen. Offen. |
| Teilen / Backup / iCloud / .tmigp | Fährtenexport über Systemteilen ist nicht vollständiges Hunde-/Vorlagenbackup, iCloud-Sync ohne Account oder .tmigp-Interoperabilität. Nicht pauschal als umgesetzt darstellen. ANYVO-Accountarchitektur erhalten. |
| Trainingsgruppen | Vorhandene Hunde-/Trainerverwaltung ist nicht die vollständige gemeinsame Fährten-/Statistikverwaltung für Vereine. Produktscope offen. |
| Continuity | Universelles Fortsetzen nach Recorderverlust sowie neue Lücken-/Segment-/Recovery-Regeln weiterhin separate Entscheidungen. Dieser Auftrag aktiviert vorhandene sichere Recoverywege. |

Priorität bleibt Zuverlässigkeit des vorhandenen Trackings und Auswertung/Export.
Weitere Fremd-App-Funktionen nicht ohne passende Architektur-/Produktentscheidung
als automatische Folge dieses UI-Auftrags implementieren oder als fertig melden.

## Dateien dieses Scopes

- `app/(tabs)/dogs.tsx`
- `app/__tests__/edit-dog-track-color.test.tsx`
- `app/dog/[id].tsx`
- `app/edit-dog.tsx`
- `app/track/[id].tsx`
- `app/track/__tests__/overview-preview.test.tsx`
- `app/track/historie.tsx`
- `app/track/index.tsx`
- `app/track/legen.tsx`
- `app/track/replay/[id].tsx`
- `app/track/replay/__tests__/replay-screen.test.tsx`
- `app/track/run.tsx`
- `components/dogs/DogCompactCard.tsx`
- `features/dogs/DogHubScreen.tsx`
- `features/tracking/components/DogTrackingPanel.tsx`
- `features/tracking/components/FaehrtenChrome.tsx`
- `features/tracking/components/TrackReplayMap.tsx`
- `features/tracking/components/TrackResumeCta.tsx`
- `features/tracking/components/TrackSketch.tsx`
- `features/tracking/components/TrackingMap.tsx`
- `features/tracking/components/__tests__/DogTrackingPanel.test.tsx`
- `features/tracking/components/__tests__/TrackReplayMap.test.tsx`
- `features/tracking/components/__tests__/TrackResumeCta.test.tsx`
- `features/tracking/components/__tests__/TrackSketch.test.tsx`
- `features/tracking/components/__tests__/TrackingMap.referenceOverlays.test.tsx`
- `features/tracking/hooks/__tests__/useDogTrackColor.test.tsx`
- `features/tracking/hooks/useDogTrackColor.ts`
- `features/tracking/services/__tests__/dogTrackRecoveryService.test.ts`
- `features/tracking/services/__tests__/openTrackContinuation.test.ts`
- `features/tracking/services/__tests__/trackPreviewService.test.ts`
- `features/tracking/services/dogTrackRecoveryService.ts`
- `features/tracking/services/trackPreviewService.ts`
- `features/tracking/services/trackRecoveryService.ts`
- `features/tracking/utils/__tests__/trackSketchGeometry.test.ts`
- `features/tracking/utils/trackSketchGeometry.ts`
- `hooks/__tests__/useDogs.identity.test.tsx`
- `hooks/useDogs.ts`
- `i18n/de-CH.ts`
- `i18n/gsw-CH.ts`
- `i18n/locales/en.ts`
- `i18n/locales/fr.ts`
- `i18n/locales/it.ts`

Zusätzlich dieser Bericht.

## Abschlussübergabe

Alle oben genannten Codeänderungen geprüft und für einen separaten Commit vorbereitet.
Production-Farbschema bestätigt; kein offener DB-Voraussetzungsblocker für diesen Scope.
Finaler integrierter Bundle-/OTA-Preflight bei Chat 01 bleibt erforderlich.
Geräte-QA bleibt OPEN; lokale Prüfungen sind keine Geräteabnahme.

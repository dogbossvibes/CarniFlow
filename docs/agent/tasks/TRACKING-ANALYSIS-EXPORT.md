# Tracking: Auswertung und Export — erste Ausbaustufe

Stand: 2026-10-08. Zuständig: Chat 02 / `01a117fa-855c-7071-a85d-b4202d6711f6`.

## Auftrag und tatsächlicher Stand

Nutzerpriorität: **Auswertung und Export zuerst**. PDF/GPX/JSON-Export und die erweiterte Tempoansicht sind lokal implementiert und geprüft. Gegenstandskorrekturen sind noch NICHT implementiert: Die separate Nutzerfrage „geräteübergreifende Korrekturhistorie oder zunächst nur lokal“ bleibt unbeantwortet. Keine Zustimmung aus Schweigen abgeleitet. Die unten belegten Zuordnungsprobleme müssen Teil dieser Umsetzung werden.

- Worktree: `/Users/moyo/canisflow-worktrees/anyvo-feature-tracking-analysis-export`
- Branch: `feat/tracking-analysis-export`
- Basis und unveränderter HEAD: `1a574212f6b7c1827bc03048f2eb5b5d662cd7a1`
- Vor Erstellung sauber. Änderungen dieses Auftrags uncommitted.
- Kein Staging, Commit, Push, Merge, OTA, nativer Build, Store-Schritt oder Production-DB-Write.
- main nicht beschrieben; zuletzt gleicher HEAD, fünf bestehende Koordinations-WIPs und der fremde neue `TRACKING-DIAGNOSTICS-AUDIT-2026-10-08.md` erhalten.
- App-Worktree-Tool war im ChatGPT-Projektmirror nicht verwendbar („Not a git repository“). Eigener Git-Worktree nach Prüfung der tatsächlichen Repository-Wurzeln erstellt; normale isolierte npm-Installation mit `--ignore-scripts` (keine Änderungen an main-Dependencies).

## Implementiertes Verhalten

### Lokale Exporte in der bestehenden Auswertung

`app/track/[id].tsx` zeigt vor den Notizen die Exportkarte mit PDF, GPX und JSON. Notizen werden nur nach aktivierter Option übernommen. Grundlage ist der bereits geladene, gespeicherte Datensatz; ungespeicherter Notiztext ist kein Bestandteil des Exports.

- **PDF:** A4-Bericht mit Datum, vorhandenem Hundenamen, gelegter Strecke und aufgezeichneter Absuche, Dauer, gespeicherter Gegenstandsanzahl, vorhandenem Analyse-Score/Datengrundlage, schematischer Vektorkarte, markierten Gegenständen, Wetter und optionalen Notizen. Lange Texte umbrechen und paginieren; keine Kartenkachel-Abhängigkeit. Kein erfundener Score bei fehlenden Analysen.
- **GPX 1.1:** Gelegte Fährte und kanonisch gespeicherte Absuche als getrennte Tracks, Gegenstände/Marker als Wegpunkte. Vorhandene gültige Zeitstempel bleiben erhalten; alte zeitlose Punkte erhalten keine erfundenen Zeiten. Ungültige Koordinaten trennen Exportsegmente. Das ist ausschließlich defensive Serialisierung, keine neue Tracking-Continuity-Regel.
- **JSON:** Versionierter `anyvo-track`-Datensatz (`version: 1`) mit expliziter Feldliste. Kein vollständiges Account-/Hundebackup, kein Importer und keine behauptete `.tmigp`-Kompatibilität.
- Exakte Standorte, Datum und Hundename sind absichtlich enthalten; die UI weist vor dem Teilen darauf hin. Keine Account-/Session-/Marker-IDs, privaten Audio-URLs oder kompletten internen Objekte. Keine automatische Übermittlung.
- Quelle sind vorhandene `points` und `runs[0].run_points`, ersatzweise der passende persistierte Run. Darstellungsdaten `replay_points` ersetzen diese Quelle nicht. Gespeicherte Run-Punkte sind bereits durch die vorhandene Aufnahmeverarbeitung gegangen; der Export ist kein Rohsensor-Dump.
- Bei widersprüchlichen Run-IDs werden Score/Zähler/Fallbacks nicht einem anderen Run zugeordnet. Unbekannt bleibt unbekannt; Exporte verändern weder Daten noch Score.
- Maximal 100.000 Punkte je Eingabespur, maximal 20.000 Zeichen optionaler Notizen; Überschreitung bricht ab, statt still zu kürzen.
- Noto Sans ist eingebettet. Nicht darstellbare Zeichen werden mit `?` und einem Hinweis ausgegeben; der JSON-Text bleibt vollständig. Unterstützte App-Sprachen DE/GSW/EN/FR/IT sind für neue Texte hinterlegt.
- Erfolgreich geteilte Dateien bleiben im OS-Cache, weil Android den Share-Aufruf vor dem Lesen durch die Ziel-App beenden kann. Der nächste Export entfernt eigene Dateien älter als 24 Stunden; dies ist KEINE garantierte zeitgesteuerte Löschung. Fehlerhafte Exporte werden direkt bereinigt. Kein Schreiben in dauerhafte Dokumentablagen.

### Tempovergleich im Replay

- Bestehende Segmentanalysen/Heatmap werden weiterverwendet. Keine Neuberechnung des Track-Scores oder der GPS-/Fusionsdaten.
- Vergleich aus mindestens drei früheren abgeschlossenen Absuchen desselben Hundes mit derselben bekannten Hundeführer-Distanz (1/5/10 m), vor dem aktuellen Run. Pro Session Median aus mindestens drei verlässlichen geraden Segmenten mit positiver Geschwindigkeit; Gesamtreferenz ist der Median dieser Session-Werte, maximal 20 Sessions. Doppelte/aktuelle/zukünftige Runs, fremde Hunde, unzureichende Confidence und unbekannte Distanz werden ausgeschlossen.
- Remote/SQLite lesen jeweils maximal 30 passende Zusammenfassungen, keine historischen GPS-Arrays oder Notizen. Remote-Zugriff auf den angemeldeten Owner und den gewählten Hund begrenzt. Offline bleibt lokaler Verlauf verwendbar; ansonsten ausdrücklich als Vergleich innerhalb der aktuellen Absuche gekennzeichnet.
- Fehlende verlässliche Referenz: keine Tempoeinfärbung. Segmentdaten mit niedriger/ungültiger Confidence werden nicht eingefärbt. Vergleichsband „ähnlich“ ist ±25 % um die Referenz, rein beschreibend. Konstantes Tempo bleibt neutral.
- UI benennt Vergleichsquelle und Anzahl, zeigt Farb-/Textlegende und erklärt die Messgrenze: Tempo des Aufzeichnungsgeräts ist kein sicherer Beleg für „Hund arbeitet/rennt“. Verlauf/Bedienelemente unter der Karte sind für kleine Displays scrollbar.
- Keine Garantie vergleichbarer Boden-/Wetter-/Trainingsbedingungen; keine wissenschaftlich validierte individuelle Leistungsnorm. Das ist eine beschreibende Trainingshilfe.

## Gegenstandskorrekturen: konkrete Entscheidungsvorlage, noch keine Umsetzung

Belegte Hindernisse im geprüften Code:

1. `features/tracking/utils/localTrackRun.ts:58` speichert die gefundene Gesamtanzahl. `:63` speichert nur Auto-Dwell-IDs; eine vollständige Zuordnung aller manuellen Funde je Gegenstand fehlt. `found=false` in Detailmarkern darf deshalb nicht als nachgewiesener Fehlfund interpretiert werden.
2. `features/sync/services/syncEngine.ts:75` ersetzt Marker beim Sync. `remoteTrainingSyncService.ts:143` übernimmt die lokale Marker-ID nicht und setzt `found: false`. Remote-IDs sind somit keine dauerhafte Korrekturreferenz. Lokale IDs tragen zudem `mk_`-Präfix (`lib/localDb/ids.ts:4`); sie können nicht blind in eine UUID-Spalte geschrieben werden.
3. V3 analysiert wahrscheinlichen Gegenstandskontakt; dieser ist kein bestätigter Fund. `trackAnalyticsV3.ts` schliesst Gegenstandszonen aus Segment-Scores aus. Eine Änderung eines Fundurteils rechtfertigt keine beliebige Neuberechnung des V3-GPS-Scores. Frühere Analyseversionen besitzen andere Regeln; Originalversion muss erhalten bleiben.

**Empfehlung zur offenen Produktfrage:** separate, geräteübergreifende Korrekturhistorie mit lokaler Warteschlange, statt einer unbemerkten Änderung alter `track_data`-Snapshots. Vorbereiteter Vertrag:

- Unveränderliche Run- und Gegenstandsidentität für neue Aufnahmen, explizite sichere Migration/Zuordnung für Altbestände. Mehrdeutige Altzuordnung bleibt unbekannt; keine Zuordnung allein nach G1/G2 oder zufälliger Remote-ID.
- Originalbeobachtung, automatischer Kontaktverdacht und menschliches Korrektururteil getrennt speichern. Urteil gefunden / nicht gefunden / unbekannt bzw. Rücknahme, Zeitpunkt und optionaler Grund. Rücknahme als neues Ereignis.
- Atomare, idempotente Speicherung; Versionsprüfung bei parallelen Änderungen. Konflikt sichtbar machen, keine stille letzte-Schreiboperation-gewinnt-Regel. Offline-Status offen anzeigen, Wiederholungen ohne doppelte Events.
- RLS: Eigentümer darf korrigieren; Trainer liest nur bei aktuell gültiger Freigabe. Kein Client-only-Autorisierungscheck. Lösch-/Accountwechsel-/Widerrufspfade und lokale Bereinigung mitprüfen.
- Export zeigt Original und Korrekturstatus nachvollziehbar. Gefunden-Zähler nur aus eindeutiger Evidenz, nie unbekannte Gegenstände automatisch als verpasst zählen. Bestehender GPS-/Analyse-Score bleibt entsprechend seiner Analyseversion nachvollziehbar; keine Rohdatenänderung.
- Akzeptanz: Fehlklick/Rücknahme, offline → Neustart → Sync, verlorene Server-Antwort/Retry, zwei Geräte ändern gleichzeitig, Marker-Re-Sync, neue Absuche derselben Fährte, Trainerfreigabe entziehen, Konto wechseln, mehrdeutiger Altbestand, Export mit Original-/Korrekturverlauf.

Alternative „zunächst lokal“ benötigt ebenfalls dauerhafte Identität, Run-Isolation und eine sichtbare Kennzeichnung ohne Sync-/Trainer-Paritätsversprechen. Keiner dieser Wege wurde ungefragt umgesetzt oder eine Migration ausgerollt.

## Produktfolge nach dieser Ausbaustufe

| Idee | Sinnvolle Anpassung an ANYVO | Einordnung |
|---|---|---|
| Verleitungsfährten | Eigenständige Linien mit eigener Legezeit/Wetterreferenz; Darstellungen dürfen Hauptfährtenprojektion und Such-Score nicht verändern | Nach stabiler Analyse/Korrektur |
| Shelly/Watch | Gemeinsame typisierte Sitzungsbefehle mit Entprellung, Run-/Phasenprüfung, ACK und Duplikatschutz; Einfachklick Gegenstand, Doppelklick Winkel nur beim Legen; Dreifachklick zunächst Ereignisnotiz statt automatisch bewerteter Fehler; Langdruck öffnet Abschlussbestätigung | Shelly-Diagnose bereits getrennt vorhanden; produktive Steuerung/Watch inklusive nativer Prüfung und Hardware-QA später |
| DTW/Heatmap | Bestehende qualitätsbewusste Analyse weiterverwenden; zusätzliche Metrik nur mit erklärbarer Aussage, Versionierung und Feldvalidierung | Kein unvalidierter Austausch des Scores |
| Teilen/Backup | GPX und versioniertes ANYVO-Format zuerst; Import/Restore mit Versionierung, Konflikt- und Vollständigkeitsprüfung separat | Exporte hier; vollständiges Backup/Restore später |
| iCloud | Bestehendes plattformübergreifendes Account-/Sync-Modell erhalten; iCloud-Dateiablage optional über OS-Teilen | Kein paralleles Apple-only-Datensystem |
| Live-Share/Gruppen | Bestehenden Trainer Connect nutzen; neue Live-Freigaben serverseitig begrenzen/widerrufen, Präzisionsstandorte schützen. „Nach 2 h gelöscht“ erst nach verifiziertem Daten-/Backupvertrag behaupten | Eigener Backend-/Datenschutz-Scope |
| GNSS-Geräte/Planer | Erst vorhandene Qualität/Sources zuverlässig erhalten, dann reale Geräte-Protokolle und plattformspezifische Unterstützung testen | Keine 10-Hz-/Dualband-Garantie aus Herstellerwerbung ableiten |

## Tests und Überprüfung

- Abschliessende relevante Auswahl: **17 Suites / 201 Tests PASS**. Umfasst neue Export-/PDF-/Bedienungs-/Verlaufs-/Tempo-Tests, bestehende Heatmap, Analytics V1/V3, Replay, ReplayMap, Detail-/Run-Datenpfade, SearchRecorder-Replay-Geometrie und i18n.
- Der unveränderte ReplayMap-Test meldete React-`act`-Hinweise aus asynchron ladenden Icons; Suite PASS. Aufnahme-Testlogs enthalten synthetische Testpunkte, keine neuen Feldmessungen.
- PDF-Langtexttest lief zunächst in sein 5-s-Limit. Zeilenumbruch danach tokenweise mit Breiten-Cache überarbeitet; abschliessend Kurzbericht ~0,7 s, Langtext ~0,9 s im isolierten Jest-Lauf (keine Handy-Performance-Aussage).
- **TypeScript PASS** (`npx tsc --noEmit`). **ESLint 0 Fehler / 0 Warnungen** für alle geänderten/neuen TS/TSX-Dateien und Sprachdateien. **git diff --check PASS**.
- Lokale Expo/Hermes-Bundles für iOS und Android erfolgreich; letzte Layoutversion nochmals gebündelt. PDF-Schriftasset in beiden enthalten. Es sind lokale JS-Exporte, KEINE nativen Builds und keine EAS-Updates.
- Bundle-Hinweis: fehlende lokale Sentry-Org/-Projektkonfiguration; diese lokalen Bundles sind keine Production-Environment-/Runtime-Abnahme.
- **GPX 1.1 PASS** gegen das offizielle Topografix-XSD (lxml, generierter Musterexport).
- **PDF visuell PASS:** einseitiger Musterbericht und alle drei Seiten eines langen Berichts per Poppler gerendert/angesehen. Kein abgeschnittener Text/überlappender Footer; Unicode DE/FR geprüft; abschliessender Notiztext mit pypdf nachgewiesen.
- Beispielartefakte mit rein synthetischen Daten: `/private/tmp/anyvo-analysis-export-qa/`; langlebiger Musterbericht im Chat-Projekt `output/pdf/anyvo-faehrtenbericht-muster.pdf`.
- **OPEN:** reale iOS-/Android-Share-Ziele (Dateien/AirDrop/Messenger), erstes Offline-PDF nach OTA, Hermes-Laufzeit auf echten Geräten, Schrift/Vergrösserung/kleines Display, wirklicher Offline-Verlauf, Performance langer realer Fährten, Review der Nutzertexte.

## Release-/Koordinationsvertrag

- Chat01 bleibt zuständig für OTA. Dort zuletzt gemeldete GPS/Shelly- und Massstab-OTAs sind von diesem neuen lokalen Feature strikt zu unterscheiden. Deren Updates sind keine Auslieferung dieses Exports.
- Neue Abhängigkeiten: reine JS-Bibliotheken `pdf-lib@1.17.1`, `@pdf-lib/fontkit@1.1.1`; vorhandene `expo-file-system`, `expo-sharing`, `expo-asset`, `expo-crypto` werden wiederverwendet. Noto Sans (~569 kB) mit OFL-Lizenzdatei. Keine Änderung an nativen Projekten, Expo-Config, Berechtigungen oder Backend-Schema.
- Aus Source-Sicht OTA-Kandidat. Vor Auslieferung bestehende iOS-1.0.4- und Android-1.0.3-Baselines/Runtimes frisch prüfen, alle bereits veröffentlichten GPS/Shelly-/Massstab-Fixes erhalten, Integration getrennt vom Feature-HEAD prüfen. Diese uncommittete main-basierte Arbeit ist KEIN direkt veröffentlichbarer Production-Snapshot.
- Chat03 übernimmt separat den beauftragten Diagnoseausbau. Dieser Auftrag verändert keine QA-/Support-Capture-Dateien. Vor Integration beide Änderungen gemeinsam prüfen.
- Globale Koordinationsdateien sind weiterhin Sache des main-Writers. Kein T-65 neu vergeben; dieser eindeutig benannte Bericht vermeidet bekannte ID-Kollisionen.

## Dateiliste

Bestehende Produktdateien: `app/track/[id].tsx`, `app/track/replay/[id].tsx`, `features/tracking/engine/trackHeatmap.ts`; fünf Sprachdateien; `package.json`, `package-lock.json`.

Neue Produktdateien: `features/tracking/components/TrackExportActions.tsx`, `services/dogPaceHistoryService.ts`, `services/trackUserExportService.ts`, `utils/paceReference.ts`, `utils/trackReportPdf.ts`, `utils/trackUserExport.ts` (jeweils unter `features/tracking/`); `assets/fonts/NotoSans-Regular.ttf`, `assets/fonts/NotoSans-LICENSE.txt`.

Sechs neue Tests: gleichnamige Tests für TrackExportActions, dogPaceHistoryService, trackUserExportService, paceReference, trackReportPdf, trackUserExport in den jeweiligen `__tests__`-Ordnern. Eigener Bericht ist diese Datei.

## Offizielle Quellen

- Expo SDK54: https://docs.expo.dev/versions/v54.0.0/ ; Sharing https://docs.expo.dev/versions/v54.0.0/sdk/sharing/ ; FileSystem https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/
- PDF: https://pdf-lib.js.org/ ; https://pdf-lib.js.org/docs/api/classes/pdfdocument
- GPX: https://www.topografix.com/GPX/1/1/gpx.xsd
- Schrift/Lizenz: https://github.com/notofonts/noto-fonts/blob/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf ; https://github.com/notofonts/noto-fonts/blob/main/LICENSE
- Shelly: https://shelly-api-docs.shelly.cloud/docs-ble/Devices/BLU_ZB/button1_ZB/
- Apple BLE Hintergrund: https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html

Nächster Schritt: Nutzerwahl zur Korrekturhistorie aufnehmen; dann deren eigenen Datenvertrag und Integration implementieren. Export/Tempo-Code ist unabhängig davon reviewbar; Release weiterhin über Chat01 mit eigenem Preflight und explizitem Auftrag.

## Design-Nachtrag — ausdrücklicher Nutzerwunsch 2026-10-08

Das PDF wurde stärker an das ANYVO-Design angepasst. Das bereits im App-Repository vorhandene `assets/images/anyvologo.png` wird unverändert eingebettet; dieselbe Datei wird unter anderem in Home, Membership und Trainer Hub benutzt. Keine Bearbeitung der Originaldatei und kein neu generiertes Ersatzlogo.

- Dunkler abgerundeter Kopfbereich mit Logo, Mint-Akzenten, Berichtstitel, Hundename und Datum; Farben aus `constants/colors.ts` (`C.trackSurface`, `C.trackPrimary`, `C.trackBlue`) mit lesbaren hellen Druckflächen kombiniert.
- Sechs Kennzahlenkarten, konsistente Abstände, Abschnittsmarkierungen, abgerundeter Kartenbereich und G-Nummern als kleine Beschriftungsfelder.
- Folgeseiten mit kompaktem Logo/Kopfbereich und Fusszeile. Lange Notizen bleiben vollständig; sehr lange Hundenamen laufen ausserhalb des begrenzten Kopfbereichs weiter.
- Export-Service lädt Schrift und vorhandenes PNG als lokale Expo-Assets und übergibt beide an die PDF-Erzeugung. Keine zusätzliche Dependency, Native-/Backend-Änderung oder Änderung an GPX/JSON, Aufnahme, Score oder Korrekturhistorie.
- Angepasste Dateien dieses Nachtrags: `trackReportPdf.ts`, `trackUserExportService.ts`, bestehender PDF-Test und dieser Bericht. Muster-PDF im Chat-Projekt aktualisiert.
- Prüfungen: Exportbedienung/Export-Service **2 Suites / 13 Tests PASS**, PDF-Erzeugung im abschliessenden Wiederholungslauf **1 Suite / 2 Tests PASS**, einschliesslich eingebettetem Bild auf jeder Seite. **TypeScript PASS, ESLint 0/0, diff-check PASS**.
- Ein PDF-Wiederholungslauf erreichte das generische 5-s-Jest-Limit. Die funktionalen Tests mit echter Schrift- und Logo-Kodierung haben nun ein explizites 30-s-Limit; der abschliessende Lauf bestand. Daraus keine Geräte-Performance-Abnahme ableiten.
- Sichtprüfung: aktueller einseitiger Musterbericht sowie dreiseitige Langtextfassung gerendert; Logo, Inhalt, Umbrüche und Fusszeilen geprüft. pypdf bestätigt Bild pro Seite und vollständigen Notizabschluss. Die früher dokumentierten lokalen Plattform-Bundles beziehen sich auf den Stand VOR diesem Design-Nachtrag; sie wurden dafür nicht erneut erstellt. Release-Preflight bleibt separat.
- Weiterhin uncommitted, keine OTA/Veröffentlichung. Die Frage zur Korrekturhistorie ist weiterhin offen und wurde durch den Designwunsch nicht entschieden.


## Gewählte Variante C / Freiraum — 2026-10-08

Der Nutzer hat nach drei konkreten PDF-Entwürfen ausdrücklich „C passt“ gewählt.
Die produktive PDF-Erzeugung verwendet jetzt diese Gestaltung: helle Mintfläche,
weisse schematische Karte neben einer eigenen Kennzahlenspalte, separater dunkler
Score-Bereich, Bedingungen/Gegenstände in Spalten und fliessende Notizen. Das
Original-Logo bleibt unverändert. Noto Sans bleibt eingebettet; die vorhandene
PDF-Bibliothek liefert die Standard-Bold-Schrift für Zahlen und die Wortmarke.
Es werden keine macOS-Schriftdateien oder neue Dependencies ausgeliefert.

- Ändert nur Darstellung: Werte, Messungsbedeutung und Exportvertrag unverändert;
  Dauer nun in Minuten:Sekunden. Fehlende Werte werden ausdrücklich ausgewiesen.
- Unterbrochene GPS-Segmente bleiben getrennt; einzelne gespeicherte Punkte können
  dargestellt werden. Keine synthetische Verbindung oder geometrische Ergänzung.
- Lange Namen, Notizen und Gegenstandslisten laufen auf Folgeseiten weiter;
  Logo/Fusszeile wiederholen sich, unbekannte Glyphen bleiben sichtbar erklärt.
- Frisch geprüft: PDF/Exportdaten/Exportservice **3 Suites / 15 Tests PASS**;
  Exportbedienung abschliessend **1 Suite / 9 Tests PASS**. Zusammen **4 / 24**,
  keine Addition überlappender Wiederholungen. Erste UI-Ausführung unter starker
  Rechnerlast traf ihr 5-s-Limit; isolierte Wiederholung mit CLI-Timeout30s PASS,
  unveränderter UI-Code. PDF-Tests prüfen Textgrenzen, lange Namen, Notizabschluss,
  unbekannte Werte/Glyphen, Geometrielücken und Bilder auf jeder Seite.
- Voll-Typecheck des Produktstands PASS; nach Hinzufügen der Testfälle gezielter
  Typecheck beider finalen PDF-Dateien PASS (temporäre Prüfkonfiguration mit den
  vorhandenen Node-/Jest-Typen). ESLint beider finaler Dateien 0/0; diff-check PASS.
- Visuelle Prüfung des tatsächlichen App-Generators: Muster1Seite, Langtext3Seiten,
  alle vier Seiten via Poppler betrachtet. pypdf bestätigt Logo je Seite, Unicode,
  Messungserklärung und vollständigen Notizabschluss. Muster-PDF im Chat-Projekt
  output/pdf/anyvo-faehrtenbericht-muster.pdf aktualisiert.
- Ein erster frischer iOS-Bundleversuch stoppte VOR Bündelung an Sandbox-EPERM
  beim NativeWind-Cache; kein Bundle-PASS. Wegen belegter Rechnerüberlastung und
  Health-Releasepriorität bei01 kein doppelter paralleler Metro-Lauf gestartet.
  Die älteren erfolgreichen iOS-/Android-Bundles sind ausdrücklich vor VarianteC.
  **Frische Plattformbundles des endgültigen Release-Kandidaten sind weiterhin
  Pflicht vor OTA durch01.** Kein lokaler Geräte- oder Production-PASS abgeleitet.

Direkte Nutzerfreigabe im MASTER-Turn01a11bfe-33dc-78b1-b572-4dade9512e46 gelesen:
alle offenen OTAs freigeben, vorher sauber committen; Geräteprüfung nur auf dem
installierten iPhone1.0.4. Das autorisiert den begrenzten Feature-Commit;01 bleibt
alleiniger Publishwriter auf frisch geprüften kompatiblen Releasebaselines. Kein
Push/main-Merge, DB-Eingriff, nativer Build oder Store-Schritt durch02.

Neue anschliessende Nutzerwünsche (wahrheitsgemässe Übersichtszeichnung,
Wiederaufnahme im Hundeprofil und Hundefarben) gehören in den separaten Worktree
anyvo-feature-tracking-preview-recovery-colors. Sie sind NICHT in diesem
Export-/Tempo-Änderungssatz enthalten. Gegenstandskorrekturhistorie weiterhin offen.

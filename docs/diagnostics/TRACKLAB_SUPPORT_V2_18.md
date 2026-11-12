# T-170 – Support-Export für TrackLab

Stand 03.11.2026: **App R3 lokal implementiert und getestet; nicht veröffentlicht.**
TrackLab wurde vom zuständigen Sites-Chat privat als Version 4 veröffentlicht:
https://anyvo-tracklab.einfachich503.chatgpt.site
Quellcommit des Importers: `fc9d14bc13169a6848878889e4fd6115b8cf8624`.
Der Sites-Owner berichtet bestandene Live-Import-, Altformat-, Datenschutz-,
Deduplizierungs- und Zugriffstests (anonyme API 403). Dies ist dessen Nachweis,
kein hier auf dem Mac ausgeführter Website-Test. R2 ändert das JSON-Schema nicht.
Keine Website-Datei wurde vom App-Writer bearbeitet.

## Basis und Datenwirkung

- Zuständiger App-Writer: Werkstatt, Task T-170.
- Branch `feat/tracklab-provenance-20261103` auf exakt
  `bb09bf625bb7305f4e8e619d1148d2685e79afd6`, Tree
  `8c2c4d0c3f789b3af203c36e2c920ad2cc8e8b62`, Parent `02545d851cec2f6ddee0f053aa2c4626971789fe`.
- Durch 00/01 geprüfte integrierte iOS-57-GPS-Quellbasis. Diese Feststellung ist
  keine neue Aussage darüber, welche OTA auf einem Gerät läuft. `main` und die
  GitHub-Referenz `78c7fe0…` wurden nicht als Production-Basis verwendet.
- Expo tatsächlich installiert: 54.0.36; Application 7.0.8, Device 8.0.10,
  Updates 29.0.19, Sharing 14.0.8. Keine Dependency-/Runtime-/Nativeänderung.
- Beide Plattformen verwenden die vorhandenen öffentlichen Expo-APIs. Die
  tatsächlich installierte App-Version kommt **nicht** aus `app.json` oder dem
  Package-Manifest. Separate Android-Releasequellen, native Verträge und spätere
  Plattformtransfers prüft 01 vor einer etwaigen Veröffentlichung.
- Nur neue kleine, lokale Metadaten-Snapshots in AsyncStorage. SQLite wird zur
  vorhandenen Eltern-/Kontozuordnung gelesen; kein Schema-/SQL-/Sync-/Backend-
  Umbau. Kein Nachfüllen oder Neuberechnen alter Aufnahmen. R2 ergänzt ausschließlich
  die Entfernung des neuen Sidecars am bereits vorhandenen, expliziten Lösch-/
  lokalen Wipe- und QA-Clear-Ablauf. Diese Abläufe wurden nicht auf Kundendaten
  ausgeführt und werden nicht zusätzlich beim Kontowechsel aufgerufen.
- Vorhandene Start-/Resume-Punkte der Recorder rufen einen beobachtenden
  Metadatenhelfer auf, ohne ihn abzuwarten. Keine Fix-/Sensor-Abonnements,
  Schwellen, Filter, Winkel-, Gegenstands-, End-, Score- oder Geometrieänderung.
- Legen: Session-Schlüssel. Suchen: zusätzlich bestehende Run-ID als **lokaler
  Lookup-Schlüssel**. Keine ID steht in den gespeicherten Metadatenwerten oder
  im Support-JSON. Kein „neuester Versuch“-Fallback.
- Metadaten sind gerätelokal. Auf anderen Geräten oder nach Verlust dieser
  Diagnoseinformationen bleiben sie unbekannt; sie werden nicht aus der
  aktuellen Installation rekonstruiert.

## Exportvertrag

Unverändert: `exportType: "support"`, `schemaVersion: 2`, relative Geometrie
und Zeiten sowie bisherige Felder. Der Service ergänzt optional `provenance`
und setzt `schemaMinor` auf mindestens **18**. Alte v2-Dateien ohne diesen
Block bleiben gültig. Die reinen alten Builder funktionieren weiterhin ohne
Metadaten. Interne QA-Dateien bleiben ein separates Format.

Maschinenlesbares exaktes Schema **nur des optionalen Blocks**:
`support-provenance-v1.schema.json` (JSON Schema Draft 7, `additionalProperties:
false` innerhalb aller Metadatenobjekte). TypeScript-Validator:
`features/tracking/utils/diagnosticProvenance.ts`.

```text
provenance
  schemaVersion: 1
  recording
    lay: RecordingProvenance
    search: RecordingProvenance
  exporter
    source: "runtime_at_export"
    environment: DiagnosticEnvironment

RecordingProvenance
  availability: "available" | "unknown" | "read_failed"
  scope: "phase_history"
  partial: boolean | null
  omittedSegments: integer [0, 99999999]
  segments: [0..16] of
    source: "recording_start" | "recording_resume"
    environment: DiagnosticEnvironment

DiagnosticEnvironment
  platform: "ios" | "android" | "web" | "unknown"
  appVersion: string | null
  nativeBuildVersion: string | null
  osVersion: string | null
  deviceModel: string | null
  runtimeVersion: string | null
  launch: "ota" | "embedded" | "emergency" | "updates_disabled" | "unknown"
  otaUpdateId: lowercase UUID | null
```

Die fünf Label-Felder sind höchstens 80 Zeichen lang, Zeichensatz
`A-Za-z0-9 ._()+-`; ISO-Datum, E-Mail-Zeichen und UUID-Muster werden verworfen.
Nicht verfügbare oder nicht sicher darstellbare SDK-Werte werden `null`.
`otaUpdateId` ist nur für `launch: "ota"` erlaubt. Auch Emergency-/Embedded-
IDs werden nicht als heruntergeladene OTA bezeichnet.

`available` erfordert mindestens ein Segment und ein boolesches `partial`.
`unknown`/`read_failed` erfordern leere Segmente, `partial: null` und
`omittedSegments: 0`. Bei erstem beobachteten Resume oder ausgelassenen
Segmenten ist `partial: true`. Bei mehr als 16 Starts bleiben die erste
Identität und die letzten 15 Beobachtungen erhalten; die Kürzung wird gezählt.
Diese Grenze betrifft ausschließlich die **neu eingeführten Metadaten**.

### Feldzuordnung für Sites

| Feld | Bedeutung / Einheit | Quelle | Phase / fehlende Werte |
|---|---|---|---|
| `recording.lay` | Beobachtete Aufnahmestände beim Legen | Am Beginn/Resume gespeicherter Snapshot | Alte Fährte: `unknown`, niemals Exportversion einsetzen |
| `recording.search` | Beobachtete Aufnahmestände der exportierten Absuche | Kontext des konkreten Search-Captures; im Persisted-Fallback exakte lokale Run-Zuordnung | Fehlende Zuordnung: `unknown`; kein Rückgriff auf andere Versuche |
| `segments[].source` | Beobachteter Start oder Wiederaufnahme | Bestehender Session-Lifecycle | Keine Aussage über unaufgezeichnete frühere Teile |
| `scope` | Verlauf der beobachteten Starts innerhalb der Phase/des Suchversuchs | Metadatenvertrag | Keine Zuordnung zu einzelnen GPS-Punkten oder Intervallzeiten |
| `partial` | Unvollständigkeit **der Metadatenbeobachtung** | Resume-/Kürzungsstatus | `null` = unbekannt; nicht mit Search-Teilaufnahme gleichsetzen |
| `omittedSegments` | Anzahl ausgelassener Metadaten-Segmente | Speichergrenze 16 | Keine fehlenden GPS-Punkte daraus ableiten |
| `appVersion` | Native App-Versionszeichenfolge | `Application.nativeApplicationVersion` | Je Snapshot; `null` = unbekannt |
| `nativeBuildVersion` | Native Build-Zeichenfolge, nicht Zahl | `Application.nativeBuildVersion` | Je Snapshot; `null` = unbekannt |
| `platform` | Betriebssystemfamilie | `Platform.OS` | Je Snapshot; sonst `unknown` |
| `osVersion` | Betriebssystemversion, Zeichenfolge | `Device.osVersion` | Je Snapshot; `null` = unbekannt |
| `deviceModel` | Hersteller-Modellbezeichnung | `Device.modelName` | Je Snapshot; `null` = unbekannt. Kein `deviceName`, keine Hardware-ID |
| `runtimeVersion` | Native Expo-Updates-Runtime | `Updates.runtimeVersion` | Je Snapshot; kein App-Versions-Fallback |
| `launch` | Tatsächlicher Startpfad | `Updates.isEnabled/isEmbeddedLaunch/isEmergencyLaunch` | Je Snapshot; nicht bekannt = `unknown` |
| `otaUpdateId` | Öffentliche Software-Update-Kennung | `Updates.updateId`, nur bei bestätigtem OTA-Start | Keine Account-/Geräte-/Session-Kennung; sonst `null` |
| `exporter` | Installation, die die Datei erstellt | Dieselben APIs **beim Export** | Niemals einer historischen Aufnahme zuordnen |

### Suchversuche und Wiederaufnahme

Der Support-Capture trägt intern optional `recordingContext`, synchron beim
Start der tatsächlichen Search-Telemetrie aufgenommen. Der Support-Builder
entfernt diesen internen Unterbaum; der Service projiziert ihn nach strikter
Prüfung ausschließlich nach `provenance.recording.search`. Ältere Captures
ohne Kontext bleiben unbekannt, auch wenn zwischenzeitlich ein neuer Versuch
unter anderem Build gestartet wurde. Ein interner QA-Export kann den Kontext
weiterhin enthalten und trägt dann ebenfalls Minor 18; er ist kein Support-Import.

Im Persisted-Fallback liest der Service ausschließlich die Metadaten der
gespeicherten `track_data.run.run_id`. Die Run-ID wird nicht exportiert.
Resume-Segmente können andere Geräte-/Versionswerte enthalten. Der Capture
nach Resume belegt nur den beobachteten Abschnitt; ein vollständiger vorheriger
Verlauf wird nicht behauptet. Beschädigte Metadaten werden nicht überschrieben;
der Export der noch verwertbaren Fährte bleibt möglich (`read_failed`).

## Notwendige Importer-Anpassung im Sites-Chat

1. Bestehenden Support-v2-Import, Originaldatei und SHA-256-Deduplizierung
   erhalten. Neue Minor-Versionen additiv behandeln. Fehlendes `provenance`
   bedeutet unbekannte Aufnahmeherkunft.
2. Den optionalen Block gegen das beigefügte Schema prüfen. Unbekannte oder
   beschädigte Metadaten klar melden; niemals durch aktuelle Exportwerte ersetzen.
3. Die bestehende rekursive UUID-Sperre **nicht entfernen**. Eine Ausnahme ist
   nur nach erfolgreicher Strukturprüfung an diesen echten Schlüsselpfaden erlaubt:
   - `provenance.exporter.environment.otaUpdateId`
   - `provenance.recording.lay.segments[N].environment.otaUpdateId`
   - `provenance.recording.search.segments[N].environment.otaUpdateId`
   `N` muss ein echter Arrayindex sein. Zusammengesetzte Punkt-/Klammer-Schlüssel,
   beliebige `updateId`-Felder und alle anderen UUIDs bleiben verboten.
4. Aufnahmeherkunft getrennt für Legen und Absuche anzeigen. Nur eindeutig
   belegte Werte übernehmen. Unterschiedliche Segmente nicht zu einer erfundenen
   Kombination aus App-Version, Build und Gerät vermischen. Bei Teilhistorie
   nur „beobachteter Abschnitt“ anzeigen, bei mehreren Ständen diese erhalten
   und keine einzelne Version für die gesamte Phase auswählen.
5. `exporter` separat als Exportumgebung anzeigen. Aus Softwarekennungen kein
   Testdatum ableiten; das Testdatum bleibt eine manuelle TrackLab-Ergänzung.
6. `searchDiagnostics.partial`, Kürzungsflags und ursprüngliche Zähler weiterhin
   beachten. Ausgedünnte Exportgeometrie ist kein vollständiger Rohdatenstrom.
7. Fixture plus Altdatei ohne Metadaten, UUID-Negativfälle, Resume, unterschiedliche
   Phasen und mehrere Suchversuche gegen den tatsächlichen Importer testen.

**Sites-Integration laut zuständigem Owner bestanden:** Private Version 4 liest
auch v2.18. Eigene App-Geräteprüfungen und 01s Plattform-/Release-Preflight bleiben
offen. R2 behält den unveränderten v2.18-Vertrag und die bytegleiche Fixture bei.

## Diagnoseabdeckung – tatsächlich vorhandene Daten

| Bereich | Aufzeichnung / Speicherung | Kunden-Support-Export | Grenze |
|---|---|---|---|
| Gelegte Fährte | Recorder → `local_track_points`, Marker dauerhaft | `points`, `markers`, Länge, Genauigkeit, relative Zeiten | Persistierte Linie ist nicht Roh-GPS oder Detektoreingang |
| Lege-Roh-/Detektor-/Live-Linie | Interne optionale QA-Capture; neues GPS-Archiv stammt bereits aus Basis bb09 | Kundenbuilder verwendet weiterhin **keine** volle Lege-QA-Capture | `qaCaptureAvailable:false`, leere Lege-Roh-/Detektorarrays und unbekannte Zähler nicht als Nullereignisse auswerten |
| Absuche | Vorhandene Support-Telemetrie; Retention letzte fünf Captures; gespeicherter Run separat dauerhaft | `searchDiagnostics` bevorzugt, sonst `persistedSearch` | Fehlender/kaputter Capture: gespeicherter Fallback; alte Daten bleiben exportierbar |
| Live-Markierung | Gedrosselte `cursor.samples`, Display-Stream-Statistik | Relative Cursorposition, Fortschritt, Referenzabstand | Kein kompletter hochfrequenter Puck-Strom; Kürzungsflag vorhanden |
| Run / Replay | Getrennte Ströme im Search-Capture, `run_points`/optionale Replay-Punkte im Run | Run-/Replay-Geometrie im Capture; Persisted-Fallback exportiert gespeicherte Run-Punkte | Replay `display_only`; keine neue Rekonstruktion. Streamgeometrien auf max. 600 Punkte ausgedünnt |
| Winkel / Richtung | Persistierte Marker; interne QA kennt zusätzliche Kandidaten-/Fusionsevidenz | Marker `angleKind`, Position, relative Zeit, `source`/`scale` | Im bisherigen Kundenpfad bleibt Markerquelle oft `unknown`; nicht automatisch „automatisch erkannt“ behaupten |
| Gegenstände | Persistierte Marker; Search-Objektstatus und Annäherung | Marker, `searchDiagnostics.objects` bzw. gespeicherte Fundanzahl | Interne Dwell-Kandidaten/Voice-/Eligibility-Details werden weiterhin entfernt |
| GPS-Genauigkeit | Lay-Punkt-Accuracy; Search-Rohfix-Accuracy und Annahme/Ablehnung | Lay min/median/max und punktweise Accuracy; Search `accuracyM`/`accepted`/`rejectReason` | Keine Satelliten-Rohmessungen ergänzt |
| IMU | Optionaler interner QA-Mitschnitt beim Legen | Kundenpfad übernimmt weiterhin keine volle Motion-Zeitleiste | `motionCaptureAvailable:false` ist keine bewiesene Abwesenheit einer realen Drehung |
| Unterbrechung / Recovery | Vorhandene `searchDiagnostics.partial`, Hintergrundzähler; interner QA-Lifecycle getrennt | Teilstatus, vorhandene relative Hintergrundzähler; Metadaten-Resume separat | Kein vollständiges Lifecycle-Protokoll nachträglich erfunden |
| Empfangs-/Messzeiten | Basis bb09 ergänzt beobachtete Empfangszeiten, wenn tatsächlich vorhanden | Search-Rohfix kann `receivedTSec` zusätzlich zu `tSec` enthalten | Nicht vorhandene Empfangs-/Verarbeitungszeiten bleiben fehlend/null. Mess- und Empfangszeit nicht gleichsetzen |

Quellen: `qaSearchCapture.ts` (`SEARCH_QA_LIMITS`, `buildSearchDiagnostics`),
`qaTrackExport.ts` (`buildQaTrackExport`, `anonymizeMarkers`),
`supportDiagnostics.ts` (`toSupportCapture`, `buildSupportExport`),
`customerTrackDiagnosis.ts` (`buildPersistedSupportExport`),
`backgroundLayDiagnostics.ts`, `supportDiagnosticsService.ts`.
Weitere vollständige Lege-Roh-/IMU-/Lifecycle-Abdeckung wäre ein separater,
datenschutz- und performancegeprüfter Auftrag; sie wird hier nicht aktiviert.

## UI und Teilen

Bestehendes natives Teilen über `shareJsonFile`/`expo-sharing` bleibt bestehen.
Der Support-Eintrag erscheint nun auch neben dem separaten QA-Export im
Diagnosebereich. Er benennt TrackLab, gespeicherte Daten bzw. zusätzlichen
Search-Capture, unbekannte Aufnahmeangaben sowie Teil-/ausgedünnte Daten.
Neue Texte sind in de/gsw/en/fr/it vorhanden; Farben bleiben im bestehenden Design.

Ein synchroner UI-Lock verhindert Doppeltippen; ein gemeinsamer Support-Service-
Lock verhindert parallele native Sheets/Dateischreibvorgänge. Kein automatischer
Upload, keine neue Berechtigung, keine zusätzliche Anmeldung. Die Datei wird
offline lokal vorbereitet. `expo-sharing` 14.0.8 liefert `Promise<void>` und
keine zuverlässige Information, ob extern gespeichert oder abgebrochen wurde:
die UI meldet deshalb keinen erfundenen Speichererfolg. „In Dateien sichern“
auf iOS und Android-Dateiapps müssen am Gerät geprüft werden.

## 1FN und 2FN / spätere Aufräumung

`fieldTestProfiles.ts` enthält feste historische Feldprotokolle:
1FN = R → L, drei Gegenstände; 2FN = SR → SL → R → L, drei Gegenstände.
Die Auswahl auf `precision-location-test.tsx` ändert nur die lokale Anzeige,
weder Erkennung noch Aufzeichnung und wird nicht dem Export zugeordnet.
Keine behauptete Herkunft eines beliebigen aktuellen Versuchs.

Empfehlung für einen separaten UI-Auftrag: Hauptansicht auf Vorbereitung,
Fährtenauswahl und Export begrenzen; Build-/Sensor-/Quellen-/Kandidaten-/Shelly-
Modultests aufklappbar. Referenzstrecken verständlich benennen; Legacy Build40
nur im internen Vergleich. Nicht ungeprüft löschen oder Build40 als Build49
bezeichnen. Die überholten pauschalen Texte „nichts gespeichert“ und „keine
Absuche“ korrigieren. In T-170 wurde nur der unmittelbar exportbezogene Text
korrigiert, keine umfassende Neuordnung vorgenommen.

## R2 – Kontokontext und Lebenszyklus des neuen Sidecars

Die unabhängige R1-Prüfung belegte zwei P2-Befunde: direkte Store-Lesezugriffe
hatten keine Kontogrenze; nach erfolgreicher Elternlöschung blieben die neuen
Metadatenschlüssel erhalten. Ein automatischer Datenabfluss wurde nicht belegt.
R1 bleibt als eingefrorenes Vergleichsartefakt erhalten und ist nicht releasefähig.

R2 verwendet den auf allen unterstützten Plattformbasen vorhandenen, nur gelesenen
Kontokontext aus `diagnosticsAccessState`. Die interne QA-Berechtigung und deren
TTL sind **keine** Voraussetzung für normale Aufnahme-Metadaten. Identitätswechsel
A→B→A ändern eine eigene flüchtige Epoche. Alte wartende Reads/Writes können danach
keine Herkunft für den neuen Kontokontext liefern. Bereits nativ zugelassene
Schreibvorgänge werden in der seriellen Queue auf ihren vorherigen Sidecarwert
zurückgesetzt; ausschließlich der neu eingeführte Wert ist betroffen.

Ein `anyvo.support.provenance.v2::`-Bundle pro lokalem Elterntraining enthält Legen
und höchstens 64 exakt zugeordnete Suchversuche. Lokale Konto-/Session-/Run-Schlüssel
werden niemals exportiert. SQLite bestätigt beim Zugriff Besitzer und nicht
gelöschten Elternsatz; Remote-Alias wird auf die lokale ID aufgelöst. Eine fehlende
oder fehlgeschlagene Elternanlage erzeugt keinen verwaisten Sidecar. Der Recorder
wartet nicht auf die Metadatenspeicherung. Keine allgemeine TTL und keine Verdrängung
noch gültiger historischer Suchversuche: oberhalb der Kapazität bleiben neue
persistierte Herkunftsangaben unbekannt; vorhandene Capture-Kontexte bleiben separat
verwertbar. Die bestehende Grenze von 16 Segmenten je Phase/Versuch bleibt sichtbar.

Explizite Elternlöschung sperrt zunächst nur neue Metadatenarbeiten; erst nach
Erfolg des bestehenden Löschablaufs wird der exakte neue Elternschlüssel entfernt.
Bei fehlgeschlagener Elternlöschung bleibt dessen Sidecar erhalten. Bestehender
expliziter lokaler Wipe entfernt nach Erfolg nur den neuen Metadaten-Namensraum
zusätzlich zum unveränderten bisherigen Wipe; QA-Clear nur dessen ausgewählte
Diagnose-Eltern. Kein automatischer Löschaufruf, keine fremde Datenbereinigung.
Support-Export prüft den Kontokontext auch vor Dateischreiben/nativem Teilen.

## Tatsächliche R2-Prüfungen und verbleibende Geräte-QA

- Gemeinsamer gezielter Lauf: **23 Suites / 332 Tests PASS**, 0 FAIL, 0 skipped.
  Darunter echte Repository-Lösch- und bestehende Wipe-Funktionen mit migrierter
  SQLite ausschließlich im Arbeitsspeicher; native RAW-Speicherung gemockt.
- Kontowechsel/Logout/A→B→A, wartende und schon nativ zugelassene Schreibvorgänge,
  QA-Berechtigungsablauf, Remote-Alias, fehlender Elternsatz, Lösch-/Wipe-Fehler,
  erneuter Versuch, selektives QA-Clear, Kapazität und unveränderte andere Daten.
- Diese Tests ersetzen keine echten Geräteprüfungen. Die 74 früheren Bestandstests
  und R1s 296 Tests sind historische Regressionsergebnisse, keine R2-Abnahme.
- Noch am iOS-/Android-Gerät: neue Fährte, spätere Absuche, Aufnahme/Export nach
  Update, Recovery, Offline, große Schrift/Screenreader, natives Teilen/Sichern,
  Abbruch und App-Wechsel. Keine solchen Gerätetests behauptet.
- 01 muss R2 unabhängig prüfen lassen und auf den drei getrennten aktuellen
  Plattformbasen integrieren; keine GPS-Dateien aus iOS nach Android rückportieren.
  Nutzerfreigabe für T170-OTA liegt vor, die Release-Sicherheitsprüfungen bleiben.

Versionierte offizielle Referenzen (SDK54-Webseiten leiteten beim Abruf auf
`latest` um; deshalb zusätzlich SDK54-Quellstand und installierte Deklarationen
geprüft): [Application](https://github.com/expo/expo/tree/sdk-54/packages/expo-application),
[Device](https://github.com/expo/expo/tree/sdk-54/packages/expo-device),
[Updates](https://github.com/expo/expo/tree/sdk-54/packages/expo-updates),
[Sharing](https://github.com/expo/expo/tree/sdk-54/packages/expo-sharing).


## R3 – unabhängig belegte Fehler an den Lebenszyklusgrenzen

Der endgültige R2-Review `T170-R2-INDEPENDENT-REVIEW-07.json` sperrte R2 wegen
überlappender Abbruch-Fences, verspäteter Alias-Snapshots und einer neuen
Metadaten-Exception nach bereits erfolgreicher Quelllöschung. R1/R2 bleiben
getrennt unverändert eingefroren; deren Tests sind keine R3-Abnahme.

R3 korrigiert ausschließlich diese Metadatenfälle:
- Fence-Freigabe zählt genau einmal für denselben Account/Account-Epoche zurück,
  auch wenn ein abgebrochener Wipe die Storage-Epoche geändert hat. Operations-
  Leases behalten den vollständigen Storage-/Account-/ABA-Schutz.
- Nach Aliasauflösung wird die kanonische Lease **vor** einer frischen SQLite-
  Elternabfrage gehalten und danach geprüft. Ein alter Snapshot kann damit den
  bereits gelöschten Elternsatz nicht erneut für Capture-Metadaten autorisieren.
- Neue Cleanup-I/O-Fehler machen eine erfolgreich abgeschlossene vorhandene
  Trainingslöschung oder einen vorhandenen Wipe nicht nachträglich zum Fehler.
  Cleanup meldet getrennt `false`; ursprüngliche RAW-/SQL-Fehler bleiben unverändert.
- Vor dem Sidecar-Entfernen wird ein exakt zugeordnetes lokales Cleanup-Intent
  unter `anyvo.support.provenance.cleanup.v1::[owner,parent]` gespeichert. Dieses
  interne Feld wird niemals exportiert. Der nächste Metadatenzugriff wiederholt
  die Bereinigung seriell und kontogetrennt, auch nach frischen JS-Modulen.
- Fehlschlagende Intent-Schreibvorgänge bleiben über den primären Elternbestand
  auffindbar: eine einzige lesende SQLite-Abfrage ermittelt die gültigen lokalen
  Eltern; ausschließlich neue Sidecars ohne gültigen Elternsatz werden wiederholt
  bereinigt. Statische Suche fand physisches Elternlöschen im Produktcode nur im
  bestehenden expliziten `wipeLocalData`; normale Elternlöschung ist soft-delete.
  Android muss diese Eltern-Lebensdauer beim Port erneut bestätigen. Es gibt keine
  neue SQL-Schreibanweisung, Migration oder allgemeine Historien-/Altersbereinigung.
- Ohne erfolgreich gelesenen Primärbestand wird keine solche Orphan-Bereinigung
  vorgenommen. Alle gültigen historischen Eltern behalten ihre Metadaten. Bei
  ausstehendem explizitem Cleanup werden weder alte Angaben ausgegeben noch neue
  Segmente in den zur Entfernung vorgesehenen Sidecar geschrieben.

Eigene finale R3-Prüfungen: **24 Suites / 345 Tests PASS**, TypeScript PASS,
ESLint 31 geänderte TS/TSX-Dateien, 0 Fehler / 4 unveränderte Basiswarnungen,
`git diff --check` PASS; Schema und synthetische Exportdatei bleiben bytegleich.
Neue Restart-Tests benutzen getrennte JS-Modulinstanzen und nur simulierte
native persistente Bytes plus SQLite `:memory:`. Das ist kein physischer
App-Neustart-/Geräte-/Feldtest. Noch nötig: unabhängige R3-Prüfung und die getrennten
aktuellen Plattformports/Runtime-/Production-Preflights durch 01.

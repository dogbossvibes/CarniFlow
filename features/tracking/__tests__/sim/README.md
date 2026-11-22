# Fährten-Simulator (T-192, T-205) — Stufe 1: Legen, Stufe 2: Absuche, Stufe 3: Führung und Unterbrechungen

Reiner Testcode. Nichts in diesem Ordner wird von der App importiert oder
ausgeliefert, und nichts hier verändert die Fährten-/GPS-/Recorder-Logik.

Der Simulator erzeugt eine **wahre Fährte**, verfälscht sie so, wie ein Handy sie
sehen würde, schickt das Ergebnis durch die **echte Lege-Verarbeitung der App**
(`createLayProcessor`, unverändert) und vergleicht die Aufzeichnung mit der Wahrheit.

## Bausteine

| Datei | Aufgabe |
|---|---|
| `truthTrack.ts` | Wahre Fährte: Schenkel, Winkel, Bögen, Gegenstände; Gehweise (Tempo, Abbremsen im Winkel, Stehen). Vorlagen IGP-1 bis IFH-3 nach FCI-Ordnung 2025. |
| `gpsModel.ts` | GPS-Fehler: langsam wandernder + schneller + zitternder Anteil, Störphasen, Sprünge, Lücken, gemeldete Genauigkeit, gebündelte Zustellung. |
| `profiles.ts` | Geräteklassen, Umgebungen, Trageweise, Plattform. |
| `motionModel.ts` | Drehung und Schritte, wie das Handy sie liefert (baut auf `utils/__tests__/helpers/motionScenarioSim.ts` auf). |
| `layRunner.ts` | Speist alles in die echte Engine und sammelt Linie, Winkel, Distanz, Rechenzeit. |
| `scoring.ts` | Bewertung gegen die Wahrheit. |
| `feldReplay.ts` | Wiedergabe einer Feldaufnahme (QA-Export) durch die echte Lege-Verarbeitung, mit und ohne Zusatzrauschen. |
| `lineGateStudy.ts` | Parameterstudie zum Linien-Gate: dieselben Szenarien mit überschriebenen Werten von `LINE_GATE` (nur im Speicher, Produktdatei unverändert). |
| `scenario.ts`, `matrix.ts` | Einzelszenario, Matrixgruppen, Bericht. |
| `searchTruth.ts` | Wahre Absuche: Hund (Pendeln, Überlaufen, Kreisen, Verweisen) und Hundeführer an der Leine. |
| `searchMocks.ts`, `searchBridge.ts`, `searchRunner.tsx` | Betreibt den echten `useSearchRecorder` ohne Gerät und wertet mit `computeTrackAnalyticsV3` aus, verdrahtet wie `app/track/run.tsx`. |
| `searchScenario.ts` | Legen mit Gegenständen → Liegezeit → Absuche → Bewertung; Unterbrechungen, Antippen, Fährtenverlust; Bewertung der Führung (`scoreGuidance`). |
| `searchBridge.ts` | Nachgebildete Sprachausgabe mit Sprechdauer (Annahme: 120 ms Anlauf, 70 ms je Zeichen) und SQLite-Ersatz für Suchpunkte. |

Seit Stufe 3 (T-205) laufen in der Absuche zusätzlich die **echte Sprachführung** (`useTrackVoiceGuidance` mit Warteschlange),
die **echte Ende-Erkennung** (`useTrackEndGuidance`) und die Ansagen «Suche gestartet», «Gegenstand erkannt» und Off-Track mit,
verdrahtet wie `app/track/run.tsx`. Die Uhr ist Jests künstliche Zeit, Timer laufen in Simulationszeit. Store,
Zwischenspeicher (AsyncStorage-Testersatz) und Suchpunkt-Puffer sind die echten Module: Ein App-Abbruch verwirft alles im
Speicher, die Wiederaufnahme liest nur, was bis dahin tatsächlich gespeichert war (wie `resumeSearch` in `run.tsx`).

## Ausführen

```bash
# Schnelle Selbsttests (laufen im normalen Testlauf immer mit, ~10 s)
npx jest features/tracking/__tests__/sim/faehrtenSim

# Grosse Matrix (übersprungen, solange FAEHRTEN_SIM nicht gesetzt ist)
FAEHRTEN_SIM=full FAEHRTEN_SIM_OUT=/pfad/zum/ausgabeordner npx jest features/tracking/__tests__/sim/layMatrix
```

- `FAEHRTEN_SIM`: `full` oder einzelne Gruppen, z. B. `winkel,geraet` (Legen: `winkel`, `geraet`, `varianten`, `pruefung`;
  Absuche: `suche`, `suchvarianten`, `formen`, `unterbrechungen`, `ablauf`, `android`, `ifh`). `ifh` läuft nicht mit `full`
  (lange Fährten rechnen sehr lange) und nur ausdrücklich: `FAEHRTEN_SIM=ifh FAEHRTEN_SIM_SEEDS=1`.
- Alle Such-Gruppen: `FAEHRTEN_SIM=suche,suchvarianten,formen,unterbrechungen,ablauf,android npx jest features/tracking/__tests__/sim/searchMatrix --maxWorkers=6`.
- Such-Matrix: `FAEHRTEN_SIM=suche,suchvarianten npx jest features/tracking/__tests__/sim/searchMatrix` (Standard 6 Wiederholungen, ~7 min bei 8).
- `FAEHRTEN_SIM_SEEDS`: Wiederholungen je Zelle (Standard 6).
- `FAEHRTEN_SIM_TRACKS`: Prüfungsfährten der Gruppe `pruefung` (Standard `IGP-1,IGP-2,IGP-3`).
- `FAEHRTEN_SIM_OUT`: Ausgabeordner für `group-*.json` und `REPORT.md` (Standard: Temp-Ordner).

Gleicher Seed ergibt exakt denselben Lauf.

## Was gemessen wird

- **Winkel:** gefunden, richtig klassiert (nach den Schwellen der App: Innenwinkel
  65–115° normal, 15–60° spitz), Richtung, Abstand zum wahren Winkelpunkt, falsche Zusatzwinkel.
- **Linie:** Formfehler (seitlicher Abstand zur wahren Fährte nach Abzug der mittleren
  Verschiebung), Längenfehler, Startpunktfehler.
- **Ecken-Abschnitt:** Abstand jedes wahren Winkelpunkts zur gespeicherten Linie (`cornerCutMeanM`), zusätzlich nach Abzug
  der mittleren Verschiebung (`cornerCutShapeMeanM`) und gegen den Winkelpunkt, wie das GPS ihn sah (`cornerCutGpsMeanM`);
  Abstand der gemeldeten Winkelpunkte zur Linie (`apexToLineMeanM`, dieselbe Messung wie an Feldaufnahmen); Länge des
  gespeicherten Linienzugs und Unruhe (Richtungsänderung je Linienpunkt abseits der Winkel).
- **Rechenzeit** der Engine je GPS-Messung.
- **Absuche:** Abgang erkannt, Fährtenende erreicht, automatische Gegenstands-Erkennung (verwiesene und nicht
  verwiesene Gegenstände), gemeldete Abweichung gegen die wahre Abweichung von Hund und Hundeführer,
  Punktzahlen, Abweichungs-Ereignisse, Abrisse.
- **Führung (Stufe 3):** je Winkel/Gegenstand, wie weit der WAHRE Hund bei Sprechbeginn noch davor war
  (rechtzeitig 3–15 m, knapp, zu spät, fehlt, zu früh); abgebrochene, verfallene, doppelte Ansagen und Ansagen
  nicht vorhandener Winkel; Fehler und Sprünge der Pfote; Zeit auf dem falschen Schenkel; Pfote und Ansagen,
  während der Hund am Gegenstand liegt; Fährtenende (angesagt, zu früh, doppelt); manuelles Antippen
  (richtiger Gegenstand, Fehlzuordnung); Fährtenverlust des Hundes als Abriss erkannt; Wiederaufnahme nach
  App-Abbruch (Suchpunkte wiederhergestellt, Funde verloren, Ansagen wiederholt).

## Herkunft der Zahlen

Die Fehlermodelle stammen aus einer Literaturrecherche vom 2026-11-10. Die meisten
Werte sind begründete **Annahmen**, viele Quellen wurden nur als Kurzfassung gelesen.

| Thema | Wert im Simulator | Quelle |
|---|---|---|
| Lagefehler offenes Feld | 1,8–2,8 m (DRMS) | Tomaštík et al. 2017/2021 (Forestry); Szot et al. 2019 (PLoS One) |
| Lagefehler Wald | 5–7 m, dichtes Laubdach 9–14 m | Purfürst 2022 (Sensors 22:1289); Lee et al. 2023 (PLoS One) |
| Ein- vs. Zweifrequenz | rund 20–25 % Unterschied | Purfürst 2022 |
| Fehler wandert langsam | schneller Anteil τ ≈ 30 s, langsamer τ ≈ 15 min | Rostami et al. (WINLAB, AR(3)-Modell); Schumayer et al. 2020 (Sensors 20:6050); Ranacher et al. 2016 |
| Gemeldete Genauigkeit | 68-%-Radius, im Wald zu optimistisch | Android-Dokumentation; Apple-Entwicklerforum 699996; **Kalibrierung für moderne Handys nicht belegt** |
| Lücken | bis ~23 % bei einem schwachen Gerät im Wald | Purfürst 2022 (Xiaomi Mi 8) |
| Bündelung Android | 30-s-Pakete im Hintergrund | eigene Konfiguration (`deferredUpdatesInterval`) |
| Schritt-Unterzählung | 2 % (≥ 1,2 m/s), 6 % (0,9–1,2), 18 % (darunter) | Major & Alford 2016; Höchsmann et al. 2018; Duncan et al. 2017 |
| Schrittlänge | 0,38 m + 0,22 × Tempo | Ho et al. 2016 (Sensors 16:1423) |
| Tempo-Schwankung, Abbremsen im Winkel | 0,05 m/s RMS; 30 % | Kowalsky et al. 2021 (PLoS One); Orendurff et al. 2006 |
| Prüfungsfährten | Länge, Schenkel, Winkel, Gegenstände | FCI-Prüfungsordnung 2025 |

Abgleich mit eigenen Feldaufnahmen (20 QA-Exporte, alle 20–68 s, vermutlich ein
iPhone): Sprung von Sekunde zu Sekunde rund 0,2 m bei 2–17 m gemeldeter
Genauigkeit. Das passt zum langsam wandernden Fehlermodell.

## Feldaufnahme wiedergeben

`feldReplay.ts` spielt den QA-Export einer im Testmodus gelegten Fährte durch die echte
Lege-Verarbeitung: einmal unverändert mit Bewegungssensor, einmal ohne (wie Android), und
je Rauschstufe mehrfach mit zusätzlich verschlechtertem GPS. Der Bericht vergleicht die
Winkelfolge (Anzahl und Richtung) mit den im Feld gesetzten Winkeln.

```
FAEHRTEN_FELD=/pfad/zum/export.json FAEHRTEN_SIM_OUT=<ordner> npx jest features/tracking/__tests__/sim/feldReplay
```

Mehrere Dateien mit Komma trennen. `FAEHRTEN_FELD_SEEDS` setzt die Läufe je Rauschstufe
(Standard 60, 0 = nur die unveränderte Aufnahme). Ohne `FAEHRTEN_FELD` laufen nur die Selbsttests.

Grenzen: Das Rauschen kommt zum echten GPS-Fehler der Aufnahme dazu, die Zahlen sind
deshalb streng und zeigen die Reserve, keine Feldquote. Die Sensorwerte bleiben unverändert.
Feldaufnahmen nicht ins Repository legen.

## Linien-Gate-Studie

`lineGateStudy.test.ts` fährt eine eigene Matrix (Kurzfährte 5–7 m, Einzelwinkel 10/20/40 m, IGP-1; offenes Feld,
Feldrand, lichter Wald; Sonderfälle Tempo, ohne Sensor, Android gebündelt) je Variante von `LINE_GATE` mit denselben Seeds.

```
FAEHRTEN_LINEGATE=1 FAEHRTEN_SIM_SEEDS=10 FAEHRTEN_SIM_OUT=<ordner> npx jest features/tracking/__tests__/sim/lineGateStudy --maxWorkers=1
```

`FAEHRTEN_LINEGATE` nimmt auch Varianten-Nummern (`0,3,7`, Reihenfolge wie `GATE_VARIANTS`); `FAEHRTEN_LINEGATE_TAG` benennt
die Ausgabedatei, damit sich die Studie auf zwei Prozesse verteilen lässt (rund 5 min je Variante bei 10 Seeds). Mit
`FAEHRTEN_FELD` laufen zusätzlich Feldaufnahmen je Variante, unverändert und verrauscht.

Befund vom 2026-11-22 (10 Seeds, 216 Läufe je Variante, plus zwei Feldaufnahmen): Weniger Glättung (`emaAlpha` 0,4 → 0,7)
bringt die Linie näher an den GEMELDETEN Winkelpunkt (0,72 → 0,33 m), gegenüber dem WAHREN Winkelpunkt aber wenig
(GPS-Sicht 1,17 → 0,90 m, absolut 3,11 → 2,94 m), und verlängert die Linie (Feldrand +28 → +39 %, Wald +53 → +69 %).
Auch mit fehlerfreiem GPS bleiben rund 1 m (rechter Winkel) bis 2 m (Spitzwinkel) Abschnitt. Werte deshalb nicht geändert.
Die Winkelerkennung läuft nur, wenn ein Linienpunkt gesetzt wird: Jede Änderung am Linien-Gate verschiebt diese Zeitpunkte
und kann kurzlebige Kandidaten melden oder auslassen (Aufnahme vom 22.11.: vierter Winkel bei 33 s).

## Grenzen

- **Kein Ersatz für Gerätetests.** Akku, echte Hintergrund-Abbrüche und
  herstellerspezifisches Verhalten zeigt nur das echte Handy.
- **Hundemodell ist eine Stellschraube, keine Wahrheit.** Für Sport-Fährtenhunde gibt es keine Messstudien;
  die drei Hundetypen und die Leinenführung (Schleppkurve, Hundeführer geht am Gegenstand zum Hund) sind Annahmen.
- **Nicht abgebildet in der Absuche:** Haptik, Segment-Ansagen, Hörbarkeit der Ansage, Kartenanzeige.
- **Sperrbildschirm/Anruf** sind als «keine Positionen in dieser Zeit» abgebildet: Die Absuche fordert keine
  Hintergrund-Ortung an (`positionStream`: `allowBackground: false`), iOS liefert dann keine Positionen. Dass die App
  in dieser Zeit tatsächlich angehalten wird, ist aus dem Code abgeleitet, nicht auf dem Gerät gemessen.
- **Android (korrigiert in T-207):** Die Absuche nutzt auf Android das GPS direkt im Sekundentakt (kein Bündeln,
  `AnyvoPrecisionLocationModule.kt`). Die Hintergrund-Option wirkt nur auf iOS, und die Absuche hat auf Android keinen
  Vordergrund-Dienst → bei ausgeschaltetem Bildschirm bildet der Simulator keine Positionen ab (aus dem Code abgeleitet).
- **App-Abbruch:** Die Wiederaufnahme folgt `resumeSearch` (run.tsx) ohne Dialog und ohne Transfer-Prüfung.
- **Nicht an eigenen Daten geeicht.** Lange Fährten, Wald und Android fehlen in den
  vorhandenen Feldaufnahmen; die Modelle sind dort reine Literaturwerte.
- **Winkelradius und Hosentaschen-Einfluss aufs GPS** sind Annahmen ohne Messdaten.
- **Lange Fährten rechnen langsam**, weil die Winkelerkennung der App bei jedem
  neuen Punkt die gesamte Fährte neu auswertet (siehe Bericht „Rechenzeit“).
  IFH-Fährten sind deshalb nicht in der Standardmatrix (eigene Gruppe `ifh`).

# Fährten-Simulator (T-192) — Stufe 1: Legen

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
| `scenario.ts`, `matrix.ts` | Einzelszenario, Matrixgruppen, Bericht. |

## Ausführen

```bash
# Schnelle Selbsttests (laufen im normalen Testlauf immer mit, ~10 s)
npx jest features/tracking/__tests__/sim/faehrtenSim

# Grosse Matrix (übersprungen, solange FAEHRTEN_SIM nicht gesetzt ist)
FAEHRTEN_SIM=full FAEHRTEN_SIM_OUT=/pfad/zum/ausgabeordner npx jest features/tracking/__tests__/sim/layMatrix
```

- `FAEHRTEN_SIM`: `full` oder einzelne Gruppen, z. B. `winkel,geraet` (Gruppen: `winkel`, `geraet`, `varianten`, `pruefung`).
- `FAEHRTEN_SIM_SEEDS`: Wiederholungen je Zelle (Standard 6).
- `FAEHRTEN_SIM_TRACKS`: Prüfungsfährten der Gruppe `pruefung` (Standard `IGP-1,IGP-2,IGP-3`).
- `FAEHRTEN_SIM_OUT`: Ausgabeordner für `group-*.json` und `REPORT.md` (Standard: Temp-Ordner).

Gleicher Seed ergibt exakt denselben Lauf.

## Was gemessen wird

- **Winkel:** gefunden, richtig klassiert (nach den Schwellen der App: Innenwinkel
  65–115° normal, 15–60° spitz), Richtung, Abstand zum wahren Winkelpunkt, falsche Zusatzwinkel.
- **Linie:** Formfehler (seitlicher Abstand zur wahren Fährte nach Abzug der mittleren
  Verschiebung), Längenfehler, Startpunktfehler.
- **Rechenzeit** der Engine je GPS-Messung.

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

## Grenzen

- **Kein Ersatz für Gerätetests.** Akku, echte Hintergrund-Abbrüche und
  herstellerspezifisches Verhalten zeigt nur das echte Handy.
- **Nur das Legen.** Absuche, Hundeverhalten, Gegenstands-Platzierung und der
  Vergleich Legen ↔ Suchen sind noch nicht abgebildet.
- **Nicht an eigenen Daten geeicht.** Lange Fährten, Wald und Android fehlen in den
  vorhandenen Feldaufnahmen; die Modelle sind dort reine Literaturwerte.
- **Winkelradius und Hosentaschen-Einfluss aufs GPS** sind Annahmen ohne Messdaten.
- **Lange Fährten rechnen langsam**, weil die Winkelerkennung der App bei jedem
  neuen Punkt die gesamte Fährte neu auswertet (siehe Bericht „Rechenzeit“).
  IFH-Fährten sind deshalb nicht in der Standardmatrix.

# Handoff: ANYVO — Fährten-Bereich (Variante C + Live-Recorder-Flow)

## Overview
Neuer **Fährten-Tab** für die ANYVO-App (Hundesport / Nasenarbeit). Modell folgt dem echten
Arbeitsablauf: Eine Fährte wird **gelegt** (live mitgeschnitten), **reift** (Liegezeit), und wird
danach vom Hund **ausgearbeitet** und bewertet.

Gewählte Übersichts-Variante: **C „Karte zuerst"**.

Flow: **Übersicht → Fährte legen → Liegezeit → Ausarbeiten → Auswertung → Logbuch**.

> Wichtig: Es gibt **kein Vorab-Planen** mehr. Länge, Winkel und Gegenstände werden **nicht**
> vorher eingegeben, sondern **während des Legens** spontan entschieden bzw. automatisch erkannt.

## About the Design Files
Die Dateien sind **Design-Referenzen in HTML/React** (Browser-Prototyp). Sie zeigen das
**gewünschte Aussehen und Verhalten** — **kein** produktionsfertiger Code. Aufgabe: diese Designs
in der **bestehenden ANYVO-Codebase** mit deren Patterns/Libraries nachbauen (SwiftUI,
React Native, Flutter …). GPS-Karte & Fährten-Skizze sind stilisierte Mocks → echte Karten-Lib
(MapKit / Mapbox) bzw. echte GPS-Spur. Beispieldaten → echte Models.

## Fidelity
**High-fidelity.** Farben, Typo, Abstände, Radien und Interaktionen sind verbindlich.

---

## Design Tokens (Auszug — alle Werte in `anyvo.css`)
- **Farben:** bg `#000`, surface `#0d0e10`, **Akzent (Mint) `#15e6c3`**, Akzent-2 `#00c9d6`,
  warn `#ffb547`, bad/Abriss `#ff5d6c`, text `#fff`, muted `rgba(255,255,255,.56)`.
- **Material-Farben:** Stoff `#15e6c3`, Holz `#ffb547`, Leder `#d08a5a`, Plastik `#8ad7ff`, Diverses `#a78bff`.
- **Typo:** `Archivo` (UI) + `Archivo Expanded` (Display/Zahlen). Display = weight 800, uppercase,
  `letter-spacing:-.02em`, `line-height:.92`. Zahlen immer `tabular-nums`.
- **Radien:** Karten 26px, Buttons 16px, Chips 12px. Glow-Schatten siehe `.card-glow` / `.btn-primary`.
- **Bausteine:** `.card`, `.card-glow`, `.glass` (backdrop-blur 20px), `.btn-primary` (Mint bg, Text `#04201b`),
  `.btn-ghost`, `.chip` (aktiv = Mint-dim).

---

## Datenmodell (Kern)
Eine **Session** (eine Fährte) entsteht beim Legen und wird durch alle Folge-Screens gereicht:
```
session = {
  points:  [[x,y], …]        // normalisierte GPS-Spur (0..1), Punkt-für-Punkt aufgezeichnet
  corners: [{ idx, type }]   // erkannte Winkel; type = 'right' | 'left' | 'spitz'
  breaks:  [ idx, … ]        // erkannte Abrisse (Index in points, an dem die Spur abreißt)
  objects: [{ idx, material }]// abgelegte Gegenstände; material = stoff|holz|leder|plastik|diverses
  steps:   Number            // gelaufene Schritte (live hochgezählt)
  surface: 'Acker'|'Wiese'|'Wald'|'Mischung'
  laidAt:  Timestamp         // Zeitpunkt „fertig gelegt" → Basis der Liegezeit
  dogId
}
```
`idx` referenziert einen Punkt in `points` — daraus ergeben sich Position auf der Karte und
Fortschritts-Bruchteil beim Ausarbeiten.

---

## Screens / Views

### 1 · Übersicht „Karte zuerst" (Variante C) — Hauptscreen
Große GPS-Karten-Card der letzten Fährte (Overlays: Label, Punkte-Badge, 3 KPIs Fährten/Ø/Serie).
Darunter 2×2 Schnellaktionen — **Legen** (Mint, gefüllt), **Ausarbeiten**, **Logbuch**, **Auswertung**.
Dann „Verlauf" mit Track-Rows (Mini-Skizze + Meta + Punktzahl). Bottom-Tab-Bar (Fährten aktiv).

### 2 · Fährte legen  ⭐ Kern-Screen
**Live-GPS-Recorder auf echter Satellitenkarte** (Apple-Maps-Satellit-Look; im Prototyp eine
stilisierte Luftbild-Nachbildung → in der App die echte Karten-Lib, z. B. MapKit Satellit).
Vollflächige Karte, die den real gelaufenen Weg **Punkt für Punkt** als Mint-Linie zeichnet.
Layout (vgl. echter Screen):
- **Kopf:** Zurück · rote **LIVE**-Pill (blinkender Punkt) · Segmented **Karte / Skizze** (Mint aktiv).
- **Timer oben links:** große Zeit + Label **AUFNAHME** (matter dunkler Overlay-Block).
- **Hunde-Chip oben rechts:** runder Mint-Avatar mit Initiale + Name.
- **Positions-Puck:** blauer Apple-Location-Punkt (weißer Ring) mit Türkis-Halo (pulsierend).
- **Metrik-Leiste unten auf der Karte** (dünne Trenner): **SCHRITTE · DISTANZ · GEGENST · WINKEL**.
- **Schritte zählen live hoch** — Länge wird **nicht** vorher geplant, entsteht beim Laufen.
- **Winkel automatisch aus dem GPS-Verlauf erkannt & klassifiziert:** Rechter (R), Linker (L),
  Spitzwinkel (S, orange `#ffb547`). Jeder erzeugt einen Marker auf der Spur + Toast-Bestätigung.
- **Abriss-Erkennung:** Lücke/Sprung im Verlauf → **Abriss (A)**, roter Marker `#ff5d6c` + Toast.
- **Gegenstand (Marker) ablegen:** Bottom-Sheet zur **Material-Wahl** —
  **Stoff / Holz / Leder / Plastik / Diverses** (eigenes Icon + Farbe); Marker an aktueller Position.
- **Sprachsteuerung-Pill** (Mikrofon) über den Buttons.
- **Buttons:** **Marker** · **Pause** · **Stop & Weiter** (rot) → Liegezeit.

> Erkennungs-Logik (Referenz): Heading-Änderung über ein gleitendes Fenster der GPS-Punkte
> bestimmen; |Δ| ≈ 90° → rechter/linker Winkel (Vorzeichen = Drehrichtung), |Δ| deutlich > 90°
> (scharfe Kehre) → Spitzwinkel; Positions-Sprung / Lücke über Schwellwert → Abriss.
> Im Prototyp ist dies aus Demo-Gründen simuliert — in der App aus dem realen GPS-Stream ableiten.

### 3 · Liegezeit
Nach „fertig gelegt" läuft ein **Reife-Timer** (zählt seit `laidAt` hoch, groß dargestellt).
Ziel-Liegezeit als Chips (15 min / 30 min / 1 h / 2 h) mit Fortschrittsbalken („bereit zum
Ausarbeiten", sobald erreicht). Vorschau der **gelegten Fährte** (Karte + Kennzahlen Länge/Winkel/
Gegenstände/Boden). Karte **„Erkannte Winkel & Ereignisse"**: Zähler für R/L/Spitz/Abriss.
Liste der **ausgelegten Gegenstände** nach Material. Button **„Ausarbeiten starten"**.

### 4 · Ausarbeiten (Live-Suche)  ⭐ exakt an echter App
Gleiche **Satellitenkarte** wie Legen. Der Hund arbeitet die **gelegte** Fährte aus: dieselbe Spur
liegt gedimmt/gepunktet im Hintergrund, der **ausgearbeitete Teil** wird hell nachgezeichnet, mit
blauem **Location-Puck**. Layout (vgl. echter Screen):
- **Kopf:** Zurück · rote **LIVE**-Pill · Segmented **Karte / Skizze**.
- **Timer oben links:** Zeit + Label **SUCHDAUER**. **Hunde-Chip** oben rechts.
- **Metrik-Leiste unten** (dünne Trenner): **DISTANZ · GEGENST. (gefunden/gesamt) · ABWEICH.
  (Abweichung von der Fährte) · GPS (Genauigkeit in m)**.
- **Sprachsteuerung-Pill** (Mikrofon) über den Buttons.
- **Buttons:** **Gegenstand** (Flagge, ghost) · **Ton an/aus** (Mint, Lautsprecher — Audio-Feedback
  togglen) · **Stop & Auswerten** (rot) → Auswertung.
- Gegenstände „füllen" sich, sobald der Hund sie passiert.

### 5 · Auswertung
Score-Ring + Display-Headline. Highlight-Reihe (Gegenstände / Winkel / **Abriss**).
**Bewertung pro Abschnitt** (LegBars): je Streckenabschnitt + jeder erkannte Winkel **mit seinem
Typ benannt** (Rechter/Linker/Spitzwinkel) + ggf. **Abriss-Zeile** (Punktabzug) + Gegenstände.
Fährtenverlauf-Skizze. Liste der **verwiesenen Gegenstände** nach Material. Notiz + Tags.

### 6 · Logbuch
Filterbare Historie (Untergrund). Pro Eintrag Mini-Skizze + Meta + Fortschrittsbalken + Punktzahl.

### Globale Chrome
Sub-Header (Titel + Hunde-Switcher mit Avatar-Dropdown), Glass-Bottom-Tab-Bar (5 Tabs,
Fährten aktiv), wiederverwendbarer Wetter-Strip (Temp/Wind/Bodenfeuchte/Luftfeuchte).

---

## Interactions & Behavior
- **Recorder:** GPS-Punkte laufend anhängen; Schritte live; Winkel/Abriss **automatisch** aus dem
  Verlauf klassifizieren (kein manuelles Setzen). Pause hält Aufzeichnung & Timer an.
- **Liegezeit:** Stoppuhr ab `laidAt`; Ziel-Liegezeit nur Orientierung.
- **Ausarbeiten:** Fortschritt 0→1 über `points`; gefundene Gegenstände, wenn `obj.idx` passiert.
- **Animationen:** Live-Linie fließende Strichelung; Positions-Punkt pulsiert; Toasts; Score-Ring
  & LegBars animiert; LIVE/REC-Punkt blinkt. Bei `prefers-reduced-motion` Deko-Loops aussetzen.

## State
`activeDog`, `session` (s. o.), beim Legen lokal: `points/corners/breaks/objects/steps/secs/walking`.
Datenbedarf der echten App: Hunde, Fährten-Historie, **GPS-Live-Feed** (für Recorder & Erkennung),
optional Wetter-API.

## Assets / Icons
Icons als Inline-SVG (`icons.jsx`, 1.8px Stroke, currentColor) — inkl. Material-Icons
(stoff/holz/leder/plastik/diverses), `hourglass` (Liegezeit), `angle`, `undo` (Abriss). In der App
durch vorhandenes Icon-Set ersetzen. Fonts: Archivo / Archivo Expanded.

## Files
- `Faehrten.html` — Einstieg (Design-Canvas: Variante C + kompletter Flow). Im Browser öffnen.
- `flow.jsx` — **Legen (Recorder + Auto-Erkennung)**, Liegezeit, Ausarbeiten, Auswertung, Logbuch.
- `viz.jsx` — Pfad-Renderer (typisierte Winkel R/L/S, Abriss-Marker), Material-Registry,
  `makeSample()` (Demo-Spur), ScoreRing, LineChart, LegBars.
- `overviews.jsx` — Übersichts-Varianten (C = `OverviewMap`).
- `chrome.jsx` — Sub-Header, Hunde-Switcher, Tab-Bar, Wetter-Strip, Stepper.
- `icons.jsx` — Icon-Set inkl. Material-/Liegezeit-Icons.
- `app.jsx` — Router + Beispieldaten + Demo-Session.
- `anyvo.css` — **alle Tokens & Bausteine** (wichtigste Werte-Datei).
- `main.jsx` — Canvas-Komposition + Tweaks.
- `ios-frame.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx` — nur Präsentations-Gerüst, **nicht** Teil des Features.

---

## Umsetzung mit Claude Code
1. Ordner ins App-Repo legen (z. B. `design/anyvo-faehrten/`), Repo in VS Code öffnen, Claude Code starten.
2. Auftrag:
   > „Lies `design/anyvo-faehrten/README.md` und die `.jsx`/`.css`-Referenzen. Baue den Fährten-Tab
   > (Variante C + Flow Legen→Liegezeit→Ausarbeiten→Auswertung→Logbuch) in unserer Codebase nach.
   > Wichtig: **kein Vorab-Planen** — der Legen-Screen ist ein **Live-GPS-Recorder**, der Schritte
   > live zählt, Gegenstände mit Material (Stoff/Holz/Leder/Plastik/Diverses) an der aktuellen
   > Position ablegt und **Winkel automatisch erkennt & klassifiziert** (rechter/linker/Spitzwinkel)
   > sowie **Abrisse** erkennt. Nutze unsere Karten-Lib für die GPS-Spur und unser Theme; mappe die
   > Tokens aus `anyvo.css`. Starte mit dem Legen-Screen und der Erkennungs-Logik."
3. Screen für Screen umsetzen und gegen `Faehrten.html` im Browser vergleichen.

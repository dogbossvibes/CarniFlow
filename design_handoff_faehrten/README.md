# Handoff: ANYVO — Fährten-Bereich (Variante C + kompletter Flow)

## Overview
Neuer **Fährten-Tab** für die ANYVO-App (Hundesport / Nasenarbeit). Der Bereich deckt den
gesamten Arbeitsablauf einer Fährte ab: Übersicht → Fährte planen → Live-Tracking →
Auswertung → Logbuch. Gewählte Übersichts-Variante: **C „Karte zuerst"**.

Sandra (Beispiel-Nutzerin) trainiert zwei Hunde (Akira, Balou). Sie plant eine Fährte mit
definierten Parametern, läuft sie mit GPS-Tracking ab, bewertet sie abschnittsweise und
sammelt alle Läufe im Logbuch.

## About the Design Files
Die Dateien in diesem Bundle sind **Design-Referenzen, erstellt in HTML/React** (Prototyp via
Babel im Browser). Sie zeigen das **gewünschte Aussehen und Verhalten** — sie sind **kein
produktionsfertiger Code zum 1:1-Kopieren**. Die Aufgabe ist, diese Designs in der
**bestehenden ANYVO-Codebase** mit deren etablierten Patterns/Libraries nachzubauen
(z. B. SwiftUI, React Native, Flutter — je nachdem, womit ANYVO gebaut ist). Falls noch keine
Umgebung existiert, das passendste Framework wählen und dort umsetzen.

Die SVG-Grafiken (GPS-Karte, Fährten-Skizze) sind **stilisierte Mocks** — in der echten App
durch die reale Karten-Lib (MapKit / Mapbox / Google Maps) bzw. eine echte GPS-Spur ersetzen.

## Fidelity
**High-fidelity (hifi).** Finale Farben, Typografie, Abstände, Radien und Interaktionen sind
verbindlich. UI bitte pixelgenau mit den Libraries der Codebase nachbauen. Beispieldaten
(Hunde, Punkte, Verlauf) sind Platzhalter und durch echte Daten zu ersetzen.

---

## Design Tokens

### Farben
| Token | Hex | Verwendung |
|---|---|---|
| `--bg` | `#000000` | App-Hintergrund (reines Schwarz) |
| `--surface` | `#0d0e10` | Karten-Basis |
| `--surface-2` | `#141518` | Glass-Flächen / erhöhte Elemente |
| `--surface-3` | `#1b1d21` | Inputs, Stepper-Buttons |
| `--line` | `rgba(255,255,255,0.075)` | Standard-Border / Divider |
| `--line-strong` | `rgba(255,255,255,0.14)` | Border auf interaktiven Elementen |
| `--acc` | `#15e6c3` | **Primär-Akzent (Mint)** — CTAs, aktive Zustände, Daten |
| `--acc-2` | `#00c9d6` | Gradient-Partner zu `--acc` |
| `--acc-dim` | `rgba(21,230,195,0.13)` | Icon-Hintergründe, aktive Chips |
| `--acc-glow` | `rgba(21,230,195,0.45)` | Glow-Schatten |
| `--warn` | `#ffb547` | Korrektur / mittlere Bewertung |
| `--bad` | `#ff5d6c` | Live-REC, Stop-Button, Fehler |
| `--text` | `#ffffff` | Primärtext |
| `--muted` | `rgba(255,255,255,0.56)` | Sekundärtext |
| `--faint` | `rgba(255,255,255,0.34)` | Tertiär / Captions |

Akzentfarbe ist tokenisiert — eine Theme-Variable, nicht hartkodiert (Prototyp erlaubt
Umschalten auf Blau/Orange/Violett/Pink).

### Typografie
- **Familie:** `Archivo` (Body/UI), `Archivo Expanded` (Display/Zahlen). Google Fonts.
- **Display** (Headlines, große Zahlen): Archivo Expanded, weight **800**,
  `letter-spacing: -0.02em`, `line-height: 0.92`. Oft `text-transform: uppercase`.
- **Eyebrow** (Sektions-Label): 11px, weight 700, `letter-spacing: 0.22em`, uppercase, `--faint`.
- **Label-Cap** (Mini-Captions unter Zahlen): 10px, weight 700, `letter-spacing: 0.16em`, uppercase, `--muted`.
- **Body:** Archivo 13–14px, weight 600–700.
- **Zahlen:** immer `font-variant-numeric: tabular-nums` (`.num`).

### Radien & Schatten
| Token | Wert |
|---|---|
| `--r-lg` | `26px` (Karten) |
| `--r-md` | `20px` |
| `--r-sm` | `14px` |
| Buttons | `16px` |
| Chips | `12px` |
| Glow-Schatten (Karten) | `0 0 0 1px rgba(21,230,195,0.10), 0 18px 40px -22px rgba(21,230,195,0.30)` |
| Primär-Button-Schatten | `0 10px 30px -10px var(--acc-glow), inset 0 1px 0 rgba(255,255,255,0.4)` |

### Bausteine
- **Karte (`.card`):** Gradient `linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.012))`, 1px `--line` Border, Radius `--r-lg`. Variante `.card-glow` mit Mint-Border + Glow.
- **Glass (`.glass`):** `rgba(20,22,25,0.62)` + `backdrop-filter: blur(20px) saturate(150%)`, Border `rgba(255,255,255,0.09)`. Für schwebende Overlays (Timer, Bottom-Nav, Map-Pills).
- **Primär-Button:** bg `--acc`, Text `#04201b` (dunkles Mint-Schwarz), weight 700.
- **Ghost-Button:** bg `rgba(255,255,255,0.06)`, Border `--line-strong`.
- **Chip:** inaktiv `rgba(255,255,255,0.05)`/`--muted`; aktiv `--acc-dim` bg + Mint-Border + Mint-Text.

---

## Screens / Views

### 0 · Globale Chrome
- **Status-Bar:** iOS-Style, 9:41, dunkel.
- **Sub-Header:** Zeile mit Route-Icon (oder Zurück-Pfeil bei Unterseiten) + Titel in Display-Schrift (uppercase) + **Hunde-Switcher** rechts (Glass-Pill mit rundem Avatar-Initial, Dropdown listet alle Hunde mit Rasse/Level).
- **Bottom-Nav (Tab-Bar):** 5 Tabs — Start, Hunde, **Fährten** (aktiv), Hub, Profil. Glass-Pill, aktiver Tab in Mint mit kurzem Leucht-Strich oben + Glow. Icon + 9.5px Label.
- **Avatar:** Kreis, Gradient aus zwei hundespezifischen Farben, Initial in dunklem Mint-Schwarz.

### 1 · Übersicht „Karte zuerst" (Variante C) — Hauptscreen
- **Zweck:** Einstieg; letzte Fährte als Karte, Schnellaktionen, Verlauf.
- **Layout:** vertikal scrollbar, 18px Seitenrand.
  1. **Große Karten-Card** (Radius `--r-lg`, Mint-getönte Border): GPS-Karte der letzten Fährte (Höhe ~248px). Overlays (Glass-Pills): oben-links „Letzte Fährte · Acker · 600 Schr", oben-rechts Punktzahl-Badge („94 / PUNKTE", Mint), unten eine Glass-Leiste mit 3 Kennzahlen (Fährten / Ø Punkte / Serie, mit vertikalen Trennern).
  2. **Schnellaktionen** — 2×2 Grid: **Planen** (Mint-Button, gefüllt, Plus-Icon), **Live** (Karte, Play), **Logbuch** (Karte, Layers), **Auswertung** (Karte, Chart). 20px Radius, Icon + 14.5px Bold-Label.
  3. **„Verlauf"-Sektion** (Eyebrow-Label + „Logbuch →"-Link): 2 Track-Rows.
- **Track-Row:** Karte, links 50–58px Mini-Fährten-Skizze (gerundet), Mitte Untergrund+Datum (bold) und Meta-Zeile (`600 Schr · 3 Winkel · 1 h`), rechts große Punktzahl (Mint wenn ≥90) + „PKT". Klick → Auswertung.

### 2 · Fährte planen
- **Zweck:** Parameter einer neuen Fährte definieren.
- **Layout:** scrollbar; oben **Vorschau-Card** (`.card-glow`) mit Live-aktualisierter Fährten-Skizze (Höhe 188px) und Footer-Streifen mit 4 Werten (Länge / Verlauf / Apportier / Alter).
- **Parameter-Sektion:**
  - **Länge:** Slider 200–1500 Schritt (Schritt 50), Akzentfarbe `--acc`, Wertanzeige rechts oben.
  - **Winkel:** Stepper 0–5 (Anzahl Richtungswechsel).
  - **Gegenstände:** Stepper 0–5 (Apportierstücke).
  - Jede Zeile = Field-Card: 38px Icon-Box (`--acc-dim` bg, Mint-Icon) + Label + Hint + Control rechts.
- **Liegezeit:** Chip-Reihe 30 min / 1 h / 2 h / 3 h (Single-Select).
- **Untergrund:** Chip-Reihe Acker / Wiese / Wald / Mischung.
- **Verleitung:** Toggle-Zeile (Switch, Mint wenn an).
- **Bedingungen:** Wetter-Strip (s. u.) + Hinweiszeile mit Sparkle-Icon.
- **Footer (fixiert, mit Fade):** „Entwurf speichern" (Ghost) + „Live starten" (Primär, Play-Icon) → Screen 3.
- **Stepper:** −/+ Buttons 34px, Radius 10px, disabled bei min/max; Wert mittig in `.num` 19px.
- **Toggle:** 50×30px Pill, Knopf 24px mit Feder-Transition.

### 3 · Live-Tracking
- **Zweck:** Laufende Fährte verfolgen.
- **Layout:** Vollflächige Karte/Skizze füllt den Screen (Radius 24px, 14px Rand).
  - **Top-Bar:** Zurück-Button + **LIVE-Pill** (roter blinkender Punkt `--bad`, „LIVE") + Karte/Skizze-Umschalter (Segmented Control, aktiv = Mint).
  - **Map/Sketch:** GPS-Karte mit animierter Fährtenlinie (`flow-line`, fließende Strichelung) ODER abstrakte Skizze; aktuelle Position als pulsierender Punkt.
  - **Overlays (Glass):** oben-links **Timer** (Display 30px, mm:ss, „Laufzeit"), oben-rechts Hunde-Pill, unten Metrik-Leiste mit 4 Werten (Distanz / Gegenst. / Abschnitt / Boden).
  - **Steuerung (unten):** 3 Buttons — „Gegenstand" (markiert Fund), „Pause/Weiter" (toggelt), „Stop & Auswerten" (rot `--bad`) → Screen 4.
- **Verhalten:** Timer zählt jede Sekunde hoch; Fortschritt der Linie wächst; gefundene Gegenstände hochzählbar; Pause stoppt Timer.

### 4 · Auswertung
- **Zweck:** Lauf abschnittsweise bewerten.
- **Layout:**
  1. **Hero-Card** (`.card-glow`): links **Score-Ring** (118px, Mint-Gradient, animiert), rechts Eyebrow „Akira · Heute", Display-Headline „SEHR GUT.", Tag-Chips (Länge/Untergrund/Winkel).
  2. **Highlight-Reihe:** 3 Mini-Cards (Gegenstände / Winkel / Verleitung) mit Icon + Wert.
  3. **„Bewertung pro Abschnitt"** — Card mit **LegBars**: pro Zeile Name + Score/Max + farbiger Balken (Mint ≥90 %, Hellgrün ≥75 %, Orange darunter, mit Glow). Footer: Gesamtpunktzahl.
  4. **„Fährtenverlauf"** — Card mit voller Fährten-Skizze + Legende (Fährte / Gegenstand / Korrektur).
  5. **„Notiz"** — Freitext + Hashtag-Tags.
- **Footer:** „Logbuch" (Ghost) + „Auswertung speichern" (Primär, Check) → zurück zur Übersicht.
- **Score-Ring:** SVG-Kreis, `stroke-linecap: round`, Gradient `--acc`→`#00c9d6`, Drop-Shadow-Glow, animierter `stroke-dashoffset` (1s ease). Innen große `.num`-Zahl + Label + optionaler Sub.

### 5 · Logbuch (Historie)
- **Zweck:** Alle Fährten eines Hundes durchsuchen.
- **Layout:** Sub-Header mit Hunde-Switcher; Filter-Chips (Alle / Acker / Wiese / Wald); Liste von Karten.
- **Logbuch-Row:** 64px Mini-Skizze + Untergrund/Datum + Meta + dünner Fortschrittsbalken + große Punktzahl rechts.

### Wetter-Strip (wiederverwendbar)
4 Spalten: Temperatur (°), Wind (km/h + Richtung), Bodenfeuchte (%), Luftfeuchte (%). Je
Spalte Mint-Icon + `.num`-Wert + Label-Cap. In Planen und Übersicht eingesetzt.

---

## Interactions & Behavior
- **Navigation:** Übersicht ist Hub. Planen → (Live starten) → Live → (Stop & Auswerten) → Auswertung → (speichern) → Übersicht. Zurück-Pfeile im Sub-Header. Logbuch von Übersicht & Auswertung erreichbar.
- **Hunde-Switcher:** Dropdown wechselt aktiven Hund global (alle Screens/Daten folgen).
- **Live-Timer:** `setInterval` 1 s; Pause stoppt; Fortschritt 0→~1 treibt Linien-Zeichnung und „Abschnitt"/Distanz-Anzeige.
- **Animationen:** Score-Ring `stroke-dashoffset` 1s `cubic-bezier(.2,.8,.2,1)`; LegBars Breite 0.8s; Toggle-Knopf Feder-Transition; Live-Linie fließende Strichelung (`@keyframes dashFlow`); LIVE-Punkt blinkt (`@keyframes anyvoRec`); Positions-Punkt pulsiert.
- **Reduced-Motion:** dekorative Loops bei `prefers-reduced-motion` aussetzen.

## State Management
- `activeDog` (id) — global, steuert alle Daten.
- `plan` — `{ length, angles, objects, age, surface, distraction }`.
- `liveSession` — `{ elapsedSec, progress, paused, foundObjects }`.
- `evaluation` — Abschnitts-Scores, Notiz, Tags.
- `history[]` — abgeschlossene Fährten pro Hund.
- Datenbedarf: Hunde-Liste, Fährten-Historie, optional Live-GPS-Feed + Wetter-API.

## Assets / Icons
- **Icons:** komplett als Inline-SVG (`icons.jsx`), 1.8px Stroke, `currentColor`. In der echten App durch das vorhandene Icon-Set ersetzen (route, paw, target, flag, timer, wind, drop, temp, chart, layers, clock, angle, ruler, pin, map, sparkle, …).
- **Fonts:** Archivo / Archivo Expanded (Google Fonts) — falls die App eine andere Display-Schrift nutzt, deren Pendant verwenden, aber das gestauchte/uppercase Display-Verhalten beibehalten.
- **Karte:** Mock-SVG → echte Karten-Lib.

## Files (in diesem Bundle)
- `Faehrten.html` — Einstieg (Design-Canvas mit allen Varianten + Flow). Öffnen im Browser.
- `main.jsx` — Canvas-Komposition + Tweaks (Variante C als gewählt markiert).
- `app.jsx` — Router + **Beispieldaten** (Hunde, Wetter, Stats, Historie).
- `overviews.jsx` — die 4 Übersichts-Varianten (Variante C = `OverviewMap`).
- `flow.jsx` — Planen / Live / Auswertung / Logbuch.
- `viz.jsx` — Datenvisualisierung (TrackSketch, GpsMap, ScoreRing, LineChart, LegBars).
- `chrome.jsx` — Sub-Header, Hunde-Switcher, Bottom-Nav, Wetter-Strip, Stepper.
- `icons.jsx` — Icon-Set.
- `anyvo.css` — **alle Design-Tokens & Bausteine** (wichtigste Datei für Werte).
- `ios-frame.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx` — nur Präsentations-Gerüst, **nicht** Teil des Features.

---

## So setzt du es mit Claude Code um
1. Lege diesen Ordner **in dein App-Repo** (z. B. `design/anyvo-faehrten/`).
2. Öffne das Repo in VS Code, starte Claude Code im Projektordner.
3. Gib Claude Code etwa diesen Auftrag:
   > „Lies `design/anyvo-faehrten/README.md` und die `.jsx`/`.css`-Referenzen. Baue den
   > Fährten-Tab (Variante C + Flow Planen→Live→Auswertung→Logbuch) in unserer bestehenden
   > Codebase nach — nutze unsere vorhandenen Komponenten, Navigation und unser Theme.
   > Mappe die Design-Tokens aus `anyvo.css` auf unsere Theme-Variablen. Ersetze die
   > Mock-GPS-Karte durch unsere Karten-Lib und die Beispieldaten durch echte Models.
   > Beginne mit dem Übersichts-Screen (Variante C)."
4. Erst **einen Screen** umsetzen lassen, gegen `Faehrten.html` im Browser vergleichen, dann iterieren.

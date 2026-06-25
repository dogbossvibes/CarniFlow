# Handoff: ANYVO — Hunde-Bereich (Redesign + mehr Infos)

Ergänzung zum Fährten-Handoff (siehe `README.md`). Gleiche App **canisflow** (Expo / React Native,
expo-router, NativeWind, react-native-svg, Supabase, TypeScript), gleiche Tokens (`anyvo.css`).

## Gewählt: Liste A + Detail A
Referenz im Browser: **`Hunde.html`** (Design-Canvas; Sektion „Final" = die gewählten Screens,
Sektion „Alternativen" = die nicht gewählten B-Varianten). Code: `hunde.jsx`, Icons in `icons.jsx`.

### 1 · Liste „Meine Hunde" (Variante A · `ListRich`)
- Kopf: Eyebrow „Deine Hunde" + großer Titel **Meine Hunde** + runder Mint-**FAB** (+) oben rechts.
- Pro Hund eine **Karte**: Foto (links, gerundet) + Name + Geschlechts-Symbol, Rasse · Farbe,
  Pill-Reihe **Stufe (Mint) · Alter · Gewicht · „gechippt"**, darunter eine **Stats-Leiste**
  (Trainings · Fährten · Bestwert · **Serie** in Mint), Trenner zwischen den Zellen.
- Karte tippen → Detailprofil. Unten die bestehende **Tab-Bar** (Tab „Hunde" aktiv).

### 2 · Detailprofil (Variante A · `DetailHero`)
- **Foto-Hero** (Vollbild oben) mit Verlauf nach Schwarz; Zurück- und Bearbeiten-Button als
  runde Glas-Buttons; Name groß + „Rasse · Geschlecht · Farbe".
- **Bento-Stats** (2×2): Bestpunktzahl, Tage Serie (beide Mint), Trainings, Fährten.
- **Steckbrief** (Karte mit Zeilen): Geburtstag + exaktes Alter, Gewicht, Sparte/Stufe, Zwinger.
- **Mikrochip & Identität** (hervorgehobene Karte): große **Mikrochip-Nr.** + „aktiv"-Pill,
  darunter Registrierung (TASSO + Datum). → in der App an euer Chip-/Tasso-Feld binden.
- **Gesundheit**: 3 Mini-Karten (Impfung, Herz, Futter).
- **Trainingsaktivität**: Balkendiagramm über Monate (letzter Monat Mint, mit Glow).
- **Letzte Aktivitäten**: Liste (Icon-Kachel + Name + Datum + Punktzahl).
- **Hund löschen** (destruktiv, ganz unten): roter Button → **Bestätigungs-Sheet** von unten
  („{Name} löschen?", Warnung, **Abbrechen** / **Endgültig löschen**) → kurze Erfolgsmeldung,
  dann zurück zur Liste. In der App: Supabase-Datensatz (Hund + abhängige Trainings/Fährten)
  löschen bzw. soft-delete; Sheet via Bottom-Sheet-Komponente / Action-Sheet umsetzen.

## Neue Hunde-Infos (Datenmodell-Ergänzung)
`weight (kg)`, `birthday` + `ageExact`, `color`, `sport` + `level`, `best`, `breeder` (Zwinger),
`chip` (Mikrochip-Nr.), `tasso` (Registrierung), `vet`, `vaccine`, `feed`, `heart`, `activity[]`
(Monats-Balken), `recent[]` (letzte Einheiten). Fotos: im Prototyp Platzhalter → echte Bilder.

## Claude-Code-Auftrag (Hunde)
> Zusätzlich zum Fährten-Modul: Baue den **Hunde-Bereich** neu nach `design/design_handoff_faehrten/HUNDE.md`
> und `hunde.jsx` — **Liste A** (`ListRich`) und **Detailprofil A** (`DetailHero`). Übersetze nach
> React Native (View/Text, NativeWind, react-native-svg für Diagramm/Icons). Erweitere unser
> Hunde-Datenmodell in Supabase um die neuen Felder (Gewicht, Geburtsdatum, Farbe, Sparte/Stufe,
> Bestwert, Zwinger, **Mikrochip-Nr. + Tasso-Registrierung**, Tierarzt, Impfung, Futter, Herz).
> Implementiere **Hund löschen** mit Bestätigungs-Sheet und Supabase-Löschung. Starte mit der
> Listen-Karte und dem Detail-Header, zeig mir das Ergebnis, bevor du weitermachst.

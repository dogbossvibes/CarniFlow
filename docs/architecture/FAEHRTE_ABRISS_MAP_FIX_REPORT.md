# FÄHRTE — Bugfix „Abriss erscheint nicht auf der Karte"

**Rolle:** Implementierung. **Erstellt:** 2026-07-27
**Kein Commit, kein Push, keine DB-Migration, keine neue Event-/Marker-/GPS-Struktur.**

## A. Root Cause
- **Datei/Funktion:** `features/tracking/components/TrackingMap.tsx` → `PinMarker` (`kind === 'abriss'`).
- **Problem:** Der Legen-Abriss wurde als **inhaltsleere** Custom-Marker-View gerendert (`<View style={s.abrissBox} />` — nur Rahmen/Hintergrund, kein Text/Icon). `react-native-maps` erfasst inhaltsleere Custom-Marker-Views **nicht zuverlässig** als Grafik, insbesondere nachdem `tracksViewChanges` nach 1200 ms auf `false` fällt. Der Marker wird korrekt erzeugt, mit gültiger `currentPosition` in den Store aufgenommen und persistiert (deshalb feuern Haptik/Toast), **aber die Grafik erscheint nicht**. Alle anderen Marker haben messbaren Inhalt: Winkel-/Gegenstand-Badge (`<Text>`) und der **Ausarbeiten-Abriss** (`breaks`) ein `Ionicons`-Kreuz — die rendern korrekt. Nur der Legen-Abriss war inhaltsleer.
- **Zweitbefund (Robustheit):** `placeAbriss` (`app/track/legen.tsx`) prüfte nur `startAnchor` und meldete „Abriss gesetzt" auch ohne valide `currentPosition` → potenziell koordinatenloser Abriss + irreführender Erfolg.

Der übrige Datenfluss (Handler → `addMarker` → Store → SQLite/Supabase → Detail-/Run-Ansicht → Renderer-Zweig `angleKind==='abriss'`) war beim Lesen bereits korrekt und wurde **nicht** umgebaut.

## B. Geänderte Dateien
- `features/tracking/components/TrackingMap.tsx` — Abriss-Marker mit Symbol (messbarer Inhalt) + Zentrierung der `abrissBox`.
- `app/track/legen.tsx` — `placeAbriss`: Guard auf valide Position, Feedback erst nach fachlicher Annahme.
- `features/tracking/store/__tests__/abrissMarker.test.ts` — **neu** (5 Tests).

## C. Wie Abriss vorher gespeichert wurde
Unverändert korrekt: Button „Abriss" → `placeAbriss` → `rec.addMarker('winkel', { angleKind: 'abriss' })` → `commitMarker` → `store.addMarker` (synchron) + SQLite `local_track_markers` + Supabase `track_markers` (best-effort). Koordinaten = `currentPosition`.

## D. Wie Abriss jetzt gespeichert wird
**Identischer Pfad** (bestehende Architektur). Zusätzlich: `placeAbriss` setzt nur bei vorhandener `currentPosition` (sonst `toast.startPointWait`, kein Abriss, kein „gesetzt"). Feedback (Haptik/Toast) **nach** dem synchronen Store-Add.

## E. Marker/Event-Typ
Unverändert der **bestehende** Typ: `MarkerType='winkel'` mit `angleKind='abriss'` (`track_markers.marker_type='winkel'`, `angle_kind='abriss'`). **Kein** neuer Typ/Key.

## F. Wie die Karte ihn rendert
`TrackingMap` → `markerList` → `m.type==='winkel' && m.angleKind==='abriss'` → `PinMarker kind="abriss"` → bordertes Kästchen (`abrissBox`, Rand `C.trackWarning`) **mit `Ionicons name="close"`** als Inhalt → `<Marker coordinate={…} anchor={0.5,0.5}>`. Exakt an der gesetzten GPS-Position. Bestehende Abriss-Optik (Kästchen) erhalten, nur mit Symbol.

## G. Offline/Recovery geprüft?
Ja. Marker laufen unverändert über `store.markers` → `PendingTrack.markers` (AsyncStorage-Snapshot) und `local_track_markers` (SQLite) → `restoreSearchSession` stellt `markers` wieder her; Detailansicht liest `track_markers` remote (`angle_kind`). Kein Pfad geändert.

## H. Mehrere Abrisse geprüft?
Ja (Test 5): zwei Abrisse bleiben gleichzeitig im Store; `addMarker` hängt an (`[...markers, m]`), Renderer mappt alle. Abriss 1 verschwindet nicht.

## I. iOS geprüft?
Rendering-Fix ist plattformübergreifend (inhaltsleere Custom-Marker sind auf iOS ebenfalls unzuverlässig). Production-Export iOS erfolgreich. Interaktiver Simulator-Durchlauf (Legen→Abriss→Marker) in diesem Pass **nicht** ausgeführt → als Gerätetest empfohlen.

## J. Android geprüft?
Gleicher Fix; Android ist der Hauptleidtragende inhaltsleerer Custom-Marker. Production-Export Android erfolgreich. Emulator-Durchlauf **nicht** ausgeführt → als Gerätetest empfohlen.

## K. Tests
- **Neu** `abrissMarker.test.ts` (5): Marker+Koordinaten (1/2/3), im Renderer-Datensatz (4), zwei Abrisse erhalten (5), Fremdmarker unverändert (6/10), koordinatenloser Abriss nicht im Renderer-Datensatz (8).
- `tsc --noEmit` grün · `expo lint` geänderte Dateien **0 Errors** (9 Warnings, alle vorbestehende Muster inkl. `jest.mock`-vor-Import wie in den bestehenden Store-Tests) · `jest --runInBand` **336/336** (33 Suites).
- Fälle 7/9/11 (Persistenz-Recovery / manuelles Setzen im Radius / Screen-Feedback) sind Screen-/Integrationsebene; die zugrundeliegende Store-/Filter-Logik ist getestet.

## L. Production Exports
`npx expo export --platform ios --platform android` → **erfolgreich** (Hermes-Bundles iOS+Android je ~10,5 MB, exit 0). Keine EAS-Produktionsbuilds ausgeführt (kein Commit/Push).

## M–O. Abgrenzung
- **M. GPS-Logik verändert?** NEIN (keine neue GPS-Abfrage; Abriss nutzt weiterhin `currentPosition` aus der zentralen Quelle).
- **N. Startpunkt-Logik verändert?** NEIN (`startApproach.ts`/`useStartPointApproach.ts`/`run.tsx`-Startpunkt-Fix unangetastet).
- **O. Andere Fährtenereignisse verändert?** NEIN (GS/TS/Winkel/OW/BW/Startpunkt/Endpunkt-Zweige unverändert; nur der Abriss-Render-Zweig + `placeAbriss`-Guard).

## Bestätigungen
- ✅ keine DB-Migration (nicht erforderlich; `angle_kind='abriss'` existiert bereits)
- ✅ keine neue parallele Event-/Marker-/GPS-Struktur
- ✅ keine Änderung an fremden Produktbereichen
- ✅ kein Commit / kein Push

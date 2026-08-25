# FÄHRTE — Gegenstand-Schnellauswahl + Dübel als roter Zylinder (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-28
**Keine DB-Migration, keine neue GPS-Logik, keine neue Gegenstandsarchitektur, kein Commit/Push.**

## A. Bisheriger Gegenstands-Flow
GS-Button → `AnyvoBottomSheet` „Material wählen" (3-Spalten-Liste) → Tap Material → `placeGegenstand` setzt Marker → Sheet schliesst. Karte: jeder Gegenstand als `G{n}`-Badge; Dübel bekam ebenfalls eine G-Nummer.

## B. Vorhandene Gegenstandstypen
`MarkerMaterial` (bestehend, unverändert): `stoff, holz, duebel, leder, plastik, metall, teppich, diverses` — Labels Holz, **Dübel**, Stoff, Leder, Plastik, Metall, Teppich, Divers.

## C. Neue Schnellwahl
GS-Button → **Inline-Popover** über der Steuerleiste (kein Sheet), **2×4-Raster** der 8 Typen; Dübel-Chip als roter Mini-Zylinder. Tap → **sofort** an `currentPosition` setzen + schliessen. Backdrop-Tap schliesst ohne Marker; GS-Button toggelt; Winkel-/GS-Popover schliessen sich gegenseitig aus.

## D. Geänderte Dateien
- `app/track/legen.tsx` — Material-`AnyvoBottomSheet` entfernt; Inline-GS-Popover + Backdrop; GS-Button = Toggle; `placeGegenstand` mit `currentPosition`-Guard.
- `features/tracking/components/TrackingMap.tsx` — Dübel → neuer PinMarker-Kind `cylinder` (roter Zylinder), aus G-Nummerierung ausgenommen; nutzt neue `objectNumbers`.
- **neu** `features/tracking/utils/objectMarkers.ts` — `isDuebel`, `objectNumbers` (reine, testbare Nummerierung).
- `features/tracking/hooks/useTrackVoiceGuidance.ts` — Objekt-Ansage (`objectPhrase`, „Dübel"/„Gegenstand"), dog-basiert.
- `features/tracking/hooks/useTrackHapticGuidance.ts` — `GuidanceObject.material?` (Haptik ignoriert; für Voice).
- `app/track/run.tsx` — `guidanceObjects` trägt `material`; Voice bekommt Objekte.
- Tests: neu `objectMarkers.test.ts`.

## E. Interner Dübel-Typ
**Bestehend** `material === 'duebel'` — kein neuer Typ/Key, keine neue Schreibweise. Persistiert über den vorhandenen `material`-Pfad.

## F. Normale G1/G2-Nummerierung
`objectNumbers(markers)` vergibt fortlaufende Nummern **nur** für `gegenstand` mit `material !== 'duebel'`. Winkel und Dübel zählen nicht mit. Nummerierung ist reine **Darstellung** — persistierte IDs/Reihenfolgen unverändert.

## G. Dübel-Darstellung
Karte: **roter Zylinder** — solid gefüllter Körper (`C.trackDanger`) + Deckel-Ellipse (helleres Rot), dunkle Kontur. Solide Füllflächen (kein leeres Border-View) → auf Satellit/hell/dunkel gut sichtbar, Android-/iOS-zuverlässig gezeichnet (kein Abriss-Bug-Muster). **Keine** G-Nummer.

## H. Verhalten bei G1 → Dübel → G2
Sichtbar: **G1**, **[roter Zylinder]**, **G2** — der Dübel verschiebt die G-Nummerierung normaler Gegenstände **nicht** (Test 8/11).

## I. Persistenz
Unveränderter Markerpfad: Store → `PendingTrack.markers` → SQLite `local_track_markers.material` → Supabase `track_markers.material`. Keine parallele Tabelle, keine Migration.

## J. Recovery
Über `PendingTrack.markers` (material erhalten) → nach App-Neustart erscheint der Dübel wieder als roter Zylinder (Dispatch `material==='duebel'` → `cylinder`).

## K. Voice Guidance
`useTrackVoiceGuidance` sagt jetzt auch **Gegenstände** an: „Dübel in ca. X Schritten" bzw. „Gegenstand in ca. X Schritten" — Distanz über **`dogProgressM`/Bogenlänge**, persönliche Schrittlänge via zentraler `metersToSteps`. Winkel-Ansagen unverändert; gemeinsame Kandidatenauswahl/Entprellung.

## L. Haptic Guidance
Unverändert (Gegenstand 1×, Winkel 2×); `material` wird ignoriert.

## M. 5/10-m-Absuche verändert? **NEIN** (`searchGeometry`/`dogProgressM`/`estimateDogProgressM` unberührt).
## N. Persönliche Schrittlänge verändert? **NEIN** (weiter über `stepLengthM`/`metersToSteps`).
## O. GPS verändert? **NEIN** (`currentPosition`/positionSource; keine Einzelabfrage).
## P. DB-Migration? **NEIN** (bestehender `material`-Text-Pfad reicht).

## Q. Tests
- `objectMarkers.test.ts` (5): `isDuebel`; G1/G2 (4/5); Sequenz normal→Dübel→normal = G1/[Zylinder]/G2 (8/11); Winkel zählen nicht mit; Dübel-Voice „Dübel in ca. X Schritten" (14, inkl. Singular).
- Fälle 1/2/17 (Popover öffnet/schliesst, Backdrop) UI im Lege-Screen; 3/6/7 (Typ setzen) über `placeGegenstand` (store-erprobt); 9/10 (Zylinder gerendert/messbarer Inhalt) via `cylinder`-Dispatch + solide Views; 12/13 (Recovery) über Markerpfad; 18 (ungültige Position) durch `placeGegenstand`-Guard; 19/20/21 (Winkel/Abriss/Teilstrecken) unberührt.
- `tsc --noEmit`: **0 Fehler** · `jest --runInBand`: **396/396** (41 Suites) · ESLint geänderte Dateien: **0 Errors** (Warnings vorbestehend).

## R. iOS Export
`npx expo export --platform ios` → **erfolgreich** (exit 0).

## S. Android Export
`npx expo export --platform android` → **erfolgreich** (exit 0).

## T. Echter Gerätetest erforderlich?
**Ja.** Am Gerät: GS-Schnellwahl ohne Clipping (2×4, kleine iPhones/Android), Sofort-Set + Backdrop-Schliessen; roter Zylinder klar sichtbar auf Satellit/hell/dunkel (iOS+Android); Sequenz G1→Dübel→G2; Dübel-Voice im Feld; Recovery nach Neustart.

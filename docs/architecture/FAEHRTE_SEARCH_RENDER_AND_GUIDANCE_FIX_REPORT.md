# Fährten-Absuche — Render & Guidance Fix Report

> Production-Bugfix (ANYVO im App Store). Stand: 2026-08-15 · Branch `feat/track-module-rewrite`.
> **Kein Commit / Push / EAS Build / Submit / DB-Änderung.** Analyse zuerst, dann minimaler belegter Fix.
> Symptome (Real-Device): (1) gelegte Fährte gestrichelt/türkis, (2) Auto-Winkel fehlen in der Absuche,
> (3) Voice nur bei Gegenständen, (4) Winkel-Voice fehlt, (5) tritt im realen Betrieb auf.

## Kurzfazit
- **Problem 1 (gestrichelte Fährte): ROOT CAUSE gefunden + minimal gefixt** (render-only, OTA-fähig).
- **Problem 2/3/4 (Winkelmarker/-Voice/-Haptik): Pfad end-to-end als KORREKT bewiesen** (Detection → Store →
  Snapshot → Restore → Map → Voice/Haptik). Der Verlust liegt **eine Stufe früher** — Auto-Winkel werden im
  Feld nur wegen **schlechter GPS-Genauigkeit (> 20 m, `MAX_ANGLE_ACCURACY_M`)** gar nicht erst erzeugt.
  → **FALL A: keine Schwellenänderung**, **FIELD EVIDENCE REQUIRED**. DEV-Diagnostik vorbereitet (nicht verdrahtet).

---

## A. Root Cause — gestrichelte Fährte
`features/tracking/components/TrackingMap.tsx` zeichnete die **gelegte** Fährte im Absuche-Modus (`dimLay`)
bewusst gedimmt-gestrichelt:
```
strokeColor    = dimLay && kind==='normal' ? 'rgba(21,230,195,0.55)' : part.color
strokeWidth    = kind==='segment' ? 6 : (dimLay ? 3.5 : 4)
lineDashPattern= dimLay && kind==='normal' ? [8,8] : undefined
```
Das entspricht exakt dem Screenshot (gestricheltes Türkis). Die gelaufene Ist-Suchspur ist bereits eine
**separate, solide blaue** Polyline. Laid & Search waren also schon getrennt — die gelegte Linie war nur
per Design gestrichelt/gedimmt und dadurch mit der blauen Ist-Linie verwechselbar.

## B. Root Cause — fehlende Winkelmarker (bewiesen: NICHT im Renderer/Store/Snapshot)
Verifizierter Datenfluss (deployter HEAD): Auto-Winkel werden beim Legen vollständig erzeugt
(`useTrackRecorder.detectCorner → commitMarker`): `type:'winkel'`, `angleKind`, `lat/lng`,
`distance_from_start` → Store (`addMarker`) + SQLite + Remote. `snapshot()`/`restoreSearchSession`
übernehmen `markers` komplett. `run.tsx` `buildSnap()` liest `store.markers`; `mapMarkers`/`guidanceAngles`
enthalten alle `winkel`. `TrackingMap` rendert `angleMarkerKind`/`ANGLE_SHORT` korrekt. → In der Pipeline
geht **nichts** verloren (durch Test bewiesen, s. V).

## C. Root Cause — fehlende Winkel-Voice (dieselbe Ursache wie B)
`useTrackVoiceGuidance` verarbeitet **alle** `winkel` über `arcM = distance_from_start` identisch zu
Gegenständen (`forwardDistanceFromDog`). Der Pfad ist korrekt; wenn **keine** Auto-Winkel-Marker existieren
(Feld-Accuracy > 20 m), gibt es nichts anzusagen. Gegenstände sind **manuell** gesetzt (kein Accuracy-Gate)
→ funktionieren weiter. Das erklärt „nur Gegenstände".

## D. Haptik betroffen? — Ja, identische Ursache
`useTrackHapticGuidance` nutzt **dieselbe** `forwardDistanceFromDog`-Distanz und dieselben
`guidanceAngles/guidanceObjects` (Winkel = 2 Impulse, Gegenstand = 1). Keine zweite Distanzlogik. Fehlt der
Auto-Winkel-Marker, fehlt auch die Winkel-Haptik — gemeinsam mit der Voice, ohne separaten Fix.

## E. Daten beim Legen korrekt? — Ja (bei guter Accuracy)
`detectAutoCorner` liefert `rechts / spitz_links / links` mit gültigem Apex; `commitMarker` schreibt den
vollständigen `MarkerSample`. Test: „Detection (Stufe 1)" grün.

## F. Persistenz korrekt? — Ja
`addMarker → JSON-Snapshot → restoreSearchSession` erhält `type/angleKind/distance_from_start/lat/lng`
unverändert; Bogenlängen bleiben identisch. Test: „Store → Snapshot → Restore (Stufen 2–4)" grün.

## G. Search-Loader korrekt? — Ja
`run.tsx` `buildSnap()`/`restoreSearchSession` füllt `snapData.laidMarkers`; `mapMarkers`/`guidanceAngles`/
`guidanceObjects` werden korrekt daraus abgeleitet (im Pipeline-Test nachgebaut und geprüft).

## H. Map-Renderer-Fix
Nur **Problem 1**: neue reine Funktion `laidTrackStroke(kind, partColor)` in `trackSegments.ts`; die gelegte
Fährte ist jetzt **immer solide ANYVO-Mint** (kein `lineDashPattern`, keine Dimmung), Teilstrecken-Overlays
bleiben dicker (6). **Winkel-Renderer unverändert** (er war korrekt).

### Vorher/Nachher (gelegte „normal"-Linie im Absuche-Modus)
| Eigenschaft | Vorher (dimLay) | Nachher |
|---|---|---|
| strokeColor | `rgba(21,230,195,0.55)` (gedimmt) | `C.trackPrimary` (solide Mint) |
| strokeWidth | `3.5` | `4` |
| lineDashPattern | `[8,8]` (gestrichelt) | `undefined` (durchgezogen) |

## I. Laid/Search-Polyline-Trennung
- **Gelegte Fährte:** solide **Mint** (`C.trackPrimary`).
- **Ist-Suchspur:** solide **Blau** (`C.trackBlue`), separate Polyline (unverändert).
- **Off-Track:** eigenes Feedback (Banner/Voice/Haptik), keine eigene „laid"-Linie → keine Verwechslung.
Unterscheidung jetzt über **Farbe** (robuster als Strichelung). Regressionstest fixiert die Rollen.

## J. Winkeltypen unterstützt
`links, rechts, spitz_links, spitz_rechts` (auto) + `gw, ow, bw, abriss` (manuell) + `spitz` (Legacy).
Map-Test bestätigt: auto → `angle`-Badge (`90 L/90 R/SL/SR`), gw/ow/bw/abriss → eigene Formen.

## K. Spitzwinkel unterstützt
`spitz_links → 'SL'`, `spitz_rechts → 'SR'`; im Pipeline-/Map-Test explizit geprüft (nicht auf generisches
Badge reduziert).

## L. Gegenstände Regression
Unverändert: `object`-Badge (G-Nummer) bzw. `cylinder` (Dübel). Voice/Haptik für Gegenstände unangetastet;
im Pipeline-Test bestätigt.

## M. Voice-Fix
**Keiner nötig** — Voice-Pfad ist korrekt. Er wird wieder funktionieren, sobald Auto-Winkel-Marker existieren
(bzw. nach dem separaten, noch zu belegenden Feld-Fix, s. P/nächste Schritte). Keine Änderung an
`useTrackVoiceGuidance`.

## N. Haptic-Fix
**Keiner nötig** — gleiche Begründung wie M; keine Änderung an `useTrackHapticGuidance`.

## O. 1/5/10 m unverändert? — Ja
`dogProgressM = estimateDogProgressM(handlerProgressM, handlerDistanceM, arc.total)` unangetastet;
Event-Distanz weiter entlang der Bogenlänge (`forwardDistanceFromDog`), keine Luftlinie. Test „1/5/10-m-Versatz
ändert nur den Zeitpunkt, nicht Typ/Reihenfolge" grün.

## P. Off-Track unverändert? — Ja
Off-Track-State-Machine/Feedback nicht angefasst. (Off-Track blockiert bewusst neue Ansagen nur bei
bestätigtem `off_track`; `on_track/warning` blockieren Winkel nicht dauerhaft — bestehendes Verhalten.)

## Q. Legacy-Fährten
`angleMarkerKind(null) → 'angle'` (generischer Winkel-Fallback, kein Crash); `spitz` (Legacy ohne Richtung)
unterstützt. Map-Test „GW/OW/BW/Abriss + Marker ohne angleKind" grün.

## R. Geänderte Dateien
| Datei | Art | Zweck |
|---|---|---|
| `features/tracking/utils/trackSegments.ts` | M | neue reine `laidTrackStroke()` (solide-Mint-Regel) |
| `features/tracking/components/TrackingMap.tsx` | M | gelegte Fährte solide Mint; `dimLay` deprecated/ignoriert |
| `features/tracking/utils/__tests__/laidTrackStroke.test.ts` | + | Dashed-Line-Regression (laid solid, kein Dash, Mint≠Blau) |
| `features/tracking/__tests__/searchGuidancePipeline.test.ts` | + | End-to-End-Pipeline + Accuracy-/Straightness-Matrix |
| `features/tracking/utils/angleDiagnostics.ts` | + | **DEV-only** Feld-Diagnostik (NICHT verdrahtet, nicht im Bundle) |
| `features/tracking/utils/__tests__/angleDiagnostics.test.ts` | + | Formatter-Tests (PII-frei) |

Produktcode außer der Solid-Track-Darstellung **nicht** verändert (keine Guidance-/Detection-/Store-Logik).

## S. DB-Migration? — **NEIN** (keine)

## T. Native Änderung? — **NEIN** (app.json/package.json/plugins/ios/android unverändert)

## U. OTA-fähig? — **JA**
Reine JS/TS-Änderung; keine neue native Dependency. Runtime `appVersion` → 1.0.1 (= Build 40).
Die DEV-Diagnostik ist von keinem Produktivpfad importiert → nicht im Bundle.

## V. Tests
- **Neu grün:** `laidTrackStroke` (5), `searchGuidancePipeline` (18: Detection, Store/Snapshot/Restore, Map,
  Voice/Haptik-Reihenfolge, **Accuracy-Matrix** 3/5/10/15/19 erkannt · 21/25 verworfen, **Straightness-Matrix**
  A–E), `angleDiagnostics` (5).
- **Gesamtsuite:** `npx jest --runInBand` → **108 Suites / 1167 Tests PASS**, **1 FAIL**.
  - Der eine Fehler ist der **vorbestehende, dokumentierte stale Test** `app/track/__tests__/run-arming.test.ts`
    (erwartet `([5, 10] as const).map`, Code nutzt `HANDLER_DISTANCES_M`) — **unabhängig** von diesem Fix
    (`run.tsx`/der Test von mir unverändert).
- `npx tsc --noEmit` = 0 Errors. ESLint berührter Dateien = 0 Errors. `git diff --check` sauber.

## W. iOS Export
`npx expo export --platform ios` → **OK** (`entry-….hbc` 11.1 MB). Kein EAS Build.

## X. Android Export
`npx expo export --platform android` → **OK** (`entry-….hbc` 11.1 MB). Kein EAS Build.
(Web bewusst nicht: `react-native-maps` bricht das Web-Bundle — bekannt, kein Mobile-Blocker.)

---

## Beweislage Problem 2/3/4 (ACCURACY- & STRAIGHTNESS-MATRIX)
Derselbe echte 90°-Winkel durch `detectAutoCorner`:
- Accuracy **3/5/10/15/19 m (≤ 20)** → erkannt.
- Accuracy **21/25 m (> 20)** → **verworfen** (Gate `MAX_ANGLE_ACCURACY_M = 20`, `autoCornerDetection.ts:63`).

Straightness (gute Accuracy): echte 90°/Spitzwinkel erkannt; S-Kurve/Schlangenlinie/GPS-Zickzack **nicht**
erkannt → T-45-Schlangenlinien-Unterdrückung weiterhin korrekt.

**Interpretation:** Im Simulator (Accuracy < 20 m) klappen Auto-Winkel; im realen Feld (Bäume/Gelände,
Accuracy oft > 20 m) verwirft der Einzelpunkt-Accuracy-Gate den Scheitel → **keine Auto-Winkel erzeugt** →
nichts zu rendern/ansagen. Gegenstände (manuell) sind nicht betroffen. Passt exakt zu allen Symptomen.

## O(2). Root Cause der fehlenden Winkel jetzt bewiesen? — **NEIN (nur stark belegt)**
Der Codepfad ist bewiesen korrekt; der Feld-Verdacht (Accuracy-Gate) ist durch die Matrix stark belegt,
aber **nicht** mit realen Gerätedaten der gemeldeten Fährte verifiziert.

## P(2). Welcher Feldbeleg fehlt noch?
Für **genau eine reale Fährte**: enthält der gelegte Track überhaupt `type='winkel'`-Auto-Marker, oder wurden
alle Kandidaten wegen `accuracy > 20 m` verworfen? → **DEV-Diagnostik** (vorbereitet, nicht verdrahtet):
`features/tracking/utils/angleDiagnostics.ts`
- `logAngleCandidate(...)` je Auto-Winkel-Kandidat in `useTrackRecorder.detectCorner` (accuracy, Turn-Winkel,
  Richtung, legBefore/After, Heading-Abweichungen, accepted/rejectReason, angleKind, distance_from_start).
- `logSearchLaidMarkers(snapData.laidMarkers)` einmalig beim Absuche-Start (Anzahl + Typen + angleKind).
- `__DEV__`-gegatet, PII-frei, keine Tokens, keine GPS-Rohtracks. **Nicht** dauerhaft ausliefern.

## Produktregel (nicht in diesem Schritt umsetzen)
Falls der Feldbeleg den Accuracy-Gate bestätigt: **kein** großzügiges Aufweichen der Erkennung. Separater
fachlicher Fix erst danach entwerfen, z. B. accuracy-adaptive Confidence / mehrere gute Punkte vor/nach dem
Scheitel / verzögerte Winkelbestätigung statt hartem Einzelpunkt-Gate — Priorität: (1) keine falschen
Schlangenlinien-Winkel, (2) echte 90°/Spitzwinkel zuverlässig, (3) schlechte Fixes intelligent behandeln.

## Y. Real-Device-Test
Noch **offen** (zwingend, da Feldfehler): Testfährte mit Rechts-/Links-/Spitz-links/Spitz-rechts-Winkel,
2 Gegenständen, 1/5/10-m-Stichprobe, Voice, Haptik, Karte, kurzer Off-Track. Für Problem 1 primär die
**solide Mint-Darstellung** verifizieren; für Problem 2–4 die **DEV-Diagnostik** aktivieren und das Log liefern.

## Z. Verbleibende Risiken
- Problem 2–4 ist **nicht** durch einen Code-Fix geschlossen, sondern als „Daten-Erzeugung im Feld"
  lokalisiert; endgültige Bestätigung braucht den Device-Log.
- `dimLay`-Prop bleibt (deprecated) an `TrackingMap`; Aufrufer unverändert (bewusst minimal).
- Vorbestehender stale Test `run-arming.test.ts` bleibt rot (separat, nicht Teil dieses Fixes).

## Nächster sicherer Schritt
1. Problem-1-Fix per OTA ausliefern (klein, OTA-fähig) — auf Freigabe.
2. DEV-Diagnostik für **eine** reale Fährte einbinden → Log auswerten → Accuracy-Gate bestätigen/widerlegen.
3. Erst dann den separaten, fachlichen Winkel-Feld-Fix entwerfen (ohne Schlangenlinien-Regression).

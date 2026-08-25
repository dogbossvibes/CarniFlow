# FÄHRTE — Persönliche Schrittlänge kalibrieren (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-28
**Grundlage:** [[FAEHRTE_STEP_LOGIC_UNIFICATION_FIX_REPORT]]
**Keine DB-Migration, keine neue GPS-Engine, kein Commit/Push.**

> **Gate-Check:** `components/tracking/TrackMap.tsx` ist wieder **vorhanden** (Fremd-Löschung behoben); tsc-Baseline sauber, Exports laufen. Ich habe nichts an TrackMap angefasst.

## A. Einbauort
Profil → Sektion **„Fährten-Einstellungen"** → neue Zeile **„Schrittlänge"** (zeigt „Standard: 75 cm" bzw. „Persönlich: X cm") → öffnet den Screen **`/track/kalibrierung`**. „Auf Standard zurücksetzen" ist im Kalibrier-Screen (Intro) verfügbar.

## B. Geänderte Dateien
- **neu** `features/tracking/utils/stepCalibration.ts` — reine Kalibrier-Logik + Konstanten/Grenzen.
- **neu** `app/track/kalibrierung.tsx` — Kalibrier-Screen (Intro → Messung → Ergebnis).
- **neu** `features/tracking/utils/__tests__/stepCalibration.test.ts`.
- `app/(tabs)/profile.tsx` — eine Settings-Zeile „Schrittlänge" + `useStepLengthSetting`.

## C. Verwendete PositionSource
Bestehende **`startPositionSource`** (`features/tracking/utils/positionSource.ts`) — Single Source of Truth (nativ bevorzugt, expo-Fallback intern). **Keine** parallele `expo-location`-Positionsabfrage; nur die Berechtigung wird via `Location.requestForegroundPermissionsAsync` geholt (wie beim Legen).

## D. Anzahl Kalibrierschritte
`CALIBRATION_STEPS = 50`. ANYVO zählt sie **nicht** automatisch — der Text sagt ausdrücklich „Zähle die Schritte selbst" (kein Pedometer-Eindruck).

## E. Distanzberechnung
Während der Messung werden Positionspunkte gesammelt und mit den **bestehenden Filterprinzipien** (`shouldAcceptTrackPoint` = Accuracy-/Speed-/Distanz-Gate aus `gpsFilter`) akzeptiert; die **kumulierte Haversine-Distanz** (`calculateDistance`) zwischen akzeptierten Punkten ergibt `measuredDistanceM` (berücksichtigt die reale Gehlinie, nicht nur Luftlinie). **Keine** zweite TrackRecorder-Engine, **keine** `training_session`, **keine** dauerhaft persistierten TrackPoints — alles Runtime-only.

## F. GPS-Qualitätsprüfung
Live-Anzeige „GPS ±X m" + `getGpsQuality`. Bei `accuracy > 20 m`: Hinweis „GPS noch zu ungenau. Bitte kurz stehen bleiben.". Keine unrealistische ±1-m-Forderung, keine 20-cm-Garantie. Übernahme ist **blockiert**, wenn das Ergebnis nicht akzeptabel ist (§H).

## G. Formel
`stepLengthM = measuredDistanceM / CALIBRATION_STEPS` (z. B. `34.8 / 50 = 0.696 m`). **Nicht** vor dem Speichern gerundet; die UI zeigt zusätzlich „≈ 70 cm".

## H. Plausibilitätsgrenzen
`MIN_CALIBRATED_STEP_LENGTH_M = 0.40`, `MAX_CALIBRATED_STEP_LENGTH_M = 1.20` (⇒ 50 Schritte ≈ 20–60 m), `MIN_CALIBRATION_DISTANCE_M = 5`. `isAcceptableCalibration` verlangt genug Strecke UND plausible Schrittlänge. Unplausibel → Hinweis „Das Messergebnis wirkt unplausibel. Bitte wiederhole die Kalibrierung." + **kein** automatisches Speichern. Konservative Feldgrenzen, keine biometrische Interpretation.

## I. Speicherung
Bestehendes **`useStepLengthSetting`** (`setStepLengthM(result)`) → AsyncStorage-Key `track_step_length_m` (unveränderte Struktur). Ungerundet persistiert. Danach automatisch für alle Aufrufer verfügbar (Fallback bleibt `DEFAULT_STEP_LENGTH_M = 0.75`).

## J. Reset
Intro-Button „Auf Standard zurücksetzen" (mit Bestätigung) → `setStepLengthM(null)` löscht den Wert → Fallback 0,75 m. Toast-Bestätigung. Auch die Profil-Zeile zeigt danach wieder „Standard: 75 cm".

## K. Verwendung beim Legen
Bereits angebunden (voriger Fix): `legen.tsx` liest `useStepLengthSetting` und reicht `stepLengthM` in `metersToSteps(...)`. **Keine** neue Durchreichung nötig.

## L. Verwendung bei Absuche
Ebenfalls bereits angebunden: `run.tsx` (Metrik, Teilstrecken, Panel) + `useTrackVoiceGuidance` nutzen `stepLengthM`. Winkel-/Gegenstand-/Teilstrecken-/Voice-Ansagen verwenden den persönlichen Wert automatisch.

## M. Verhalten alter Sessions
**Keine rückwirkende Verfälschung.** Alte Fährten-Rohdaten/Meterwerte/GPS bleiben unverändert; gespeicherte Segment-Schrittwerte (z. B. in `[id].tsx`) werden **nicht** neu berechnet. Live-/neue Anzeigen nutzen die aktuelle persönliche Schrittlänge; eine rückwirkende Neuberechnung historischer, gespeicherter Step-Werte erfolgt **bewusst nicht** (Produktentscheidung ausständig — hier dokumentiert). Ältere Installation ohne gespeicherten Wert → 0,75 m.

## N. GPS-Engine verändert? **NEIN**
`positionSource`/`gpsFilter`/Recorder/5-10-m-Absuche unverändert; Kalibrierung nutzt sie nur lesend/Runtime.

## O. DB-Migration? **NEIN**

## P. Tests
- **neu** `stepCalibration.test.ts` (8): 37,5→0,75 · 35→0,70 · 40→0,80 (1-3), nicht gerundet (4), Guards, Plausibilitätsgrenzen, unplausibel abgelehnt (12), Grenzfälle 0,40/1,20.
- Fälle 5/7/8/18 (Persistenz/Reset/Fallback) durch `useStepLengthSetting` + `steps.test.ts` (`normalizeStepLength`) abgedeckt; 9/10/11 (Abbruch/Übernahme/ungültiges GPS) sind Screen-Logik (Übernahme nur bei `acceptable`, Abbruch speichert nichts); 13/14/15 (keine Session/keine persistierten Punkte/Engine unverändert) baulich sichergestellt; 16/17 (Legen/Absuche nutzen Wert) durch bestehende Anbindung.
- `tsc --noEmit`: **0 Fehler** · `jest --runInBand`: **384/384** (38 Suites) · ESLint geänderte Dateien: **0 Errors** (Warnings vorbestehend).

## Q. iOS Export
`npx expo export --platform ios` → **erfolgreich** (exit 0).

## R. Android Export
`npx expo export --platform android` → **erfolgreich** (exit 0).

## S. Echter Gerätetest noch erforderlich?
**Ja.** Simulator/Emulator liefern keine realistische Gehstrecke/GPS-Bewegung. Empfohlene Gerätetests: 50 Schritte auf gerader Strecke bei gutem GPS (Distanz/Schrittlänge plausibel), unplausible Messung (zu kurz/GPS schlecht → blockiert), Übernehmen/Erneut messen/Abbrechen, Reset, sowie Verifikation, dass Legen/Absuche-Ansagen den neuen Wert verwenden.

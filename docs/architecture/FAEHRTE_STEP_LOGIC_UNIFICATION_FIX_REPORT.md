# FÄHRTE — Schrittlogik vereinheitlicht + persönliche Schrittlänge vorbereitet (Fix-Report)

**Rolle:** Implementierung. **Erstellt:** 2026-07-28
**Grundlage:** [[FAEHRTE_STEP_ACCURACY_ANALYSIS]]
**Keine DB-Migration, keine GPS-/Geometrie-Änderung, kein Commit/Push.**

> ⚠️ **Vorbestehender Fremd-Blocker (nicht Teil dieses Fixes):** `components/tracking/TrackMap.tsx` ist im Arbeitsbaum **gelöscht** (uncommittete Löschung, **nicht** von mir/dieser Aufgabe). Das bricht `tsc` (2 Fehler) und `expo export` (`Unable to resolve @/components/tracking/TrackMap`, importiert von `features/tracking/components/TrackingMap.tsx`). Ich habe diese Löschung **bewusst nicht angefasst** (Regel: keine uncommitteten Änderungen überschreiben). **Empfehlung:** `git checkout -- components/tracking/TrackMap.tsx` zum Entsperren. Meine Änderungen sind davon unabhängig (siehe N/O/P).

## A. Geänderte Dateien
- `features/tracking/utils/steps.ts` — zentrale Utility neu (`DEFAULT_STEP_LENGTH_M`, `metersToSteps(m, stepLengthM?)`, `stepsToMeters(s, stepLengthM?)`, `normalizeStepLength`).
- `features/tracking/utils/trackSegments.ts` — Import `STEP_LENGTH_M` → `DEFAULT_STEP_LENGTH_M`.
- `features/tracking/hooks/useTrackVoiceGuidance.ts` — `STEP_M` entfernt; zentrale `metersToSteps` + persönliche Schrittlänge; „ca."-Formulierung.
- `app/track/legen.tsx` — `useStepLengthSetting`; alle `metersToSteps` mit `stepLengthM`; „≈/ca."-Kennzeichnung.
- `app/track/run.tsx` — `useStepLengthSetting`; Kontext-Trennung Hund/Handler; „≈/ca."; Voice-Guidance mit `stepLengthM`.
- **neu** `hooks/useStepLengthSetting.ts` — AsyncStorage-Setting für persönliche Schrittlänge (kein Wizard).
- **neu** `features/tracking/utils/__tests__/steps.test.ts`.

## B. Zentrale Schritt-Konstante
`DEFAULT_STEP_LENGTH_M = 0.75` — **einzige** Definition (`features/tracking/utils/steps.ts`).

## C. Entfernte Duplikate
- `STEP_M = 0.75` in `useTrackVoiceGuidance.ts` → **entfernt** (nutzt jetzt `metersToSteps`).
- `STEP_LENGTH_M` (alter Name) → durch `DEFAULT_STEP_LENGTH_M` ersetzt (einziger Konsument `trackSegments.ts` umgestellt).
- *(`MIN_STEP_M` in `gpsFilter.ts`/`useTrackRecorder.ts` ist ein **Distanz-Gate**, keine Schrittlänge → bewusst unverändert.)*

## D. Neue Utility-Funktionen
`metersToSteps(meters, stepLengthM?)` (Rundung wie bisher, negative/ungültige Meter → 0), `stepsToMeters(steps, stepLengthM?)`, `normalizeStepLength(value?)` (ungültig/≤0 → Default, keine Division durch 0).

## E. Legen — Schrittbasis
Unverändert: gefilterte TrackPoints → kumulierte Haversine-Distanz (`store.distanceMeters`) → `metersToSteps(distanceMeters, stepLengthM)`. **Keine** Änderung an EMA/2-m-Gate/Haversine/GPS-Filter/TrackPoint-Erfassung/Winkel/Gegenstände/Abriss/Teilstrecken.

## F. Absuche Hund — Schrittbasis
`dogProgressM` (projizierte Bogenlänge + 5/10 m) → `metersToSteps(dogProgressM, stepLengthM)`. Verwendet für: Teilstreckenansagen (`run.tsx:359`), `currentRunSegment` (`:373`), Panel „Noch … Schritte" (`:511`, **von `progressM` auf `dogProgressM` korrigiert**), Winkel/Abriss-Voice (`useTrackVoiceGuidance` via `forwardDistanceFromDog`→`metersToSteps`).

## G. Absuche Hundeführer — Schrittbasis
`distanceM` (gelaufene Suchpfad-Distanz) → `metersToSteps(distanceM, stepLengthM)`. Verwendet für die **Metrik-Leiste** (`run.tsx:418`). Klar getrennt von den hundebezogenen Ansagen (kein `progressM`/`dogProgressM` mehr vermischt).

## H. UI-/Voice-Kennzeichnung „ca./≈"
- Metrik-Leiste Legen & Absuche: `≈ N Schr.`
- Legen-TS-Panel: „seit ca. N Schritten" / „≈ +N Schr.".
- Absuche-Panel: „Noch ca. N Schritte".
- Voice: „… in ca. N Schritten." (natürliche Sprache; keine technische Formulierung).
- **Nicht** blind global geändert: historische Segment-Längen in `[id].tsx`/`liegen.tsx` (gespeicherte Step-Werte, keine Live-Meter-Ableitung) bewusst unangetastet.

## I. Persönliche stepLengthM technisch vorbereitet?
**Ja.** Utility akzeptiert `stepLengthM?`; `useStepLengthSetting()` liefert/setzt den Wert; `legen.tsx`/`run.tsx`/Voice reichen ihn durch. Ohne gesetzten Wert → `undefined` → Default 0,75 (Verhalten unverändert). **Kein Kalibrierungs-Wizard** (nur `setStepLengthM`-API für eine spätere Kalibrierung).

## J. Persistenz dafür bereits vorhanden?
**Ja, gerätelokal:** `useStepLengthSetting` nutzt AsyncStorage (Key `track_step_length_m`) analog zu `useAutoDetectSetting`/`useVolumeKeyArticleSetting`. **Keine** DB-Tabelle/Migration. Kann später zusätzlich ins Profil gespiegelt werden.

## K. GPS-Logik verändert? **NEIN**
## L. 5/10-m-Logik verändert? **NEIN** (`searchGeometry`/`estimateDogProgressM`/`useSearchRecorder`-Distanz unverändert; nur die *Anzeige/Umrechnung* nutzt die zentrale Utility).
## M. DB-Migration? **NEIN**

## N. Tests
- **neu** `steps.test.ts` (8): `metersToSteps(75,0.75)=100`, `stepsToMeters(100,0.75)=75`, Fallback bei ungültigem/fehlendem `stepLengthM` (inkl. Alt-Session, Fälle 3/13), `0.70`/`0.80` (4/5), negative/ungültige Meter → 0 (6), Rundung.
- Fälle 7/8 (Voice/Haptik zentrale Utility): Voice nutzt jetzt `metersToSteps` (Haptik gibt **keine** Schritte aus — nur Vibration nach Meter-Schwelle → keine Umrechnung nötig; im Bericht vermerkt). Fall 9 (keine zweite 0,75-Konstante): per Grep verifiziert. Fälle 10–14 durch bestehende Segment-/searchGeometry-Tests + unveränderte Distanzpfade abgedeckt.
- `jest --runInBand`: **376/376** grün (37 Suites) — kein Test vom TrackMap-Blocker betroffen. ESLint geänderte Dateien: **0 Errors** (20 vorbestehende Warnings).
- `tsc --noEmit`: nur **2 vorbestehende** Fehler (TrackMap-Fremd-Löschung); **keine** in meinen Dateien.

## O. iOS Export
**Blockiert durch Fremd-Löschung** `components/tracking/TrackMap.tsx` (`Unable to resolve @/components/tracking/TrackMap`) — **nicht** durch diese Änderung. Nach `git checkout -- components/tracking/TrackMap.tsx` erwartbar grün.

## P. Android Export
Gleicher Fremd-Blocker (derselbe Metro-Resolve-Fehler). Nicht durch diese Änderung verursacht.

## Offene Empfehlungen (nicht umgesetzt)
- Fremd-Löschung `components/tracking/TrackMap.tsx` wiederherstellen, dann Exports erneut ausführen.
- Später: leichte Kalibrierung (Variante B) als UI auf Basis von `useStepLengthSetting`.

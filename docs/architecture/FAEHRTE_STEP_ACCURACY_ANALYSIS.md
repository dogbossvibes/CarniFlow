# FÄHRTE — Schrittzählung / metersToSteps (Genauigkeits-Analyse)

**Rolle:** Repository-Analyst (read-only). **Erstellt:** 2026-07-27
**Kein Code geändert, keine Migration, kein Commit/Push.** Belege mit Datei:Zeile.

## Zusammenfassung

> **AKTUELL:** 1 Schritt = **0,75 Meter** (fest).
> **LEGEN:** Schritte basieren auf **akkumulierter GPS-Distanz** (Haversine über EMA-geglättete, ≥2 m-gegatete Linienpunkte) ÷ 0,75, gerundet.
> **ABSUCHE:** Schritte basieren auf **projizierter Bogenlänge** entlang der gelegten Fährte (+ 5/10 m Hundeversatz) ÷ 0,75, gerundet — je nach Ansage; die Metrik-Leiste nutzt die **gelaufene Suchdistanz**.
> **ECHTER SCHRITTZÄHLER:** **NEIN** — ANYVO zählt derzeit keine tatsächlichen Schritte; Schritte werden aus GPS-Distanz geschätzt.
> **HAUPTURSACHE DER ABWEICHUNG:** feste 0,75 m/Schritt **+** systematische GPS-Distanz-**Unterschätzung** (Sehnen-Verkürzung an Kurven/Winkeln durch 2-m-Distanz-Gate + EMA-Glättung, 2D-Distanz ohne Höhe, Stillstands-/Langsamgeh-Verluste). Netto meist **zu wenige** Schritte.

---

## 1. metersToSteps — zentrale Implementierung

| Wert/Funktion | Datei:Zeile | Wert |
|---|---|---|
| `STEP_LENGTH_M` | `features/tracking/utils/steps.ts:2` | **0.75** m/Schritt |
| `metersToSteps(m)` | `features/tracking/utils/steps.ts:4-6` | `Math.round(m / 0.75)` |
| `STEP_M` (Voice) | `features/tracking/hooks/useTrackVoiceGuidance.ts:10` | **0.75** (zweite, separate Konstante!) |

1. **1 Schritt = 0,75 m.**
2. Definiert in `steps.ts` (`STEP_LENGTH_M`).
3. **Fast** überall identisch, **aber es gibt zwei Definitionen desselben Wertes:** `STEP_LENGTH_M=0.75` (steps.ts) und `STEP_M=0.75` (useTrackVoiceGuidance.ts). Gleicher Wert, doppelte Quelle → Drift-Risiko bei Änderungen.
4. **Keine** widersprüchlichen Schrittlängen. **Achtung Namensfalle:** `MIN_STEP_M` (`gpsFilter.ts:20` = 1.0; `useTrackRecorder.ts:38` = 2.0) ist **keine** Schrittlänge, sondern ein **Distanz-Gate** (Mindestabstand für einen neuen Linienpunkt).
5. **Nutzer:**
   - `metersToSteps`: `app/track/legen.tsx` (Anzeige + TS-Start/Stop-`currentStep`, Z. 264/404/421/457/494/612), `app/track/run.tsx` (Segment-/Metrik-Anzeigen, Z. 359/371/416/509).
   - `STEP_LENGTH_M`: `trackSegments.ts:414` (markersInside: `startStep*STEP_LENGTH_M`) — Steps→Meter (bidirektional).
   - `STEP_M`: `useTrackVoiceGuidance.ts:58` (`bestD / STEP_M` → Ansage „in N Schritten").

---

## 2. Legen — Datenfluss zur Schrittzahl

```
GPS-Fix (positionSource, ~1 s Intervall, BestForNavigation)
→ onFix (useTrackRecorder.ts:326ff):
     EMA-Glättung (EMA_ALPHA=0.4) der Position
     Accuracy-Gate: raw.accuracy > MAX_ACCURACY_M(45) → verworfen (kein Linienpunkt)
     Speed-Gate:    d/dt > MAX_SPEED_MPS(12) → verworfen
     Distanz-Gate:  Abstand zum letzten akzeptierten Punkt < MIN_STEP_M(2.0) → KEIN neuer Punkt
→ akzeptierter Linienpunkt (EMA-Koordinate)
→ store.addTrackPoint (trackingStore.ts:213-219):
     distanceMeters += calculateDistance(last, p)   // Haversine (R=6.371.000 m)
→ metersToSteps(distanceMeters)  (legen.tsx:494)  → angezeigte Schrittzahl
```

**Konkrete Antworten:**
- **Welche Punkte?** Nur **akzeptierte, EMA-geglättete** Linienpunkte (nach Accuracy-/Speed-/Distanz-Gate).
- **Verworfene Punkte?** Zählen **nicht** in die Distanz (kein Linienpunkt).
- **Haversine?** Ja (`gpsFilter.calculateDistance = lib/trackGuidance.distanceM`, Haversine).
- **Geglättet?** Ja — EMA (α=0.4) auf die Linie; der Live-Puck separat mit PUCK_ALPHA=0.6.
- **Mindestdistanz?** Ja — `MIN_STEP_M = 2.0 m` (Distanz-Gate).
- **distanceInterval?** `WATCH_OPTS`/native Engine mit `timeInterval` ~1 s, `distanceInterval: 0` (zeitbasiert); das Gate erfolgt in `onFix`.
- **Kurze Bewegungen gefiltert?** Ja — Bewegungen < 2 m zwischen akzeptierten Punkten erzeugen keinen Punkt/keine Distanz.
- **Stillstand?** Keine Distanz (Start-Lock + 2-m-Gate); reale „Tritt-auf-der-Stelle"-Schritte werden nicht gezählt.
- **GPS-Drift?** Durch Accuracy-Gate (≤45 m) + 2-m-Gate weitgehend unterdrückt; im Startbereich zusätzlich Start-Lock/Drift-Zähler (`useTrackRecorder.ts:290`).
- **90°-Winkel?** Punkte nur alle ≥2 m → an Ecken werden **Sehnen** zwischen sparse Punkten gezogen → die tatsächlich gelaufene Ecklänge wird **verkürzt** (Distanz zu klein).
- **Sparse Samples diagonal verbunden?** Ja — genau dieser Sehnen-Effekt verkürzt Kurven/Winkel systematisch.

---

## 3. Absuche — Schrittberechnung

Größen (aus `useSearchRecorder`): `progressM` (= handlerProgressM, projizierte Bogenlänge), `dogProgressM = min(arc.total, progressM + searchHandlerDistanceM)`, `distanceM` (gelaufene Suchpfad-Distanz).

| Ansage/Anzeige | Datei:Zeile | Umrechnungsbasis |
|---|---|---|
| **Teilstrecken-Ansage** | `run.tsx:359` | `metersToSteps(dogProgressM)` → **B/C** (Bogenlänge + Hundeversatz) |
| **currentRunSegment** | `run.tsx:371` | `metersToSteps(dogProgressM)` → **B/C** |
| **Winkel/Abriss (Voice)** | `useTrackVoiceGuidance.ts:58` | `forwardDistanceFromDog(arcM, dogProgressM) / STEP_M` → **B/C** (Bogenlängendifferenz) |
| **Gegenstand (Haptik)** | `useTrackHapticGuidance.ts` | dieselbe Bogenlängendifferenz (keine „Schritt"-Ansage, nur Vibration) |
| **Panel „Noch … Schritte"** | `run.tsx:509` | `metersToSteps(s.progressM)` → **B** (Handler-Progress, **nicht** dog!) |
| **Metrik-Leiste „Schr."** | `run.tsx:416` | `metersToSteps(s.distanceM)` → **A** (gelaufene Suchdistanz des Hundeführers) |
| **Endpunkt** | — | keine eigene Schritt-Ansage |

**Klassifikation:**
- **A. echte GPS-Distanz:** `s.distanceM` (Metrik-Leiste in der Absuche; Legen `distanceMeters`).
- **B. projizierte Bogenlänge:** `progressM` (Handler auf die gelegte Linie projiziert).
- **C. geschätzte Hundeposition:** `dogProgressM` (= B + 5/10 m entlang der Bogenlänge).
- **D. daraus „Schritte":** `metersToSteps(...)` bzw. `/STEP_M` — je Ansage auf A, B **oder** C.

⚠️ **Inkonsistenz innerhalb der Absuche:** Segment-/Winkel-/Gegenstand-Ansagen nutzen **C (dogProgressM)**, das Teilstrecken-**Panel** (`run.tsx:509`) noch **B (progressM)**, die Metrik-Leiste **A (distanceM)**. Drei verschiedene „Schritt"-Basen im selben Screen.

---

## 4. Legen vs. Absuche — gleiche Grundlage?

| | Basis der „Schritte" |
|---|---|
| **Legen** | akkumulierte Haversine-Distanz der EMA-/2-m-gegateten Linienpunkte ÷ 0,75 |
| **Absuche (Ansagen)** | projizierte Bogenlänge `dogProgressM` (Handler-Projektion + 5/10 m) ÷ 0,75 |
| **Absuche (Metrik)** | gelaufene Suchpfad-Distanz `distanceM` ÷ 0,75 |

- Die **Bogenlänge** (Absuche-Projektion) wird aus **denselben** gelegten Punkten gebildet (`buildArc(laidPoints)`, Haversine) → für die **gelegte** Fährte ist die Skala mit dem Legen konsistent (arc.cum[i] ≈ legen-`distanceMeters` bei Punkt i).
- **ABER:** In der Absuche kommt der **+5/10-m-Versatz** hinzu und die **Handler-Projektion** (der Hundeführer läuft nicht exakt die gelegte Linie → `progressM` kann vor-/nachlaufen). Dadurch bekommt **dieselbe reale Position** in der Absuche einen **anderen** Schrittwert als beim Legen (systematisch um ~7 bzw. ~13 Schritte durch den 5/10-m-Versatz, plus Projektions-Jitter).
- Zusätzlich: Metrik-Leiste (A) vs. Ansagen (C) divergieren, weil der Suchpfad des Hundeführers ≠ Bogenlänge der Sollfährte ist.

---

## 5. Fehlerquellen (getrennt bewertet)

| Fehlerquelle | zu klein? | zu groß? | Bedeutung im aktuellen Code |
|---|:--:|:--:|---|
| **Feste 0,75 m/Schritt** | ✅ (wenn realer Tritt < 0,75 m, typisch beim Fährtenlegen) | ✅ (wenn > 0,75 m) | **Dominanter** systematischer Fehler; keine Kalibrierung |
| GPS horizontalAccuracy | ✅ | ✅ | Rauschen; durch Gates gedämpft, Netto klein |
| Sampling-Intervall (~1 s) | ✅ | – | an Kurven/schnellem Gehen Sehnen-Verkürzung |
| Ausreißer-/Speed-Filter (12 m/s) | ✅ (selten) | – | verhindert Sprünge (kein Über-Count) |
| Distanz-Gate `MIN_STEP_M=2` | ✅ | – | Bewegungen < 2 m verloren; Mikro-Wackeln geglättet |
| EMA-Glättung (α=0.4) | ✅ | – | zieht Linie nach innen → kürzer |
| GPS-Drift (Stand) | – | ✅ (Rest) | durch Gates/Start-Lock stark unterdrückt |
| 90°-Winkel | ✅ | – | Sehne statt Ecke → systematisch kürzer |
| Stillstand | ✅ | – | Tritt-auf-der-Stelle wird nicht gezählt |
| Langsames Gehen | ✅ | – | Sub-2-m-Inkremente unter dem Gate verloren |
| Gelände (Höhe) | ✅ | – | 2D-Haversine ignoriert Steigung → Bergdistanz zu kurz |
| 5/10-m-Hundeversatz (Absuche) | – | ✅ | verschiebt dog-Schritte bewusst um ~7/13 (Annahme, kein Messfehler) |
| Projektion auf Sollfährte | ✅ | ✅ | Progress kann vor-/nachlaufen bei Abweichung |
| Rundung (`Math.round`) | ✅ | ✅ | ±0,5 Schritt je Umrechnung; mehrfach hintereinander |

**Netto:** überwiegend **zu wenige** Schritte (feste Schrittlänge + Sehnen-Verkürzung + Gate + 2D + Stillstand). Über-Count nur durch Restdrift/Rundung, meist klein.

---

## 6. Echte Schritte oder Distanz?

**ANYVO zählt derzeit keine tatsächlichen Schritte; Schritte werden aus GPS-Distanz geschätzt.**
- **Kein** Pedometer/CMPedometer/Android-StepCounter/`expo-sensors`-Pedometer im aktiven Pfad.
- `expo-sensors` ist zwar in `package.json` (~15.0.8) vorhanden, wird aber **nicht** für Schritte genutzt.
- Die `TrackingSessionEngine` (`engine/trackingSessionEngine.ts:90`, „optional Accelerometer") wird **nur** von `hooks/useTrackRecording.ts` importiert — und dieser Hook ist **Dead Code** (nirgends in Screens verwendet; vgl. P0-05). Der aktive Recorder (`useTrackRecorder`) nutzt **keine** Sensorik.

---

## 7. Verbesserungsoptionen (nur Bewertung, NICHT implementieren)

### Variante A — GPS-Meter mit fixer Schrittlänge (Status quo)
- **Genauigkeit:** niedrig-mittel; systematischer Bias (s. §5). **iOS/Android:** identisch. **Handy in Hand/Tasche/Halterung:** egal (nur GPS). **Offline:** ok (GPS lokal). **Akku:** niedrig (nur GPS läuft ohnehin). **Komplexität:** minimal. **Fährteneignung:** grob; für die Praxis oft „gefühlt zu wenig".

### Variante B — persönliche Schrittlängen-Kalibrierung
- Nutzer geht z. B. 50 reale Schritte, ANYVO misst GPS-Distanz → `metersPerStep = distanz/50`, gespeichert im Profil (kein DB-Modellzwang: könnte lokal/Profil-JSON).
- **Genauigkeit:** deutlich besser für die **individuelle** Schrittlänge; korrigiert den 0,75-Bias, **nicht** die Sehnen-/Gate-Verkürzung. **iOS/Android:** identisch. **Handy-Lage:** egal. **Offline:** ok. **Akku:** unverändert. **Komplexität:** gering (UI + ein Wert). **Fährteneignung:** gut als „bester Kompromiss ohne Sensor".

### Variante C — echte Geräteschritte (CMPedometer / Android StepCounter, kombiniert mit GPS)
- **Genauigkeit:** hoch für **tatsächliche** Schritte des Trägers; **aber** misst die Schritte des **Handyträgers**, nicht die zurückgelegte Fährtenstrecke. **iOS:** CMPedometer (sehr gut, HW-gestützt). **Android:** `TYPE_STEP_COUNTER` (geräteabhängig, teils ungenau). **Handy-Lage:** **kritisch** — in fester Halterung/Tasche am Rumpf ok; in ruhiger Hand/auf Tisch zählt es evtl. nicht; am Hund/an der Leine unbrauchbar. **Offline:** ok. **Akku:** sehr niedrig (HW-Zähler). **Komplexität:** höher (Permissions `MOTION`/Activity Recognition, Plattform-APIs, Fusion mit GPS). **Fährteneignung:** eingeschränkt — Fährtenarbeit will die **Streckenlänge**, nicht die Trittzahl des Führers; der Führer geht zudem 5/10 m hinter dem Hund.

### Fachliche Empfehlung: primär METER, Schritte sekundär
Für Fährtenarbeit ist die **Meter-Distanz** die objektive, GPS-native und prüfungsrelevante Größe (IGP-Fährten werden in Metern definiert). „Schritte" sind eine **abgeleitete Feldkonvention** mit fester, personenunabhängiger Länge. Empfehlung: **Meter als Primärgröße** anzeigen/ansagen, **Schritte** klar als *geschätzt* kennzeichnen (z. B. „≈ N Schritte"). Optional Variante B als leichte Kalibrierung. Variante C nur, wenn ein echter Träger-Schrittzähler ausdrücklich gewünscht ist — mit klaren Lage-Einschränkungen.

---

## 8. Offene Konsistenz-Punkte (Beobachtung, kein Fix)
- **Zwei 0,75-Konstanten** (`STEP_LENGTH_M`, `STEP_M`) → auf eine Quelle vereinheitlichen.
- **Drei Schritt-Basen in der Absuche** (A/B/C, §3) → auf eine bewusste Basis je Kontext festlegen (Panel `run.tsx:509` nutzt noch `progressM` statt `dogProgressM`).
- **Rundung** erst bei der Anzeige, nicht in Zwischenschritten, um Kompounding zu vermeiden.
- **2D-Distanz** ignoriert Höhe — für hügeliges Gelände relevant.

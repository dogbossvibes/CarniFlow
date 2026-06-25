# ANYVO — Fährten-Recorder: korrekte GPS-Aufnahme + IGP/IFH-Logik

Dieses Dokument behebt die aktuellen Bugs der Live-Fährtenaufnahme in der ANYVO-App
(React Native / Expo, Apple-MapKit über `react-native-maps`, `expo-location`) und legt die
**fachlich korrekte** Winkel-/Gegenstands-/Schenkel-Logik nach IGP und IFH/FH fest.

Begleitcode: **`useTrackRecorder.ts`** (fertige, funktionierende Referenz-Implementierung).

---

## 1. Warum es aktuell nicht funktioniert (Diagnose aus den Screenshots)

**Symptom A — „bleibt bei GPS wird stabilisiert / 00:00 / 0 m / 0 Winkel":**
Der Aufnahme-Loop akkumuliert nichts. Klassische Ursachen in RN:
- Der `watchPositionAsync`-Callback hängt in einer **veralteten Closure** (stale state). Punkte
  werden in `useState` gehalten und der Callback sieht immer das **leere Anfangs-Array** →
  `setPoints([...points, p])` hängt nie an. **Fix:** den mutierbaren Track in einem `useRef`
  führen, nicht im State, und nur einen gedrosselten Snapshot in den State spiegeln (für die UI).
- Der **Timer** wird nicht beim Start des Legens gestartet (eigener `setInterval`).
- Distanz/Winkel werden nicht berechnet, weil nie ein Punkt akzeptiert wird (siehe B).

**Symptom B — „stabilisiert den Standort nicht, macht nur Striche":**
- Die Polyline wird aus **rohen** GPS-Fixes gezeichnet. Bei ±3 m und im Stand „springt" das Signal
  → Zickzack/gerade Sprünge statt Spur. **Fix:** (1) Fixes mit `accuracy` schlechter als ein
  Schwellwert verwerfen, (2) **Distanz-Gate**: einen neuen Punkt nur akzeptieren, wenn er ≥ ~2 m
  vom letzten akzeptierten Punkt entfernt ist (killt Stand-Jitter), (3) leichte **Glättung** (EMA
  oder 1-D-Kalman je Achse).
- „Stabilisiert nicht": die Stabilisierungs-Phase braucht ein **klares Gate** (z. B. 3 Fixes in
  Folge mit `accuracy ≤ 8 m`) und erst dann den „Fährte legen"-Button aktiv.

**Symptom C — konzeptioneller Fehler im alten Prototyp:**
- **Abriss** gehört **nicht** in die Phase *Fährte legen* (man legt sie ja gerade) — sondern in
  *Ausarbeiten* (Hund verliert die Spur / Neuansatz). Beim Legen werden nur **Winkel** und
  **Gegenstände** gesetzt/erkannt. Bitte Abriss aus dem Legen-Screen entfernen.

---

## 2. Korrekte Aufnahme-Pipeline (Reihenfolge pro GPS-Fix)

1. **Permission**: `requestForegroundPermissionsAsync()` (für Bildschirm-aus zusätzlich
   `requestBackgroundPermissionsAsync()` + `UIBackgroundModes: ["location"]`).
2. **Watch starten** (schon beim Screen-Mount, für Stabilisierung):
   `watchPositionAsync({ accuracy: Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, cb)`.
3. **Stabilisierung**: rollend prüfen — sobald **3 Fixes in Folge** mit `coords.accuracy ≤ 8 m` →
   `stabilized = true`, „Fährte legen" freigeben. Anzeige „GPS wird stabilisiert ±{accuracy} m".
4. **Nach „Fährte legen"** (recording = true): pro Fix
   a. **Verwerfen**, wenn `accuracy > 20 m`.
   b. **Glätten** (EMA, α≈0.35) auf lat/lng.
   c. **Distanz-Gate**: nur akzeptieren, wenn `dist(last, p) ≥ 2 m`. Sonst Fix ignorieren.
   d. Punkt an `pointsRef` anhängen, **Distanz** per Haversine aufaddieren.
   e. **Schritte**: bevorzugt echte Schritte via `expo-sensors` **Pedometer**; sonst
      `Schritte = round(Distanz / 0.75)` (1 Schritt ≈ 0,75 m „Normalschritt").
   f. **Winkel-Erkennung** (siehe §3) auf den geglätteten Punkten.
   g. Gedrosselt (z. B. alle 1 s oder alle 3 Punkte) Snapshot in den State → Polyline + Metriken.
5. **Karte folgt** der Position (`camera`/`animateCamera`), Polyline aus den **geglätteten**
   Punkten, Marker für Winkel (typisiert) und Gegenstände (Material).

Parameter-Defaults (gut für Fährte zu Fuß): `ACCURACY_GATE=8`, `MAX_FIX_ACCURACY=20`,
`MIN_SEGMENT=2.0 m`, `SMOOTH_ALPHA=0.35`, `STRIDE=0.75 m`.

---

## 3. Winkel-Erkennung — fachlich korrekt (IGP & IFH/FH)

Ein **Winkel** entsteht zwischen zwei **Schenkeln**. Erkennung über die **Richtungsänderung**
(Heading) zwischen zwei Wegabschnitten, nicht über einen einzelnen Punkt:

- Nimm den Punkt ~5 m **vor** der aktuellen Position (`pBack`) und ~10 m davor (`pBack2`).
- `headingPrev = bearing(pBack2, pBack)`, `headingNow = bearing(pBack, aktuell)`.
- `delta = signierte Drehung(headingPrev → headingNow)` ∈ −180..180 (**+ = rechts, − = links**).
- Nur werten, wenn `|delta| ≥ 25°` **und** seit dem letzten Winkel ≥ 6 m gelaufen (Debounce).

**Richtung** aus dem Vorzeichen: `delta > 0` → **rechter Winkel** (Drehung nach rechts),
`delta < 0` → **linker Winkel** (Drehung nach links).

**Form** aus dem Betrag — Geometrie: der *Innenwinkel* der Fährte = `180° − |delta|`:
| Richtungsänderung `|delta|` | Innenwinkel | Typ |
|---|---|---|
| 70°–110° | ≈ 90° | **Rechter Winkel** (90°, Standard in IGP & IFH1) |
| > 110° | < 70° | **Spitzer Winkel** (scharfe Kehre — IFH2) |
| 25°–70° | > 110° | **Stumpfer/flacher Winkel** (optional anzeigen) |
| viele kleine, gleichsinnige Drehungen über langen Bogen | — | **Bogen** (IFH2) |

→ Speichere pro Winkel **beides**: Richtung (links/rechts) **und** Form (rechter/spitzer Winkel)
**und** den gemessenen Grad, z. B. „Rechter Winkel · 90°" / „Spitzer Winkel links · 50°".

**Wichtiger Realitäts-Hinweis:** Bei ±3 m GPS ist die Grad-Klassifikation nicht zentimetergenau.
Darum: Winkel **automatisch erkennen**, aber dem Hundeführer eine **schnelle Korrektur** anbieten
(Typ links/rechts/spitz/recht antippen) — und einen Marker exakt an der erkannten Ecke setzen.
Optional „Winkel manuell setzen"-Button für volle Kontrolle beim Legen.

---

## 4. Fachliche Eckdaten IGP / IFH (für Validierung, Auswertung, Vorgaben)

**IGP (Abteilung A — Fährte):**
- **IGP-1**: Eigenfährte, ~**300 Schritt**, **3 Schenkel**, **2 Winkel** (~90°), **3 Gegenstände**,
  Liegezeit ~**20 min**. (Gegenstände neuerdings **zwischen** den Schritten, Winkel geschlossen getreten.)
- **IGP-2**: Fremdfährte, ~**400 Schritt**, **3 Schenkel**, **2 Winkel**, **3 Gegenstände**, ~**30 min**.
- **IGP-3**: Fremdfährte, ~**600 Schritt**, **5 Schenkel**, **4 Winkel**, **3 Gegenstände**, ~**60 min**.
- Winkel in IGP sind **rechte Winkel (~90°)**.

**IFH / FH (Fährtenhundprüfung — eigenständig):**
- **IFH-1 (FH1)**: Fremdfährte ~**1200 Schritt**, **7 Schenkel**, **6 rechte Winkel**, **4 Gegenstände**,
  ~**180 min** alt, **1 Verleitungsfährte** (quer über 2 Schenkel), **1 Übergang** (Weg/Straße).
  Bewertung: Halten der Fährte **79 P** + Gegenstände **21 P** = **100 P**.
- **IFH-2 (FH2)**: ~**1800 Schritt**, **8 Schenkel**, **7 Winkel — davon ≥ 2 spitze Winkel + 1 Bogen**,
  **7 Gegenstände**, ~**180 min**, Verleitungen.
- **IGP-FH**: an 2 Tagen je eine IFH-2 bei verschiedenen Richtern.
- **Gegenstände**: max. **10 cm × 2–3 cm × 0,5–1 cm**, Material **Leder, Textil/Stoff, Holz**
  (in ANYVO zusätzlich Plastik/Diverses fürs Training). Liegen in unregelmäßigen Abständen.

→ Nutze diese Werte als **Sollvorgaben** beim Legen (Fortschritt „4/6 Winkel", „1100/1200 Schritt")
und in der Auswertung (Soll/Ist je Stufe). Stufe pro Fährte wählbar: IGP-1/2/3, IFH-1/2, IGP-FH, Training.

---

## 4b. Ausarbeiten (Suche) — `useSearchRecorder.ts`

Phase 2: der Hund arbeitet die gelegte Fährte aus. Eingabe = das beim Legen gespeicherte
Snapshot (`laidPoints`, `laidObjects`, `level`). Liefert live:

- **Hundespur** (geglättet) → eigene Polyline über der gedimmten Soll-Fährte.
- **Abweichung** = kürzeste Distanz der aktuellen Position zur **Soll-Polylinie** (Punkt→Segment,
  lokale Meter-Projektion), geglättet → Metrik „ABWEICH.". `onTrack = Abweichung ≤ 3 m`.
- **Abriss / Neuansatz** (gehört HIERHER, nicht ins Legen): Abweichung **> 6 m** für **≥ 4 s**
  durchgehend ⇒ bestätigter **Abriss** (roter Marker). Sinkt sie wieder **≤ 3 m** ⇒ **Neuansatz**
  (Abriss „erholt"). Verhindert Fehlalarme bei kurzem Übertreten.
- **Gegenstand verwiesen**: Annäherung **≤ 2,5 m** an einen abgelegten Gegenstand ⇒ gefunden.
  Zusätzlich „Gegenstand"-Button = manuelles Verweisen (markiert den nächstgelegenen offenen).
- **Live-Score (0–100)** nach IFH/IGP-Modell: **Halten der Fährte (79 P)** skaliert mit der
  mittleren Abweichung, minus Strafe je Abriss; **Gegenstände (21 P)** anteilig gefunden/gesamt.

Score-Parameter sind oben in der Datei als Konstanten gekapselt und leicht justierbar
(`ON_TRACK_M`, `BREAK_THRESHOLD_M`, `BREAK_HOLD_MS`, `OBJECT_HIT_M`, Strafe je Abriss).

---

## 5. Datenmodell (Supabase)

```
track:
  id, dog_id, created_at, laid_at, surface, condition, level (igp1..ifh2|training)
  points: jsonb            -- [{lat,lng,t,acc}] geglättet & akzeptiert
  distance_m, steps
  duration_s               -- Legezeit
track_corner:
  id, track_id, index, lat, lng, direction (left|right), shape (right|acute|obtuse|bogen), angle_deg
track_object:
  id, track_id, index, lat, lng, material (leder|stoff|holz|plastik|diverses)
search (Ausarbeitung):
  id, track_id, dog_id, started_at, duration_s, found_objects, deviation_m, score
  search_points: jsonb     -- Spur des Hundes
  breaks: jsonb            -- [{index,lat,lng,t}] ABRISS gehört hierher, nicht ins Legen
```

---

## 6. Claude-Code-Auftrag (Recorder reparieren)

> Unsere Live-Fährtenaufnahme (`expo-location` + `react-native-maps`) funktioniert nicht: GPS
> stabilisiert nicht sauber, der Aufnahme-Loop akkumuliert nichts (Timer/Distanz/Winkel bleiben 0)
> und die Polyline „macht nur Striche". Lies `design/.../ANYVO_Faehrte_GPS.md` und ersetze unsere
> Recorder-Logik durch die Referenz in `useTrackRecorder.ts`.
>
> Wichtige Fixes: (1) Track in `useRef` statt State führen (Stale-Closure beheben), (2) Fixes mit
> schlechter `accuracy` verwerfen, Distanz-Gate ≥ 2 m + EMA-Glättung gegen Jitter, (3) eigener
> Timer beim Start, (4) Winkel-Erkennung über Heading-Differenz zweier Schenkel mit Klassifikation
> **rechter / linker / spitzer Winkel** (+ gemessener Grad) und Debounce, (5) Schritte bevorzugt via
> `expo-sensors` Pedometer, sonst Distanz/0,75. **Abriss** aus dem Legen-Screen entfernen — gehört
> in *Ausarbeiten*. Setze die IGP/IFH-Sollwerte (Schenkel/Winkel/Gegenstände/Schritt je Stufe) als
> Vorgaben. Zeig mir zuerst den reparierten Legen-Screen mit echter, geglätteter Spur, bevor du weitermachst.

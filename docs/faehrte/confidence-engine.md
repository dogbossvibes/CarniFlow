# Corner Confidence Engine (Phase 1 + 2)

Automatische Winkelerkennung der Fährten-Aufnahme mit einer belastbaren,
deterministischen Confidence und einer adaptiven Bestätigungslogik. Keine
KI/ML-Abhängigkeit, keine Cloud-API, keine native Dependency, keine DB-Migration.

Relevante Dateien:
- `features/tracking/utils/autoCornerDetection.ts` — Geometrie + Confidence-Score + Level
- `features/tracking/utils/cornerConfidence.ts` — `CornerConfidence`-View (Komponenten/Reasons)
- `features/tracking/utils/cornerConfirmation.ts` — adaptive Confirmation-State-Machine
- `features/tracking/utils/angleDiagnostics.ts` — DEV-Diagnostics + QA-Metriken
- `features/tracking/hooks/useTrackRecorder.ts` — Verdrahtung in die Aufnahme
- `features/tracking/store/trackingStore.ts` — optionale Runtime-Felder am Marker

---

## Phase 1 — Confidence pro Winkelkandidat

Jeder erkannte Winkelkandidat erhält zusätzlich zur Klasse (`links` / `rechts` /
`spitz_links` / `spitz_rechts`) eine **Confidence**.

### `CornerConfidence`
```ts
type CornerConfidence = {
  score: number;                 // 0..1, deterministisch
  level: 'low' | 'medium' | 'high';
  components: {
    turnStrength: number;        // Nähe der Richtungsänderung zur Winkelklasse (90/45)
    legSupport: number;          // belegte Schenkel: Punktzahl UND Mindestlänge (bindend = min)
    gpsQuality: number;          // robuste Accuracy (Median über die Schenkelpunkte)
    straightness: number;        // Geradheit des schwächeren Schenkels (bindend = min)
    stability: number;           // Bearing-Stabilität der Schenkel
    speedSupport?: number;       // optional, nur wenn Zeitstempel vorliegen
  };
  reasons?: string[];            // z. B. 'deadzone', 'weak_turn', 'poor_gps', 'low_movement'
};
```

### Score-Mathematik (unverändert, zentral gewichtet)
Der `score` ist die gewichtete Summe der internen Faktoren (Summe der Gewichte = 1):

| Faktor          | Gewicht |
|-----------------|---------|
| angle           | 0.24    |
| straightBefore  | 0.16    |
| straightAfter   | 0.16    |
| accuracy        | 0.12    |
| bearing         | 0.12    |
| support         | 0.10    |
| legLength       | 0.10    |

- Robuste GPS-Accuracy über den **Median** der Schenkelpunkte (ein einzelner
  schlechter Fix am Scheitel kippt einen klaren Winkel nicht).
- Geradheit über ein 8-m-Fenster mit Ausreißer-Toleranz; Micro-Segmente (<0.5 m,
  Stop/Jitter) werden übersprungen (kein Stillstands-Artefakt als „Richtung").
- **`speedSupport`** ist bewusst **nicht** im gewichteten Score — langsames Gehen
  wird nie bestraft; die Komponente markiert nur echte Stillstand-/Mikrobewegung
  informell (Reason `low_movement`).

### Level-Grenzen (an Testdaten kalibriert)
- `high  ≥ 0.80`
- `medium ≥ 0.60`
- `low   < 0.60`

Bezug: `ACCEPT_CONF = 0.62` ist die geometrische Accept-Untergrenze; knapp
Akzeptiertes ist daher bewusst „medium", eine saubere 90°-Ecke ≈ 0.98 → „high".

### Diagnostics
`formatCornerConfidence` / `logCornerConfidence` (DEV, PII-frei): type, side,
angle, score, level, alle Komponenten, reasons. Kein Log je GPS-Rohsample.

---

## Phase 2 — Adaptive Corner Confirmation

Zwischen „Kandidat akzeptiert" und „Winkel persistieren" liegt eine kleine,
evidenzbasierte State-Machine (`cornerConfirmation.ts`). **Keine zweite
Detection-Engine** — sie ruft die bestehende Geometrie/Confidence auf und
entscheidet nur über das *Timing* der Freigabe.

```
candidate → (HIGH)      → confirmed        (sofort, keine Verzögerung)
candidate → confirming  → confirmed        (MEDIUM: kurze geometrische Bestätigung)
candidate → confirming  → rejected/expired (Bearing kippt zurück / kein Beleg)
```

### Verhalten je Level
- **HIGH** (`level === 'high'` + geometrischer Accept): **sofort** `confirmed`
  (Grund `high_immediate`). Saubere 90°/Spitzwinkel reagieren unverändert schnell.
- **MEDIUM**: `confirming`. Bestätigt bei **Bearing-Stabilität** (`straightAfter ≥ 0.70`)
  **UND** (`≥ 2 Folge-Samples` **ODER** `≥ 8 m` neuer Schenkel). Steigt die
  Confidence auf high → sofort `evidence_upgrade`. Fällt sie unter `0.42` oder
  knickt der Schenkel (`straightAfter < 0.45`) → `rejected`.
- **LOW**: wird **nicht blind persistiert**. Rehabilitation erfolgt implizit über
  die erneute Klassifizierung pro Fix — hebt Folgegeometrie den Scheitel auf
  accept/medium/high, greift der normale `confirming`-Pfad.

### Confirmation-Kriterien (zentral, kommentiert)
- **Samples:** `confirmSamples = 2` (bei MIN_STEP 2 m ≈ 4 m; kein Einzelsprung)
- **Distanz:** `confirmOutboundM = 8` (= Geradheits-Fensterlänge)
- **Bearing:** `bearingStableMin = 0.70`
- **aktualisierte Confidence:** wird je Fix am eigenen Scheitel neu berechnet und
  darf sich entwickeln (steigt bei stabiler Fortführung, fällt bei Rücksprung) —
  nie zeitgetrieben.
- **Backstops (nur Sicherheit):** `expiryMs = 20 000`, `maxOutboundM = 24`,
  `maxMisses = 2` (transienter GPS-Aussetzer wird toleriert).

### Candidate Identity & Hysterese
- Identität über die **Along-Track-Distanz des ursprünglichen Scheitels**: ein
  laufender Kandidat wird immer am eigenen Scheitel neu bewertet, nie neu
  „erfunden" → keine A/B/C-Duplikate, keine Doppelwinkel.
- Umklassifizierung (`normal ↔ spitz`, `links ↔ rechts`) erst nach
  `classHysteresisVotes = 2` konsistenten Gegenbeobachtungen → kein Klassen-/
  Seiten-Flip durch GPS-Jitter.

### Robustheit
- **Stop / langsames Gehen:** Micro-Segmente werden übersprungen bzw. als `miss`
  toleriert (nicht als Reject). Langsames Gehen und bewusstes Stehen am Winkel
  bleiben zuverlässig erkannt.
- **Zwei nahe Winkel:** der aktive Kandidat wird bis `confirmed` getrackt, erst
  danach setzt das Gap den nächsten Scheitel frei → kein Verschlucken, kein
  Zusammenziehen.
- **`flush()`** am Track-Ende: rettet best-effort einen noch offenen, aber
  bestätigungswürdigen Medium-Winkel (accept, ≥ medium, stabiler Schenkel ≥ 4 m),
  damit ein Winkel ohne Auslauf am Ende nicht verloren geht.

### Diagnostics / QA-Metriken
- `formatConfirmEvent` / `logConfirmEvent` (DEV): Lifecycle
  `created | evidence | updated | reclassified | confirmed | rejected | expired`.
- `formatConfirmedCornerMetrics` / `logConfirmedCornerMetrics` (DEV, `[cornerQA]`):
  je finalem Winkel `kind`, `angleDeg`, `initialConfidence`, `finalConfidence`/
  `level`, `confirmDistanceM`, `confirmSamples`, Scheitel-`accuracy`, `reason`.

---

## Persistenz

Confidence/Level werden **nur zur Laufzeit** am In-Memory-`MarkerSample`
(`confidence`, `confidenceLevel`) geführt. **Keine DB-Migration**; `track_markers`
(Supabase) und der lokale SQLite-Marker bleiben unverändert. Historische Fährten
funktionieren ohne diese Felder normal weiter. DB-Persistenz ist ein bewusster
Folgepunkt (Migration erforderlich).

---

## Tests
- `features/tracking`: 50 Suites / 522 Tests PASS
- `app/track`: 8/8 PASS
- TypeScript PASS, ESLint 0 Errors

---

## REAL DEVICE / OUTDOOR CONFIDENCE QA: OPEN

Noch **nicht** im Feld verifiziert (nicht als PASS werten). Draußen zu prüfen:
- 90° links/rechts
- Spitzwinkel links/rechts
- Stop im Winkel
- langsames Gehen
- zwei Winkel nahe hintereinander
- False Positives
- Medium Confirmation Distance
- initial/final Confidence

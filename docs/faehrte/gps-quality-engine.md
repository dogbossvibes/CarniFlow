# GPS Quality Engine (Phase 3)

Laufende, deterministische Bewertung der GPS-Signalstabilität während der
Fährtenaufnahme. Sie beschreibt einen **Rolling Quality State** und koppelt ihn
kontrolliert an die Adaptive Corner Confirmation (Phase 2). Keine ML/Cloud, keine
native Dependency, keine DB-Migration, keine Kunden-UI.

Relevante Dateien:
- `features/tracking/utils/gpsQualityState.ts` — Rolling Quality Engine
- `features/tracking/utils/cornerConfirmation.ts` — quality-abhängige Confirmation-Anforderung
- `features/tracking/utils/angleDiagnostics.ts` — `[gpsQuality]`-Diagnostics
- `features/tracking/hooks/useTrackRecorder.ts` — Verdrahtung pro Fix + `gpsDebug`
- `features/tracking/components/PrecisionDebugPanel.tsx` + `app/track/legen.tsx` — DEV-Debug-Anzeige

---

## Rolling GPS Quality State

`createGpsQualityTracker()` bewertet ein begrenztes Fenster der letzten Fixes:

```ts
type GpsQualityState = {
  score: number;                 // 0..1, EMA-geglättet
  level: 'excellent' | 'good' | 'degraded' | 'poor';
  valid: boolean;                // false während Warmup / zu wenig Evidenz
  components: { … };
  sampleCount: number;
  windowDurationMs: number;
  reasons: string[];
};
```

- **Rolling Window:** `windowMs = 12 000` (≈12 s bei ~1 Hz) UND `maxSamples = 20`.
- **valid** erst ab `minSamplesValid = 4` Fixes (davor `reason=insufficient_data`;
  kein „excellent nach einem Fix").
- **Score-Bänder:** `excellent ≥0.85`, `good ≥0.65`, `degraded ≥0.45`, `poor <0.45`.
- **Hysterese:** EMA-Glättung (`alpha=0.35`) + Downgrade-Deadband (`0.04`) → ein
  einzelner schlechter Fix senkt den Score nur leicht und ändert den Level nicht;
  Upgrade sofort, Downgrade nur klar unter der Grenze (kein Flackern).

### Komponenten (gewichtet, Summe = 1)
| Komponente          | Gewicht | Bedeutung |
|---------------------|---------|-----------|
| `accuracy`          | 0.30    | robuster **Median** der Fenster-Accuracy |
| `temporalStability` | 0.20    | Streuung der Accuracy (trennt [3,4,3,4,5] von [3,18,4,25,3]) |
| `jumpStability`     | 0.20    | rejectete Jumps + implizite Übergeschwindigkeit (>8 m/s) |
| `rejectionHealth`   | 0.20    | accepted/rejected-Quote (nicht absolute Zahl) |
| `sampleConsistency` | 0.10    | Lücken + Variationskoeffizient (normales Scheduling-Jitter wird nicht bestraft) |
| `motionConsistency?`| —       | **optional/informativ**, NICHT im Score; Stillstand/langsam ausgeschlossen |

---

## Integration mit Corner Confidence

**Keine Multiplikation** mit der Corner Confidence (das würde Accuracy doppelt
bestrafen). GPS Quality beeinflusst **ausschließlich die notwendige Confirmation-
Evidenz** in der Adaptive Corner Confirmation:

| Quality | MEDIUM | HIGH |
|---------|--------|------|
| good / excellent | 2 Samples / 8 m | sofort confirmed |
| degraded | 3 Samples / 11 m | zusätzliche Bestätigung (+1 Folgepunkt) |
| poor | 4 Samples / 14 m | konservative Bestätigung (volle Evidenz) |

- **Keine** automatische harte Ablehnung nur wegen schlechter GPS-Qualität — der
  Reject bleibt allein an der Geometrie (Bearing-Rücksprung / Confidence-Einbruch).
- Der **Marker bleibt immer am ursprünglichen Winkelscheitel** — nur die
  Bestätigung erfolgt später, keine räumliche Verschiebung.
- Bei `valid=false` (Warmup) wird neutral (= good) gekoppelt → bisheriges Verhalten.

### Recovery
Eine kurze schlechte GPS-Phase am Winkel darf einen echten Kandidaten nicht
dauerhaft zerstören: erhöhte Miss-Toleranz (`degraded +1`, `poor +2`) überbrückt
transiente Aussetzer, und `poor → degraded → good` senkt die Anforderung wieder →
ein Pending-Candidate kann nach Erholung noch bestätigt werden.

---

## Debug (nur DEV)

`PrecisionDebugPanel` (Sektion „GPS Quality Engine", nur `devMode`) zeigt:
- Quality Score
- Level (inkl. `(warming)` bei `valid=false`)
- Window Samples
- Reasons (accuracy, accuracy_variance, jumps, reject_rate, irregular_sampling, insufficient_data)
- Accuracy, accepted/rejected (bestehende Sektionen)
- JSON-Snapshot (`gpsQualityEngine { score, level, valid, sampleCount, reasons }`)

`[gpsQuality]`-Logs erscheinen nur bei relevanter Änderung (Level-/valid-Wechsel
oder |Δscore| ≥ 0.1) — kein Log je Rohsample. Keine Kunden-UI.

---

## REAL DEVICE / OUTDOOR GPS QUALITY QA: OPEN

Noch **nicht** im Feld verifiziert (nicht als PASS werten). Draußen zu prüfen:
- GPS Quality bei freiem Himmel / Waldrand / Wald
- kurze schlechte GPS-Phase + Recovery (poor → good)
- 90° links/rechts, Spitzwinkel links/rechts
- Stop am Winkel, langsames Gehen
- False Positives
- Confirmation Distance bei good / degraded / poor

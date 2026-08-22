# Tracking-Hotfix: Corner-Recall + Track-Geometrie-Schutz

Zwei minimale, isolierte Fixes für die Fährten-Aufnahme. **Keine** Änderung an
Detection-Schwellen (ACCEPT_CONF/REJECT_CONF/LEG_MIN_M/STRAIGHT_*/MIN_STEP_M/
CORNER_GAP_M), Confirmation-Distanzen, GPS-Quality-Level, EMA_ALPHA, MAX_SPEED_MPS
oder Timestamp-Handling.

## 1. Recall-Hotfix — `geometric accept → sofort persistieren`
`useTrackRecorder.detectCorner` persistiert einen Winkel wieder **sofort**, sobald die
bestehende Geometrie `state === 'accept'` liefert (`detectAutoCorner` → Marker), wie
im Feldtest-Stand ≤65eceeb.
- Confidence Engine und Adaptive Confirmation laufen **nur noch als Shadow/Diagnostics**
  (`[cornerConfirm]`) — sie **blockieren die Persistenz nicht** mehr.
- GPS Quality Engine bleibt Diagnose/Kontext.
- **Ein bereits geometrisch akzeptierter Winkel kann nicht mehr durch eine spätere
  Confirmation verschwinden** (der zuvor nachgewiesene „created → nie confirmed"-
  Recall-Verlust ist beseitigt). Doppelmarker verhindert der `lastCornerAtRef`-Gap.

## 2. EMA-Gating-Fix — Track-EMA erst NACH den Gates
In `useTrackRecorder.onFix` wird die **Track-EMA** (`emaRef`, aufgezeichnete Linie)
erst **nach** dem Accuracy-Gate (`>MAX_ACCURACY_M`) und dem Speed/Jump-Gate
(`>MAX_SPEED_MPS`) aktualisiert.
- **Verworfene Fixes kontaminieren die Mint-Linie / Distanz / Persistenz / Corner-Buffer
  nicht mehr.** (Vorher zog jeder Fix die EMA um α, bevor er verworfen wurde — ein
  einzelner verworfener 15-m-Jump versetzte die Linie um bis zu ~3.6 m; jetzt 0 m.)
- Die **Puck-EMA** (`puckRef`, α=0.6) bleibt **separat** und wird für die Live-
  Standortanzeige weiterhin bei jedem Fix aktualisiert; StartLock nutzt die Live-
  Position (Puck) für die Bewegungserkennung.
- Reihenfolge-/Namensänderung only — keine Schwellen, keine neue Filterarchitektur.

## Weiterhin offen (bewusst NICHT Teil dieses Hotfix)
- EMA Corner-Rounding (~14–17°, Scheitel ~1.2 m) → segment-aware/adaptive Glättung.
- Walking-spezifischer Jump-Filter (12-m/s-Gate zu tolerant) → Hampel/Median.
- Monotonic-Timestamp-Guard (out-of-order/stale nach Background/Resume).
- Raw-Fix-Logging / Golden Field Track (Raw wird nicht persistiert).
- Detection-/Display-Geometrie-Trennung (heute eine EMA für beides).

## Tests
- `cornerPersist.test.ts` — Sofort-Persist ≥ Shadow-Confirmed, kein Doppelmarker, False-Positive-Schutz.
- `emaGating.test.ts` — verworfene Fixes verändern die Track-EMA nicht (accept-/jump-reject), Winkel-Recall + Scheitel unverschoben, reale Kreuzung erhalten.
- Gesamt: `jest features/tracking` 54 Suites / 569 PASS; `app/track` 8/8 PASS.

## REAL DEVICE FIELD QA: OPEN
Noch **nicht** im Feld verifiziert. Draußen auf der App-Store-Version zu prüfen:
Mint-Linie folgt der realen Bewegung besser · 90° L/R + Spitzwinkel erkannt · keine
Doppelmarker · keine Phantomwinkel · reale Kreuzungen erhalten.

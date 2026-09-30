# T-TRACK-FUSION-QUALITY-2026-09-30 — Turn-Fusion & Reference Quality (Root-Cause-Audit)

| Feld | Wert |
|---|---|
| **Task-ID** | `T-TRACK-FUSION-QUALITY-2026-09-30` |
| **Ziel** | Echte Sensorfusion (GPS ∪ IMU) für Winkelerkennung, Geometrie-Qualität als eigenständige Grösse, Trennung Direction/Sharpness, turn-aware Persistenz, belastbare Reference Quality — vor dem nächsten Feldtest. |
| **Worktree** | `~/canisflow-worktrees/anyvo-tracking-fusion-1.0.3` |
| **Branch** | `fix/tracking-fusion-reference-quality-1.0.3` |
| **Basis (base)** | `68cc6c3` (verifizierte iOS-Production-Linie, **nicht** `main`) |
| **Verantwortlicher Agent** | `claude-code` |
| **Status** | `IMPLEMENTED — UNCOMMITTED` (Traces eingetroffen, §0 aufgelöst; Implementierung + Tests grün; kein Commit/Push/Merge/Build/OTA) |
| **Review-Status** | `NONE` |
| **Commit(s)** | — (bewusst kein Commit; Working Tree enthält die Änderungen) |

---

## 0. Ehemaliger Blocker — AUFGELÖST

`fixtures/F1T.json` und `fixtures/FT2.json` liegen im Worktree. **Session-IDs verifiziert:**

| Datei | `sessionId` im JSON | Erwartet | Ergebnis |
|---|---|---|---|
| `fixtures/F1T.json` | `qa-1616e65f` | `qa-1616e65f` | ✔ |
| `fixtures/FT2.json` | `qa-c2a47f13` | `qa-c2a47f13` | ✔ |

Beide sind QA-Schema v2 / Minor 1 mit `rawFixes`, `detectorPoints` (31 / 32), `linePoints`, `autoDiagnostics`
und `candidateMotionEvidence`. Kopien liegen als Testfixtures unter
`features/tracking/utils/__tests__/fixtures/realFieldV21/{f1t-qa-1616e65f,ft2-qa-c2a47f13}.json`
(die Originale in `fixtures/` sind unberührt).

**Weiterhin fehlend:** die drei Tail-Negativfälle aus Vorgabe §13 (`qa-0253a5de`, `qa-80efcfe6`,
`qa-f7f8d378`). Ihr Fehlen ist der Grund, warum der Rescue so konstruiert ist, dass er **am Puffer-Ende
strukturell nicht greifen kann** (s. §6.3) und warum Stop-Flush unverändert blieb.

---

## 1. Verifizierte Ausgangsbasis (read-only geprüft)

| Prüfung | Ergebnis |
|---|---|
| `git merge-base --is-ancestor 70c8912 68cc6c3` | **YES** — canonical tracking release ist enthalten |
| `git merge-base --is-ancestor 6efcc59 68cc6c3` | **YES** — Build-48-Commit ist enthalten |
| `git merge-base --is-ancestor 626464b 68cc6c3` | **YES** — Search-Trace-Fix ist enthalten |
| `main` (`e90df20`) → `68cc6c3` | `main` ist **Vorfahre**; `68cc6c3..main` ist **leer** |
| Algorithmus-Kern-Diff `70c8912..68cc6c3` | **0 Zeilen** in `features/tracking/`, `components/tracking/`, `modules/anyvo-motion/`, `lib/trackRecorder.ts`, `lib/trackGuidance.ts`, `hooks/useTrackStats.ts`, `types/tracking.ts` |
| `app/track/`-Diff `70c8912..68cc6c3` | **7 Dateien / +311 −39** — Marker-Material-Anzeige, Newbie-Quota-Gate, Track-Sharing |

### Befund A — `main` ist NICHT die Production-Linie
`main` liegt **20+ Commits hinter** `68cc6c3` und enthält keinen eigenen Commit. Wer von `main`
branchen würde, verlöre u. a. Build 46/47/48, die Health-Phase-3-Arbeit und
`7bc337b fix(tracking): preserve marker material through track lifecycle`.
→ Dieser Worktree basiert korrekt auf `68cc6c3`.

### Befund B — Präzisierung zur Annahme „68cc6c3 verändert den Tracking-Kern nicht"
Für den **Algorithmus-Kern** korrekt (0 Zeilen Diff seit `70c8912`).
Für **`app/track/` (Screens)** *nicht* korrekt: dort liegen UI-/Entitlement-Änderungen
(`7bc337b`, `252a54c`, `bf81168`, `935ce14`). Keine davon berührt Detektion, Fusion, Persistenz
oder Analytics — die Kern-Aussage der Vorgabe bleibt gültig, die Formulierung war zu weit.

### Baseline (vor jeder Änderung)
```
HEAD            68cc6c3e223dc372454b2549dc3f336d8a4a124f
git status      (leer)
tsc --noEmit    exit 0, 0 Fehler
jest (tracking) 140 Suites / 1638 Tests PASS
```

---

## 2. Root Causes (aus Code-Lektüre, mit Beleg)

### RC-1 — Sharpness entsteht allein aus dem GPS-Innenwinkel, ohne jede Zuverlässigkeitsprüfung
`features/tracking/utils/shortLegCornerDetection.ts:485-493`

```ts
const dir = headingDelta > 0 ? 'rechts' : 'links';
if (interior >= NORMAL_MIN && interior <= NORMAL_MAX) kind = dir;            // 65..115 → normal
else if (interior >= SPITZ_MIN && interior <= SPITZ_MAX) kind = ...spitz...; // 15..60  → spitz
```
`interior` ist eine reine Differenz zweier Regressionsrichtungen. Ob diese Differenz bei der
vorliegenden Accuracy und Schenkellänge überhaupt **auflösbar** ist, wird nirgends geprüft.
FT2: `interior 53,9°` fällt damit mechanisch ins Spitz-Band → `spitz_links`.
**Betroffen: `qa-c2a47f13` (FT2).**

### RC-2 — Die Confidence-Formel bestraft schlechte Geometrie praktisch nicht
`shortLegCornerDetection.ts:498-512`

```ts
const accScore = acc == null ? 0.5 : clamp01((ACC_BAD_M - acc) / (ACC_BAD_M - ACC_GOOD_M));
//                                    ACC_GOOD_M = 10, ACC_BAD_M = 35   (Zeile 127)
confidence = 0.24*lengthScore + 0.22*sampleScore + 0.22*straightScore
           + 0.16*turnScore   + 0.10*concScore   + 0.06*accScore + motionBonus;
```
Zwei unabhängige Defekte:

1. **Sättigung.** Bei FT2 (`acc 7,87 m`) ist `(35−7,87)/(35−10) = 1,085 → clamp01 = 1,0`.
   8 m Accuracy erhält die **volle** Punktzahl, weil `ACC_GOOD_M = 10 m`.
2. **Gewicht 0,06.** Selbst ein `accScore = 0` könnte die Confidence nur um 0,06 senken.
   `lengthScore` (0,24) ist zudem **absolut** normiert (`(minLeg − 2,0)/2,5`) — es gibt
   **nirgends** ein Verhältnis *Accuracy ÷ Schenkellänge*.

Ergebnis: eine Geometrie, in der die Positionsunsicherheit (≈8 m) **grösser** ist als die
Schenkel (≈3–5 m), erreicht `confidenceBeforeMotion 0,759`. Genau der berichtete Wert.
**Betroffen: `qa-c2a47f13` (FT2), latent jede Kurzschenkel-Fährte.**

### RC-3 — Motion ist ein nachgelagerter Skalar-Bonus und prüft die Winkel**grösse** nicht
`shortLegCornerDetection.ts:515-532` → `motionTurnEvidence.ts:375-395`

```ts
if (e >= params.supportAbove) {              // supportAbove = 0.50
  return Math.min(1, gpsConfidence + params.maxBoost * ramp(e, 0.50, 1));   // maxBoost = 0.12
}
```
`applyMotionToConfidence()` vergleicht **ausschliesslich** die Evidenz-Stärke `e` mit Schwellen.
Es vergleicht **nie** `ev.netYawDeg` mit dem GPS-`magnitude`. Bei FT2 ist
`netYaw ≈ 62°` vs. GPS-`|headingDelta| = 126,1°` — Motion **widerspricht** der Spitz-Deutung
(62° ist deutlich näher an einem normalen 90°-Turn), wird aber als `+0,12`-**Bestätigung**
verrechnet: `0,759 → 0,879`. Motion hebt hier die Confidence einer Klassifikation, die sie
inhaltlich widerlegt.
**Betroffen: `qa-c2a47f13` (FT2).**

### RC-4 — `no_window_*` ist ein struktureller Totpunkt; drei Ursachen sind nicht unterscheidbar
`shortLegCornerDetection.ts:415-418` (harter Abbruch) und `:278-321` (`stableLegWindow`)

```ts
const before = stableLegWindow(points, apexIndex, false);
if (!before) return reject('no_window_before');
const after  = stableLegWindow(points, apexIndex, true);
if (!after)  return reject('no_window_after');
```
`stableLegWindow` verwirft eine Skala bei `lengthM < MIN_LEG_M (2,0)` **oder**
`sampleCount < 3` (Skala < 4,5 m) **oder** `spread > STRAIGHT_TOL_DEG (26°)` — und gibt in allen
drei Fällen dasselbe `null` zurück. Der Reject-Reason unterscheidet nur *before/after*, nicht
*warum*. Der Kopfkommentar `:99-113` dokumentiert den 10-Hz-Ausfall („27 von 29 Kandidaten")
ausdrücklich als **offenen, ungelösten Befund**.
Zusätzlich: am **Puffer-Ende** kann es schlicht keine Punkte nach dem Apex geben → `no_window_after`
ist dort strukturell unvermeidbar. F1s dritter Gegenstand liegt laut Ground Truth am Ende.
**Betroffen: `qa-1616e65f` (F1), verlorener L-Turn.**

### RC-5 — Motion kann links/rechts strukturell nicht liefern: das Vorzeichen wird verworfen
`features/tracking/utils/motionTurnEvidence.ts:247-249`

```ts
// Vorzeichen wird hier verworfen und nie exportiert — Regel: Motion darf
// links/rechts nicht entscheiden.
const netYawDeg = Math.abs(signedYaw);
```
`signedYaw` wird `:225/:237` korrekt vorzeichenbehaftet akkumuliert und in **einer Zeile**
weggeworfen. Der Header `:7-10` erklärt das als Absicht. Damit ist die Vorgabe §7
(„Motion eindeutig LINKS → Richtung LINKS erhalten") und §8 („Richtung aus Yaw ableitbar")
mit dem heutigen Typ `TurnEvidence` **nicht erfüllbar**.
**Betroffen: beide Sessions.**

### RC-6 — Persistenz-Ausdünnung ist ein *fester* Distanz-Gate, keine Simplification
`features/tracking/hooks/useTrackRecorder.ts:67-68` / `:641` / `:653-657`

```ts
const MIN_STEP_M = 2.0;   // Linienpunkt-Gate
const EMA_ALPHA  = 0.4;   // Linien-Glättung
...
if (!dLast || dStep >= DETECTOR_INPUT.minStepM) { ... }   // Detektor-Puffer: 0,5 m, EMA 0,7
if (last && step < MIN_STEP_M) return;                    // Linie:          2,0 m, EMA 0,4
```
Es existiert **kein** RDP/Douglas-Peucker und **kein** Downsampling (grep: keine Treffer für
`simplif|douglas|rdp|decimat|downsample` in `features/tracking/`). Die Ausdünnung entsteht
allein beim Erfassen, **gleichförmig und turn-blind**. Rechnerisch deckungsgleich mit den
Feldzahlen: F1 `19,14 m / 9 Punkte ≈ 2,1 m`, FT2 `25,22 m / 11 Punkte ≈ 2,3 m`.
Ein 3,75-m-Schenkel liefert damit 1–2 Linienpunkte — **unabhängig davon, ob dort ein 90°-Knick
liegt.** Der Detektor sieht 31/32 Punkte, Replay und Persistenz nur 9/11.
**Betroffen: beide Sessions; Ursache der diagonalen Replay-Segmente.**

### RC-7 — Search: ebenfalls festes Gate; Analytics läuft aber auf dem dichteren Strom
`features/tracking/hooks/useSearchRecorder.ts:100` / `:539` / `:564-571` / `:654`

```ts
const MIN_SEGMENT = 1.5;                       // m — festes Liniendichte-Gate
...
analyticsSamplesRef.current.push({ ... });     // VOR dem Gate  (vgl. Kommentar :466)
if (d < MIN_SEGMENT) { emitDiag('SKIP_MIN_SEGMENT', ...); return; }
pts.push(sm);                                  // NACH dem Gate → persistiert + Replay
```
Teil-Entlastung gegenüber der Vermutung in der Vorgabe: **Analytics liegt nicht auf der
überausgedünnten Linie** (`analyticsSamplesRef` wird vor dem Gate gefüllt — das ist der
Mechanismus aus `626464b`, der erhalten bleiben muss). **Persistenz und Replay** nutzen dagegen
`pointsRef` mit dem festen 1,5-m-Gate; dreht der Hund innerhalb von 1,5 m, wird die Ecke
abgeschnitten → diagonale Segmente. Vier Ströme (`raw`/`filtered`/`persisted`/`display`) sind
heute **nicht** getrennt modelliert.

### RC-8 — Es gibt keine gemeinsame Turn-Fusionsstufe
`features/tracking/engine/trackFusionEngine.ts` heisst „Fusion", fusioniert aber **Punkte**
(Fix-Akzeptanz, Outlier, Stillstand — `:171-296`), nicht Turns. Eine Stufe, in die
*GPS-Kandidat* **oder** *IMU-Kandidat* einlaufen und gemeinsam zu Direction/Sharpness/Confidence
führen, existiert nicht. Die Vorgabe-Diagnose in §5 ist damit bestätigt.

### RC-9 — Analysis-Quality-System existiert **bereits** und ist verdrahtet; ihm fehlen nur Eingänge
Das ist der wichtigste Befund für §11/§12, weil er den Umfang drastisch verkleinert.

**Bereits vorhanden und in der UI aktiv:**

| Baustein | Ort |
|---|---|
| `analysisConfidence: number` je Segment | `trackAnalyticsV3.ts` (Schema v3) |
| `analysisConfidenceBand: ConfidenceBand` | `trackFusionEngine.ts:116-121` (`excellent`/`good`/`limited`/`unreliable`) |
| `analysisConfidenceHint: string` | `trackAnalyticsV3.ts`, gerendert in `app/track/[id].tsx:495-498` |
| Warn-Pille bei `limited`/`unreliable` | `app/track/[id].tsx:481-487`, `:500` |
| i18n-Label | `i18n/de-CH.ts:1124` `'track.analysisFoundation': 'Analyse-Grundlage'` + `CONFIDENCE_BAND_LABEL` (`app/track/[id].tsx:51`) |
| Struktur für Begründungen | `AnalysisQualityReason` (`trackAnalyticsV3.ts:64-70`) |
| Test-Absicherung | `app/track/__tests__/analyse-section.test.ts:31-32` |

**Was fehlt, ist kein System, sondern zwei Eingänge.** Die bestehende Reason-Enum lautet:
```ts
type AnalysisQualityReason =
  | 'poor_gps' | 'gps_outlier' | 'implausible_speed'
  | 'low_fusion_confidence' | 'low_motion_confidence' | 'geometry_rejected';
```
Alle sechs bewerten **Sample-/Fix-Qualität der Absuche**. Es gibt **keinen** Grund, der die
Qualität der **Referenzfährte selbst** ausdrückt — insbesondere nicht
„Accuracy ≳ Schenkellänge" (RC-2) und nicht „ein Ground-Truth-Winkel wurde nicht erfasst" (RC-4).
Genau deshalb kann heute ein Score von 100/100 neben einer Referenz stehen, die einen echten
Winkel verloren hat: die Analyse-Grundlage **weiss davon nichts**.

→ §11/§12 sind damit als **Erweiterung** umzusetzen (zwei neue Reason-Werte + Referenz-Qualität
als Eingang in die bestehende `analysisConfidence`), **nicht** als neues Quality-System und
**nicht** als neue UI. Auch der i18n-Aufwand reduziert sich auf die neuen Hint-Texte.

---

## 3. Architekturentscheidung (vor Implementierung festzuhalten)

### Der Motion-Rescue darf NICHT in `evaluateShortLegCorner()`
`features/tracking/utils/__tests__/motionConfidenceCoupling.test.ts:114-155` sperrt als
**bewusste Invariante**: „`no_window_before/after` kann durch Motion NIEMALS akzeptiert werden" —
geprüft über die gesamte Golden-Route (>100 Kandidaten) *und* im Einzelaufruf, inklusive
`maxEvidence` (evidence = 1).

Diese Invariante ist die Schutzschicht gegen Tail-False-Positives und darf nicht gelockert
werden. Der Rescue gehört deshalb in eine **separate Fusionsstufe oberhalb** des Detektors:

```
GPS-Kandidaten  ──┐
                  ├─►  Turn-Fusion  ─►  Direction ─► Sharpness ─► Confidence ─► Persistenz
IMU-Kandidaten  ──┘     (neu, eigene Datei)
```

Damit bleibt `evaluateShortLegCorner()` unverändert streng (Test bleibt grün, kein
`no_window_*`-Accept), und der Rescue ist ein eigener, eigenständig gegateter Pfad mit eigenem
`source: 'motion'` in der Telemetrie.

### Minimal-invasive Voraussetzung für §7/§8
`TurnEvidence` braucht ein zusätzliches Feld `signedNetYawDeg` (+ unverändertes `netYawDeg`).
Änderung: **eine** Zeile Berechnung + ein Typfeld in `motionTurnEvidence.ts`. Kein DB-Schema,
keine API-Änderung, rückwärtskompatibel.

---

## 4. Implementierungsplan (nach Eingang der QA-Traces)

| Schritt | Datei (neu/geändert) | Abhängig von Traces? |
|---|---|---|
| 1 | `motionTurnEvidence.ts` — `signedNetYawDeg` exportieren | nein |
| 2 | `turnGeometryQuality.ts` **(neu)** — Accuracy÷Schenkel, Baseline, Samples, Richtungsstabilität → 0..1 + high/medium/low | nein (eigener Kontrakt, synthetisch testbar = Test C) |
| 3 | `shortLegCornerDetection.ts` — `accScore` entsättigen, Geometry-Quality in die Sharpness-Confidence einkoppeln; Direction unangetastet | teilweise (Kalibrierung gegen FT2) |
| 4 | `applyMotionToConfidence()` — Magnituden-Konsistenz (`netYaw` vs. `magnitude`) prüfen, statt blind zu boosten | ja (FT2 = der Beleg) |
| 5 | `turnFusion.ts` **(neu)** — GPS ∪ IMU → Direction/Sharpness/Confidence, Rescue-Gates (Locomotion, Mindestdistanz/-zeit, Duplicate-Suppression, End-Zone, Stationarity) | **ja** (F1 = der Beleg; Tail-Fälle als Schutz) |
| 6 | `useTrackRecorder.ts` — turn-aware adaptives Gate (dichter bei hoher Heading-Änderung / Objekt / Ende) | ja (Punktdichte-Effekt real messen) |
| 7 | `useSearchRecorder.ts` — Vier-Strom-Trennung; `analyticsSamplesRef`-Mechanismus aus `626464b` erhalten | teilweise |
| 8 | `trackAnalyticsV3.ts` — Reference Quality + Score/Confidence-Trennung, i18n DE/GSW/EN/FR/IT | nein (nach 2/3) |
| 9 | QA-Telemetrie §17 pro Turn (`source`, `direction`, `sharpness`, `geometryQuality`, …) | nein |

**Schritte 1, 2, 9 sind ohne die Traces sauber umsetzbar** und wären ein sinnvoller erster,
eigenständig reviewbarer Commit. Schritte 4–6 nicht.

---

## 5. Non-Goals / Tabu
- Kein B3-Winkeldetektor-Übernahme.
- Kein Snap-to-Track der Suchspur.
- Keine DB-Migration (`angleKind` bleibt der persistierte Wert; Direction/Sharpness intern).
- Keine Änderung an `app/track/`-Entitlements, Health, Subscription, Trainer-Connect.
- Kein Push / Merge / Build / OTA.

---

## 6. Implementierung (2026-09-30)

### 6.1 Befunde an den realen Traces (korrigieren bzw. präzisieren den Audit)

| Befund | Beleg | Konsequenz |
|---|---|---|
| **Motion-Vorzeichen ist real das NEGATIVE des GPS-`headingDelta`** (Rechtskurve → negative Yaw-Summe). 9/9 Ereignisse mit \|GPS\| ≥ 60° (F1, FT2, Lauf 1/2/9/10, Spitz-QA). | `candidateMotionEvidence[].samples` | `MOTION_YAW_LEFT_SIGN = +1` (positiv = links) in `motionTurnEvidence.ts`. Der synthetische Generator `goldenMotion.ts` nutzte die **umgekehrte** Konvention — korrigiert. |
| **Netto-Yaw im ±1-s-Fenster taugt nicht als Winkelmass.** Bestätigte 90°-Ecken: 32–81°; bestätigte 126–129°-Spitzwinkel: 82–97°. FT2 (62°) liegt **zwischen** beiden. | s. o. | RC-3 des Audits („Motion widerspricht der Spitz-Deutung") ist **zu stark**. Die Grösse fliesst nur als weiche Plausibilität in die Schärfe-Confidence, **nicht** als Zuschlags-Gate (als Gate vernichtete sie in der Golden-Matrix Gewinn: ±5 m 0,5 → 0,2). Motion widerspricht nur über die **Richtung**. |
| **F1: für den verlorenen L-Turn existiert KEINE Motion-Aufzeichnung** (`candidateMotionEvidence` nur für Punkte 11/13/14/15). | F1T | Ein Motion-Rescue ist an F1 **nicht validierbar**. Der Rescue ist deshalb rein GPS-geometrisch (Split-Apex); Motion kann ihn nur bestätigen/vetoen. |
| **F1-Ursache**: ein 0,66-m-Wackel-Segment (244°) direkt am Scheitel. Vor Punkt 22 ist das Fenster sauber (94°, 2,6 m), nach Punkt 23 ebenfalls (326°, 2,3 m) — **kein einzelner Scheitel** bekommt beide. | `stableLegWindow`-Dump | Paarung Vorher-Fenster(i) + Nachher-Fenster(i+1), Fenster **nicht** gelockert. |
| **FT2-Ursache**: nicht Motion, sondern Auflösbarkeit: Median-Accuracy im Fenster 8,2 m ÷ kürzester Schenkel 3,1 m = **2,67**. Bestätigte Spitzwinkel: 0,98 (Spitz-QA), 1,53 (Lauf 2). | Kalibrierung an 11 Läufen | `turnGeometryQuality.ts`: „spitz" nur bei Verhältnis ≤ 2,5. |

### 6.2 Was gebaut wurde

| # | Datei | Inhalt |
|---|---|---|
| 1 | `utils/motionTurnEvidence.ts` | `signedNetYawDeg` (neues Feld), `motionTurnDirection()`, `MOTION_YAW_LEFT_SIGN`. `evidence` bleibt vorzeichenfrei. |
| 2 | `utils/turnGeometryQuality.ts` **(neu)** | Accuracy÷Schenkel, Basislinie, Punkte, Richtungsstabilität → 0..1 + high/medium/low + `sharpnessResolvable`. |
| 3 | `utils/shortLegCornerDetection.ts` | Direction ⟂ Sharpness getrennt: unauflösbares „spitz" → Richtung bleibt, Klasse `normal`, `sharpness:'unresolved'`. Neue Diagnosefelder. `cornerConfidence()` als geteilte Formel extrahiert. Motion-Zuschlag wird bei **Richtungswiderspruch** unterdrückt (nie ein Abzug). `no_window_*` bleibt unrettbar (Invariante-Test grün). |
| 4 | `utils/turnFusion.ts` **(neu)** | `fuseTurns()`: Regelpfad + IMU-Bestätigung/Widerspruch + IMU-belegtes „spitz" (≥ 100° Netto-Yaw, gleiche Richtung) + Split-Apex-Rescue + IMU-only-**Protokoll** (nie persistiert). Drop-in für `detectShortLegCorners`. |
| 5 | `utils/turnAwareLineGate.ts` **(neu)** + `hooks/useTrackRecorder.ts` | Kurvenzone (Richtungsänderung ≥ 45° über 2×1,5 m oder ≤ 3 m nach bestätigter Ecke) → Gate 0,8 m statt 2,0 m, Linien-EMA 0,7 statt 0,4. Nur CURRENT; BUILD40 unverändert. |
| 6 | `engine/referenceQuality.ts` **(neu)**, `engine/trackAnalytics(V3).ts`, `app/track/run.tsx`, `app/track/[id].tsx`, i18n ×5 | Referenz-Qualität der gelegten Fährte (Median-Accuracy ≥ 7 m; nicht erfasste Ecke). Senkt **nur** `analysisConfidence`, nie `trackScore`. Neuer Hinweistext DE-CH/GSW/EN/FR/IT. |
| 7 | `utils/qaSessionCapture.ts`, `utils/qaTrackExport.ts` | QA v2.2 (`schemaMinor: 2`): `turnFusion[]` je Ecke (Vorgabe §17) + `imuOnlyEvents[]`. Relative Zeiten, `assertNoAbsoluteData` erweitert. Marker-Herkunft `auto_split_apex`. |
| 8 | Tests | `turnFusion.test.ts` (25), `turnGeometryQuality.test.ts` (8), `turnAwareLineGate.test.ts` (11), `turnFusionQa.test.ts` (10), `referenceQuality.test.ts` (21). |

### 6.3 Messergebnis an den 11 realen Läufen (unverändert reproduzierbar per `npx jest turnFusion`)

| Lauf | Vorher (Regelpfad) | Nachher (Fusion, nur GPS) |
|---|---|---|
| **F1T** `qa-1616e65f` | `rechts` (L-Turn verloren) | `rechts`, **`links` (gerettet, 20,9 m, Schärfe unaufgelöst)** |
| **FT2** `qa-c2a47f13` | `rechts`, `spitz_links` (Innen 53,9°) | `rechts`, **`links`** (Richtung erhalten, Schärfe `unresolved`, `sharpnessConfidence` 0,25) |
| **Spitz-QA** `qa-0ec8c4ca` (gelaufen R→L→SL→SR) | `rechts`, `spitz_rechts` (2/4) | **`rechts`, `links`, `spitz_links`, `spitz_rechts` (4/4, richtige Reihenfolge und Klasse)** |
| r1 `qa-03d970ff` | — | `links` bei ≈ 11,4 m (deckt sich mit dem aufgezeichneten Marker) |
| Lauf 1 / 2 / 9 / 10 | unverändert | unverändert (kein Rescue, kein Klassenwechsel) |
| **Lauf 3 / 7 / 8** (keine Ecke gelaufen) | 0 | **0 — auch mit Motion** (keine Fehlalarme) |

Spitz-QA und r1 sind **unabhängige Bestätigungen**: sie wurden nicht zur Kalibrierung der Rescue-Gates benutzt
(Gates: ≥ 60°, Streuung ≤ 18°, Residuum ≤ 0,6 m, Konzentration ≥ 0,6, ≥ 3 Punkte je Fenster, Lücke ≤ 1 m).

Golden-Route-Matrix (synthetisch, 5–9 m Accuracy, kein Wahrheitsbeleg): Fusion ≥ Detektor bei jedem Drift
(mit Motion 3,00 / 2,70 / 2,30 / 0,60 / 0,60 / 0,80 für ±0…5 m).

Turn-aware Gate (Simulation der Recorder-Kette auf den `rawFixes` aller 11 Läufe): mittlerer Abstand
Ecken-Scheitel → aufgezeichnete Linie **1,15 m → 0,82 m** (n = 14).

### 6.4 Bewusste Grenzen / ehrlich ausgewiesene Nebenwirkungen

1. **Golden-Pins neu vermessen (nicht stillschweigend gelockert).** `motionConfidenceCoupling.test.ts` (vorher/nachher-Matrix),
   `goldenFieldRoute.test.ts` (Obergrenze 0,3 → 0,5), `motionTurnEvidenceBenchmark.test.ts` (Struktur-Test: nur `signedNetYawDeg`
   trägt ein Vorzeichen). Grund: bei 5–9 m Accuracy wird „spitz" jetzt nicht mehr behauptet — bei ±1 m verlieren 2 von 10 Seeds
   den ersten Spitzwinkel (2,70 → 2,50), bei ±5 m wird ein früher als „spitz" gelabelter Kandidat zur Richtung-only-Ecke.
   Vier Source-Pin-Tests wurden auf `fuseTurns(...)` umgestellt.
2. **Distanz-Inflation durch das turn-aware Gate.** Aufgezeichnete Linienlänge je Lauf **−4 % … +21 %** (Median ≈ +8 %); FT2 20,9 → 25,3 m.
   Ein Teil davon ist Ehrlichkeitsgewinn (die 2-m-Linie schnitt Ecken ab), ein Teil GPS-Wackeln in der dichter abgetasteten Zone.
   Stellgrössen: `LINE_GATE.denseStepM / turnDeg / holdM`. **Produktentscheidung offen** (Distanz ist nutzersichtbar).
3. **Split-Apex braucht ein volles Nachher-Fenster** (≥ 2 m, ≥ 3 Punkte) — am Puffer-Ende gibt es deshalb weiterhin **keinen** Rescue.
   `evaluateStopFlush` ruft weiterhin nur den Regelpfad (per Test gesperrt). Tail-Negativfälle §13 fehlen weiterhin → die Tail-Sicherheit ist
   durch **Konstruktion** und synthetische Tail-Tests belegt, **nicht** an den realen Tail-Fällen.
4. **IMU-only-Ereignisse** werden nur protokolliert (`imuOnlyEvents`, `persisted:false`); der Motion-Ringpuffer hält nur die letzten ~20 s,
   der Stop-Sweep deckt daher nur das Aufnahme-Ende ab. Ein Motion-**Rescue** ohne GPS-Beleg wurde **nicht** gebaut: „geradeaus + Handy
   um 90° drehen" liefert Evidenz 1,00 (Benchmark), und F1 hat für die verlorene Ecke keine Motion-Daten.
5. **`SPITZ_MOTION_MIN_NET_YAW_DEG = 100`** ist an **keinem** realen Fall kalibriert (kein Lauf erreicht ihn; bestätigte Spitzwinkel 82–98°).
   Konservativ gewählt, nur synthetisch getestet.
6. **Search-Recorder (Vier-Strom-Trennung) NICHT geändert.** Die gegatete `pointsRef`-Linie treibt dort Distanz, Cursor, Abweichung und Score;
   eine Dichteänderung verschöbe Suchmetriken, und es liegen keine Absuch-Traces zur Validierung vor. Der `analyticsSamplesRef`-Mechanismus
   aus `626464b` ist unberührt. `turnAwareLineGate.ts` ist wiederverwendbar.
7. **`reference_geometry_low` / `reference_turn_uncaptured`** sind an 11 Läufen kalibriert (2 bzw. 2 positive Läufe) — Schwellen sind
   Startwerte. Als **eigener** Typ (`ReferenceQualityReason`), nicht als Erweiterung der per-Sample-Enum `AnalysisQualityReason`
   (semantisch pro Sample) — Abweichung vom Wortlaut des Audits, gleicher Zweck.
8. Persistiert wird weiterhin nur `angleKind` (keine Migration): `sharpness:'unresolved'` erscheint im Export/QA, nicht in der DB.

### 6.5 Verifikation

```
tsc --noEmit                         exit 0, 0 Fehler
eslint (geänderte Dateien)           0 Fehler (23 Warnungen, vorbestehend)
jest features/tracking i18n app/track   150 Suites / 1780 Tests PASS
jest (gesamtes Repo, 256 Suites)     2 Läufe: jeweils 1–2 Suites (app/dog-health-record/weight-entry,
                                     app/unit/document) laufen unter Volllast in Timeouts und sind
                                     einzeln grün (133/133 bzw. 17/17) — Health/Unit, nicht berührt
```
Die Baseline im Audit (§1: „140 Suites / 1638 Tests") ist mit einem anderen Filter entstanden und
mit obigen Zahlen nicht direkt vergleichbar; belastbar ist: **keine vorher grüne Suite ist rot** —
geänderte Pins sind in 6.4 Nr. 1 einzeln benannt.

### 6.6 Nächster Schritt (Empfehlung, nicht ausgeführt)
Feldtest mit QA-Modus: `turnFusion[]` liefert je Ecke `source`, `sharpness`, `geometryQuality`, `motion.directionAgrees`. Prüfen:
(a) treten `gps_split_apex`-Ecken auf, wo tatsächlich eine Ecke gelaufen wurde; (b) die drei Tail-Negativfälle §13 nachreichen und als
Regressionstest aufnehmen; (c) Entscheidung zur Distanz-Inflation (6.4 Nr. 2).

---

## 7. Hardening-Pass (2026-09-30, nach Zwischenstand-Review)

### 7.1 Search-Replay-/Display-Geometrie (getrennt von den Metriken)
- **Neu:** `utils/searchReplayGeometry.ts` (Douglas-Peucker ε = 1,0 m + Ecken-Schutz: Vor-Anker · Scheitel · Nach-Anker ±1,5 m; Geraden ≥ 1,5 m ausgedünnt; Ausgabepunkte sind ausschliesslich Eingabepunkte — kein Snap, keine Projektion, kein Begradigen).
- **Speisung** in `useSearchRecorder.ts`: VOR dem 1,5-m-Gate (`SKIP_MIN_SEGMENT`), NACH Fix-Akzeptanz und Fusion-Schutzschicht (Outlier/Stillstand haben davor bereits `return`ed). Eigene leichte EMA (0,7) — die Metrik-Glättung (0,4) rundet den Scheitel ab und ist mit Ursache des Befunds; `smoothRef`/`sm` bleiben unberührt.
- **Persistenz ohne Migration:** additives Feld `replay_points` (`{lat,lng,t}`) im schemalosen `payload_json.run` (und damit in `track_data.run`). `run_points` bleibt **byte-gleich**. Lokales Schema: unverändert. Remote: `track_data.run` ist JSONB; `run_points`/`track_runs` unberührt.
- **Konsumenten:** `searchDisplayGeometry.selectDisplayRunPoints()` → Detail-Karte (`trackDetailMap`) und Replay (`trackReplayData`). Analyse/Segmente lesen weiter `run_points`. **Legacy** (kein Feld / kaputtes Feld / Resume / Recovery / Remote ohne Feld) → unverändert `run_points`.
- **Resume:** keine Replay-Geometrie (Vor-Resume-Punkte haben keine dichte Spur) → Legacy.
- **Synthetischer 90°-Search-Turn** (1 Hz, 1,3 m/s): Abstand Ecke → Polylinie **legacy 1,43 m → replay 0,51 m**; Punkte 9 → 5.

### 7.2 Cursor / Score / Search-Distanz unverändert — belegt
Recorder-Test fährt dasselbe Szenario mit und ohne Replay-Berechnung (Mock von `replayGeometryArrays`) und vergleicht `points`, `pointsTimeSec`, `distanceM`, `score`, `deviationAvgM`, `analyticsSamples`, `breaks`, `foundObjects*`, jeden gemeldeten Cursor-Fortschritt und `trackLengthM` — **identisch**, synthetisch und auf der realen Handler-Route `qa-0ec8c4ca`. Die Replay-Ref wird von keinem Cursor/Distanz/Score-Code gelesen (Source-Test). `626464b` (`analyticsSamplesRef` vor dem Gate) unberührt, Self-Crossing-Suiten grün.

### 7.3 Track-Geometrie ≠ kanonische Distanz
- **Neu:** `utils/canonicalDistance.ts` — Akkumulator mit exakt der bisherigen Semantik (EMA 0,4, Gate 2,0 m, Start am Anker). `useTrackRecorder`: `emaRef` bleibt die kanonische Kette (auch Start-Lock); die turn-aware Geometrie läuft auf einer eigenen `lineEmaRef`-Kette; `store.setDistanceMeters()` + `addTrackPoint(p, {skipDistance:true})`.
- **Keine neue Heuristik, keine Kalibrierung an F1/FT2.**
- **Regressionstest:** Wechsel der Persistenzdichte (Gate 0,5/0,8/1,5/2,0/3,0 m) ändert die kanonische Distanz nicht (`toBeCloseTo(…, 6)`, alle 11 Läufe).
- **Offen (ehrlich):** die dichtere Lay-*Geometrie* bleibt länger (s. Tabelle) und damit auch `arc.total` (= `trackLengthM` der Suche, aus der Lay-Polylinie). Das ist Geometrie, nicht Distanz; Search-Metriken auf einer GEGEBENEN Lay-Linie sind unverändert (7.2), auf einer neu aufgezeichneten, dichteren Lay-Linie ist die Referenz-Bogenlänge ≈ +8 % (Median). Entscheidung, ob die Suche die kanonische Lay-Distanz statt der Polylinien-Länge als Track-Länge nehmen soll, ist offen und ohne reale Search-Traces nicht validierbar.

BEFORE/AFTER je Real-Run (Simulation der Recorder-Kette auf den `rawFixes`; „Distanz" = nutzersichtbar):

| Lauf | Distanz BEFORE | Distanz AFTER | Lay-Geometrie BEFORE → AFTER | Punkte |
|---|---|---|---|---|
| F1 `qa-1616e65f` | 16,67 m | 16,65 m | 16,67 → 18,98 m | 8 → 13 |
| FT2 `qa-c2a47f13` | 20,94 m | 20,92 m | 20,94 → 25,26 m | 10 → 14 |
| Lauf 1 | 11,93 m | 11,92 m | 11,93 → 13,32 m | 6 → 7 |
| Lauf 10 | 20,57 m | 20,54 m | 20,57 → 20,17 m | 9 → 10 |
| Lauf 2 | 10,94 m | 10,93 m | 10,94 → 11,79 m | 6 → 8 |
| Lauf 3 | 10,13 m | 10,11 m | 10,13 → 11,39 m | 5 → 7 |
| Lauf 7 | 14,30 m | 14,28 m | 14,30 → 16,07 m | 7 → 10 |
| Lauf 8 | 13,70 m | 13,68 m | 13,70 → 13,08 m | 7 → 8 |
| Lauf 9 | 10,66 m | 10,65 m | 10,66 → 12,59 m | 5 → 8 |
| r1 | 14,48 m | 14,46 m | 14,48 → 15,66 m | 7 → 9 |
| Spitz-QA | 28,43 m | 28,39 m | 28,43 → 27,75 m | 12 → 16 |

Distanz-Delta ≤ 0,04 m (≤ 0,2 %; Rest = Haversine vs. planare Summe im Test).

### 7.4 100°-Motion-Sharpness-Regel ENTFERNT
`SPITZ_MOTION_MIN_NET_YAW_DEG`, die Promotion `sharpness_promoted_by_motion` und `SHARPNESS_MAX_RATIO_CORROBORATED`/`motionCorroborated` sind gelöscht. Sharpness: GPS-Geometrie auflösbar → GPS-Klasse; nicht auflösbar → `unresolved` — unabhängig von der Motion-Stärke (Test: 100°/130°/200° gleichgerichtet ändern nichts). Motion trägt weiter zu Existenz-Confidence, Richtungsbestätigung/-widerspruch und Motion-Qualität bei. Die Golden-Pins mussten dafür **nicht** weiter geändert werden.

### 7.5 Reference-Quality-Semantik
`reference_turn_uncaptured` → **`reference_turn_uncertain`** (`unmarkedSharpTurns`). Ermittlung exakt: ein INNERER Knoten (nicht die ersten zwei/letzten) der persistierten Lay-Linie mit ≥ 100° Richtungsänderung, dem in ±4,5 m Bogenlänge kein Winkel-Marker zugeordnet ist. Die Software **weiss nicht**, ob ein Winkel gelaufen wurde (Ausreisser, Umweg, gewollter Absatz sind möglich) — Name und Kommentar sagen das jetzt. UI-Text (DE-CH/GSW/EN/FR/IT): „… geringe GPS-Genauigkeit oder scharfe Knicke ohne Winkel-Markierung …" statt „nicht erfasste Winkel".

### 7.6 Tail-Sicherheit — unverändert
Split-Apex braucht volles Nachher-Fenster; `evaluateStopFlush` ruft nur den Regelpfad (Source-Test); IMU-only nie persistiert; synthetische Tail-/Post-End-/Rausch-/Bogen-Negative grün. Keine Lockerung.

### 7.7 Real-Runs nach dem Hardening (GPS-only-Fusion)
F1 `[rechts, links(unresolved)*]` · FT2 `[rechts, links(unresolved)]` · Spitz-QA `[rechts, links*, spitz_links*, spitz_rechts]` · r1 `[links*]` (Marker 11,4 m) · Lauf 3/7/8 `[]` · Lauf 1/2/9/10 unverändert (`rechts` / `spitz_links` / `rechts` / `rechts`). (`*` = Split-Apex.)

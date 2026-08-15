# Fährten-Winkel — Confidence-Logik (Field-Fix)

> Folge-Fix zu `FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md` (Fall A). Stand: 2026-08-15 ·
> Branch `feat/track-module-rewrite`. **Kein Commit / Push / Build / Submit / DB-Änderung.**
> Ziel: reale 90°/Spitzwinkel auch bei wechselnder GPS-Accuracy zuverlässig erkennen, **ohne** die
> Schlangenlinien-Unterdrückung (T-45) zu schwächen und **ohne** simples Anheben von `MAX_ANGLE_ACCURACY_M`.

## Kernidee
Das frühere **harte Einzelpunkt-Gate** `apex.accuracy > 20 m → verwerfen` fiel im Feld (Accuracy oft > 20 m)
zu häufig — reale Winkel entstanden gar nicht. Ersetzt durch eine **Confidence-Bewertung pro Kandidat** mit
drei Zuständen **reject | pending | accept**. Die GPS-Accuracy ist nur noch **ein weicher Faktor** (robust über
den **Median**, nicht Einzelpunkt); der eigentliche Schutz gegen schlechtes GPS ist die **Geometrie**
(Geradheit der Schenkel) — genau die Größe, die auch Schlangenlinien fernhält.

Nur eine Datei geändert: `features/tracking/utils/autoCornerDetection.ts` (Signatur `detectAutoCorner`
unverändert, `AutoCorner` um `confidence` ergänzt → Recorder unberührt).

## A. Faktoren der Confidence (0..1)
| Faktor | Bedeutung | Robustheit |
|---|---|---|
| `angle` | Nähe zum Zielwinkel (90° bzw. 45°) innerhalb der Klasse | — |
| `straightBefore` | Anteil gerader Segmente **vor** dem Scheitel (Fenster 8 m) | tolerant ggü. 1 Ausreißer (langer Schenkel) |
| `straightAfter` | Anteil gerader Segmente **nach** dem Scheitel | dito |
| `support` | Anzahl unterstützender Punkte über beide Schenkel | — |
| `accuracy` | GPS-Genauigkeit als **Median** der Schenkelpunkte | ein schlechter Punkt kippt nichts |
| `bearing` | Stabilität der Segment-Bearings (mittlere Abweichung zur Sehne) | — |
| `legLength` | Mindestlänge **beider** Schenkel erfüllt | — |

## B. Gewichte & Schwellen
```
Gewichte (Σ=1):  angle .24 · straightBefore .16 · straightAfter .16 · support .10 · accuracy .12 · bearing .12 · legLength .10
Geometrie:       LEG_MIN_M 4 · STRAIGHT_WINDOW_M 8 · SEG_ALIGN_DEG 18 · MIN_TURN_DEG 15
Klassen:         normal 75–105° · spitz 30–60° (dazwischen Totzone)
Accuracy-Score:  ≤12 m → 1 · ≥40 m → 0 · linear dazwischen (Median)
Zustände:        ACCEPT_CONF 0.62 · REJECT_CONF 0.42 · STRAIGHT_ACCEPT 0.70 · STRAIGHT_REJECT 0.45
```
`MAX_ANGLE_ACCURACY_M` (hartes Gate) existiert **nicht mehr**; keine sonstige Schwelle wurde inhaltlich
aufgeweicht (Klassenbänder/Turn identisch zu T-45).

## C. Wann `pending`?
- Schenkel noch zu kurz (`inLen < 4 m` oder `outLen < 4 m`) → `reason: 'short_legs'` → **weiter Punkte sammeln**
  (der Recorder ruft die Detection bei jedem Fix erneut über den wachsenden Puffer auf).
- Geometrie grenzwertig: `minStraight ∈ [0.45, 0.70)` **oder** `confidence ∈ [0.42, 0.62)` → `reason: 'low_confidence'`.
- Ergebnis: `detectAutoCorner` liefert `null` (kein Marker), aber der Kandidat wird beim nächsten Fix neu bewertet.

## D. Wann `accept`?
- Gültige Winkelklasse (normal/spitz, nicht Totzone) **und** `minStraight ≥ 0.70` **und** `confidence ≥ 0.62`.
- Ein einzelner schlechter GPS-Punkt (Accuracy **oder** eine leichte Positions-Abweichung) kippt das nicht:
  Median-Accuracy bleibt gut und die Geradheit ist über das 8-m-Fenster robust.

## E. Wann `reject`?
- Totzone (Innenwinkel 60–75° oder >105° / <30°) → `reason: 'deadzone'`.
- Keine echte Richtungsänderung (`magnitude < 15°`) → `reason: 'no_turn'`.
- Kurve/Schlangenlinie: `minStraight < 0.45` **oder** `confidence < 0.42` → `reason: 'curve'`.

## F. 90° vs. Spitzwinkel getrennt
`angle` bewertet die Nähe zum jeweiligen Klassenmittel (90° bzw. 45°) separat; `spitz_links/spitz_rechts`
und `links/rechts` werden korrekt getrennt vergeben (Richtung aus dem Vorzeichen der Drehung).

## G. Schlangenlinien-Regressionsstatus — **UNVERÄNDERT GRÜN**
`autoCornerDetection.test.ts` (38 Tests, unverändert) bleibt vollständig grün: Gerade, Gerade+Jitter, sanfte
Kurve, 90°-Viertelkreis-Bogen, S-Kurven, enge Schlangenlinie, verrauschte Kurve, S+Jitter → **weiterhin 0 Winkel**;
echte 90°/Spitz + jitter-robuster 90° → erkannt; Sequenz/Gap korrekt. Die Straightness-Faktoren + Totzone
halten Kurven/Schlangenlinien fern; der `accept`-Pfad verlangt hart `minStraight ≥ 0.70`.

## H. Accuracy-Matrix (neues Verhalten)
Saubere 90°-Ecke, nur die Accuracy-**Marke** variiert:
| Accuracy-Marke | vorher | jetzt |
|---|---|---|
| 3 / 5 / 10 / 15 / 19 m | erkannt | **erkannt** |
| 21 / 25 / 30 m | **verworfen** (hartes Gate) | **erkannt** (Geometrie trägt; `accuracy`-Score gedämpft) |
| Apex-Punkt 45 m, Rest gut | verworfen | **erkannt** (Median robust) |
| starkes **Positions-Rauschen** (Geometrie kaputt) | — | **nicht** erkannt (Geradheit fällt < 0.45) |

Kernaussage: **Die Accuracy-Marke allein vetot einen sauberen Winkel nicht mehr.** Schlechtes GPS wirkt über
die *Geometrie* (Zittern → niedrige Geradheit) — dort wird korrekt abgelehnt.

## I. Beispiel-Confidence-Werte (aus Tests nachvollziehbar)
- perfekte 90°-Ecke (Acc 5 m): `confidence ≈ 0.92`, `straightBefore/After ≈ 1.0`, `angle ≈ 1.0`, `state=accept`.
- saubere 90°-Ecke (Acc 25 m): `accuracy < 1` (gedämpft), `confidence ≥ 0.62`, `state=accept`.
- 90° mit Apex-Punkt 45 m: `state=accept` (Median-Accuracy bleibt gut).
- starkes Positions-Rauschen: `state ≠ accept` (Geradheit < Schwelle).

## J. Nicht geändert (bewusst)
Manuelle Winkel **GW/OW/BW/Abriss** (nur manuell gesetzt, nicht über Auto-Detection), **Marker-Persistenz**
(Store/SQLite/Remote), **Voice/Haptik**, **1/5/10-m-Logik**, **Off-Track**, **DB**. Der Recorder konsumiert
`detectAutoCorner` unverändert (`{apex, kind, angleDeg}`; `confidence` wird ignoriert).

## K. Geänderte / neue Dateien
| Datei | Art | Zweck |
|---|---|---|
| `features/tracking/utils/autoCornerDetection.ts` | M | Confidence-Modell + 3 Zustände; hartes Accuracy-Gate entfernt |
| `features/tracking/utils/__tests__/cornerConfidence.test.ts` | + | Confidence-/State-Tests inkl. nachvollziehbarer Werte |
| `features/tracking/__tests__/searchGuidancePipeline.test.ts` | M | Accuracy-Matrix auf neues Verhalten aktualisiert (Confidence statt hartem Gate) |

## L. Tests
- **Neu/aktualisiert grün:** `cornerConfidence` (24), `searchGuidancePipeline` (18, inkl. neue Accuracy-Sektion).
- **Unverändert grün:** `autoCornerDetection` (38) — Schlangenlinien-/Kurven-Regression intakt.
- Abgedeckt (Vorgabe): perfekte 90°, 90° mit einem schlechten Accuracy-Punkt, 90° mit mehreren guten Punkten,
  90° mit komplett schlechter GPS-Lage, Spitzwinkel, Schlangenlinie, S-Kurve, GPS-Zickzack, kurze Schenkel,
  lange stabile Schenkel, links/rechts in allen 8 Himmelsrichtungen, pending→accept-Übergang, Confidence-Werte.
- **Gesamtsuite:** `npx jest --runInBand` → **109 Suites / 1191 PASS**, **1 FAIL** = vorbestehender
  dokumentierter stale Test `app/track/__tests__/run-arming.test.ts` (unabhängig; `run.tsx` unverändert).
- `npx tsc --noEmit` = 0 Errors · ESLint berührter Dateien = 0 Errors · `git diff --check` sauber.

## M. iOS/Android Export
- `npx expo export --platform ios` → **OK** (`entry-….hbc` 11.1 MB).
- `npx expo export --platform android` → **OK** (11.1 MB). Kein EAS Build. (Web bewusst nicht: `react-native-maps`.)

## N. DB-Migration? — **NEIN** · Native Änderung? — **NEIN** · OTA-fähig? — **JA** (reine JS/TS, Runtime 1.0.1).

## O. Real-Device-Test noch nötig — **JA**
Zwingend im Feld verifizieren (der Fehler stammt aus dem Feld): reale Fährte mit Rechts-/Links-/Spitz-links/
Spitz-rechts-Winkel + 2 Gegenständen bei realer, schwankender GPS-Accuracy → Auto-Winkel entstehen jetzt,
werden in der Absuche angezeigt und angesagt; Schlangenlinien erzeugen weiterhin **keine** Winkel. Empfohlen:
zusätzlich die vorbereitete DEV-Diagnostik (`angleDiagnostics.ts`) für eine Fährte aktivieren, um
`accept/pending/reject` + Confidence pro Kandidat im Feld gegenzuprüfen.

## Verbleibende Risiken
- Schwellen (`ACCEPT_CONF`, `STRAIGHT_ACCEPT`, `ACC_BAD_M`) sind konservativ gewählt und synthetisch validiert;
  echte Feld-Fährten können ein Nachjustieren einzelner Gewichte erfordern (isoliert, testgedeckt).
- `pending` verzögert einen Winkel ggf. um wenige Fixes (bis genug Auslauf vorhanden) — gewollt, verhindert
  Fehlmarker an unfertigen Ecken.

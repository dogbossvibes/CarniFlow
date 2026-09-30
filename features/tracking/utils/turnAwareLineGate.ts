// ──────────────────────────────────────────────────────────────────────────
// Turn-aware Linien-Gate (T-TRACK-FUSION-QUALITY-2026-09-30, RC-6 / RC-7).
//
// BEFUND: die aufgezeichnete Linie wird über ein FESTES Distanz-Gate
// (MIN_STEP_M = 2,0 m) ausgedünnt — gleichförmig und blind für Ecken. Rechnerisch
// deckungsgleich mit den Feldzahlen (F1: 19,14 m / 9 Punkte ≈ 2,1 m; FT2:
// 25,22 m / 11 Punkte ≈ 2,3 m). Ein 3,75-m-Schenkel bekommt damit 1–2 Linien-
// punkte, unabhängig davon, ob dort ein 90°-Knick liegt; Persistenz und Replay
// schneiden die Ecke ab (diagonale Segmente), während der Detektor-Puffer
// (0,5-m-Gate) sie sieht.
//
// LÖSUNG: keine Simplification der Linie, sondern ein Gate, das die Dichte dort
// erhöht, wo eine Richtungsänderung stattfindet — und nur dort:
//
//   • Richtungsänderung: Peilung der letzten `lookM` Meter des Detektor-Puffers
//     gegen die `lookM` Meter davor. ≥ `turnDeg` → Kurvenzone.
//   • Nachlauf einer bestätigten Ecke: bis `holdM` Meter danach bleibt die Zone
//     offen (der Detektor bestätigt erst mit Nachlauf).
//   • In der Kurvenzone gilt `denseStepM` statt `stepM`, und die Linien-Glättung
//     läuft mit `turnEmaAlpha` statt `emaAlpha` (der träge EMA rundet eine Ecke
//     sonst über ~2 m ab — siehe shortLegCornerDetection.ts, Punkt 3).
//
// Auf gerader Strecke bleibt alles exakt wie bisher (gleiche Punktzahl, gleiches
// Gate, gleiche Glättung). Die Distanz-Bilanz der Session ändert sich nur in den
// wenigen Metern einer Kurve.
//
// Reine Funktion, kein React/Native. Verändert weder Detektor noch Analytics-Strom.
// ──────────────────────────────────────────────────────────────────────────
import { calculateHeading } from '@/features/tracking/utils/gpsFilter';

export const LINE_GATE = {
  /** Regelabstand (m) auf gerader Strecke — unverändert. */
  stepM: 2.0,
  /** Abstand (m) innerhalb einer Kurvenzone. */
  denseStepM: 0.8,
  /** Länge (m) der beiden Vergleichs-Sehnen. */
  lookM: 1.5,
  /**
   * Richtungsänderung (Grad), ab der eine Kurvenzone beginnt. GEMESSEN an den
   * 11 realen QA-Läufen (rawFixes → Simulation von Detektor-Puffer + Linie):
   * Abstand Ecken-Scheitel → aufgezeichnete Linie mittel 1,15 m → 0,82 m; 40°
   * bringt 0,80 m, kostet aber mehr Zusatzpunkte auf gerader Strecke (+7 statt
   * +6 über 3 Läufe ohne Ecke); ab 50° fällt der Gewinn auf 0,92 m.
   */
  turnDeg: 45,
  /** Nachlauf (m) nach einer bestätigten Ecke, in dem die Zone offen bleibt. */
  holdM: 3.0,
  /** Linien-Glättung auf gerader Strecke — unverändert. */
  emaAlpha: 0.4,
  /** Linien-Glättung in der Kurvenzone (leichter, damit die Ecke nicht abgerundet wird). */
  turnEmaAlpha: 0.7,
} as const;

export interface GatePoint { lat: number; lng: number; cumDist: number }

function normalizeDeg(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Richtungsänderung (Grad, 0..180) zwischen den letzten `lookM` Metern und den
 * `lookM` Metern davor. `null`, solange der Puffer für zwei Sehnen zu kurz ist.
 */
export function recentHeadingChangeDeg(pts: readonly GatePoint[], lookM: number = LINE_GATE.lookM): number | null {
  const n = pts.length;
  if (n < 3) return null;
  const end = pts[n - 1].cumDist;
  let i1 = -1, i0 = -1;
  for (let i = n - 2; i >= 0; i--) {
    const back = end - pts[i].cumDist;
    if (i1 < 0 && back >= lookM) i1 = i;
    if (back >= 2 * lookM) { i0 = i; break; }
  }
  if (i1 < 0 || i0 < 0) return null;
  const b1 = calculateHeading(pts[i0], pts[i1]);
  const b2 = calculateHeading(pts[i1], pts[n - 1]);
  return Math.abs(normalizeDeg(b2 - b1));
}

/**
 * Ist die aktuelle Position in einer Kurvenzone?
 * `lastCornerAtM` = cumDist (Detektor-Massstab) der zuletzt bestätigten Ecke, sonst null/-Infinity.
 */
export function inTurnZone(pts: readonly GatePoint[], lastCornerAtM?: number | null): boolean {
  const n = pts.length;
  if (!n) return false;
  if (lastCornerAtM != null && Number.isFinite(lastCornerAtM) && pts[n - 1].cumDist - lastCornerAtM <= LINE_GATE.holdM) return true;
  const change = recentHeadingChangeDeg(pts);
  return change != null && change >= LINE_GATE.turnDeg;
}

/** Distanz-Gate (m) für den nächsten Linienpunkt. */
export function lineGateStepM(pts: readonly GatePoint[], lastCornerAtM?: number | null): number {
  return inTurnZone(pts, lastCornerAtM) ? LINE_GATE.denseStepM : LINE_GATE.stepM;
}

/** Linien-Glättungsfaktor für den nächsten Fix. */
export function lineEmaAlpha(turnZone: boolean): number {
  return turnZone ? LINE_GATE.turnEmaAlpha : LINE_GATE.emaAlpha;
}

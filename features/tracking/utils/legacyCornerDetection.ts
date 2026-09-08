// ──────────────────────────────────────────────────────────────────────────
// Wörtlich (mechanisch, nicht neu geschrieben) aus Commit 82bd17c
// ("chore(release): bump ios buildNumber to 40" — Build 40, der letzte
// nachweislich auf echtem iPhone funktionierende Fährten-Stand, siehe
// docs/architecture/FAEHRTE_SEARCH_RENDER_AND_GUIDANCE_FIX_REPORT.md)
// extrahiert: features/tracking/hooks/useTrackRecorder.ts, `detectCorner()`
// plus die zugehörigen modul-lokalen Konstanten. Einzige Änderung: aus dem
// `useCallback`/Refs herausgelöst zu einer reinen Funktion (Punkte +
// lastCornerAt als Parameter statt Refs) — die Algorithmus-Logik selbst ist
// UNVERÄNDERT (siehe legacyCornerDetection.fidelity.test.ts, der die
// Konstanten UND das Klassifikationsverhalten gegen den historischen Stand
// verifiziert). ANGLE_INVERT_SIDE ist historisch bereits `false` — genauso
// übernommen, nicht neu entschieden.
//
// Zweck: ENGINE=BUILD40 im Golden-Reference-A/B-Modus (siehe
// trackingEngineMode.ts) — QA kann damit die exakte historische
// Corner-Detection gegen die heutige (autoCornerDetection.ts +
// cornerConfirmation.ts) A/B vergleichen, ohne den Bericht/die Erinnerung
// als Quelle zu nehmen, sondern den echten historischen Code.
import { calculateHeading, type LatLng } from '@/features/tracking/utils/gpsFilter';

export const LEG_MIN_M           = 4.0;  // moderate Schenkellänge (3–5 m) — bewusst kurze Winkel bleiben erfassbar
export const ACUTE_ANGLE_MIN_DEG = 30;   // Innenwinkel: ab hier Spitzwinkel
export const ACUTE_ANGLE_MAX_DEG = 60;   // Innenwinkel: bis hier Spitzwinkel
export const ANGLE_90_MIN_DEG    = 75;   // Innenwinkel: ab hier rechtwinklig (~90°)
export const ANGLE_90_MAX_DEG    = 115;  // Innenwinkel: bis hier rechtwinklig
export const MAX_ANGLE_ACCURACY_M = 20;  // Winkel nur bestätigen, wenn der Scheitel-Fix genau genug ist
export const CORNER_GAP_M        = LEG_MIN_M;
export const ANGLE_USE_INTERIOR  = true;
export const ANGLE_INVERT_SIDE   = false;

export type LegacyAngleKind = 'links' | 'rechts' | 'spitz_links' | 'spitz_rechts';

export interface LegacyAcceptedPoint extends LatLng { t: number; accuracy: number | null; cumDist: number; }

export interface LegacyCornerResult {
  apex: LegacyAcceptedPoint;
  dir: 'links' | 'rechts';
  kind: LegacyAngleKind;
  angleDeg: number;      // Innenwinkel (gerundet wie historisch: Math.round)
  turnDeg: number;       // Richtungsänderung (Betrag), historisch `best.mag`
  reject: null;
}
export interface LegacyCornerReject {
  apex: null; dir: null; kind: null; angleDeg: null; turnDeg: null;
  reject: 'no_turn' | 'poor_accuracy' | 'leg_too_short' | 'angle_unclear';
}

function normalizeDeg(d: number): number {
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

// Wörtliche Portierung von useTrackRecorder.ts@82bd17c `detectCorner()`.
// `pts` = alle bisher akzeptierten Linienpunkte (aufsteigend nach cumDist),
// `lastCornerAt` = cumDist des zuletzt erkannten Winkels (-Infinity falls
// noch keiner). Gibt GENAU EINEN Kandidaten zurück (den mit der stärksten
// Richtungsänderung im gültigen Fenster) oder eine Ablehnung mit Grund.
export function legacyDetectCorner(
  pts: readonly LegacyAcceptedPoint[], lastCornerAt: number,
): LegacyCornerResult | LegacyCornerReject {
  const n = pts.length;
  if (n < 3) return { apex: null, dir: null, kind: null, angleDeg: null, turnDeg: null, reject: 'no_turn' };
  const C = pts[n - 1];

  let best: { apex: LegacyAcceptedPoint; diff: number; mag: number } | null = null;
  let sawLegShort = false, sawPoorAcc = false;
  for (let k = n - 2; k > 0; k--) {
    const apex = pts[k];
    if (C.cumDist - apex.cumDist < LEG_MIN_M) { sawLegShort = true; continue; }      // Auslauf noch zu kurz
    if (apex.cumDist - lastCornerAt < CORNER_GAP_M) break;                            // nur NACH dem letzten Winkel
    if (apex.accuracy == null || apex.accuracy > MAX_ANGLE_ACCURACY_M) { sawPoorAcc = true; continue; }  // Fix zu ungenau

    // Anker A: LEG_MIN_M vor dem Scheitel; Auslauf-Endpunkt: LEG_MIN_M danach.
    let ai = k;
    while (ai > 0 && apex.cumDist - pts[ai].cumDist < LEG_MIN_M) ai--;
    if (apex.cumDist - pts[ai].cumDist < LEG_MIN_M) { sawLegShort = true; continue; }  // kein voller Einlauf-Schenkel
    let ci = k;
    while (ci < n - 1 && pts[ci].cumDist - apex.cumDist < LEG_MIN_M) ci++;

    const diff = normalizeDeg(calculateHeading(apex, pts[ci]) - calculateHeading(pts[ai], apex));
    const mag = Math.abs(diff);
    if (!best || mag > best.mag) best = { apex, diff, mag };
  }

  if (!best || best.mag < 15) {   // praktisch keine Richtungsänderung → kein Winkel
    const reject = best ? 'no_turn' : (sawPoorAcc ? 'poor_accuracy' : sawLegShort ? 'leg_too_short' : 'no_turn');
    return { apex: null, dir: null, kind: null, angleDeg: null, turnDeg: null, reject };
  }

  const B = best.apex;
  let dir: 'links' | 'rechts' = best.diff > 0 ? 'rechts' : 'links';
  if (ANGLE_INVERT_SIDE) dir = dir === 'rechts' ? 'links' : 'rechts';

  const angleDeg = ANGLE_USE_INTERIOR ? 180 - best.mag : best.mag;
  let kind: LegacyAngleKind | null = null;
  if (angleDeg >= ANGLE_90_MIN_DEG && angleDeg <= ANGLE_90_MAX_DEG) {
    kind = dir;
  } else if (angleDeg >= ACUTE_ANGLE_MIN_DEG && angleDeg <= ACUTE_ANGLE_MAX_DEG) {
    kind = dir === 'rechts' ? 'spitz_rechts' : 'spitz_links';
  }
  if (!kind) return { apex: null, dir: null, kind: null, angleDeg: null, turnDeg: null, reject: 'angle_unclear' };

  return { apex: B, dir, kind, angleDeg: Math.round(angleDeg), turnDeg: Math.round(best.mag), reject: null };
}

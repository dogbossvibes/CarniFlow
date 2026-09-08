// QA-Diagnose der Absuche: pro eingehendem GPS-Fix GENAU EIN Endstatus, plus
// die Grössen, aus denen dieser Status folgt. Zweck ist ausschliesslich
// Nachvollziehbarkeit im Feld/Test ("welche Bedingung hat den Punkt
// verworfen?") — diese Datei enthält KEINE Entscheidungslogik und verändert
// nichts an der Aufnahme.
export type SearchFixStatus =
  | 'ACCEPTED'
  | 'REJECT_ACCURACY'
  | 'REJECT_SPEED'
  | 'BLOCK_FUSION_STATIONARY'
  | 'BLOCK_FUSION_OUTLIER'
  | 'SKIP_MIN_SEGMENT';

export interface SearchFixDiag {
  status:         SearchFixStatus;
  source:         string | null;        // 'expo' | 'native' | 'external'
  accuracy:       number | null;        // gemeldete Genauigkeit (m)
  dtMs:           number | null;        // Zeit seit dem letzten AKZEPTIERTEN Fix
  jumpM:          number | null;        // Distanz zum letzten AKZEPTIERTEN Fix
  speedMps:       number | null;        // daraus berechnete Geschwindigkeit
  movementState:  string | null;        // Core Motion (null ohne Modul/Permission)
  fusion:         string | null;        // trackFusionEngine-Klassifikation
  pointsBefore:   number;
  pointsAfter:    number;
  distanceBefore: number;
  distanceAfter:  number;
}

export function formatSearchFixDiag(d: SearchFixDiag): string {
  const n = (v: number | null, digits = 1) => (v == null ? '–' : v.toFixed(digits));
  return `[searchFix] ${d.status} src=${d.source ?? '–'} acc=${n(d.accuracy)} dt=${d.dtMs == null ? '–' : Math.round(d.dtMs)}ms `
    + `jump=${n(d.jumpM)}m v=${n(d.speedMps, 2)}m/s motion=${d.movementState ?? '–'} fusion=${d.fusion ?? '–'} `
    + `pts ${d.pointsBefore}→${d.pointsAfter} dist ${n(d.distanceBefore)}→${n(d.distanceAfter)}m`;
}

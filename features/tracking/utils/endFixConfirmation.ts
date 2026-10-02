import { endRadiusM } from './guidanceEngine';

export interface EndFixHistory {
  lastFixMs: number | null;
  approachSeen: boolean;
  approachStartDistanceM: number | null;
  approachEndDistanceM: number | null;
  approachSampleCount: number;
  insideCount: number;
  firstInsideMs: number | null;
}
export const INITIAL_END_FIX_HISTORY: EndFixHistory = {
  lastFixMs: null, approachSeen: false, approachStartDistanceM: null,
  approachEndDistanceM: null, approachSampleCount: 0, insideCount: 0, firstInsideMs: null,
};

/** Feed only distinct, GPS-accepted handler fixes. Dog projection is not an input. */
export function advanceEndFixHistory(previous: EndFixHistory, fix: {
  tMs: number;
  distanceToEndM: number;
  accuracyM: number | null;
  lastSegmentReached: boolean;
  handlerProgressRatio: number;
}): EndFixHistory {
  if (previous.lastFixMs === fix.tMs) return previous;
  const radius = endRadiusM(fix.accuracyM);
  // Keep the approach observation independently of the final last-segment
  // gate. Real accepted fixes can pass 4–5 m before progress crosses 90%;
  // requiring both on that earlier sample loses a valid monotone approach.
  const plausibleFinalApproach = fix.lastSegmentReached || fix.handlerProgressRatio >= 0.75
    || fix.distanceToEndM <= 5;
  const approachSample = plausibleFinalApproach && fix.distanceToEndM > radius + 1
    && fix.distanceToEndM <= 10;
  const approachSeen = previous.approachSeen || approachSample;
  const approachStartDistanceM = previous.approachStartDistanceM ?? (approachSample ? fix.distanceToEndM : null);
  const approachEndDistanceM = approachSample ? fix.distanceToEndM : previous.approachEndDistanceM;
  const approachSampleCount = previous.approachSampleCount + (approachSample ? 1 : 0);
  const inside = plausibleFinalApproach && fix.distanceToEndM <= radius;
  return {
    lastFixMs: fix.tMs, approachSeen,
    approachStartDistanceM, approachEndDistanceM, approachSampleCount,
    insideCount: inside ? previous.insideCount + 1 : 0,
    firstInsideMs: inside ? previous.firstInsideMs ?? fix.tMs : null,
  };
}

/**
 * Darf ein GPS-akzeptierter Handler-Fix die Ende-Bestätigung speisen?
 *
 * Es zählen nur Fixes, die die Sensor-Fusion selbst als belastbar einstuft:
 *   • `gps_outlier`    → NEIN (Sprung + schlechte Accuracy/Geschwindigkeit + Motion-Widerspruch)
 *   • `low_confidence` → NEIN (die Fusion hält den Fix selbst für unsicher)
 *   • Flag `stale_fix` → NEIN (zu alt; `stationary` wird in der Fusion VOR der Altersprüfung
 *                         zurückgegeben und würde ihn sonst durchlassen)
 *   • `stationary`     → JA: genau das erwartete Signal, wenn der Handler am Ziel steht.
 *   • `accepted`       → JA.
 * Wurden Stillstands-Fixes ausgeschlossen, blieb `endHandlerFix` beim ersten Fix im Radius
 * eingefroren (stableFixCount = 1, end_hysteresis bis zum manuellen Stop).
 *
 * Es entsteht KEINE neue Schwelle: weitere Absicherung bleibt unverändert bestehen —
 * evaluateSearchFix (Accuracy ≤ 45 m, Speed ≤ 12 m/s) vorgelagert, Fix-Identität über den
 * Zeitstempel (advanceEndFixHistory), Radius endRadiusM, ≥ 2 Fixes UND ≥ 800 ms Spanne
 * (trackEndBlocker). BUILD40 blockierte vorher nie und bleibt so.
 */
export function admitsEndHandlerFix(
  fusion: { classification: string; reasonFlags?: readonly string[] },
  engineMode: string,
): boolean {
  if (engineMode === 'build40') return true;
  if (fusion.classification === 'gps_outlier' || fusion.classification === 'low_confidence') return false;
  return !(fusion.reasonFlags ?? []).includes('stale_fix');
}

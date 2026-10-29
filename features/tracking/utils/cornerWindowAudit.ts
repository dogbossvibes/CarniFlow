import {
  SCALES_M, MIN_LEG_M, MIN_SAMPLES_SHORT, MIN_SAMPLES_LONG, STRAIGHT_TOL_DEG,
  nearIndex, robustBearing, meanBearing, type ShortLegPoint,
} from './shortLegCornerDetection';

export interface WindowAudit {
  scaleM: number; endIndex: number; lengthM: number; minimumLengthM: number;
  samples: number; minimumSamples: number; spreadDeg: number | null;
  spreadLimitDeg: number; residualM: number | null;
  outcome: 'too_short' | 'too_few_samples' | 'no_fit' | 'direction_spread' | 'valid';
}
/** Offline explanation of the PRIMARY GPS window gates, not IMU windows.
 * No coordinates, modified points, alternative thresholds or detection decisions.
 * Spatial-baseline rescue and fusion have separate gates and are not explained here.
 * Uses the detector's actual geometry functions/constants and stop rule.
 */
export function auditPrimaryCornerWindows(points: readonly ShortLegPoint[], apexIndex: number, forward: boolean): WindowAudit[] {
  if (!Number.isInteger(apexIndex) || apexIndex < 0 || apexIndex >= points.length) return [];
  const result: WindowAudit[] = [];
  let found = false;
  for (const scaleM of SCALES_M) {
    const endIndex = nearIndex(points, apexIndex, forward, scaleM);
    const lengthM = Math.abs(points[endIndex].cumDist - points[apexIndex].cumDist);
    const samples = Math.abs(endIndex - apexIndex) + 1;
    const minimumSamples = scaleM < 4.5 ? MIN_SAMPLES_SHORT : MIN_SAMPLES_LONG;
    const fit = lengthM >= MIN_LEG_M && samples >= minimumSamples ? robustBearing(points, apexIndex, endIndex) : null;
    const bearing = fit ? meanBearing(points, apexIndex, endIndex) : null;
    const outcome: WindowAudit['outcome'] = lengthM < MIN_LEG_M ? 'too_short'
      : samples < minimumSamples ? 'too_few_samples' : !fit ? 'no_fit'
      : (bearing?.spreadDeg ?? 0) > STRAIGHT_TOL_DEG ? 'direction_spread' : 'valid';
    result.push({ scaleM, endIndex, lengthM, minimumLengthM: MIN_LEG_M,
      samples, minimumSamples, spreadDeg: bearing?.spreadDeg ?? null,
      spreadLimitDeg: STRAIGHT_TOL_DEG, residualM: fit?.residualM ?? null, outcome });
    if (outcome === 'direction_spread' && found) break;
    if (outcome === 'valid') found = true;
  }
  return result;
}

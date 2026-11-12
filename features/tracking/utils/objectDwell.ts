/** Conservative dwell evidence for a laid reference object. No GPS geometry is changed. */
export const OBJECT_DWELL = Object.freeze({ durationMs: 6000, maxSpeedMps: 0.4, maxDriftM: 1.5,
  maxReferenceM: 2.5, maxAccuracyM: 20, maxGapMs: 3000, boundaryM: 3, angleM: 3,
  // Genauigkeitsabhängige Nähe-Toleranz (T-196): Anteil der kombinierten GPS-Unsicherheit
  // und Obergrenze. maxReferenceM bleibt die Untergrenze.
  referenceAccuracyFactor: 0.3, maxReferenceCapM: 5 });

/**
 * Wie nah am gelegten Gegenstand der Hundeführer stehen muss, damit ein Halt als
 * Fund zählen kann. Der gelegte Punkt und die Position bei der Absuche stammen aus
 * zwei unabhängigen GPS-Aufzeichnungen; ihr Versatz liegt schon im offenen Feld in
 * der Grössenordnung der bisherigen festen 2,5 m. Die Toleranz wächst deshalb mit
 * der gemeldeten Unsicherheit beider Messungen, bleibt aber gedeckelt, damit ein
 * Halt weit neben dem Gegenstand nie als Fund zählt. Ohne Genauigkeitsangaben gilt
 * unverändert maxReferenceM.
 */
export function objectReferenceToleranceM(searchAccuracyM: number | null | undefined, objectAccuracyM: number | null | undefined): number {
  const usable = (v: number | null | undefined): number => (v != null && Number.isFinite(v) && v > 0 ? v : 0);
  const combined = Math.hypot(usable(searchAccuracyM), usable(objectAccuracyM));
  return Math.min(OBJECT_DWELL.maxReferenceCapM, OBJECT_DWELL.maxReferenceM + OBJECT_DWELL.referenceAccuracyFactor * combined);
}

export interface ObjectDwellSample {
  tMs: number; speedMps: number | null; accuracyM: number | null;
  progressM: number; trackLengthM: number; distanceToReferenceM: number;
  driftFromStartM: number; nearAngle: boolean; searchActive: boolean; gpsOutlier: boolean;
  /** Zulässiger Abstand zum gelegten Gegenstand (m); fehlt er, gilt OBJECT_DWELL.maxReferenceM. */
  referenceToleranceM?: number;
}
export interface ObjectDwellState { startedMs: number | null; lastMs: number | null; accepted: boolean }
export const INITIAL_OBJECT_DWELL: ObjectDwellState = { startedMs: null, lastMs: null, accepted: false };

export function stepObjectDwell(state: ObjectDwellState, sample: ObjectDwellSample):
  { state: ObjectDwellState; acceptedNow: boolean; rejectReason: string | null } {
  if (state.accepted) return { state, acceptedNow: false, rejectReason: null };
  const reason = !sample.searchActive ? 'search_inactive'
    : sample.gpsOutlier ? 'gps_outlier'
    : sample.accuracyM == null || sample.accuracyM > OBJECT_DWELL.maxAccuracyM ? 'accuracy'
    : sample.progressM <= OBJECT_DWELL.boundaryM ? 'near_start'
    // A laid reference object may itself be at a turn or at the end. Proximity
    // to that actual object remains mandatory; only the start is excluded.
    : sample.distanceToReferenceM > (sample.referenceToleranceM ?? OBJECT_DWELL.maxReferenceM) ? 'far_from_reference'
    : sample.speedMps != null && sample.speedMps > OBJECT_DWELL.maxSpeedMps ? 'moving'
    : sample.driftFromStartM > OBJECT_DWELL.maxDriftM ? 'position_drift'
    : state.lastMs != null && sample.tMs - state.lastMs > OBJECT_DWELL.maxGapMs ? 'gps_gap'
    : null;
  if (reason) return { state: INITIAL_OBJECT_DWELL, acceptedNow: false, rejectReason: reason };
  const startedMs = state.startedMs ?? sample.tMs;
  const acceptedNow = sample.tMs - startedMs >= OBJECT_DWELL.durationMs;
  return { state: { startedMs, lastMs: sample.tMs, accepted: acceptedNow }, acceptedNow, rejectReason: null };
}

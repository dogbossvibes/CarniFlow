/**
 * Confidence-basierte Fährtenanalyse (Schema v3).
 *
 * Die Geometrie kommt unverändert aus dem bestehenden Lay-/Search-Recorder.
 * GPS-Qualität, Fusion und Core Motion klassifizieren ausschliesslich, wie
 * belastbar eine Aussage ist. Dieses Modul verschiebt oder erzeugt keine
 * Positionen und führt ausdrücklich kein Dead-Reckoning durch.
 */
import {
  confidenceBand,
  type AnalyticsCornerInput,
  type AnalyticsObjectInput,
  type AnalyticsSample,
  type ConfidenceBand,
  type ReacquisitionStats,
  type TrackAnalyticsInput,
} from '@/features/tracking/engine/trackAnalytics';
import {
  computeTrackAnalyticsV2,
  type TrackAnalyticsV2,
} from '@/features/tracking/engine/trackSegmentAnalysis';

export const ANALYTICS_VERSION_V3 = 3 as const;

/**
 * Zentrale, bewusst konservative Schwellen. Genauigkeitswerte sind Meter,
 * Geschwindigkeiten m/s, Zeiten Sekunden. Die Grenzen klassifizieren Daten;
 * sie korrigieren niemals die aufgezeichnete Search-Geometrie.
 */
export const TRACK_ANALYSIS_THRESHOLDS = Object.freeze({
  reliableConfidenceMin: 0.65,
  excludedConfidenceBelow: 0.25,
  reliableAccuracyMaxM: 25,
  excludedAccuracyAboveM: 45,
  reliableSpeedMaxMps: 3.5,
  excludedSpeedAboveMps: 8,
  reliableMotionConfidenceMin: 0.35,
  minSamplesForAssessment: 3,
  maxContinuousSampleGapSec: 5,
  dynamicCorridorBaseM: 3,
  dynamicCorridorAccuracyFactor: 0.12,
  dynamicCorridorMaxExpansionM: 2,
  deviationMinConsecutiveSamples: 3,
  deviationMinDurationSec: 2.5,
  deviationMinDistanceM: 3,
  deviationMinAwayTrendM: 0.5,
  recoveryConsecutiveSamples: 2,
  cornerStableConsecutiveSamples: 3,
  cornerWindowBeforeM: 8,
  cornerWindowAfterM: 15,
  objectWindowBeforeM: 8,
  objectWindowAfterM: 8,
  objectMinReliableSamples: 3,
  objectMinUsableSamples: 4,
  objectStopSpeedMps: 0.25,
  objectSlowSpeedMps: 0.4,
  objectStableStopMinSec: 3,
  objectSustainedSlowdownMinSec: 2,
  objectContinuationM: 3,
  stopGoStopMinSec: 2,
} as const);

export type AnalysisSampleState = 'reliable' | 'uncertain' | 'excluded';
export type AnalysisQualityReason =
  | 'poor_gps'
  | 'gps_outlier'
  | 'implausible_speed'
  | 'low_fusion_confidence'
  | 'low_motion_confidence'
  | 'geometry_rejected';

export interface ClassifiedAnalyticsSample {
  sample: AnalyticsSample;
  state: AnalysisSampleState;
  reasons: AnalysisQualityReason[];
  dynamicCorridorM: number;
}

export interface AssessableDistance {
  percent: number;
  reliableDistanceM: number;
  uncertainDistanceM: number;
  excludedDistanceM: number;
  totalDistanceM: number;
  reliableSamples: number;
  uncertainSamples: number;
  excludedSamples: number;
}

export interface DeviationEvent {
  id: string;
  startAlongTrackM: number;
  startTimeSec: number;
  durationSec: number;
  maxLineDeviationM: number;
  typicalLineDeviationM: number;
  distanceUntilReturnM: number | null;
  confidence: number;
  recoveryTimeSec: number | null;
  recoveryDistanceM: number | null;
  recovered: boolean;
}

export type CornerInterpretation =
  | 'clean'
  | 'short_control_phase'
  | 'likely_overshoot'
  | 'longer_search_phase'
  | 'reacquisition_required'
  | 'not_reliably_assessable';

export interface CornerAnalysisV3 {
  atM: number;
  side: 'links' | 'rechts' | 'unbekannt';
  sharpness: 'rechtwinklig' | 'spitz' | 'unbekannt';
  arrivalTSec: number | null;
  speedBeforeMps: number | null;
  speedAfterMps: number | null;
  speedChangePercent: number | null;
  minDistanceM: number | null;
  maxLateralDeviationM: number | null;
  overshootM: number | null;
  reacquisitionSec: number | null;
  stabilizationTimeSec: number | null;
  stabilizationDistanceM: number | null;
  confidence: number;
  interpretation: CornerInterpretation;
}

export type ObjectContactStatus =
  | 'likely_contact'
  | 'inconclusive'
  | 'no_clear_contact'
  | 'insufficient_data';

export type ObjectContactReasonCode =
  | 'sustained_slowdown'
  | 'stable_stop'
  | 'poor_gps'
  | 'insufficient_samples'
  | 'passed_without_stop'
  | 'motion_consistent'
  | 'gps_outlier_near_object'
  | 'continued_after_object';

export interface ObjectContactAnalysis {
  objectId: string | null;
  objectIndex: number;
  material: string | null;
  legIndex: number | null;
  alongTrackPositionM: number;
  proximityWindowStartSec: number | null;
  proximityWindowEndSec: number | null;
  /** Technische Diagnose, nicht Grundlage für die Kontaktentscheidung. */
  minRecordedDistanceM: number | null;
  speedBeforeMps: number | null;
  minimumSpeedMps: number | null;
  stopDurationSec: number;
  speedAfterMps: number | null;
  contactConfidence: number;
  status: ObjectContactStatus;
  reasonCodes: ObjectContactReasonCode[];
}

export interface PaceAnalysisV3 {
  avgMps: number;
  medianMps: number;
  consistency: number;
  stopGoPhases: number;
}

export interface AnalysisScoreBreakdown {
  deviationEvents: number;
  recovery: number;
  corners: number | null;
  stabilization: number | null;
  pace: number;
  assessableDistance: number;
  dataQuality: number;
}

export interface TrackAnalyticsV3 extends Omit<TrackAnalyticsV2, 'analyticsVersion' | 'corners' | 'objects' | 'reacquisition' | 'pace'> {
  analyticsVersion: typeof ANALYTICS_VERSION_V3;
  corners: CornerAnalysisV3[];
  objects: ObjectContactAnalysis[];
  reacquisition: ReacquisitionStats;
  pace: PaceAnalysisV3;
  assessableDistance: AssessableDistance;
  deviationEvents: DeviationEvent[];
  scoreBreakdown: AnalysisScoreBreakdown;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }
function round1(value: number): number { return Math.round(value * 10) / 10; }
function round2(value: number): number { return Math.round(value * 100) / 100; }
function mean(values: number[]): number { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function dynamicCorridor(sample: AnalyticsSample): number {
  const accuracy = sample.accuracyM == null || !Number.isFinite(sample.accuracyM) ? 0 : Math.max(0, sample.accuracyM);
  return TRACK_ANALYSIS_THRESHOLDS.dynamicCorridorBaseM + Math.min(
    TRACK_ANALYSIS_THRESHOLDS.dynamicCorridorMaxExpansionM,
    accuracy * TRACK_ANALYSIS_THRESHOLDS.dynamicCorridorAccuracyFactor,
  );
}

function recordedSearchDistance(start: AnalyticsSample, end: AnalyticsSample): number {
  const source = start.searchDistanceM != null && end.searchDistanceM != null
    ? end.searchDistanceM - start.searchDistanceM
    : end.atM - start.atM;
  return Math.max(0, source);
}

export function classifyAnalyticsSamples(samples: AnalyticsSample[]): ClassifiedAnalyticsSample[] {
  return samples.map((sample, index) => {
    const reasons: AnalysisQualityReason[] = [];
    const accuracy = sample.accuracyM;
    const previous = samples[index - 1];
    const dt = previous ? sample.tSec - previous.tSec : 0;
    const impliedSpeed = previous && dt > 0 ? recordedSearchDistance(previous, sample) / dt : null;
    const reportedOrImpliedSpeed = Math.max(sample.speedMps ?? 0, impliedSpeed ?? 0);
    const sparse = previous != null && (dt <= 0 || dt > TRACK_ANALYSIS_THRESHOLDS.maxContinuousSampleGapSec);

    if (sample.geometryAccepted === false) reasons.push('geometry_rejected');
    if (sample.fusionClassification === 'gps_outlier') reasons.push('gps_outlier');
    if (accuracy != null && accuracy > TRACK_ANALYSIS_THRESHOLDS.reliableAccuracyMaxM) reasons.push('poor_gps');
    if (reportedOrImpliedSpeed > TRACK_ANALYSIS_THRESHOLDS.reliableSpeedMaxMps) reasons.push('implausible_speed');
    if (sample.confidence < TRACK_ANALYSIS_THRESHOLDS.reliableConfidenceMin) reasons.push('low_fusion_confidence');
    if (sample.motionConfidence != null && sample.motionConfidence < TRACK_ANALYSIS_THRESHOLDS.reliableMotionConfidenceMin) reasons.push('low_motion_confidence');

    const stationaryEvidence = sample.geometryAccepted === false && sample.fusionClassification === 'stationary';
    const excluded = !Number.isFinite(sample.atM) || !Number.isFinite(sample.tSec) || !Number.isFinite(sample.devM)
      || (sample.geometryAccepted === false && !stationaryEvidence)
      || sample.fusionClassification === 'gps_outlier'
      || sample.confidence < TRACK_ANALYSIS_THRESHOLDS.excludedConfidenceBelow
      || (accuracy != null && accuracy > TRACK_ANALYSIS_THRESHOLDS.excludedAccuracyAboveM)
      || reportedOrImpliedSpeed > TRACK_ANALYSIS_THRESHOLDS.excludedSpeedAboveMps;
    const reliable = !excluded && !stationaryEvidence
      && !sparse
      && samples.length >= TRACK_ANALYSIS_THRESHOLDS.minSamplesForAssessment
      && sample.confidence >= TRACK_ANALYSIS_THRESHOLDS.reliableConfidenceMin
      && (accuracy == null || accuracy <= TRACK_ANALYSIS_THRESHOLDS.reliableAccuracyMaxM)
      && reportedOrImpliedSpeed <= TRACK_ANALYSIS_THRESHOLDS.reliableSpeedMaxMps
      && (sample.motionConfidence == null || sample.motionConfidence >= TRACK_ANALYSIS_THRESHOLDS.reliableMotionConfidenceMin);

    return { sample, state: excluded ? 'excluded' : reliable ? 'reliable' : 'uncertain', reasons, dynamicCorridorM: dynamicCorridor(sample) };
  });
}

export function computeAssessableDistance(classified: ClassifiedAnalyticsSample[]): AssessableDistance {
  let reliableDistanceM = 0;
  let uncertainDistanceM = 0;
  let excludedDistanceM = 0;
  for (let index = 1; index < classified.length; index++) {
    const distance = recordedSearchDistance(classified[index - 1].sample, classified[index].sample);
    const states = [classified[index - 1].state, classified[index].state];
    if (states.includes('excluded')) excludedDistanceM += distance;
    else if (states.includes('uncertain')) uncertainDistanceM += distance;
    else reliableDistanceM += distance;
  }
  const totalDistanceM = reliableDistanceM + uncertainDistanceM + excludedDistanceM;
  // Unsichere Abschnitte tragen nur mit halbem Gewicht zur bewertbaren Strecke bei.
  const assessableM = reliableDistanceM + uncertainDistanceM * 0.5;
  return {
    percent: totalDistanceM > 0 ? Math.round(100 * assessableM / totalDistanceM) : 0,
    reliableDistanceM: round1(reliableDistanceM),
    uncertainDistanceM: round1(uncertainDistanceM),
    excludedDistanceM: round1(excludedDistanceM),
    totalDistanceM: round1(totalDistanceM),
    reliableSamples: classified.filter(item => item.state === 'reliable').length,
    uncertainSamples: classified.filter(item => item.state === 'uncertain').length,
    excludedSamples: classified.filter(item => item.state === 'excluded').length,
  };
}

export function detectDeviationEvents(classified: ClassifiedAnalyticsSample[]): DeviationEvent[] {
  const events: DeviationEvent[] = [];
  let candidate: ClassifiedAnalyticsSample[] = [];
  let confirmed: ClassifiedAnalyticsSample[] | null = null;
  let recovery: ClassifiedAnalyticsSample[] = [];

  const qualifies = (items: ClassifiedAnalyticsSample[]): boolean => {
    if (items.length < TRACK_ANALYSIS_THRESHOLDS.deviationMinConsecutiveSamples) return false;
    const duration = items[items.length - 1].sample.tSec - items[0].sample.tSec;
    const distance = recordedSearchDistance(items[0].sample, items[items.length - 1].sample);
    const awayTrend = items[items.length - 1].sample.devM - items[0].sample.devM;
    return (duration >= TRACK_ANALYSIS_THRESHOLDS.deviationMinDurationSec || distance >= TRACK_ANALYSIS_THRESHOLDS.deviationMinDistanceM)
      && (awayTrend >= TRACK_ANALYSIS_THRESHOLDS.deviationMinAwayTrendM || duration >= TRACK_ANALYSIS_THRESHOLDS.deviationMinDurationSec * 2);
  };

  const pushEvent = (excursion: ClassifiedAnalyticsSample[], returned: ClassifiedAnalyticsSample | null) => {
    const first = excursion[0].sample;
    const last = returned?.sample ?? excursion[excursion.length - 1].sample;
    const confidences = excursion.map(item => item.sample.confidence);
    events.push({
      id: `deviation-${events.length + 1}`,
      startAlongTrackM: round1(first.atM),
      startTimeSec: round1(first.tSec),
      durationSec: round1(Math.max(0, last.tSec - first.tSec)),
      maxLineDeviationM: round1(Math.max(...excursion.map(item => item.sample.devM))),
      typicalLineDeviationM: round1(median(excursion.map(item => item.sample.devM))),
      distanceUntilReturnM: returned ? round1(recordedSearchDistance(first, returned.sample)) : null,
      confidence: round2(clamp01(mean(confidences) * Math.min(1, excursion.length / 5))),
      recoveryTimeSec: returned ? round1(Math.max(0, returned.sample.tSec - first.tSec)) : null,
      recoveryDistanceM: returned ? round1(recordedSearchDistance(first, returned.sample)) : null,
      recovered: returned != null,
    });
  };

  for (const item of classified) {
    const outside = item.state === 'reliable' && item.sample.devM > item.dynamicCorridorM;
    const inside = item.state === 'reliable' && item.sample.devM <= item.dynamicCorridorM;
    if (!confirmed) {
      if (outside) {
        candidate.push(item);
        if (qualifies(candidate)) confirmed = [...candidate];
      } else {
        candidate = [];
      }
      continue;
    }

    if (outside) {
      confirmed.push(item);
      recovery = [];
    } else if (inside) {
      recovery.push(item);
      if (recovery.length >= TRACK_ANALYSIS_THRESHOLDS.recoveryConsecutiveSamples) {
        pushEvent(confirmed, recovery[0]);
        candidate = [];
        confirmed = null;
        recovery = [];
      }
    } else {
      // Unsichere Fixes bestätigen weder Ausflug noch Rückkehr.
      recovery = [];
    }
  }
  if (confirmed) pushEvent(confirmed, null);
  return events;
}

function averageSpeed(items: ClassifiedAnalyticsSample[]): number | null {
  const reported = items.map(item => item.sample.speedMps).filter((value): value is number => value != null && Number.isFinite(value));
  if (reported.length >= 2) return round2(mean(reported));
  let distance = 0;
  let duration = 0;
  for (let index = 1; index < items.length; index++) {
    const dt = items[index].sample.tSec - items[index - 1].sample.tSec;
    if (dt <= 0) continue;
    distance += Math.max(0, items[index].sample.atM - items[index - 1].sample.atM);
    duration += dt;
  }
  return duration > 0 ? round2(distance / duration) : reported[0] ?? null;
}

function sideAndSharpness(kind: AnalyticsCornerInput['angleKind']): Pick<CornerAnalysisV3, 'side' | 'sharpness'> {
  if (kind === 'links') return { side: 'links', sharpness: 'rechtwinklig' };
  if (kind === 'rechts') return { side: 'rechts', sharpness: 'rechtwinklig' };
  if (kind === 'spitz_links') return { side: 'links', sharpness: 'spitz' };
  if (kind === 'spitz_rechts') return { side: 'rechts', sharpness: 'spitz' };
  if (kind === 'spitz') return { side: 'unbekannt', sharpness: 'spitz' };
  return { side: 'unbekannt', sharpness: 'unbekannt' };
}

export function analyzeCornersV3(classified: ClassifiedAnalyticsSample[], corners: AnalyticsCornerInput[]): CornerAnalysisV3[] {
  return corners.map(corner => {
    const shape = sideAndSharpness(corner.angleKind);
    const window = classified.filter(item => item.sample.atM >= corner.atM - TRACK_ANALYSIS_THRESHOLDS.cornerWindowBeforeM
      && item.sample.atM <= corner.atM + TRACK_ANALYSIS_THRESHOLDS.cornerWindowAfterM);
    const reliable = window.filter(item => item.state === 'reliable').sort((a, b) => a.sample.tSec - b.sample.tSec);
    const empty: CornerAnalysisV3 = {
      atM: corner.atM, ...shape, arrivalTSec: null, speedBeforeMps: null, speedAfterMps: null,
      speedChangePercent: null, minDistanceM: null, maxLateralDeviationM: null, overshootM: null,
      reacquisitionSec: null, stabilizationTimeSec: null, stabilizationDistanceM: null,
      confidence: 0, interpretation: 'not_reliably_assessable',
    };
    if (reliable.length < TRACK_ANALYSIS_THRESHOLDS.cornerStableConsecutiveSamples) return empty;

    const nearest = reliable.reduce((best, item) => {
      const distance = Math.hypot(item.sample.atM - corner.atM, item.sample.devM);
      return distance < best.distance ? { item, distance } : best;
    }, { item: reliable[0], distance: Number.POSITIVE_INFINITY });
    const before = reliable.filter(item => item.sample.atM < corner.atM);
    const after = reliable.filter(item => item.sample.atM >= corner.atM);
    const speedBeforeMps = averageSpeed(before);
    const speedAfterMps = averageSpeed(after);
    const speedChangePercent = speedBeforeMps != null && speedBeforeMps > 0 && speedAfterMps != null
      ? Math.round(100 * (speedAfterMps - speedBeforeMps) / speedBeforeMps) : null;

    let excursion: ClassifiedAnalyticsSample[] = [];
    let confirmedExcursion: ClassifiedAnalyticsSample[] | null = null;
    let recoveredAt: ClassifiedAnalyticsSample | null = null;
    let insideCount = 0;
    for (const item of after) {
      if (item.sample.devM > item.dynamicCorridorM) {
        excursion.push(item);
        insideCount = 0;
        if (excursion.length >= TRACK_ANALYSIS_THRESHOLDS.deviationMinConsecutiveSamples) confirmedExcursion = [...excursion];
      } else if (confirmedExcursion) {
        insideCount++;
        if (insideCount >= TRACK_ANALYSIS_THRESHOLDS.recoveryConsecutiveSamples) {
          recoveredAt = item;
          break;
        }
      } else {
        excursion = [];
      }
    }

    let stableRun: ClassifiedAnalyticsSample[] = [];
    let stabilizedAt: ClassifiedAnalyticsSample | null = null;
    for (const item of after) {
      if (item.sample.devM <= item.dynamicCorridorM) {
        stableRun.push(item);
        if (stableRun.length >= TRACK_ANALYSIS_THRESHOLDS.cornerStableConsecutiveSamples) {
          stabilizedAt = item;
          break;
        }
      } else stableRun = [];
    }
    const stabilizationTimeSec = stabilizedAt ? round1(Math.max(0, stabilizedAt.sample.tSec - nearest.item.sample.tSec)) : null;
    const stabilizationDistanceM = stabilizedAt ? round1(Math.max(0, stabilizedAt.sample.atM - corner.atM)) : null;
    const confidence = round2(clamp01(mean(reliable.map(item => item.sample.confidence)) * Math.min(1, reliable.length / 6)));
    let interpretation: CornerInterpretation = 'clean';
    if (!stabilizedAt || confidence < TRACK_ANALYSIS_THRESHOLDS.reliableConfidenceMin) interpretation = 'not_reliably_assessable';
    else if (confirmedExcursion && recoveredAt && recoveredAt.sample.tSec - confirmedExcursion[0].sample.tSec >= 4) interpretation = 'reacquisition_required';
    else if (confirmedExcursion) interpretation = 'likely_overshoot';
    else if ((stabilizationTimeSec ?? 0) >= 6 || (stabilizationDistanceM ?? 0) >= 6) interpretation = 'longer_search_phase';
    else if ((stabilizationTimeSec ?? 0) >= 2) interpretation = 'short_control_phase';

    return {
      atM: corner.atM, ...shape,
      arrivalTSec: round1(nearest.item.sample.tSec),
      speedBeforeMps, speedAfterMps, speedChangePercent,
      minDistanceM: round1(nearest.distance),
      maxLateralDeviationM: round1(Math.max(...reliable.map(item => item.sample.devM))),
      overshootM: confirmedExcursion ? round1(Math.max(...confirmedExcursion.map(item => Math.max(0, item.sample.atM - corner.atM)))) : 0,
      reacquisitionSec: confirmedExcursion && recoveredAt ? round1(recoveredAt.sample.tSec - confirmedExcursion[0].sample.tSec) : null,
      stabilizationTimeSec, stabilizationDistanceM, confidence, interpretation,
    };
  });
}

function speedSeries(items: ClassifiedAnalyticsSample[]): { item: ClassifiedAnalyticsSample; speed: number }[] {
  return items.map((item, index) => {
    if (item.sample.speedMps != null && Number.isFinite(item.sample.speedMps)) return { item, speed: Math.max(0, item.sample.speedMps) };
    const previous = items[index - 1];
    if (!previous) return { item, speed: 0 };
    const dt = item.sample.tSec - previous.sample.tSec;
    return { item, speed: dt > 0 ? Math.max(0, item.sample.atM - previous.sample.atM) / dt : 0 };
  });
}

function longestDurationAtOrBelow(series: { item: ClassifiedAnalyticsSample; speed: number }[], maxSpeed: number): number {
  let start: number | null = null;
  let longest = 0;
  for (const entry of series) {
    if (entry.speed <= maxSpeed) {
      if (start == null) start = entry.item.sample.tSec;
      longest = Math.max(longest, entry.item.sample.tSec - start);
    } else start = null;
  }
  return round1(longest);
}

export function analyzeObjectContacts(classified: ClassifiedAnalyticsSample[], objects: AnalyticsObjectInput[], handlerDistanceHintM = 0): ObjectContactAnalysis[] {
  return objects.map((object, index) => {
    // Eine konfigurierte Führer-Hund-Distanz erweitert bloss das unsichere
    // Vorfeld. Sie wird nie als exakte Hundeposition oder Fundbeleg benutzt.
    const beforeRadius = TRACK_ANALYSIS_THRESHOLDS.objectWindowBeforeM + Math.min(12, Math.max(0, handlerDistanceHintM));
    const window = classified.filter(item => item.sample.atM >= object.atM - beforeRadius
      && item.sample.atM <= object.atM + TRACK_ANALYSIS_THRESHOLDS.objectWindowAfterM);
    const usable = window.filter(item => item.state !== 'excluded').sort((a, b) => a.sample.tSec - b.sample.tSec);
    const reliable = usable.filter(item => item.state === 'reliable');
    const reasons = new Set<ObjectContactReasonCode>();
    if (window.some(item => item.reasons.includes('poor_gps'))) reasons.add('poor_gps');
    if (window.some(item => item.reasons.includes('gps_outlier'))) reasons.add('gps_outlier_near_object');
    const resultBase = {
      objectId: object.objectId ?? null,
      objectIndex: object.objectIndex ?? index + 1,
      material: object.material,
      legIndex: object.legIndex ?? null,
      alongTrackPositionM: round1(object.atM),
      proximityWindowStartSec: usable[0]?.sample.tSec == null ? null : round1(usable[0].sample.tSec),
      proximityWindowEndSec: usable[usable.length - 1]?.sample.tSec == null ? null : round1(usable[usable.length - 1].sample.tSec),
      minRecordedDistanceM: usable.length ? round1(Math.min(...usable.map(item => Math.hypot(item.sample.atM - object.atM, item.sample.devM)))) : null,
    };
    if (usable.length < TRACK_ANALYSIS_THRESHOLDS.objectMinUsableSamples || reliable.length < TRACK_ANALYSIS_THRESHOLDS.objectMinReliableSamples) {
      reasons.add('insufficient_samples');
      return {
        ...resultBase, speedBeforeMps: null, minimumSpeedMps: null, stopDurationSec: 0, speedAfterMps: null,
        contactConfidence: round2(reliable.length / TRACK_ANALYSIS_THRESHOLDS.objectMinReliableSamples * 0.4),
        status: 'insufficient_data' as const, reasonCodes: [...reasons],
      };
    }

    const before = usable.filter(item => item.sample.atM < object.atM - 1);
    const after = usable.filter(item => item.sample.atM > object.atM + 1);
    const uncertainPreContactM = Math.min(12, Math.max(0, handlerDistanceHintM));
    const near = usable.filter(item => item.sample.atM >= object.atM - 4 - uncertainPreContactM
      && item.sample.atM <= object.atM + 4);
    const nearSpeeds = speedSeries(near);
    const speedBeforeMps = averageSpeed(before);
    const speedAfterMps = averageSpeed(after);
    const minimumSpeedMps = nearSpeeds.length ? round2(Math.min(...nearSpeeds.map(entry => entry.speed))) : null;
    const stopDurationSec = longestDurationAtOrBelow(nearSpeeds, TRACK_ANALYSIS_THRESHOLDS.objectStopSpeedMps);
    const slowDurationSec = longestDurationAtOrBelow(nearSpeeds, TRACK_ANALYSIS_THRESHOLDS.objectSlowSpeedMps);
    const continued = classified.some(item => item.state !== 'excluded' && item.sample.atM >= object.atM + TRACK_ANALYSIS_THRESHOLDS.objectContinuationM);
    const stableStop = stopDurationSec >= TRACK_ANALYSIS_THRESHOLDS.objectStableStopMinSec;
    const slowdownThreshold = Math.max(TRACK_ANALYSIS_THRESHOLDS.objectSlowSpeedMps, (speedBeforeMps ?? 0) * 0.6);
    const sustainedSlowdown = slowDurationSec >= TRACK_ANALYSIS_THRESHOLDS.objectSustainedSlowdownMinSec
      && minimumSpeedMps != null && minimumSpeedMps <= slowdownThreshold;
    if (stableStop) reasons.add('stable_stop');
    if (sustainedSlowdown) reasons.add('sustained_slowdown');
    if (continued) reasons.add('continued_after_object');
    if (reliable.some(item => item.sample.motionConfidence == null || item.sample.motionConfidence >= TRACK_ANALYSIS_THRESHOLDS.reliableMotionConfidenceMin)) reasons.add('motion_consistent');

    const upstreamStop = nearSpeeds.some(entry => entry.speed <= TRACK_ANALYSIS_THRESHOLDS.objectStopSpeedMps
      && entry.item.sample.atM < object.atM - 4);
    const quality = clamp01(mean(reliable.map(item => item.sample.confidence)) * Math.min(1, reliable.length / 5)
      * (upstreamStop ? 0.85 : 1));
    let status: ObjectContactStatus;
    let contactConfidence: number;
    if (quality < 0.5) {
      status = 'insufficient_data';
      reasons.add('insufficient_samples');
      contactConfidence = quality;
    } else if (continued && (stableStop || sustainedSlowdown)) {
      status = 'likely_contact';
      contactConfidence = clamp01(quality * (stableStop ? 1 : 0.85));
    } else if (continued && stopDurationSec < 1.5 && !sustainedSlowdown) {
      status = 'no_clear_contact';
      reasons.add('passed_without_stop');
      contactConfidence = quality;
    } else {
      status = 'inconclusive';
      contactConfidence = quality * 0.65;
    }
    return {
      ...resultBase, speedBeforeMps, minimumSpeedMps, stopDurationSec, speedAfterMps,
      contactConfidence: round2(contactConfidence), status, reasonCodes: [...reasons],
    };
  });
}

function computePaceV3(classified: ClassifiedAnalyticsSample[], base: TrackAnalyticsV2['pace']): PaceAnalysisV3 {
  const reliable = classified.filter(item => item.state === 'reliable');
  const series = speedSeries(reliable);
  let stopGoPhases = 0;
  let movingSeen = false;
  let stopStart: number | null = null;
  for (const entry of series) {
    if (entry.speed >= 0.5) {
      if (movingSeen && stopStart != null && entry.item.sample.tSec - stopStart >= TRACK_ANALYSIS_THRESHOLDS.stopGoStopMinSec) stopGoPhases++;
      movingSeen = true;
      stopStart = null;
    } else if (movingSeen && entry.speed <= TRACK_ANALYSIS_THRESHOLDS.objectStopSpeedMps && stopStart == null) {
      stopStart = entry.item.sample.tSec;
    }
  }
  return { ...base, stopGoPhases };
}

function reacquisitionFromEvents(events: DeviationEvent[]): ReacquisitionStats {
  const completed = events.filter(event => event.recovered && event.recoveryTimeSec != null).map(event => event.recoveryTimeSec as number);
  return {
    count: events.length,
    completedCount: completed.length,
    meanSec: completed.length ? round1(mean(completed)) : null,
    maxSec: completed.length ? round1(Math.max(...completed)) : null,
    medianSec: completed.length ? round1(median(completed)) : null,
  };
}

function computeScore(
  events: DeviationEvent[], corners: CornerAnalysisV3[], pace: PaceAnalysisV3,
  assessable: AssessableDistance, analysisConfidence: number,
): { score: number; breakdown: AnalysisScoreBreakdown } {
  const completed = events.filter(event => event.recovered && event.recoveryTimeSec != null);
  const deviationEvents = Math.max(0, 100 - events.reduce((sum, event) => sum + (event.recovered ? 14 : 24), 0));
  const recovery = completed.length ? Math.max(0, 100 - mean(completed.map(event => event.recoveryTimeSec as number)) * 5) : 100;
  const reliableCorners = corners.filter(corner => corner.interpretation !== 'not_reliably_assessable');
  const cornerValues: Record<Exclude<CornerInterpretation, 'not_reliably_assessable'>, number> = {
    clean: 100, short_control_phase: 85, likely_overshoot: 65, longer_search_phase: 60, reacquisition_required: 45,
  };
  const cornerScore = reliableCorners.length ? mean(reliableCorners.map(corner => cornerValues[corner.interpretation as keyof typeof cornerValues])) : null;
  const stabilized = reliableCorners.filter(corner => corner.stabilizationTimeSec != null);
  const stabilization = stabilized.length ? Math.max(0, 100 - mean(stabilized.map(corner => corner.stabilizationTimeSec as number)) * 8) : null;
  const breakdown: AnalysisScoreBreakdown = {
    deviationEvents: Math.round(deviationEvents), recovery: Math.round(recovery),
    corners: cornerScore == null ? null : Math.round(cornerScore),
    stabilization: stabilization == null ? null : Math.round(stabilization),
    pace: Math.round(pace.consistency * 100), assessableDistance: assessable.percent,
    dataQuality: Math.round(analysisConfidence * 100),
  };
  const weights: Record<keyof AnalysisScoreBreakdown, number> = {
    deviationEvents: 25, recovery: 15, corners: 20, stabilization: 10, pace: 15, assessableDistance: 10, dataQuality: 5,
  };
  const applicable = (Object.keys(breakdown) as (keyof AnalysisScoreBreakdown)[]).filter(key => breakdown[key] != null);
  const totalWeight = applicable.reduce((sum, key) => sum + weights[key], 0);
  const score = totalWeight > 0 ? applicable.reduce((sum, key) => sum + (breakdown[key] as number) * weights[key] / totalWeight, 0) : 0;
  return { score: Math.round(clamp01(score / 100) * 100), breakdown };
}

export function computeTrackAnalyticsV3(input: TrackAnalyticsInput): TrackAnalyticsV3 {
  const base = computeTrackAnalyticsV2(input);
  const classified = classifyAnalyticsSamples(input.samples);
  const assessableDistance = computeAssessableDistance(classified);
  const deviationEvents = detectDeviationEvents(classified);
  const corners = analyzeCornersV3(classified, input.corners);
  const objects = analyzeObjectContacts(classified, input.objects, input.handlerDistanceHintM ?? 0);
  const reacquisition = reacquisitionFromEvents(deviationEvents);
  const pace = computePaceV3(classified, base.pace);
  const confidence = input.samples.length
    ? round2(clamp01((assessableDistance.percent / 100) * mean(input.samples.map(sample => sample.confidence))))
    : 0;
  const band: ConfidenceBand = confidenceBand(confidence);
  const { score, breakdown } = computeScore(deviationEvents, corners, pace, assessableDistance, confidence);
  return {
    ...base,
    analyticsVersion: ANALYTICS_VERSION_V3,
    analysisConfidence: confidence,
    analysisConfidenceBand: band,
    // Erklärung kommt lokalisiert aus der UI statt als deutscher Text im
    // dauerhaft gespeicherten Analytics-Payload.
    analysisConfidenceHint: null,
    corners,
    objects,
    reacquisition,
    pace,
    assessableDistance,
    deviationEvents,
    scoreBreakdown: breakdown,
    trackScore: input.samples.length >= TRACK_ANALYSIS_THRESHOLDS.minSamplesForAssessment ? score : 0,
    // V3 zeigt keine irreführende „niedrigste Abweichung“ und wertet einen
    // automatischen Kontaktstatus nie als bestätigtes Verweisen.
    segmentHighlights: base.segmentHighlights.filter(highlight =>
      highlight.labelKey === 'track.segments.highlights.mostUncertain'
      || (highlight.labelKey === 'track.segments.highlights.highestDeviation' && deviationEvents.length > 0)),
    segments: base.segments.map(segment => segment.type === 'object_zone' ? { ...segment, score: null } : segment),
  };
}

export function isTrackAnalyticsV3(value: unknown): value is TrackAnalyticsV3 {
  if (!value || typeof value !== 'object') return false;
  const analytics = value as { analyticsVersion?: unknown; segments?: unknown; objects?: unknown; corners?: unknown };
  return analytics.analyticsVersion === ANALYTICS_VERSION_V3
    && Array.isArray(analytics.segments) && Array.isArray(analytics.objects) && Array.isArray(analytics.corners);
}

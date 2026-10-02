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

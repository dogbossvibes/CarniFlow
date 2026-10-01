import { endRadiusM } from './guidanceEngine';

export interface EndFixHistory {
  lastFixMs: number | null;
  approachSeen: boolean;
  insideCount: number;
  firstInsideMs: number | null;
}
export const INITIAL_END_FIX_HISTORY: EndFixHistory = {
  lastFixMs: null, approachSeen: false, insideCount: 0, firstInsideMs: null,
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
  const nearLastSection = fix.lastSegmentReached || fix.handlerProgressRatio >= 0.9;
  const approachSeen = previous.approachSeen || (nearLastSection
    && fix.distanceToEndM > radius + 1 && fix.distanceToEndM <= 10);
  const inside = nearLastSection && fix.distanceToEndM <= radius;
  return {
    lastFixMs: fix.tMs, approachSeen,
    insideCount: inside ? previous.insideCount + 1 : 0,
    firstInsideMs: inside ? previous.firstInsideMs ?? fix.tMs : null,
  };
}

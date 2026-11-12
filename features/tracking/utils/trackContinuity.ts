/** Version 1: actual interruption evidence, never inferred from point thinning. */
export const CONTINUITY_MAX_FIX_GAP_MS = 5_000;
export interface ContinuityPoint { breakBefore?: boolean }
export function isRecordingGap(previousMs: number | null, nextMs: number): boolean {
  return previousMs != null && Number.isFinite(previousMs) && Number.isFinite(nextMs)
    && nextMs - previousMs > CONTINUITY_MAX_FIX_GAP_MS;
}
export function splitContinuousPoints<T extends ContinuityPoint>(points: readonly T[]): T[][] {
  const parts: T[][] = [];
  let part: T[] = [];
  for (const point of points) {
    if (point.breakBefore === true && part.length) { parts.push(part); part = []; }
    part.push(point);
  }
  if (part.length) parts.push(part);
  return parts;
}
/** Local point metadata. Missing/old metadata never fabricates historical gaps. */
export function readContinuityPoint(payload: string | null | undefined): ContinuityPoint {
  try { return payload && JSON.parse(payload)?.breakBefore === true ? { breakBefore: true } : {}; }
  catch { return {}; }
}

/** Remote point columns remain unchanged; section boundaries live in track_data JSON. */
export function restoreLayContinuity<T extends { timestamp?: string; breakBefore?: boolean; payload_json?: string | null }>(
  points: readonly T[], metadata: unknown,
): (T & ContinuityPoint)[] {
  const value = metadata as { version?: unknown; breakBeforeTimestamps?: unknown } | null;
  const timestampKey = (t: string) => Number.isFinite(Date.parse(t)) ? String(Date.parse(t)) : t;
  const times = new Set(value?.version === 1 && Array.isArray(value.breakBeforeTimestamps)
    ? value.breakBeforeTimestamps.filter((t): t is string => typeof t === 'string').map(timestampKey) : []);
  return points.map(p => p.breakBefore || readContinuityPoint(p.payload_json).breakBefore || (p.timestamp && times.has(timestampKey(p.timestamp)))
    ? { ...p, breakBefore: true } : p);
}

export interface ContinuitySample extends ContinuityPoint { continuitySection?: number }
export function tagContinuitySections<T extends ContinuitySample>(samples: readonly T[]): T[] {
  let section = 0;
  return samples.map(sample => {
    if (sample.breakBefore) section++;
    return { ...sample, continuitySection: section };
  });
}
export function isContinuousPair(a: ContinuitySample, b: ContinuitySample): boolean {
  return !b.breakBefore && a.continuitySection === b.continuitySection;
}

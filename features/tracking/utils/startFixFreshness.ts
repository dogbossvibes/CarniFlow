/** Pre-start evidence uses measurement time, never callback or render time. */
export function isFreshStartTimestamp(tMs: number, nowMs: number, maxAgeMs: number): boolean {
  return Number.isFinite(tMs) && tMs >= 0 && Math.floor(tMs) <= nowMs
    && nowMs - tMs <= maxAgeMs;
}

export function isValidStartPosition(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

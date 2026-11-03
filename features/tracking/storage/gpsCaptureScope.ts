/** Account lifecycle only. Diagnostic permissions/TTL never revoke recording data. */
let userId: string | null = null;
let epoch = 0;
export function setGpsCaptureAccount(next: string | null, identityEvent = false): void {
  if (next !== userId || identityEvent) { epoch++; userId = next; }
}
export function gpsCaptureScope() { return { userId, epoch }; }
/** Fence callbacks before explicit local-data wipe, without changing the login. */
export function invalidateGpsCaptures() { epoch++; }

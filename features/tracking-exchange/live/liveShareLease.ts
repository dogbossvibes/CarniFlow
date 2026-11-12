/** Local consent/expiry guard. This is NOT server authorization.
 * The transport must check membership, revocation and expiry on every read/write.
 * No recorder, native location subscription, background task or durable GPS queue.
 */
export const LIVE_SHARE_MAX_DURATION_MS = 2 * 60 * 60 * 1000;
export const LIVE_SHARE_SEND_INTERVAL_MS = 5_000;
export const LIVE_SHARE_FIX_MAX_AGE_MS = 10_000;
export const LIVE_SHARE_VIEW_LEASE_MS = 5_000;

export interface ShareScope {
  userId: string;
  sessionId: string;
  dogId: string;
}

/** Times are server UTC milliseconds, never compared with the device wall clock. */
export interface ShareGrant extends ShareScope {
  shareId: string;
  serverNowMs: number;
  expiresAtMs: number;
}

export interface LivePosition {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

export interface ShareUpdate extends LivePosition {
  shareId: string;
  sessionId: string;
  sequence: number;
  /** Internal monotonic clock only; transport converts using its server anchor. */
  observedAtMonotonicMs: number;
}

export interface ActivationRequest {
  readonly generation: number;
  readonly startedAt: number;
  readonly scope: Readonly<ShareScope>;
}

function validPosition(p: LivePosition): boolean {
  return Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90
    && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180
    && Number.isFinite(p.accuracyM) && p.accuracyM >= 0;
}

function remainingLease(grant: ShareGrant, requestAt: number, now: number): number {
  const lifetime = grant.expiresAtMs - grant.serverNowMs;
  if (!Number.isFinite(grant.expiresAtMs) || !Number.isFinite(grant.serverNowMs)
    || !Number.isFinite(requestAt) || !Number.isFinite(now) || now < requestAt
    || lifetime <= 0 || lifetime > LIVE_SHARE_MAX_DURATION_MS) return 0;
  // Deduct the entire round trip. A delayed response may shorten, never extend a grant.
  return Math.max(0, lifetime - (now - requestAt));
}

/** Use a monotonic elapsed-time clock. Stop on background/suspend, logout,
 * permission loss, dog/session switch and network loss. Resuming requires a new
 * explicit confirmation and a fresh server grant; it cannot renew an old grant.
 */
export class LiveShareLease {
  private generation = 0;
  private pending: ActivationRequest | null = null;
  private grant: Readonly<ShareGrant> | null = null;
  private deadline = 0;
  private activatedAt = 0;
  private lastClock = -Infinity;
  private lastSentAt = -Infinity;
  private sequence = 0;

  constructor(private readonly clock: () => number) {}

  /** Called only by the explicit Start-sharing action, not by mount/reconnect. */
  requestActivation(scope: ShareScope): ActivationRequest | null {
    // Do not silently replace a grant and lose the ID that needs revocation.
    // The transport must complete its explicit stop/cancel flow first.
    if (this.grant || this.pending) return null;
    this.stop();
    const now = this.clock();
    if (!Number.isFinite(now) || !scope.userId || !scope.sessionId || !scope.dogId) return null;
    this.lastClock = now;
    const request = Object.freeze({ generation: this.generation, startedAt: now,
      scope: Object.freeze({ ...scope }) });
    this.pending = request;
    return request;
  }

  acceptActivation(request: ActivationRequest, grant: ShareGrant): boolean {
    // A late response cannot stop or reactivate a newer explicit request.
    if (this.pending !== request || request.generation !== this.generation) return false;
    this.pending = null;
    const now = this.clock();
    const remaining = remainingLease(grant, request.startedAt, now);
    if (!grant.shareId || remaining <= 0 || now < this.lastClock || grant.userId !== request.scope.userId
      || grant.sessionId !== request.scope.sessionId || grant.dogId !== request.scope.dogId) {
      this.stop();
      return false;
    }
    this.grant = Object.freeze({ ...grant });
    this.deadline = now + remaining;
    this.activatedAt = now;
    this.lastClock = now;
    return true;
  }

  /** Returns the share to revoke remotely. Local sending stops synchronously.
   * A remote acknowledgement (or server expiry) is required before the UI may
   * claim the recipients' access has ended. Cancelling a pending request also
   * requires the transport to cancel/revoke its idempotent server operation.
   */
  stop(): string | null {
    const shareId = this.grant?.shareId ?? null;
    this.generation++;
    this.pending = null;
    this.grant = null;
    this.deadline = 0;
    this.lastSentAt = -Infinity;
    this.sequence = 0;
    return shareId;
  }

  isActive(): boolean {
    const now = this.clock();
    if (!Number.isFinite(now) || now < this.lastClock || (this.grant && now >= this.deadline)) this.stop();
    this.lastClock = now;
    return this.grant !== null;
  }

  /** Successful receipt must precede the next dispatch by the full server
   * receive-time interval. A dispatch-only interval is unsafe when upstream
   * latency shrinks. Called only for the controller's still-current operation. */
  acknowledgePosition(update: ShareUpdate): void {
    if (!this.isActive() || !this.grant || update.shareId !== this.grant.shareId
      || update.sessionId !== this.grant.sessionId || update.sequence !== this.sequence) return;
    this.lastSentAt = this.lastClock;
  }

  /** Fresh observations only; the caller must discard failed/offline writes,
   * not replay a location backlog on reconnection. Never fabricates dog GPS:
   * coordinates describe the phone/receiver carried by the participant.
   */
  takePosition(scope: ShareScope, position: LivePosition, observedAt: number): ShareUpdate | null {
    if (!this.isActive() || !this.grant) return null;
    const now = this.lastClock;
    if (scope.userId !== this.grant.userId || scope.sessionId !== this.grant.sessionId
      || scope.dogId !== this.grant.dogId) {
      this.stop();
      return null;
    }
    if (!validPosition(position) || !Number.isFinite(observedAt) || observedAt < this.activatedAt || observedAt > now
      || now - observedAt > LIVE_SHARE_FIX_MAX_AGE_MS
      || now - this.lastSentAt < LIVE_SHARE_SEND_INTERVAL_MS) return null;
    this.lastSentAt = now;
    return { shareId: this.grant.shareId, sessionId: this.grant.sessionId,
      sequence: ++this.sequence, observedAtMonotonicMs: observedAt, latitude: position.latitude,
      longitude: position.longitude, accuracyM: position.accuracyM };
  }
}

/** Receiver-side short display lease. A failed/offline refresh must clear the
 * live map. No local persistence. Already-seen coordinates cannot be recalled.
 */
export class LiveShareViewLease {
  private generation = 0;
  private deadline = 0;
  private lastClock = -Infinity;
  private positions: readonly Readonly<LivePosition>[] = [];

  constructor(private readonly clock: () => number) {}

  clear(): void {
    this.generation++;
    this.deadline = 0;
    this.positions = [];
  }

  beginRefresh(): { generation: number; startedAt: number } {
    // Single outstanding logical response. Earlier requests are invalidated.
    return { generation: ++this.generation, startedAt: this.clock() };
  }

  acceptRefresh(request: { generation: number; startedAt: number }, positions: readonly LivePosition[],
    serverNowMs: number, accessExpiresAtMs: number): boolean {
    if (request.generation !== this.generation) return false;
    this.generation++;
    const now = this.clock();
    const remaining = remainingLease({ userId: '', sessionId: '', dogId: '', shareId: '',
      serverNowMs, expiresAtMs: accessExpiresAtMs }, request.startedAt, now);
    const viewRemaining = Math.min(remaining, LIVE_SHARE_VIEW_LEASE_MS - (now - request.startedAt));
    if (!(viewRemaining > 0) || now < this.lastClock || positions.some(p => !validPosition(p))) {
      this.clear();
      return false;
    }
    this.positions = Object.freeze(positions.map(p => Object.freeze({ latitude: p.latitude,
      longitude: p.longitude, accuracyM: p.accuracyM })));
    this.deadline = now + viewRemaining;
    this.lastClock = now;
    return true;
  }

  read(): readonly Readonly<LivePosition>[] {
    const now = this.clock();
    if (!Number.isFinite(now) || now < this.lastClock) this.clear();
    else if (now >= this.deadline) {
      // Expiring old pixels must not invalidate a newer refresh already in flight.
      // That response still has its own RTT/expiry checks in acceptRefresh().
      this.positions = []; this.deadline = 0;
    }
    this.lastClock = now;
    return this.positions;
  }
}

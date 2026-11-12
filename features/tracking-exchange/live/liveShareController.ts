import { LiveShareLease, LIVE_SHARE_MAX_DURATION_MS,
  type ShareScope, type ShareGrant, type LivePosition, type ShareUpdate } from './liveShareLease';
import { RevocationJournal, type RevocationEntry } from './revocationJournal';

export interface StartShare extends ShareScope, RevocationEntry {
  recipientIds: readonly string[];
  durationMs: number;
}
/** Adapter must authenticate as expectedUserId before AND after each RPC.
 * Revoke is idempotent and tombstones even a start not received by the server yet.
 * Each call needs a bounded timeout; no silent retry for positions/start.
 */
export interface LiveShareTransport {
  start(input: StartShare, signal: AbortSignal): Promise<ShareGrant>;
  publish(expectedUserId: string, update: ShareUpdate, signal: AbortSignal): Promise<void>;
  revoke(expectedUserId: string, entry: RevocationEntry): Promise<void>;
}
export type ShareState = { phase: 'idle' | 'starting' | 'sharing' | 'stopped' | 'revoke_pending' | 'error';
  issue: 'auth' | 'invalid' | 'connection' | 'storage' | 'expired' | 'maintenance' | 'active_required' | null; expiresAtMs?: number };
type Active = { input: StartShare; persisted: boolean; activation: AbortController; publish: AbortController | null };

export class LiveShareController {
  private readonly lease: LiveShareLease;
  private active: Active | null = null;
  private generation = 0;
  private state: ShareState = { phase: 'idle', issue: null };
  private retrying: Promise<boolean> | null = null;
  private disposed = false;
  private readonly revoking = new Map<string, Promise<boolean>>();

  constructor(private readonly transport: LiveShareTransport, private readonly journal: RevocationJournal,
    private readonly currentUserId: () => string | null, clock: () => number,
    private readonly changed: (state: ShareState) => void) {
    this.lease = new LiveShareLease(clock);
  }
  get snapshot(): ShareState { return { ...this.state }; }
  private emit(state: ShareState): void {
    this.state = state;
    if (!this.disposed) this.changed({ ...state });
  }
  private current(run: Active, generation: number): boolean {
    return !this.disposed && this.active === run && this.generation === generation
      && this.currentUserId() === run.input.userId;
  }

  async start(input: StartShare): Promise<boolean> {
    if (this.disposed || this.active || this.retrying || this.state.phase === 'revoke_pending') return false;
    if (this.currentUserId() !== input.userId) { this.emit({ phase: 'error', issue: 'auth' }); return false; }
    if (!Number.isFinite(input.durationMs) || input.durationMs < 60_000 || !Number.isSafeInteger(input.durationMs / 1000) || input.durationMs > LIVE_SHARE_MAX_DURATION_MS
      || !input.recipientIds.length || input.recipientIds.length > 49 || input.recipientIds.includes(input.userId)
      || new Set(input.recipientIds).size !== input.recipientIds.length) {
      this.emit({ phase: 'error', issue: 'invalid' }); return false;
    }
    const request = this.lease.requestActivation(input);
    if (!request) return false;
    const run: Active = { input: Object.freeze({ ...input, recipientIds: Object.freeze([...input.recipientIds]) }), persisted: false,
      activation: new AbortController(), publish: null };
    this.active = run;
    const generation = ++this.generation;
    this.emit({ phase: 'starting', issue: null });
    try {
      // Before any server effect: make an unknown start outcome recoverable.
      await this.journal.put(run.input.userId, { shareId: run.input.shareId, sessionId: run.input.sessionId });
      run.persisted = true;
      if (!this.current(run, generation)) { await this.finishCancelled(run, generation); return false; }
      const grant = await this.transport.start(run.input, run.activation.signal);
      if (!this.current(run, generation)) { await this.finishCancelled(run, generation); return false; }
      if (grant.shareId !== run.input.shareId || grant.expiresAtMs - grant.serverNowMs > run.input.durationMs
        || !this.lease.acceptActivation(request, grant)) throw new Error('SHARE_INVALID_GRANT');
      this.emit({ phase: 'sharing', issue: null, expiresAtMs: grant.expiresAtMs });
      return true;
    } catch (error) {
      const activeRequired = error instanceof Error && error.message === 'TRACKING_ACTIVE_REQUIRED';
      const maintenance = error instanceof Error && error.message === 'GROUP_MAINTENANCE_UNAVAILABLE';
      if (this.active === run) {
        this.active = null; this.generation++; this.lease.stop();
        run.activation.abort(); run.publish?.abort();
        const revoked = await this.revoke(run);
        // A new request may have started while the old revocation awaited I/O.
        if (this.generation === generation + 1 && !this.active) this.emit({
          phase: run.persisted && !revoked ? 'revoke_pending' : 'error',
          issue: activeRequired ? 'active_required' : maintenance ? 'maintenance' : run.persisted ? 'connection' : 'storage',
        });
      }
      return false;
    }
  }

  private async finishCancelled(run: Active, startGeneration: number): Promise<void> {
    const revoked = await this.revoke(run);
    // A cancelled start can finish its durable write after Stop. Report its ACK
    // only to that cancellation, never to another account or a newer operation.
    if (!this.disposed && !this.active && this.currentUserId() === run.input.userId
      && this.generation === startGeneration + 1 && this.state.phase === 'revoke_pending') {
      this.emit({ phase: revoked ? 'stopped' : 'revoke_pending', issue: this.state.issue });
    }
  }

  private revokeEntry(userId: string, entry: RevocationEntry): Promise<boolean> {
    const key = `${userId}:${entry.shareId}`;
    const previous = this.revoking.get(key);
    if (previous) return previous;
    const operation = (async () => {
      if (this.currentUserId() !== userId) return false;
      try {
        await this.transport.revoke(userId, entry);
        await this.journal.acknowledge(userId, entry.shareId);
        return true;
      } catch { return false; }
    })();
    this.revoking.set(key, operation);
    void operation.finally(() => { if (this.revoking.get(key) === operation) this.revoking.delete(key); });
    return operation;
  }
  private revoke(run: Active): Promise<boolean> {
    if (!run.persisted) return Promise.resolve(false); // start revokes after its pending write resolves.
    return this.revokeEntry(run.input.userId, { shareId: run.input.shareId, sessionId: run.input.sessionId });
  }

  /** Local stop is synchronous, even when this returned promise never succeeds. */
  async stop(issue: ShareState['issue'] = null): Promise<void> {
    const run = this.active;
    // A repeated local stop must not orphan the in-flight revocation ACK.
    // Preparation cancellation is separately owned by the hook generation.
    if (!run) return;
    this.active = null;
    const generation = ++this.generation;
    this.lease.stop();
    run?.activation.abort(); run?.publish?.abort();
    this.emit({ phase: 'revoke_pending', issue });
    const revoked = await this.revoke(run);
    if (generation === this.generation) this.emit({ phase: revoked ? 'stopped' : 'revoke_pending', issue });
  }

  tick(): void {
    if (!this.active) return;
    if (this.currentUserId() !== this.active.input.userId) { void this.stop('auth'); return; }
    if (this.state.phase === 'sharing' && !this.lease.isActive()) void this.stop('expired');
  }

  async position(position: LivePosition, observedAt: number): Promise<void> {
    this.tick();
    const run = this.active;
    if (!run || run.publish || this.state.phase !== 'sharing') return;
    const update = this.lease.takePosition(run.input, position, observedAt);
    if (!update) return;
    const controller = new AbortController();
    run.publish = controller;
    try {
      await this.transport.publish(run.input.userId, update, controller.signal);
      if (this.active === run && !controller.signal.aborted) {
        this.lease.acknowledgePosition(update);
        this.tick(); // ACK latency cannot extend a lease or revive an expired run.
      }
    }
    catch (error) { if (this.active === run) await this.stop(error instanceof Error && error.message === 'GROUP_MAINTENANCE_UNAVAILABLE' ? 'maintenance' : error instanceof Error && error.message === 'TRACKING_ACTIVE_REQUIRED' ? 'active_required' : 'connection'); }
    finally { if (run.publish === controller) run.publish = null; }
  }

  /** Call on login/foreground/reconnect. Retries revocations, never starts GPS. */
  retryPending(): Promise<boolean> {
    if (this.retrying) return this.retrying;
    const userId = this.currentUserId();
    if (!userId || this.active || this.disposed) return Promise.resolve(false);
    const generation = this.generation;
    const operation = (async () => {
      let loaded = false;
      try {
        const entries = await this.journal.list(userId);
        loaded = true;
        if (entries.length && generation === this.generation && !this.active) this.emit({ phase: 'revoke_pending', issue: null });
        for (const entry of entries) {
          if (this.currentUserId() !== userId || this.active || this.disposed) return false;
          if (!await this.revokeEntry(userId, entry)) throw new Error('REVOKE_PENDING');
        }
        if (generation === this.generation && this.state.phase === 'revoke_pending') {
          this.emit({ phase: 'stopped', issue: null });
        }
        return true;
      } catch {
        if (generation === this.generation && !this.active && !this.disposed) {
          this.emit({ phase: 'revoke_pending', issue: loaded ? 'connection' : 'storage' });
        }
        return false;
      }
    })();
    this.retrying = operation;
    void operation.finally(() => { if (this.retrying === operation) this.retrying = null; });
    return operation;
  }

  dispose(): void { this.disposed = true; void this.stop(); }
}

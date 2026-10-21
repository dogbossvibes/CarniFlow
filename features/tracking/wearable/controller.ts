import { commandFingerprint, idleWearableState, parseWearableRequest } from './protocol';
import type { WearableAck, WearableAction, WearableCommand, WearableReason, WearableSnapshot, WearableState } from './protocol';
export interface WearableBinding {
  getState(): WearableState;
  /** Recheck stillCurrent after asynchronous business preflight, before mutating. */
  execute(action: WearableAction, stillCurrent: () => boolean): boolean | Promise<boolean>;
}
interface Entry { fingerprint: string; created: number; result: Promise<WearableAck> }
const LEASE_MS = 30_000;
const CACHE_MS = 300_000;
/** No command queue. Only a mounted phone owner can authorize a mutation. */
export class WearableController {
  private owner: string | null = null;
  private binding: WearableBinding | null = null;
  private contextId: string | null = null;
  private revision = 0;
  private sequence = 0;
  private signature = '';
  private leases = new Map<string, number>();
  private currentLease: string | null = null;
  private cache = new Map<string, Entry>();
  private busy: object | null = null;
  private lastClock = 0;
  private listeners = new Set<() => void>();
  private notifiedControl = '';
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  changed() {
    const snapshot = this.snapshot();
    const control = JSON.stringify([snapshot.contextId, snapshot.revision]);
    if (control === this.notifiedControl) return;
    this.notifiedControl = control;
    for (const listener of this.listeners) listener();
  }
  constructor(private readonly deps: { now(): number; id(): string }) {}
  setOwner(owner: string | null) {
    if (owner === this.owner) return;
    this.owner = owner;
    this.binding = null;
    this.invalidate(); this.changed();
  }
  register(owner: string, binding: WearableBinding): () => void {
    if (!owner || owner !== this.owner) return () => undefined;
    this.binding = binding;
    this.invalidate(); this.changed();
    return () => { if (this.binding === binding) { this.binding = null; this.invalidate(); this.changed(); } };
  }
  private invalidate() {
    this.contextId = this.binding && this.owner ? this.deps.id() : null;
    this.revision = 0;
    this.signature = '';
    this.leases.clear(); this.currentLease = null; this.cache.clear();
    // Keep the in-flight mutex: an old handler may still be unwinding.
  }
  private clock() {
    const now = this.deps.now();
    if (!Number.isFinite(now) || now < this.lastClock) {
      this.leases.clear(); this.currentLease = null;
    }
    this.lastClock = Number.isFinite(now) ? now : 0;
    return this.lastClock;
  }
  snapshot(): WearableSnapshot {
    const now = this.clock();
    let state = idleWearableState();
    if (this.owner && this.binding) {
      try { state = this.binding.getState(); } catch { /* fail closed */ }
    }
    const signature = JSON.stringify([state.sessionId, state.dogId, state.phase, state.capabilities]);
    if (signature !== this.signature) {
      this.signature = signature; this.revision += 1;
      this.leases.clear(); this.currentLease = null;
    }
    for (const [key, expiry] of this.leases) if (expiry <= now) this.leases.delete(key);
    const available = !!this.contextId && !!state.dogId && state.capabilities.length > 0;
    if (available && (!this.currentLease || (this.leases.get(this.currentLease) ?? 0) - now <= 10_000)) {
      this.currentLease = this.deps.id(); this.leases.set(this.currentLease, now + LEASE_MS);
    }
    if (!available) this.currentLease = null;
    // State is freshly read. Never forward NaN/negative metrics to a native decoder.
    const metric = (value: number | null) => value != null && Number.isFinite(value) && value >= 0 ? value : null;
    return { ...state, dogName: state.dogName?.slice(0, 80) ?? null, distanceM: metric(state.distanceM),
      elapsedSeconds: metric(state.elapsedSeconds), protocolVersion: 1, kind: 'snapshot',
      contextId: this.contextId, revision: this.revision, sequence: ++this.sequence,
      leaseId: this.currentLease, expiresAtMs: this.currentLease ? this.leases.get(this.currentLease) ?? now : now };
  }
  private ack(command: WearableCommand | null, reason: WearableReason, redact = false): WearableAck {
    const snapshot = redact ? { ...idleWearableState(), protocolVersion: 1 as const, kind: 'snapshot' as const,
      contextId: null, revision: 0, sequence: ++this.sequence, leaseId: null, expiresAtMs: this.clock() } : this.snapshot();
    return { protocolVersion: 1, kind: 'ack', commandId: command?.commandId ?? null,
      status: reason === 'ok' ? 'accepted' : 'rejected', reason, snapshot };
  }
  async receive(json: string, nativeExpiresAtMs: number): Promise<WearableAck | WearableSnapshot> {
    const request = parseWearableRequest(json);
    if (!Number.isFinite(nativeExpiresAtMs) || nativeExpiresAtMs <= this.clock() || nativeExpiresAtMs > this.clock() + 5_000) return this.ack(request?.kind === 'command' ? request : null, 'expired');
    if (!request) return this.ack(null, 'invalid_command');
    if (request.kind === 'snapshot_request') return this.snapshot();
    const command = request;
    const snapshot = this.snapshot();
    if (!this.binding || !this.owner) return this.ack(command, 'unavailable');
    if (command.contextId !== snapshot.contextId) return this.ack(command, 'stale_context');
    const now = this.clock();
    for (const [key, entry] of this.cache) if (now - entry.created > CACHE_MS) this.cache.delete(key);
    const fingerprint = commandFingerprint(command);
    const cached = this.cache.get(command.commandId);
    if (cached) return cached.fingerprint === fingerprint ? cached.result : this.ack(command, 'invalid_command');
    if (command.revision !== snapshot.revision) return this.ack(command, 'stale_revision');
    if ((this.leases.get(command.leaseId) ?? 0) <= now) return this.ack(command, 'expired');
    if (command.sessionId !== snapshot.sessionId || command.dogId !== snapshot.dogId) return this.ack(command, 'wrong_target');
    if (!snapshot.capabilities.includes(command.action)) return this.ack(command, 'not_allowed');
    if (command.action === 'end_phase' && !command.confirmed) return this.ack(command, 'confirmation_required');
    if (this.busy) return this.ack(command, 'busy');
    // Never evict an unexpired dedup result to admit another mutation.
    if (this.cache.size >= 128) return this.ack(command, 'busy');
    const binding = this.binding; const owner = this.owner; const context = this.contextId;
    const token = {}; this.busy = token;
    const stillCurrent = () => {
      const fresh = this.snapshot();
      return nativeExpiresAtMs > this.clock() && this.binding === binding && this.owner === owner && this.contextId === context
        && command.revision === fresh.revision && command.sessionId === fresh.sessionId
        && command.dogId === fresh.dogId && fresh.capabilities.includes(command.action)
        && (this.leases.get(command.leaseId) ?? 0) > this.clock();
    };
    // Install the dedup entry before calling user code (including synchronous handlers).
    const result = Promise.resolve().then(async () => {
      try {
        if (!stillCurrent()) return this.ack(command, 'stale_context');
        const success = await binding.execute(command.action, stillCurrent);
        const changedOwner = this.binding !== binding || this.owner !== owner || this.contextId !== context;
        return this.ack(command, changedOwner ? 'stale_context' : success === true ? 'ok' : 'failed', changedOwner);
      } catch { return this.ack(command, 'failed', this.owner !== owner || this.binding !== binding); }
      finally { if (this.busy === token) this.busy = null; }
    });
    this.cache.set(command.commandId, { fingerprint, created: now, result });
    return result;
  }
}

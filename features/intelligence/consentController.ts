import { validId, validUuid } from './contract';
import { parseConsentRevision, parseRevocationReceipt, type ConsentIntent, type ConsentRevision } from './consent';
import { IntelligenceSession } from './session';

export interface PendingRevocation { accountId: string; policyId: string }
export interface ConsentOutbox {
  read(): Promise<PendingRevocation[]>;
  write(records: PendingRevocation[]): Promise<void>;
}
// All adapters must pin the original authenticated account across token refresh.
// readRevision returns normalized, verified server state. Its wire mapping is a
// remaining backend contract gate; absence must never be inferred from an error.
export interface ConsentGateway {
  readRevision(context: PendingRevocation, signal: AbortSignal): Promise<unknown>;
  grant(intent: ConsentIntent, signal: AbortSignal): Promise<unknown>;
  revoke(context: PendingRevocation, signal: AbortSignal): Promise<unknown>;
}
export interface ConsentStorageQueue { run<T>(work: () => Promise<T>): Promise<T> }
export function createConsentStorageQueue(): ConsentStorageQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return { run<T>(work: () => Promise<T>) {
    const next = tail.then(work, work); tail = next.catch(() => {}); return next;
  } };
}
export type ConsentStatus = 'idle' | 'loadingRevision' | 'saving' | 'confirmed' | 'revocationPending' | 'failed';

export class IntelligenceConsentController {
  private status: ConsentStatus = 'idle';
  private listeners = new Set<() => void>();
  private operation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private storageTail: Promise<unknown> = Promise.resolve();
  private unsaved: PendingRevocation[] = [];
  private revision: ConsentRevision | null = null;
  private retry: ConsentIntent | null = null;
  private revisionGeneration: number | null = null;
  private usedActions = new Set<string>();
  constructor(private session: IntelligenceSession, private outbox: ConsentOutbox, private gateway: ConsentGateway,
    private uuid: () => string, private timeoutMs = 15000, private storageQueue?: ConsentStorageQueue, private authenticatedAccount?: () => string | null) {}
  getStatus() { return this.status; }
  getRevision() {
    const context = this.session.consentContext();
    if (!context || !this.revision || this.revisionGeneration !== this.session.consentGeneration()) return null;
    return context.accountId === this.revision.accountId && context.policyId === this.revision.policyId ? this.revision.revision : null;
  }
  private rememberRevision(revision: ConsentRevision) { this.revision = revision; this.revisionGeneration = this.session.consentGeneration(); }
  canRetryGrant() { return !!this.retry && this.session.isConsentCurrent(this.retry); }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private setStatus(status: ConsentStatus) { this.status = status; for (const listener of this.listeners) listener(); }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work); this.tail = next.catch(() => {}); return next;
  }
  private storage<T>(work: () => Promise<T>): Promise<T> {
    const queued = () => this.storageQueue ? this.storageQueue.run(work) : work();
    const next = this.storageTail.then(queued, queued); this.storageTail = next.catch(() => {}); return next;
  }
  private readRecords() { return this.storage(() => this.records()); }
  private persistPending() {
    return this.storage(async () => {
      const pending = this.unsaved.slice();
      const records = await this.records(); await this.outbox.write(records);
      this.unsaved = this.unsaved.filter(r => !pending.includes(r));
    });
  }
  private async records() {
    const stored = await this.outbox.read();
    if (!Array.isArray(stored) || stored.some(r => !r || !validId(r.accountId) || !validId(r.policyId)
      || Object.keys(r).some(k => k !== 'accountId' && k !== 'policyId'))) throw new Error('Invalid consent outbox');
    const records = [...stored, ...this.unsaved];
    return records.filter((r, i) => records.findIndex(v => v.accountId === r.accountId && v.policyId === r.policyId) === i);
  }
  private async request(work: (signal: AbortSignal) => Promise<unknown>) {
    const abort = new AbortController(); let timer!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { abort.abort(); reject(new Error('Consent request timed out')); }, this.timeoutMs);
    });
    try { return await Promise.race([work(abort.signal), timeout]); } finally { clearTimeout(timer); }
  }
  // Separate user action. Loading a revision never grants consent or retries POST.
  loadRevision(): Promise<boolean> {
    const context = this.session.consentContext(); if (!context || this.status === 'saving') return Promise.resolve(false);
    this.session.revokeConsent(); this.retry = null; this.revision = null;
    const generation = this.session.consentGeneration(); const operation = ++this.operation;
    const current = () => operation === this.operation && generation === this.session.consentGeneration()
      && this.session.consentContext()?.accountId === context.accountId && this.session.consentContext()?.policyId === context.policyId;
    this.setStatus('loadingRevision');
    return this.serial(async () => {
      try {
        const records = await this.readRecords(); if (!current()) return false;
        if (records.some(r => r.accountId === context.accountId)) { this.setStatus('revocationPending'); return false; }
        const raw = await this.request(signal => this.gateway.readRevision(context, signal));
        if (!current()) return false;
        const revision = parseConsentRevision(raw, context); if (revision) this.rememberRevision(revision);
        this.setStatus(revision ? 'idle' : 'failed'); return !!revision;
      } catch { if (current()) this.setStatus('failed'); return false; }
      finally { if (operation === this.operation && !current()) this.setStatus('idle'); }
    });
  }
  grant(text: boolean, audio: boolean): Promise<boolean> {
    if (this.status === 'saving' || this.status === 'loadingRevision' || this.status === 'revocationPending') return Promise.resolve(false);
    const expectedRevision = this.getRevision();
    if (expectedRevision === null) { this.session.revokeConsent(); this.retry = null; this.setStatus('failed'); return Promise.resolve(false); }
    let actionId: string; try { actionId = this.uuid(); } catch { this.setStatus('failed'); return Promise.resolve(false); }
    if (!validUuid(actionId) || this.usedActions.has(actionId)) { this.session.revokeConsent(); this.retry = null; this.revision = null; this.setStatus('failed'); return Promise.resolve(false); }
    const ticket = this.session.beginConsent(text, audio, actionId, expectedRevision);
    if (!ticket) { this.setStatus('failed'); return Promise.resolve(false); }
    // Bind both values synchronously to this explicit action; never refresh them
    // inside async work or from a late grant reply.
    this.usedActions.add(actionId); this.revision = null; this.retry = ticket;
    return this.submit(ticket);
  }
  // Explicit retry of precisely the unresolved action, without a new UUID/revision.
  retryGrant(): Promise<boolean> {
    if (!this.canRetryGrant() || this.status === 'saving' || this.status === 'loadingRevision') return Promise.resolve(false);
    return this.submit(this.retry!);
  }
  private submit(ticket: ConsentIntent): Promise<boolean> {
    const operation = ++this.operation; this.setStatus('saving');
    return this.serial(async () => {
      try {
        const records = await this.readRecords();
        if (!this.session.isConsentCurrent(ticket)) { if (operation === this.operation) this.setStatus('idle'); return false; }
        if (records.some(r => r.accountId === ticket.accountId)) {
          this.retry = null; this.session.revokeConsent(); if (operation === this.operation) this.setStatus('revocationPending'); return false;
        }
        const raw = await this.request(signal => this.gateway.grant(ticket, signal));
        const current = operation === this.operation && this.session.isConsentCurrent(ticket);
        const accepted = current && this.session.confirmConsent(ticket, raw);
        if (current) {
          this.retry = null;
          if (accepted) this.rememberRevision({ version: 1, accountId: ticket.accountId, policyId: ticket.policyId, exists: true, revision: ticket.expectedRevision + 1 });
          this.setStatus(accepted ? 'confirmed' : 'failed');
        } else if (operation === this.operation) this.setStatus('idle');
        return accepted;
      } catch {
        // Unknown network outcome keeps only the same explicit retry ticket.
        // No automatic retry, new action UUID, revision refresh or local unlock.
        if (operation === this.operation) this.setStatus(this.session.isConsentCurrent(ticket) ? 'failed' : 'idle');
        return false;
      }
    });
  }
  revoke(): Promise<boolean> {
    const context = this.session.consentContext(); this.session.revokeConsent(); this.retry = null; this.revision = null;
    if (!context) return Promise.resolve(false);
    const operation = ++this.operation; const generation = this.session.consentGeneration(); this.setStatus('revocationPending');
    this.unsaved.push(context);
    // Durability must not wait behind an unanswered grant/network request.
    const durable = this.persistPending().then(() => true, () => false);
    return this.serial(async () => {
      try {
        if (!await durable) return false;
        const confirmed = await this.flushAccount(context.accountId, generation);
        if (operation === this.operation) this.setStatus(confirmed ? 'idle' : 'revocationPending'); return confirmed;
      } catch { if (operation === this.operation) this.setStatus('revocationPending'); return false; }
    });
  }
  retryRevocations(accountId: string): Promise<boolean> {
    const operation = ++this.operation; this.session.revokeConsent(); this.retry = null; this.revision = null;
    const generation = this.session.consentGeneration(); this.setStatus('revocationPending');
    const durable = this.persistPending().then(() => true, () => false);
    return this.serial(async () => {
      try {
        if (!await durable) return false;
        const confirmed = await this.flushAccount(accountId, generation);
        if (operation === this.operation) this.setStatus(confirmed ? 'idle' : 'revocationPending'); return confirmed;
      } catch { if (operation === this.operation) this.setStatus('revocationPending'); return false; }
    });
  }
  private canFlushAccount(accountId: string) {
    try { return (this.authenticatedAccount ? this.authenticatedAccount() : this.session.snapshot().scope?.ownerId) === accountId; }
    catch { return false; }
  }
  private async flushAccount(accountId: string, generation: number): Promise<boolean> {
    const records = await this.readRecords();
    for (const record of records.filter(r => r.accountId === accountId)) {
      if (!this.canFlushAccount(accountId)) return false;
      const raw = await this.request(signal => this.gateway.revoke({ ...record }, signal));
      const receipt = parseRevocationReceipt(raw, accountId, record.policyId); if (!receipt) return false;
      await this.storage(async () => {
        const latest = await this.records();
        await this.outbox.write(latest.filter(r => !(r.accountId === accountId && r.policyId === record.policyId)));
      });
      if (generation === this.session.consentGeneration() && this.session.consentContext()?.accountId === accountId
        && this.session.consentContext()?.policyId === record.policyId) {
        this.rememberRevision({ version: 1, accountId, policyId: record.policyId, exists: true, revision: receipt.revision });
      }
    }
    return !(await this.readRecords()).some(r => r.accountId === accountId);
  }
}

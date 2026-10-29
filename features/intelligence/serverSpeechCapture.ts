import type { IntelligenceSession } from './session';
import type { PcmCapturePort, PcmTake } from './pcmCapture';
import type { SpeechCaptureControls, SpeechCaptureStatus } from './speechCapture';
import type { TranscriptionGateway } from './transcriptionHttp';
// A separate explicit finish sends audio for transcription only. No automatic
// retry, chat submission, resume or transcript persistence.
export class ServerSpeechCapture implements SpeechCaptureControls {
  private status: SpeechCaptureStatus = 'idle';
  private listeners = new Set<() => void>();
  private ticket: number | null = null;
  private abort: AbortController | null = null;
  private take: PcmTake | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending = false;
  private disposed = false;
  private unsubscribe: () => void;
  private stopObserving: (() => void) | undefined;
  constructor(private session: IntelligenceSession, private port: PcmCapturePort,
    private gateway: TranscriptionGateway, private uuid: () => string,
    private current: () => boolean, private audioIdle: () => boolean) {
    this.stopObserving = port.onInterruption?.(() => this.cancel());
    this.unsubscribe = session.subscribe(() => {
      if (this.ticket !== null && !session.isSpeechCurrent(this.ticket)) this.cancel();
    });
  }
  getStatus() { return this.status; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private set(status: SpeechCaptureStatus) { this.status = status; for (const listener of this.listeners) listener(); }
  private valid(ticket: number) {
    return !this.disposed && !this.abort?.signal.aborted && this.ticket === ticket
      && this.current() && this.audioIdle() && this.session.isSpeechCurrent(ticket);
  }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  private async close() {
    this.clearTimer(); const take = this.take;
    this.set('cleaning');
    let clean = false; try { clean = take ? await take.close() : await this.port.recover(); } catch { /* retain cleanup block */ }
    if (clean) this.take = null;
    this.set(clean ? 'idle' : 'cleanupPending'); return clean;
  }
  cancel() {
    const ticket = this.ticket; this.ticket = null; this.abort?.abort(); this.clearTimer();
    if (ticket !== null && this.session.isSpeechCurrent(ticket)) this.session.interrupt();
    // An unresolved prepare owns cleanup until it settles; never delete a file
    // underneath a recorder still being prepared.
    if (!this.pending && this.take) { this.pending = true; void this.close().finally(() => { this.pending = false; }); }
  }
  dispose() { this.disposed = true; this.cancel(); this.unsubscribe(); this.stopObserving?.(); }
  async retryCleanup() {
    if (this.pending || this.ticket !== null || this.disposed) return false;
    this.pending = true;
    try { return await this.close(); } finally { this.pending = false; }
  }
  async start() {
    if (this.disposed || this.pending || this.take || this.status === 'cleanupPending' || !this.current()
      || !this.audioIdle() || !this.port.available()) return false;
    const ticket = this.session.beginSpeechReview(); if (ticket === null) return false;
    this.ticket = ticket; this.abort = new AbortController(); this.pending = true; this.set('requesting');
    let failure: SpeechCaptureStatus = 'failed';
    try {
      if (!await this.port.recover()) { failure = 'cleanupPending'; throw new Error('Cleanup required'); }
      if (!this.valid(ticket)) throw new Error('Interrupted');
      if (!await this.port.permitted()) { failure = 'denied'; throw new Error('Denied'); }
      if (!this.valid(ticket)) throw new Error('Interrupted');
      this.take = await this.port.prepare(this.abort.signal);
      if (!this.valid(ticket)) throw new Error('Interrupted');
      this.take.start(); this.set('listening');
      // Native recorder also enforces 60s. Watchdog discards, never uploads.
      this.timer = setTimeout(() => this.cancel(), 60000);
      return true;
    } catch {
      const cancelled = this.ticket !== ticket || this.abort.signal.aborted;
      this.ticket = null;
      if (this.session.isSpeechCurrent(ticket)) this.session.interrupt();
      const clean = await this.close();
      if (clean) this.set(cancelled ? 'idle' : failure);
      return false;
    } finally { this.pending = false; }
  }
  async finish() {
    const ticket = this.ticket; const take = this.take; const abort = this.abort;
    if (this.pending || ticket === null || !take || !abort || !this.valid(ticket)) return false;
    const context = this.session.consentContext(); if (!context) return false;
    this.pending = true; this.clearTimer(); this.set('transcribing');
    let bytes: Uint8Array | null = null;
    const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      bytes = await take.bytes(); if (!this.valid(ticket)) return false;
      let cancelled!: () => void;
      const interrupted = new Promise<never>((_, reject) => {
        cancelled = () => reject(new Error('Interrupted'));
        abort.signal.addEventListener('abort', cancelled, { once: true });
        if (abort.signal.aborted) cancelled();
      });
      let result;
      try { result = await Promise.race([this.gateway.transcribe({ ...context, requestId: this.uuid(), bytes }, abort.signal), interrupted]); }
      finally { abort.signal.removeEventListener('abort', cancelled); }
      if (!this.valid(ticket)) return false;
      // Verified local deletion is required before exposing the transcript.
      const clean = await this.close();
      if (!clean || !this.valid(ticket)) return false;
      this.ticket = null;
      if ('error' in result) { this.session.failSpeech(ticket, result.error); return false; }
      return this.session.receiveTranscript(ticket, result.text);
    } catch {
      if (this.valid(ticket)) this.session.failSpeech(ticket, 'NETWORK');
      return false;
    } finally {
      clearTimeout(timeout); bytes?.fill(0);
      if (this.take) await this.close();
      if (this.ticket === ticket) { this.ticket = null; if (this.session.isSpeechCurrent(ticket)) this.session.interrupt(); }
      this.pending = false;
    }
  }
}

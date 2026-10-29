import { INTELLIGENCE_LIMITS } from './contract';
import type { IntelligenceSession } from './session';

// Native adapter must be one-shot and synchronous to start/stop/abort; never
// reuse the tracking command listener that automatically restarts itself.
export interface SpeechCapturePort {
  available(): boolean;
  permitted(): Promise<boolean>;
  start(events: { result: (text: string) => void; end: () => void; error: () => void }): void;
  stop(): void;
  abort(): void;
}
export type SpeechCaptureStatus = 'idle' | 'requesting' | 'listening' | 'unavailable' | 'denied' | 'failed' | 'transcribing' | 'cleaning' | 'cleanupPending';
export interface SpeechCaptureControls {
  getStatus(): SpeechCaptureStatus;
  subscribe(listener: () => void): () => void;
  start(): Promise<boolean>;
  cancel(): void;
  dispose(): void;
  finish?(): Promise<boolean>;
  retryCleanup?(): Promise<boolean>;
}
export class IntelligenceSpeechCapture {
  private generation = 0;
  private ticket: number | null = null;
  private nativeActive = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private status: SpeechCaptureStatus = 'idle';
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;
  private disposed = false;
  constructor(private session: IntelligenceSession, private port: SpeechCapturePort,
    private current: () => boolean, private audioIdle: () => boolean) {
    // Account, consent, text editing and app interruption invalidate the ticket.
    this.unsubscribe = session.subscribe(() => {
      if (this.ticket !== null && !session.isSpeechCurrent(this.ticket)) this.cancel();
    });
  }
  getStatus() { return this.status; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private setStatus(status: SpeechCaptureStatus) { this.status = status; for (const listener of this.listeners) listener(); }
  private release(abort: boolean) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.nativeActive) return;
    this.nativeActive = false;
    try { if (abort) this.port.abort(); else this.port.stop(); } catch { /* Never log voice content. */ }
  }
  cancel() {
    const ticket = this.ticket;
    this.generation++; this.ticket = null; this.setStatus('idle');
    this.release(true);
    if (ticket !== null && this.session.isSpeechCurrent(ticket)) this.session.interrupt();
  }
  // Route blur/background must call this; no automatic recording on resume.
  dispose() { this.disposed = true; this.cancel(); this.unsubscribe(); }
  async start(): Promise<boolean> {
    if (this.disposed || this.status === 'requesting' || this.nativeActive || !this.current()) return false;
    if (!this.port.available()) { this.setStatus('unavailable'); return false; }
    if (!this.audioIdle()) { this.setStatus('unavailable'); return false; }
    const ticket = this.session.beginSpeechReview();
    if (ticket === null) return false;
    this.ticket = ticket; const generation = ++this.generation; this.setStatus('requesting');
    const valid = () => !this.disposed && generation === this.generation && this.current()
      && this.ticket === ticket && this.session.isSpeechCurrent(ticket);
    try {
      const granted = await this.port.permitted();
      if (!valid()) { if (generation === this.generation) this.cancel(); return false; }
      if (!granted) { this.cancel(); this.setStatus('denied'); return false; }
      // Permissions can resolve after a tracking/other recording has started.
      if (!this.audioIdle()) { this.cancel(); this.setStatus('unavailable'); return false; }
      this.nativeActive = true; this.setStatus('listening');
      this.port.start({
        result: text => {
          if (!valid() || !this.nativeActive) return;
          this.release(false); this.setStatus('idle');
          this.session.receiveTranscript(ticket, text);
        },
        end: () => { if (valid() && this.nativeActive) this.cancel(); },
        error: () => { if (valid()) { this.cancel(); this.setStatus('failed'); } },
      });
      if (this.nativeActive) this.timer = setTimeout(() => { if (valid()) this.cancel(); }, INTELLIGENCE_LIMITS.audioSeconds * 1000);
      return true;
    } catch {
      if (generation === this.generation) { this.cancel(); this.setStatus('failed'); }
      return false;
    }
  }
}

import { parseConsentReceipt, validExpectedRevision, type ConsentIntent } from './consent';
import {
  INTELLIGENCE_LIMITS as limits, parseReply, parseServerError, sourceKey, validId, validUuid, validPolicy, validSource,
  type IntelligenceScope, type IntelligencePolicy, type IntelligenceError, type ConversationGateway,
  type ConversationMessage, type ConversationRequest, type SourceSelection,
} from './contract';

export interface ConversationState {
  scope: IntelligenceScope | null; input: string; transcript: string;
  phase: 'idle' | 'listening' | 'reviewing' | 'sending';
  messages: ConversationMessage[]; error: IntelligenceError | null;
}
export interface ConversationSnapshot extends ConversationState {
  policy: IntelligencePolicy | null; consent: { text: boolean; audio: boolean } | null;
}
interface Consent { policyId: string; text: boolean; audio: boolean }
// In-memory only. Native capture, authenticated transport and editor navigation
// are separate adapters; this controller can never save customer records.
export class IntelligenceSession {
  private state: ConversationState = { scope: null, input: '', transcript: '', phase: 'idle', messages: [], error: null };
  private policy: IntelligencePolicy | null = null;
  private consent: Consent | null = null;
  private pendingConsent: ConsentIntent | null = null;
  private sources: SourceSelection[] = [];
  private generation = 0;
  private pending: AbortController | null = null;
  private listeners = new Set<() => void>();
  constructor(private gateway: ConversationGateway, private uuid: () => string, private timeoutMs = 15000) {}
  snapshot(): ConversationSnapshot {
    return { ...this.state, policy: this.policy ? { ...this.policy } : null,
      consent: this.consent ? { text: this.consent.text, audio: this.consent.audio } : null, scope: this.state.scope ? { ...this.state.scope } : null, messages: this.state.messages.map(m => ({ ...m })) };
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private update(patch: Partial<ConversationState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private invalidate() { this.pendingConsent = null; this.generation++; this.pending?.abort(); this.pending = null; }
  selectScope(scope: IntelligenceScope | null) {
    if (scope && (!validId(scope.ownerId) || !validId(scope.dogId))) throw new Error('Invalid conversation scope');
    if (this.state.scope?.ownerId === scope?.ownerId && this.state.scope?.dogId === scope?.dogId) return;
    this.invalidate(); this.consent = null; this.sources = [];
    this.update({ scope: scope ? { ...scope } : null, input: '', transcript: '', phase: 'idle', messages: [], error: null });
  }
  configure(policy: IntelligencePolicy | null) {
    this.invalidate(); this.consent = null; this.sources = [];
    this.policy = policy && validPolicy(policy) ? { ...policy } : null;
    this.update({ phase: 'idle', input: '', transcript: '', messages: [], error: null });
  }
  consentContext() {
    return this.policy && this.state.scope ? { accountId: this.state.scope.ownerId, policyId: this.policy.id } : null;
  }
  consentGeneration() { return this.generation; }
  isConsentCurrent(intent: ConsentIntent) { return intent === this.pendingConsent; }
  beginConsent(text: boolean, audio: boolean, actionId: string, expectedRevision: number): ConsentIntent | null {
    // Changing the selection locks the previous consent immediately. The returned
    // one-shot ticket must accompany the server ACK; a local boolean cannot unlock.
    this.revokeConsent();
    if (!this.policy || !this.state.scope || text !== true || typeof audio !== 'boolean'
      || !validUuid(actionId) || !validExpectedRevision(expectedRevision)) return null;
    const intent = Object.freeze({ accountId: this.state.scope.ownerId, policyId: this.policy.id, text, audio, actionId, expectedRevision });
    this.pendingConsent = intent;
    return intent;
  }
  confirmConsent(intent: ConsentIntent, raw: unknown) {
    if (!intent || intent !== this.pendingConsent) return false;
    this.pendingConsent = null;
    if (!this.policy || !this.state.scope || intent.accountId !== this.state.scope.ownerId
      || intent.policyId !== this.policy.id || !parseConsentReceipt(raw, intent)) {
      this.update({ error: 'CONSENT_REQUIRED' }); return false;
    }
    this.invalidate(); this.consent = { policyId: intent.policyId, text: intent.text, audio: intent.audio };
    this.update({ phase: 'idle', transcript: '', error: null });
    return true;
  }
  revokeConsent() {
    this.invalidate(); this.consent = null; this.sources = [];
    this.update({ input: '', transcript: '', phase: 'idle', messages: [], error: null });
  }
  selectSources(sources: SourceSelection[]) {
    if (sources.length > limits.sources || !sources.every(validSource) || new Set(sources.map(sourceKey)).size !== sources.length) return false;
    this.invalidate(); this.sources = sources.map(s => ({ ...s }));
    // Do not silently replay replies derived from a now-deselected source.
    this.update({ messages: [], phase: 'idle', transcript: '', error: null });
    return true;
  }
  editInput(text: string) {
    this.invalidate(); this.update({ input: text.slice(0, limits.transcriptChars), phase: 'idle', transcript: '', error: null });
  }
  private permitted(audio = false): IntelligenceError | null {
    if (!this.state.scope || !this.policy) return 'UNAVAILABLE';
    if (!this.consent?.text || this.consent.policyId !== this.policy.id || (audio && !this.consent.audio)) return 'CONSENT_REQUIRED';
    return null;
  }
  beginSpeechReview(): number | null {
    const error = this.permitted(true);
    if (error || this.state.phase !== 'idle') { if (error) this.update({ error }); return null; }
    this.invalidate(); this.update({ phase: 'listening', transcript: '', error: null });
    return this.generation;
  }
  isSpeechCurrent(ticket: number) {
    return ticket === this.generation && (this.state.phase === 'listening' || this.state.phase === 'reviewing') && !this.permitted(true);
  }
  failSpeech(ticket: number, error: IntelligenceError) {
    if (!this.isSpeechCurrent(ticket)) return false;
    this.invalidate(); this.update({ phase: 'idle', transcript: '', error }); return true;
  }
  receiveTranscript(ticket: number, text: string) {
    if (ticket !== this.generation || this.state.phase !== 'listening' || this.permitted(true)) return false;
    if (!text.trim() || text.length > limits.transcriptChars) { this.update({ phase: 'idle', error: 'INVALID_INPUT' }); return false; }
    this.update({ phase: 'reviewing', transcript: text }); return true;
  }
  confirmTranscript(corrected: string) {
    if (this.state.phase !== 'reviewing' || !corrected.trim() || corrected.length > limits.messageChars) return false;
    this.update({ phase: 'idle', input: corrected, transcript: '', error: null }); return true;
  }
  interrupt() { this.invalidate(); this.update({ phase: 'idle', transcript: '', error: null }); }
  clear() { this.invalidate(); this.sources = []; this.update({ input: '', transcript: '', messages: [], phase: 'idle', error: null }); }
  trainingNoteDraft() {
    if (!this.state.scope || this.state.phase !== 'idle' || !this.state.input.trim()) return null;
    // Only the explicitly reviewed current input. No historical score, media,
    // timing, exercise identity or model-generated save action is accepted.
    return { dogId: this.state.scope.dogId, note: this.state.input.trim() };
  }
  async send(): Promise<boolean> {
    const error = this.permitted();
    if (error) { this.update({ error }); return false; }
    if (this.state.phase !== 'idle') return false;
    const text = this.state.input.trim();
    if (!text || text.length > limits.messageChars) { this.update({ error: 'INVALID_INPUT' }); return false; }
    const policy = this.policy!; const scope = this.state.scope!;
    const messages: ConversationMessage[] = [...this.state.messages, { role: 'user', text }];
    // Trim complete user/assistant pairs; never cut the current message.
    while (messages.length > limits.historyMessages || messages.reduce((n, m) => n + m.text.length, 0) > limits.historyChars) messages.splice(0, 2);
    const request: ConversationRequest = { version: 1, requestId: this.uuid(), dogId: scope.dogId, policyId: policy.id,
      messages, sources: this.sources.map(s => ({ ...s })) };
    if (!validId(request.requestId)) { this.update({ error: 'INVALID_INPUT' }); return false; }
    this.invalidate(); const generation = this.generation;
    const abort = new AbortController(); this.pending = abort;
    this.update({ phase: 'sending', error: null });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, this.timeoutMs);
    let aborted!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      aborted = () => reject(new Error('Request cancelled'));
      abort.signal.addEventListener('abort', aborted, { once: true });
    });
    try {
      const raw = await Promise.race([this.gateway.respond(request, abort.signal), cancelled]);
      if (generation !== this.generation || abort.signal.aborted) return false;
      const serverError = parseServerError(raw);
      const reply = serverError ? null : parseReply(raw, request);
      if (!reply) { this.update({ phase: 'idle', error: serverError ?? 'INVALID_RESPONSE' }); return false; }
      this.update({ phase: 'idle', input: '', messages: [...messages, { role: 'assistant', text: reply.text }], error: null });
      return true;
    } catch {
      if (generation === this.generation) this.update({ phase: 'idle', error: timedOut ? 'TIMEOUT' : 'NETWORK' });
      return false;
    } finally {
      clearTimeout(timer); abort.signal.removeEventListener('abort', aborted);
      if (this.pending === abort) this.pending = null;
    }
  }
}

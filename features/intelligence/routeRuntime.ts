import { validPolicy, validUuid, type ConversationGateway, type IntelligencePolicy, type IntelligenceScope } from './contract';
import { IntelligenceSession } from './session';
import { IntelligenceConsentController, type ConsentGateway } from './consentController';
import { createConsentOutbox, consentOutboxQueue, type ConsentStorage } from './consentOutbox';
import { ServerSpeechCapture } from './serverSpeechCapture';
import type { PcmCapturePort } from './pcmCapture';
import type { TranscriptionGateway } from './transcriptionHttp';
import { IntelligenceSpeechCapture, type SpeechCapturePort } from './speechCapture';

// All route instances share the outbox RMW lock, including a departing account's
// still-running durable revoke write. This lock covers only our own namespace.
export interface RouteRuntimeDependencies {
  storage: ConsentStorage;
  gateway: ConversationGateway;
  consentGateway: ConsentGateway;
  policy: IntelligencePolicy | null;
  uuid: () => string;
  currentAccount: () => string | null;
  serverSpeech?: { port: PcmCapturePort; gateway: TranscriptionGateway; audioIdle: () => boolean };
  speech?: { port: SpeechCapturePort; audioIdle: () => boolean };
}
export function createIntelligenceRouteRuntime(scope: IntelligenceScope, deps: RouteRuntimeDependencies) {
  if (!validUuid(scope.ownerId) || !validUuid(scope.dogId)) throw new Error('Invalid conversation identity');
  const identity = { ...scope }; let disposed = false;
  let policy = deps.policy && validPolicy(deps.policy) ? { ...deps.policy } : null;
  const pending = new Set<AbortController>();
  const current = () => {
    try { return !disposed && deps.currentAccount() === identity.ownerId; } catch { return false; }
  };
  const request = async (signal: AbortSignal, work: (signal: AbortSignal) => Promise<unknown>, requirePolicy = true) => {
    if (!current() || (requirePolicy && !policy) || signal.aborted) throw new Error('Conversation unavailable');
    const abort = new AbortController(); pending.add(abort);
    const cancel = () => abort.abort(); signal.addEventListener('abort', cancel, { once: true });
    let onAbort!: () => void;
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Conversation interrupted'));
      abort.signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const raw = await Promise.race([work(abort.signal), cancelled]);
      if (!current() || abort.signal.aborted) return null;
      return raw;
    } finally {
      signal.removeEventListener('abort', cancel); abort.signal.removeEventListener('abort', onAbort); pending.delete(abort);
    }
  };
  const session = new IntelligenceSession({ respond: (value, signal) =>
    value.dogId === identity.dogId && value.policyId === policy?.id
      ? request(signal, bound => deps.gateway.respond(value, bound)) : Promise.resolve(null) }, deps.uuid);
  session.selectScope(identity); session.configure(policy);
  const contextMatches = (value: { accountId: string; policyId: string }) =>
    value.accountId === identity.ownerId && value.policyId === policy?.id;
  const consent = new IntelligenceConsentController(session, createConsentOutbox(deps.storage), {
    readRevision: (value, signal) => contextMatches(value) ? request(signal, bound => deps.consentGateway.readRevision(value, bound)) : Promise.resolve(null),
    grant: (value, signal) => contextMatches(value) ? request(signal, bound => deps.consentGateway.grant(value, bound)) : Promise.resolve(null),
    // Outbox may hold an older policy of this same account. Never discard it or
    // send it with another account; the server validates its exact policy.
    revoke: (value, signal) => value.accountId === identity.ownerId
      ? request(signal, bound => deps.consentGateway.revoke(value, bound), false) : Promise.resolve(null),
  }, deps.uuid, 15000, consentOutboxQueue);
  const speech = deps.serverSpeech ? new ServerSpeechCapture(session, deps.serverSpeech.port, deps.serverSpeech.gateway, deps.uuid, current, deps.serverSpeech.audioIdle) : deps.speech ? new IntelligenceSpeechCapture(session, deps.speech.port, current, deps.speech.audioIdle) : null;
  const interrupt = () => {
    speech?.cancel(); session.revokeConsent();
    for (const abort of pending) abort.abort();
  };
  return {
    session, consent, speech,
    interrupt,
    configurePolicy(next: IntelligencePolicy | null) {
      // Policy arrives asynchronously from the authenticated server. Rebind the
      // transport closures together with the session; never unlock just the UI.
      interrupt();
      policy = current() && next && validPolicy(next) ? { ...next } : null;
      session.configure(policy);
    },
    dispose() {
      if (disposed) return;
      disposed = true; interrupt(); policy = null; speech?.dispose(); session.configure(null); session.selectScope(null);
      // Durable revocations intentionally survive leaving, logout and app resume.
    },
  };
}
export type IntelligenceRouteRuntime = ReturnType<typeof createIntelligenceRouteRuntime>;

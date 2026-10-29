import { validId, validUuid } from './contract';
import { validExpectedRevision, type ConsentIntent } from './consent';
import type { ConsentGateway, PendingRevocation } from './consentController';
import type { IntelligenceHttpReply } from './gateway';

export interface ConsentGrantRequest {
  version: 1; policyId: string; text: boolean; audio: boolean; expectedRevision: number; actionId: string;
}
interface ConsentMutation {
  operation: 'intelligence-consent-v1'; method: 'POST' | 'DELETE';
  // Local authentication binding only, never part of JSON body.
  accountId: string; body: ConsentGrantRequest | { version: 1; policyId: string };
}
export type ConsentMutationTransport = (request: ConsentMutation, signal: AbortSignal) => Promise<IntelligenceHttpReply>;
export type ConsentRevisionReader = (context: PendingRevocation, signal: AbortSignal) => Promise<unknown>;
export function consentGrantRequest(intent: ConsentIntent): ConsentGrantRequest | null {
  if (!validUuid(intent.accountId) || !validId(intent.policyId) || intent.text !== true || typeof intent.audio !== 'boolean'
    || !validUuid(intent.actionId) || !validExpectedRevision(intent.expectedRevision)) return null;
  return { version: 1, policyId: intent.policyId, text: intent.text, audio: intent.audio,
    expectedRevision: intent.expectedRevision, actionId: intent.actionId };
}
// No live/default transport. Revision read is a separate normalized adapter;
// do not invent an endpoint or interpret a network/authorization error as rev0.
export function createConsentGateway(transport: ConsentMutationTransport, readRevision: ConsentRevisionReader): ConsentGateway {
  const send = async (mutation: ConsentMutation, signal: AbortSignal) => {
    if (signal.aborted) return null;
    const reply = await transport(mutation, signal);
    if (signal.aborted || !Number.isInteger(reply.status) || reply.status < 200 || reply.status >= 300
      || typeof reply.bodyText !== 'string' || !reply.bodyText || reply.bodyText.length > 20000) return null;
    try { return JSON.parse(reply.bodyText) as unknown; } catch { return null; }
  };
  return {
    readRevision: async (context, signal) => {
      if (signal.aborted || !validUuid(context.accountId) || !validId(context.policyId)) return null;
      const reply = await readRevision({ ...context }, signal); return signal.aborted ? null : reply;
    },
    grant: (intent, signal) => {
      const body = consentGrantRequest(intent);
      return body ? send({ operation: 'intelligence-consent-v1', method: 'POST', accountId: intent.accountId, body }, signal) : Promise.resolve(null);
    },
    revoke: (context, signal) => validUuid(context.accountId) && validId(context.policyId)
      ? send({ operation: 'intelligence-consent-v1', method: 'DELETE', accountId: context.accountId, body: { version: 1, policyId: context.policyId } }, signal)
      : Promise.resolve(null),
  };
}

// Client contract candidate for the dedicated, authenticated backend (owner 05).
// No provider credentials, endpoint activation, customer writes or billing here.
export const INTELLIGENCE_LIMITS = Object.freeze({
  messageChars: 2000, replyChars: 3000, transcriptChars: 4000,
  historyChars: 8000, historyMessages: 8, sources: 8, audioSeconds: 60,
  pilotMonthlyChfCents: 500,
});
export interface IntelligenceScope { ownerId: string; dogId: string }
export interface IntelligencePolicy {
  id: string; enabled: boolean; providerLabel: string; disclosure: string; retentionSummary: string;
  monthlyBudgetChfCents: number;
}
export interface SourceSelection { kind: 'unit' | 'session'; originalId: string }
export interface ConversationMessage { role: 'user' | 'assistant'; text: string }
export interface ConversationRequest {
  version: 1; requestId: string; dogId: string; policyId: string;
  messages: ConversationMessage[]; sources: SourceSelection[];
}
export interface ConversationReply {
  version: 1; requestId: string; dogId: string; policyId: string; text: string; sources: SourceSelection[];
}
export type IntelligenceError = 'UNAVAILABLE' | 'CONSENT_REQUIRED' | 'INVALID_INPUT' | 'INVALID_RESPONSE'
  | 'BUDGET_EXHAUSTED' | 'DAILY_LIMIT_REACHED' | 'NETWORK' | 'TIMEOUT';
// Supplied by the authenticated server adapter, not by a model provider SDK.
export interface ConversationGateway { respond(request: ConversationRequest, signal: AbortSignal): Promise<unknown> }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const validId = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 128;
export const validUuid = (v: unknown): v is string => typeof v === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const sourceKey = (v: SourceSelection) => JSON.stringify([v.kind, validUuid(v.originalId) ? v.originalId.toLowerCase() : v.originalId]);
export function validSource(v: unknown): v is SourceSelection {
  return object(v) && Object.keys(v).every(k => k === 'kind' || k === 'originalId')
    && (v.kind === 'unit' || v.kind === 'session') && validId(v.originalId);
}
// Match the authenticated backend's wire boundary before any transport. Local
// UI/session fixtures can use opaque IDs; only UUID entity references go online.
export function validConversationRequest(v: unknown): v is ConversationRequest {
  if (!object(v) || Object.keys(v).some(k => !['version', 'requestId', 'dogId', 'policyId', 'messages', 'sources'].includes(k))
    || v.version !== 1 || !validUuid(v.requestId) || !validUuid(v.dogId) || !validId(v.policyId)
    || !Array.isArray(v.messages) || v.messages.length < 1 || v.messages.length > INTELLIGENCE_LIMITS.historyMessages
    || !Array.isArray(v.sources) || v.sources.length > INTELLIGENCE_LIMITS.sources
    || !v.sources.every(s => validSource(s) && validUuid(s.originalId))
    || new Set(v.sources.map(sourceKey)).size !== v.sources.length) return false;
  let chars = 0;
  for (const m of v.messages) {
    if (!object(m) || Object.keys(m).some(k => k !== 'role' && k !== 'text') || (m.role !== 'user' && m.role !== 'assistant')
      || typeof m.text !== 'string' || !m.text.trim()
      || m.text.length > (m.role === 'user' ? INTELLIGENCE_LIMITS.messageChars : INTELLIGENCE_LIMITS.replyChars)) return false;
    chars += m.text.length;
  }
  return chars <= INTELLIGENCE_LIMITS.historyChars && v.messages[v.messages.length - 1].role === 'user';
}
export function validPolicy(v: unknown): v is IntelligencePolicy {
  return object(v) && validId(v.id) && v.enabled === true
    && typeof v.providerLabel === 'string' && !!v.providerLabel.trim()
    && typeof v.disclosure === 'string' && !!v.disclosure.trim()
    && typeof v.retentionSummary === 'string' && !!v.retentionSummary.trim()
    && typeof v.monthlyBudgetChfCents === 'number' && Number.isSafeInteger(v.monthlyBudgetChfCents)
    && v.monthlyBudgetChfCents > 0 && v.monthlyBudgetChfCents <= INTELLIGENCE_LIMITS.pilotMonthlyChfCents;
}
export function parseReply(v: unknown, request: ConversationRequest): ConversationReply | null {
  if (!object(v) || Object.keys(v).some(k => !['version', 'requestId', 'dogId', 'policyId', 'text', 'sources'].includes(k))
    || v.version !== 1 || v.requestId !== request.requestId || v.dogId !== request.dogId || v.policyId !== request.policyId
    || typeof v.text !== 'string' || !v.text.trim() || v.text.length > INTELLIGENCE_LIMITS.replyChars
    || !Array.isArray(v.sources) || v.sources.length > INTELLIGENCE_LIMITS.sources || !v.sources.every(validSource)) return null;
  const allowed = new Set(request.sources.map(sourceKey));
  if (v.sources.some(s => !allowed.has(sourceKey(s))) || new Set(v.sources.map(sourceKey)).size !== v.sources.length) return null;
  return { version: 1, requestId: request.requestId, dogId: request.dogId, policyId: request.policyId,
    text: v.text, sources: v.sources.map(s => ({ ...s })) };
}
export function parseServerError(v: unknown): IntelligenceError | null {
  if (!object(v) || v.version !== 1 || !object(v.error)) return null;
  const codes: IntelligenceError[] = ['UNAVAILABLE', 'CONSENT_REQUIRED', 'INVALID_INPUT', 'BUDGET_EXHAUSTED', 'DAILY_LIMIT_REACHED'];
  return codes.includes(v.error.code as IntelligenceError) ? v.error.code as IntelligenceError : null;
}

import { validId, validUuid } from './contract';

export interface ConsentIntent {
  readonly accountId: string; readonly policyId: string; readonly text: boolean; readonly audio: boolean;
  readonly expectedRevision: number; readonly actionId: string;
}
export interface ConsentReceipt {
  version: 1; accountId: string; policyId: string; text: boolean; audio: boolean; revision: number; grantedAt: string;
}
// Normalized output from a future authenticated revision-read adapter, not a
// claim that a corresponding HTTP endpoint is already implemented.
export interface ConsentRevision {
  version: 1; accountId: string; policyId: string; exists: boolean; revision: number;
}
export const validExpectedRevision = (v: unknown): v is number => typeof v === 'number'
  && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER;
export interface RevocationReceipt {
  version: 1; accountId: string; policyId: string; revoked: true; revision: number; revokedAt: string;
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const timestamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 64
  && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v));
const revision = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

// A receipt is meaningful only for the exact action and authenticated account.
// The server must additionally enforce current stored consent on every request.
export function parseConsentReceipt(raw: unknown, intent: ConsentIntent): ConsentReceipt | null {
  if (!object(raw) || Object.keys(raw).some(k => !['version', 'accountId', 'policyId', 'text', 'audio', 'revision', 'grantedAt'].includes(k))
    || raw.version !== 1 || !validId(raw.accountId) || !validId(raw.policyId)
    || raw.accountId !== intent.accountId || raw.policyId !== intent.policyId
    || raw.text !== intent.text || raw.audio !== intent.audio || !validExpectedRevision(intent.expectedRevision) || !validUuid(intent.actionId)
    || !revision(raw.revision) || raw.revision !== intent.expectedRevision + 1 || !timestamp(raw.grantedAt)) return null;
  return { version: 1, accountId: intent.accountId, policyId: intent.policyId, text: intent.text, audio: intent.audio, revision: raw.revision, grantedAt: raw.grantedAt };
}
export function parseRevocationReceipt(raw: unknown, accountId: string, policyId: string): RevocationReceipt | null {
  if (!object(raw) || Object.keys(raw).some(k => !['version', 'accountId', 'policyId', 'revoked', 'revision', 'revokedAt'].includes(k))
    || raw.version !== 1 || !validId(raw.accountId) || !validId(raw.policyId)
    || raw.accountId !== accountId || raw.policyId !== policyId || raw.revoked !== true
    || !revision(raw.revision) || !timestamp(raw.revokedAt)) return null;
  return { version: 1, accountId, policyId, revoked: true, revision: raw.revision, revokedAt: raw.revokedAt };
}

export function parseConsentRevision(raw: unknown, context: { accountId: string; policyId: string }): ConsentRevision | null {
  if (!object(raw) || Object.keys(raw).some(k => !['version', 'accountId', 'policyId', 'exists', 'revision'].includes(k))
    || raw.version !== 1 || !validId(raw.accountId) || !validId(raw.policyId)
    || raw.accountId !== context.accountId || raw.policyId !== context.policyId || typeof raw.exists !== 'boolean'
    || !validExpectedRevision(raw.revision) || (raw.exists ? raw.revision === 0 : raw.revision !== 0)) return null;
  return { version: 1, accountId: raw.accountId, policyId: raw.policyId, exists: raw.exists, revision: raw.revision };
}

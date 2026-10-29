import type { SupabaseClient } from '@supabase/supabase-js';
import { validUuid, validId, validPolicy, type IntelligencePolicy } from './contract';
import { consentGrantRequest } from './consentGateway';
import { parseConsentReceipt, parseRevocationReceipt } from './consent';
import type { ConsentGateway } from './consentController';
import { createConsentRevisionRpcReader } from './consentRevisionRpc';

// Exact public client RPCs from the owner's reviewed SQL candidate. No budget
// reserve/dispatch/service-role RPC and no model transport is exposed here.
type Rpc = 'intelligence_policy_v1' | 'intelligence_consent_grant_v1' | 'intelligence_consent_revoke_v1';
function rpcAccess(client: SupabaseClient, currentAccount: () => string | null) {
  return async (accountId: string, rpc: Rpc, args: Record<string, unknown>, read: boolean, signal: AbortSignal) => {
    const current = () => { try { return !signal.aborted && currentAccount() === accountId; } catch { return false; } };
    if (!validUuid(accountId) || !current()) return null;
    // An unknown mutation outcome must remain eligible for retry of the SAME
    // UUID/revision ticket. Never log or propagate SDK/token details to the UI.
    try {
      const { data, error } = await client.auth.getSession();
      const session = data.session;
      if (error || !session || session.user.id !== accountId || !current()
        || typeof session.access_token !== 'string' || !session.access_token) return null;
      const reply = await client.rpc(rpc, args, { get: read })
        .setHeader('Authorization', `Bearer ${session.access_token}`).abortSignal(signal).retry(false);
      if (!current()) return null;
      if (reply.status === 0 || reply.status === 408 || reply.status >= 500) throw new Error('Unconfirmed consent operation');
      if (reply.error || !Number.isInteger(reply.status) || reply.status < 200 || reply.status >= 300) return null;
      return reply.data as unknown;
    } catch {
      if (read || !current()) return null;
      throw new Error('Unconfirmed consent operation');
    }
  };
}
export function parsePolicyReply(raw: unknown): IntelligencePolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const wrapper = raw as Record<string, unknown>;
  if (wrapper.version !== 1 || Object.keys(wrapper).some(k => k !== 'version' && k !== 'policy') || !validPolicy(wrapper.policy)) return null;
  const p = wrapper.policy;
  if (Object.keys(p).some(k => !['id', 'enabled', 'providerLabel', 'disclosure', 'retentionSummary', 'monthlyBudgetChfCents'].includes(k))) return null;
  // Copy server values; no made-up provider, disclosure, retention or budget.
  return { ...p };
}
export function createIntelligencePolicyRpcReader(client: SupabaseClient, currentAccount: () => string | null) {
  const access = rpcAccess(client, currentAccount);
  return async (accountId: string, signal: AbortSignal) => {
    if (signal.aborted) return null;
    const abort = new AbortController(); let rejectCancelled!: () => void;
    const cancelled = new Promise<null>(resolve => { rejectCancelled = () => resolve(null); });
    const cancel = () => { abort.abort(); rejectCancelled(); };
    signal.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, 15000);
    try { return parsePolicyReply(await Promise.race([access(accountId, 'intelligence_policy_v1', {}, true, abort.signal), cancelled])); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); }
  };
}
export function createConsentRpcGateway(client: SupabaseClient, currentAccount: () => string | null): ConsentGateway {
  const access = rpcAccess(client, currentAccount);
  return {
    readRevision: createConsentRevisionRpcReader(client, currentAccount, 'intelligence_consent_revision_v1'),
    async grant(requested, signal) {
      const intent = { ...requested }; const body = consentGrantRequest(intent); if (!body) return null;
      const raw = await access(intent.accountId, 'intelligence_consent_grant_v1', {
        p_policy_id: body.policyId, p_text: body.text, p_audio: body.audio,
        p_expected_revision: body.expectedRevision, p_action_id: body.actionId,
      }, false, signal);
      return parseConsentReceipt(raw, intent);
    },
    async revoke(requested, signal) {
      const context = { ...requested };
      if (!validId(context.policyId)) return null;
      const raw = await access(context.accountId, 'intelligence_consent_revoke_v1', { p_policy_id: context.policyId }, false, signal);
      return parseRevocationReceipt(raw, context.accountId, context.policyId);
    },
  };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { validId, validUuid } from './contract';
import { parseConsentRevision } from './consent';
import type { ConsentRevisionReader } from './consentGateway';

// RPC contract matches the locally tested backend candidate; deployment is pending.
// Explicit injection keeps imports free of connections and live endpoint assumptions.
export type ConsentRevisionRpcName = 'intelligence_consent_revision_v1';
export function createConsentRevisionRpcReader(client: SupabaseClient, currentAccount: () => string | null,
  rpcName: ConsentRevisionRpcName): ConsentRevisionReader {
  return async (requested, signal) => {
    const context = { accountId: requested.accountId, policyId: requested.policyId };
    const current = () => !signal.aborted && currentAccount() === context.accountId;
    if (!validUuid(context.accountId) || !validId(context.policyId) || rpcName !== 'intelligence_consent_revision_v1') return null;
    try {
      if (!current()) return null;
      const { data, error } = await client.auth.getSession();
      const session = data.session;
      if (error || !session || session.user.id !== context.accountId || typeof session.access_token !== 'string'
        || !session.access_token || !current()) return null;
      // Pin this original account's token explicitly. The SDK may refresh global
      // auth asynchronously; it must never substitute another account's JWT.
      const response = await client.rpc(rpcName, { p_policy_id: context.policyId }, { get: true })
        .setHeader('Authorization', `Bearer ${session.access_token}`).abortSignal(signal).retry(false);
      if (!current() || response.error || !Number.isInteger(response.status) || response.status < 200 || response.status >= 300) return null;
      return parseConsentRevision(response.data, context);
    } catch { return null; } // No token, provider or account data in logs.
  };
}

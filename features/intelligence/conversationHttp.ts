import type { SupabaseClient } from '@supabase/supabase-js';
import { createConversationGateway } from './gateway';
import { validUuid } from './contract';
import { boundedJsonText, intelligenceEndpoint, utf8Size } from './httpBoundary';
import type { IntelligenceFetch } from './transcriptionHttp';
// Local contract67 only. The deployment/review gate remains independently closed.
export function createConversationHttpGateway(client: SupabaseClient, currentAccount: () => string | null,
  projectUrl: string, publicKey: string, fetcher: IntelligenceFetch) {
  const endpoint = intelligenceEndpoint(projectUrl, 'intelligence-respond');
  return createConversationGateway(async (_operation, request, signal) => {
    const account = currentAccount();
    const current = () => !signal.aborted && currentAccount() === account;
    const denied = { status: 503, bodyText: '{"version":1,"error":{"code":"UNAVAILABLE"}}' };
    if (!endpoint || !validUuid(account) || !publicKey || !current()) return denied;
    const body = JSON.stringify(request);
    if (utf8Size(body) > 65536 || !/^[A-Za-z0-9._:-]{1,128}$/.test(request.policyId)) return denied;
    const { data, error } = await client.auth.getSession();
    if (error || !data.session || data.session.user.id !== account || !data.session.access_token || !current()) return denied;
    // Direct fetch pins the original user token; mutable SDK global headers
    // cannot replace it after an account switch. No automatic retry.
    const response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: publicKey, 'Content-Type': 'application/json' }, body });
    const bodyText = await boundedJsonText(response, endpoint, signal);
    if (!current()) return denied;
    if (response.status >= 300) {
      let raw: unknown;
      try { raw = JSON.parse(bodyText); } catch { return { status: response.status, bodyText: '' }; }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)
        || Object.keys(raw).some(key => key !== 'version' && key !== 'error')) return { status: response.status, bodyText: '' };
      const error = (raw as { error?: unknown }).error;
      if (!error || typeof error !== 'object' || Array.isArray(error) || Object.keys(error).some(key => key !== 'code')) return { status: response.status, bodyText: '' };
    }
    return { status: response.status, bodyText };
  });
}

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createConsentRpcGateway, createIntelligencePolicyRpcReader, parsePolicyReply } from '../consentRpcGateway';
import { IntelligenceSession } from '../session';
import { IntelligenceConsentController } from '../consentController';
const owner = '11111111-1111-4111-8111-111111111111'; const other = '22222222-2222-4222-8222-222222222222';
const intent = { accountId: owner, policyId: 'p', text: true, audio: false, expectedRevision: 2, actionId: '33333333-3333-4333-8333-333333333333' };
const receipt = { version: 1, accountId: owner, policyId: 'p', text: true, audio: false, revision: 3, grantedAt: '2026-10-23T08:00:00Z' };
const policy = { id: 'p', enabled: true, providerLabel: 'Test provider', disclosure: 'Real disclosure', retentionSummary: 'Real retention', monthlyBudgetChfCents: 500 };
const authSession = (id = owner): Session => ({ access_token: id === owner ? 'synthetic-original-token' : 'synthetic-other-token', refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user: { id, aud: 'authenticated', created_at: '2026-10-23T00:00:00Z', app_metadata: {}, user_metadata: {} } });
function setup() {
  let account: string | null = owner;
  const response = { status: 200, data: receipt as unknown, error: null as unknown };
  const query = Object.assign(Promise.resolve(response), { setHeader: jest.fn(), abortSignal: jest.fn(), retry: jest.fn() });
  query.setHeader.mockReturnValue(query); query.abortSignal.mockReturnValue(query); query.retry.mockReturnValue(query);
  const client = { auth: { getSession: jest.fn(async () => ({ data: { session: authSession() as Session | null }, error: null as unknown })) }, rpc: jest.fn((_name: string, _args: Record<string, unknown>, _options: { get: boolean }) => query) };
  const current = () => account;
  return { client, query, response, current, select: (id: string | null) => { account = id; }, gateway: createConsentRpcGateway(client as unknown as SupabaseClient, current), reader: createIntelligencePolicyRpcReader(client as unknown as SupabaseClient, current) };
}
afterEach(() => jest.useRealTimers());
it('projects exact grant SQL arguments without accountId and pins the original JWT for POST', async () => {
  const s = setup(); const signal = new AbortController().signal;
  expect(await s.gateway.grant(intent, signal)).toEqual(receipt);
  expect(s.client.rpc).toHaveBeenCalledWith('intelligence_consent_grant_v1', { p_policy_id: 'p', p_text: true, p_audio: false, p_expected_revision: 2, p_action_id: intent.actionId }, { get: false });
  expect(s.query.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer synthetic-original-token'); expect(s.query.abortSignal).toHaveBeenCalledWith(signal); expect(s.query.retry).toHaveBeenCalledWith(false);
});
it('binds explicit revoke to original account/policy and validates its positive tombstone', async () => {
  const s = setup(); const raw = { version: 1, accountId: owner, policyId: 'old-policy', revoked: true, revision: 1, revokedAt: '2026-10-23T08:00:00Z' }; s.response.data = raw;
  expect(await s.gateway.revoke({ accountId: owner, policyId: 'old-policy' }, new AbortController().signal)).toEqual(raw);
  expect(s.client.rpc).toHaveBeenCalledWith('intelligence_consent_revoke_v1', { p_policy_id: 'old-policy' }, { get: false });
});
it.each([0,408,500,503])('preserves unknown grant outcome HTTP%s for explicit same-ticket retry', async status => {
  const s = setup(); s.response.status = status; s.response.error = { message: 'synthetic private error' };
  await expect(s.gateway.grant(intent, new AbortController().signal)).rejects.toThrow('Unconfirmed consent operation'); expect(s.client.rpc).toHaveBeenCalledTimes(1);
});
it.each([401,403,404,409])('rejects explicit grant HTTP%s without trusting a success-shaped body', async status => {
  const s = setup(); s.response.status = status; expect(await s.gateway.grant(intent, new AbortController().signal)).toBeNull();
});
it('does not retry or accept an unknown or mismatched receipt field', async () => {
  const s = setup(); s.response.data = { ...receipt, extra: true }; expect(await s.gateway.grant(intent, new AbortController().signal)).toBeNull();
  s.response.data = { ...receipt, accountId: other }; expect(await s.gateway.grant(intent, new AbortController().signal)).toBeNull();
  s.response.data = { ...receipt, revision: 2 }; expect(await s.gateway.grant(intent, new AbortController().signal)).toBeNull();
});
it('validates grant/revoke fields before reading a session or constructing RPC', async () => {
  const s = setup(); expect(await s.gateway.grant({ ...intent, expectedRevision: -1 }, new AbortController().signal)).toBeNull();
  expect(await s.gateway.revoke({ accountId: owner, policyId: '' }, new AbortController().signal)).toBeNull(); expect(s.client.auth.getSession).not.toHaveBeenCalled();
});
it('never authenticates a different account and rejects permission after account switch', async () => {
  const s = setup(); s.client.auth.getSession.mockResolvedValueOnce({ data: { session: authSession(other) }, error: null });
  expect(await s.gateway.grant(intent, new AbortController().signal)).toBeNull(); expect(s.client.rpc).not.toHaveBeenCalled();
  s.select(other); expect(await s.gateway.revoke({ accountId: owner, policyId: 'p' }, new AbortController().signal)).toBeNull(); expect(s.client.rpc).not.toHaveBeenCalled();
});
it('snapshots mutation arguments before a slow auth lookup and ignores completion after abort', async () => {
  const s = setup(); let finish!: (v: Awaited<ReturnType<typeof s.client.auth.getSession>>) => void;
  s.client.auth.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const requested = { ...intent }; const pending = s.gateway.grant(requested, new AbortController().signal); requested.policyId = 'changed';
  finish({ data: { session: authSession() }, error: null }); expect(await pending).toEqual(receipt);
  const abort = new AbortController(); abort.abort(); expect(await s.gateway.grant(intent, abort.signal)).toBeNull(); expect(s.client.rpc).toHaveBeenCalledTimes(1);
});
it('reads exact server policy through GET without local activation or made-up disclosure', async () => {
  const s = setup(); s.response.data = { version: 1, policy }; expect(await s.reader(owner, new AbortController().signal)).toEqual(policy);
  expect(s.client.rpc).toHaveBeenCalledWith('intelligence_policy_v1', {}, { get: true });
});
it.each([null, { version: 1, policy: null }, { version: 1, policy: { ...policy, enabled: false } }, { version: 1, policy: { ...policy, monthlyBudgetChfCents: 501 } }, { version: 1, policy, extra: true }, { version: 1, policy: { ...policy, extra: true } }])('fails closed on disabled, excessive or malformed policy %j', raw => {
  expect(parsePolicyReply(raw)).toBeNull();
});
it('bounds a policy lookup even when auth ignores cancellation, without late application', async () => {
  jest.useFakeTimers(); const s = setup(); let finish!: (v: Awaited<ReturnType<typeof s.client.auth.getSession>>) => void;
  s.client.auth.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = s.reader(owner, new AbortController().signal); await jest.advanceTimersByTimeAsync(15000);
  expect(await pending).toBeNull(); finish({ data: { session: authSession() }, error: null }); await Promise.resolve();
  expect(s.client.rpc).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});
it('cancels policy lookup immediately on caller abort and never infers a usable policy', async () => {
  const s = setup(); s.client.auth.getSession.mockImplementationOnce(() => new Promise(() => {})); const abort = new AbortController();
  const pending = s.reader(owner, abort.signal); abort.abort(); expect(await pending).toBeNull(); expect(s.client.rpc).not.toHaveBeenCalled();
});
it('keeps the same action UUID and expected revision after a real adapter reports an unknown outcome', async () => {
  const s = setup(); const session = new IntelligenceSession({ respond: async () => null }, () => intent.actionId); session.selectScope({ ownerId: owner, dogId: other }); session.configure(policy);
  const consent = new IntelligenceConsentController(session, { read: async () => [], write: async () => {} }, s.gateway, () => intent.actionId);
  s.response.data = { version: 1, accountId: owner, policyId: 'p', exists: false, revision: 0 }; expect(await consent.loadRevision()).toBe(true);
  s.response.status = 0; expect(await consent.grant(true, false)).toBe(false); expect(consent.canRetryGrant()).toBe(true); expect(session.snapshot().consent).toBeNull();
  s.response.status = 200; s.response.data = { ...receipt, revision: 1 }; expect(await consent.retryGrant()).toBe(true);
  const mutations = s.client.rpc.mock.calls.filter(([name]) => name === 'intelligence_consent_grant_v1'); expect(mutations).toHaveLength(2); expect(mutations[1]).toEqual(mutations[0]);
});
it.each(['grant','revoke'] as const)('installed SDK performs one authenticated POST for %s without any model request', async action => {
  const body = action === 'grant' ? receipt : { version: 1, accountId: owner, policyId: 'p', revoked: true, revision: 4, revokedAt: receipt.grantedAt };
  const fetcher = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toContain(`/rest/v1/rpc/intelligence_consent_${action}_v1`); expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-original-token'); expect(JSON.parse(String(init?.body))).not.toHaveProperty('accountId');
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const client = createClient('https://anyvo-fixture.invalid', 'synthetic-public', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  jest.spyOn(client.auth, 'getSession').mockResolvedValueOnce({ data: { session: authSession() }, error: null }).mockResolvedValue({ data: { session: authSession(other) }, error: null });
  const gateway = createConsentRpcGateway(client, () => owner); const result = action === 'grant' ? await gateway.grant(intent, new AbortController().signal) : await gateway.revoke({ accountId: owner, policyId: 'p' }, new AbortController().signal);
  expect(result).toEqual(body); expect(fetcher).toHaveBeenCalledTimes(1); client.auth.stopAutoRefresh();
});

it('installed SDK never retries a failed policy GET and never treats a 503 as usable policy', async () => {
  const fetcher = jest.fn(async () => new Response(JSON.stringify({ message: 'unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  const client = createClient('https://anyvo-fixture.invalid', 'synthetic-public', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  jest.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: authSession() }, error: null });
  expect(await createIntelligencePolicyRpcReader(client, () => owner)(owner, new AbortController().signal)).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1); client.auth.stopAutoRefresh();
});
it('installed SDK network-failed POST retains an unknown outcome with one attempt and no SDK details', async () => {
  const fetcher = jest.fn(async () => { throw new TypeError('synthetic private network details'); });
  const client = createClient('https://anyvo-fixture.invalid', 'synthetic-public', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  jest.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: authSession() }, error: null });
  await expect(createConsentRpcGateway(client, () => owner).grant(intent, new AbortController().signal)).rejects.toThrow('Unconfirmed consent operation'); expect(fetcher).toHaveBeenCalledTimes(1); client.auth.stopAutoRefresh();
});

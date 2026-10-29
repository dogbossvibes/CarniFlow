import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { createConsentRevisionRpcReader } from '../consentRevisionRpc';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const context = { accountId: owner, policyId: 'policy' };
const snapshot = { version: 1, ...context, exists: false, revision: 0 };
const fixtureSession = (id = owner, token = 'synthetic-owner-token'): Session => ({ access_token: token, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer',
  user: { id, aud: 'authenticated', created_at: '2026-10-23T00:00:00Z', app_metadata: {}, user_metadata: {} } });
const setup = () => {
  let selected: string | null = owner;
  const reply = { status: 200, data: snapshot as unknown, error: null as unknown };
  const query = Object.assign(Promise.resolve(reply), { setHeader: jest.fn(), abortSignal: jest.fn(), retry: jest.fn() });
  query.setHeader.mockReturnValue(query); query.abortSignal.mockReturnValue(query); query.retry.mockReturnValue(query);
  const client = { auth: { getSession: jest.fn(async () => ({ data: { session: fixtureSession() as Session | null }, error: null as unknown })) }, rpc: jest.fn(() => query) };
  const reader = createConsentRevisionRpcReader(client as unknown as SupabaseClient, () => selected, 'intelligence_consent_revision_v1');
  return { client, query, reply, reader, select: (id: string | null) => { selected = id; } };
};
it('uses authenticated GET RPC with only the policy parameter, pinned JWT, abort and retries disabled', async () => {
  const s = setup(); const signal = new AbortController().signal;
  expect(await s.reader(context, signal)).toEqual(snapshot);
  expect(s.client.rpc).toHaveBeenCalledWith('intelligence_consent_revision_v1', { p_policy_id: 'policy' }, { get: true });
  expect(s.query.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer synthetic-owner-token');
  expect(s.query.abortSignal).toHaveBeenCalledWith(signal); expect(s.query.retry).toHaveBeenCalledWith(false);
});
it.each([401,403,404,503])('never converts HTTP%s into an absent consent row', async status => {
  const s = setup(); s.reply.status = status; s.reply.error = { code: 'RPC_UNAVAILABLE' };
  expect(await s.reader(context, new AbortController().signal)).toBeNull();
});
it.each([{ accountId: other }, { policyId: 'other' }, { revision: 1 }, { exists: true }, { extra: true }])('rejects wrong or malformed server revision (%#)', async patch => {
  const s = setup(); s.reply.data = { ...snapshot, ...patch }; expect(await s.reader(context, new AbortController().signal)).toBeNull();
});
it('does not dispatch for a different selected account or session owner', async () => {
  const s = setup(); s.select(other); expect(await s.reader(context, new AbortController().signal)).toBeNull(); expect(s.client.auth.getSession).not.toHaveBeenCalled();
  s.select(owner); s.client.auth.getSession.mockResolvedValueOnce({ data: { session: fixtureSession(other) }, error: null });
  expect(await s.reader(context, new AbortController().signal)).toBeNull(); expect(s.client.rpc).not.toHaveBeenCalled();
});
it('ignores a session resolving after account change or cancellation', async () => {
  const s = setup(); let finish!: (r: Awaited<ReturnType<typeof s.client.auth.getSession>>) => void;
  s.client.auth.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const abort = new AbortController(); const pending = s.reader(context, abort.signal); s.select(other); abort.abort();
  finish({ data: { session: fixtureSession() }, error: null }); expect(await pending).toBeNull(); expect(s.client.rpc).not.toHaveBeenCalled();
});
it('snapshots the requested context before asynchronous token resolution', async () => {
  const s = setup(); let finish!: (r: Awaited<ReturnType<typeof s.client.auth.getSession>>) => void;
  s.client.auth.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const requested = { ...context }; const pending = s.reader(requested, new AbortController().signal); requested.policyId = 'changed';
  finish({ data: { session: fixtureSession() }, error: null }); expect(await pending).toEqual(snapshot);
  expect(s.client.rpc).toHaveBeenCalledWith('intelligence_consent_revision_v1', { p_policy_id: 'policy' }, { get: true });
});
it('fails closed on missing or rejected auth state', async () => {
  const s = setup(); s.client.auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
  expect(await s.reader(context, new AbortController().signal)).toBeNull(); s.client.auth.getSession.mockRejectedValueOnce(new Error('offline'));
  expect(await s.reader(context, new AbortController().signal)).toBeNull(); expect(s.client.rpc).not.toHaveBeenCalled();
});
it('the actual installed SDK preserves the explicit original-account Authorization header', async () => {
  // Synthetic client and intercepted fetch only. No real URL request or credentials.
  const fetcher = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-owner-token');
    return new Response(JSON.stringify(snapshot), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  const client = createClient('https://anyvo-fixture.invalid', 'synthetic-public-fixture', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetcher } });
  jest.spyOn(client.auth, 'getSession').mockResolvedValueOnce({ data: { session: fixtureSession() }, error: null })
    .mockResolvedValue({ data: { session: fixtureSession(other, 'synthetic-other-token') }, error: null });
  const reader = createConsentRevisionRpcReader(client, () => owner, 'intelligence_consent_revision_v1');
  expect(await reader(context, new AbortController().signal)).toEqual(snapshot); expect(fetcher).toHaveBeenCalledTimes(1);
  client.auth.stopAutoRefresh();
});

it('does not accept an invalid SDK response status as a successful read', async () => {
  const s = setup(); s.reply.status = Number.NaN; expect(await s.reader(context, new AbortController().signal)).toBeNull();
});
it('fails closed if current account resolution throws', async () => {
  const s = setup(); const reader = createConsentRevisionRpcReader(s.client as unknown as SupabaseClient, () => { throw new Error('disposed'); }, 'intelligence_consent_revision_v1');
  expect(await reader(context, new AbortController().signal)).toBeNull(); expect(s.client.rpc).not.toHaveBeenCalled();
});

import { createClient, type Session } from '@supabase/supabase-js';
import { createCandidateIntelligenceRuntime } from '../deploymentRuntime';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const dog = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const policy = { id: 'p', enabled: true, providerLabel: 'Review fixture', disclosure: 'Separate text and audio', retentionSummary: 'Fixture', monthlyBudgetChfCents: 500 };
it('runs consent, speech review and explicit chat through real SDK and intercepted local HTTP only', async () => {
  const rpcNames: string[] = [];
  const client = createClient('https://fixture.supabase.co', 'synthetic-public', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url: RequestInfo | URL) => {
      const name = String(url).split('/').pop()!.split('?')[0]; rpcNames.push(name);
      const body = name === 'intelligence_consent_revision_v1' ? { version: 1, accountId: owner, policyId: 'p', exists: false, revision: 0 }
        : { version: 1, accountId: owner, policyId: 'p', text: true, audio: true, revision: 1, grantedAt: '2026-10-23T10:00:00Z' };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } } });
  const auth = jest.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'synthetic-original-token', user: { id: owner } } as Session }, error: null });
  const fetcher = jest.fn(async (url: string, init: RequestInit) => {
    const raw = url.endsWith('intelligence-transcribe') ? { version: 1, requestId: owner, text: 'Heute ging es gut.' }
      : { version: 1, requestId: owner, dogId: dog, policyId: 'p', text: 'Wie war euer Spaziergang?', sources: [] };
    const body = JSON.stringify(raw);
    expect((init.headers as Record<string,string>).Authorization).toBe('Bearer synthetic-original-token');
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) } });
  });
  const take = { start: jest.fn(), bytes: async () => new Uint8Array(46), close: jest.fn(async () => true) };
  const pcm = { available: () => true, permitted: jest.fn(async () => true), recover: async () => true, prepare: async () => take };
  const runtime = createCandidateIntelligenceRuntime({ ownerId: owner, dogId: dog }, { client, projectUrl: 'https://fixture.supabase.co', publicKey: 'synthetic-public', fetcher,
    storage: { getItem: async () => null, setItem: async () => {} }, uuid: () => owner, currentAccount: () => owner, pcm, audioIdle: () => true });
  expect(auth).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled(); expect(pcm.permitted).not.toHaveBeenCalled();
  expect(await runtime.speech!.start()).toBe(false); runtime.configurePolicy(policy);
  expect(await runtime.consent.loadRevision()).toBe(true); expect(await runtime.consent.grant(true, true)).toBe(true);
  expect(await runtime.speech!.start()).toBe(true);
  expect(await ('finish' in runtime.speech! ? runtime.speech!.finish!() : false)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1); expect(runtime.session.snapshot().phase).toBe('reviewing');
  expect(runtime.session.confirmTranscript('Heute ging es gut.')).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(await runtime.session.send()).toBe(true); expect(fetcher).toHaveBeenCalledTimes(2);
  expect(runtime.session.snapshot().messages.at(-1)?.text).toBe('Wie war euer Spaziergang?');
  expect(rpcNames).toEqual(['intelligence_consent_revision_v1', 'intelligence_consent_grant_v1']);
  runtime.dispose(); auth.mockRestore();
});

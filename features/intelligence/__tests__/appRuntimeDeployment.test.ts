import type { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { createAppIntelligenceRuntime, loadAppIntelligencePolicy } from '../appRuntime';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dog = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const policy = { id: 'cf-fixture', enabled: true, providerLabel: 'Cloudflare fixture',
  disclosure: 'Separate text and audio', retentionSummary: 'Fixture only', monthlyBudgetChfCents: 500 };
let mockReady = false;
let mockAudioIdle = true;
let mockSequence = 0;
const mockNativeLoaded = jest.fn();
const mockTake = { start: jest.fn(), bytes: jest.fn(async () => new Uint8Array(46)), close: jest.fn(async () => true) };
const mockPcm = { available: () => true, permitted: jest.fn(async () => true),
  recover: jest.fn(async () => true), prepare: jest.fn(async () => mockTake) };
const mockCreatePcm = jest.fn((..._args: unknown[]) => mockPcm);
const mockRpcNames: string[] = [];
jest.mock('../releaseGate', () => ({ conversationReleaseReady: () => mockReady }));
jest.mock('../expoPcmCapture', () => {
  mockNativeLoaded();
  return { createExpoPcmCapture: (...args: unknown[]) => mockCreatePcm(...args), intelligenceAudioIdle: () => mockAudioIdle };
});
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `dddddddd-dddd-4ddd-8ddd-${String(++mockSequence).padStart(12, '0')}` }));
jest.mock('@/lib/supabase', () => {
  const { createClient } = jest.requireActual<typeof import('@supabase/supabase-js')>('@supabase/supabase-js');
  return { SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'synthetic-public',
    supabase: createClient('https://fixture.supabase.co', 'synthetic-public', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: async (url: RequestInfo | URL) => {
        const name = String(url).split('/').pop()!.split('?')[0]; mockRpcNames.push(name);
        const data = name === 'intelligence_policy_v1' ? { version: 1, policy }
          : name === 'intelligence_consent_revision_v1'
            ? { version: 1, accountId: owner, policyId: policy.id, exists: false, revision: 0 }
            : { version: 1, accountId: owner, policyId: policy.id, text: true, audio: true, revision: 1, grantedAt: '2026-10-24T10:00:00Z' };
        return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } },
    }) };
});
const originalFetch = global.fetch;
const mockFetch = jest.fn(async (_url: string, init: RequestInit) => {
  const headers = init.headers as Record<string, string>;
  const data = headers['Content-Type'] === 'audio/wav'
    ? { version: 1, requestId: headers['X-Request-Id'], text: 'Unser Spaziergang war schön.' }
    : { version: 1, requestId: JSON.parse(init.body as string).requestId, dogId: dog, policyId: policy.id,
      text: 'Was hat euch besonders gefallen?', sources: [] };
  return jsonResponse(data);
});
function jsonResponse(data: unknown, status = 200) {
  const body = JSON.stringify(data);
  return new Response(body, { status, headers: { 'Content-Type': 'application/json', 'Content-Length': String(body.length) } });
}
let auth: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks(); mockReady = false; mockAudioIdle = true; mockSequence = 0; mockRpcNames.length = 0;
  global.fetch = mockFetch as typeof fetch;
  auth = jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({
    data: { session: { access_token: 'synthetic-original-token', user: { id: owner } } as Session }, error: null,
  });
});
afterEach(() => { auth.mockRestore(); global.fetch = originalFetch; });
async function allowed(currentAccount: () => string | null = () => owner) {
  mockReady = true;
  const runtime = createAppIntelligenceRuntime({ ownerId: owner, dogId: dog }, currentAccount);
  runtime.configurePolicy(await loadAppIntelligencePolicy(owner, currentAccount, new AbortController().signal));
  expect(await runtime.consent.loadRevision()).toBe(true);
  expect(await runtime.consent.grant(true, true)).toBe(true);
  return runtime;
}

it('does not even load native audio or create live ports while the release gate is closed', async () => {
  const runtime = createAppIntelligenceRuntime({ ownerId: owner, dogId: dog }, () => owner);
  expect(mockNativeLoaded).not.toHaveBeenCalled(); expect(mockCreatePcm).not.toHaveBeenCalled();
  expect(runtime.speech).toBeNull(); expect(await runtime.session.send()).toBe(false);
  expect(auth).not.toHaveBeenCalled(); expect(mockFetch).not.toHaveBeenCalled();
  expect(AsyncStorage.getItem).not.toHaveBeenCalled(); runtime.dispose();
});

it('constructs the released ports without network, permission, recording or storage work before server policy', async () => {
  mockReady = true;
  const runtime = createAppIntelligenceRuntime({ ownerId: owner, dogId: dog }, () => owner);
  expect(mockCreatePcm).toHaveBeenCalledWith(AsyncStorage, expect.any(Function));
  expect(runtime.speech).not.toBeNull(); expect(runtime.session.snapshot().policy).toBeNull();
  expect(await runtime.speech!.start()).toBe(false); expect(await runtime.session.send()).toBe(false);
  expect(auth).not.toHaveBeenCalled(); expect(mockRpcNames).toEqual([]); expect(mockFetch).not.toHaveBeenCalled();
  expect(mockPcm.permitted).not.toHaveBeenCalled(); expect(mockPcm.prepare).not.toHaveBeenCalled();
  expect(AsyncStorage.getItem).not.toHaveBeenCalled(); runtime.dispose();
});

it('connects actual app policy, consent, audio review and explicit chat to the authenticated Supabase gateways only', async () => {
  const runtime = await allowed();
  expect(mockRpcNames).toEqual(['intelligence_policy_v1', 'intelligence_consent_revision_v1', 'intelligence_consent_grant_v1']);
  expect(mockFetch).not.toHaveBeenCalled();
  expect(await runtime.speech!.start()).toBe(true); expect(mockTake.start).toHaveBeenCalledTimes(1);
  expect(await (runtime.speech && 'finish' in runtime.speech ? runtime.speech.finish() : false)).toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockTake.close).toHaveBeenCalledTimes(1); expect(runtime.session.snapshot().phase).toBe('reviewing');
  expect(runtime.session.confirmTranscript('Unser Spaziergang war schön.')).toBe(true);
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(await runtime.session.send()).toBe(true); expect(mockFetch).toHaveBeenCalledTimes(2);
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
    'https://fixture.supabase.co/functions/v1/intelligence-transcribe',
    'https://fixture.supabase.co/functions/v1/intelligence-respond',
  ]);
  for (const [, init] of mockFetch.mock.calls) {
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer synthetic-original-token');
    expect(init.redirect).toBe('error');
  }
  expect(runtime.session.snapshot().messages.at(-1)?.text).toBe('Was hat euch besonders gefallen?');
  runtime.dispose();
});

it('keeps DAILY_LIMIT_REACHED as a denied operation without retry or fallback', async () => {
  const runtime = await allowed(); runtime.session.editInput('Was können wir heute machen?');
  mockFetch.mockResolvedValueOnce(jsonResponse({ version: 1, error: { code: 'DAILY_LIMIT_REACHED' } }, 429));
  expect(await runtime.session.send()).toBe(false);
  expect(runtime.session.snapshot().error).toBe('DAILY_LIMIT_REACHED'); expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockPcm.permitted).not.toHaveBeenCalled(); runtime.dispose();
});

it('blocks another audio owner and account switches, and never resumes capture automatically', async () => {
  let account: string | null = owner;
  const runtime = await allowed(() => account);
  mockAudioIdle = false; expect(await runtime.speech!.start()).toBe(false);
  expect(mockPcm.permitted).not.toHaveBeenCalled();
  mockAudioIdle = true; expect(await runtime.speech!.start()).toBe(true);
  account = null; runtime.interrupt();
  expect(await (runtime.speech && 'finish' in runtime.speech ? runtime.speech.finish() : false)).toBe(false);
  expect(await runtime.session.send()).toBe(false);
  await Promise.resolve(); expect(mockTake.close).toHaveBeenCalledTimes(1); expect(mockFetch).not.toHaveBeenCalled();
  account = owner; expect(await runtime.speech!.start()).toBe(false);
  expect(mockTake.start).toHaveBeenCalledTimes(1); runtime.dispose();
});

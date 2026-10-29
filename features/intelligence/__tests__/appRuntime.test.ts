import { createAppIntelligenceRuntime, loadAppIntelligencePolicy } from '../appRuntime';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
beforeEach(() => jest.clearAllMocks());
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') }));
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('binds the app storage and confirmed RPC reader while all nondeployed ports and policy remain denied', async () => {
  const runtime = createAppIntelligenceRuntime({ ownerId: owner, dogId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, () => owner);
  expect(runtime.session.snapshot().policy).toBeNull(); expect(runtime.speech).toBeNull();
  expect(await runtime.consent.loadRevision()).toBe(false); expect(await runtime.consent.grant(true, true)).toBe(false);
  expect(await runtime.session.send()).toBe(false); expect(supabase.rpc).not.toHaveBeenCalled();
  expect(supabase.auth.getSession).not.toHaveBeenCalled(); expect(AsyncStorage.getItem).not.toHaveBeenCalled(); expect(AsyncStorage.setItem).not.toHaveBeenCalled(); runtime.dispose();
});

it('fails closed when the existing SDK policy RPC is not deployed', async () => {
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  jest.mocked(supabase.auth.getSession).mockResolvedValueOnce({ data: { session: null }, error: null });
  expect(await loadAppIntelligencePolicy(owner, () => owner, new AbortController().signal)).toBeNull();
  expect(supabase.rpc).not.toHaveBeenCalled();
});

it('loads actual app policy and binds it to BOTH session and SDK consent ports, then closes both on removal', async () => {
  const account = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const policy = { id: 'p', enabled: true, providerLabel: 'Test provider', disclosure: 'D', retentionSummary: 'R', monthlyBudgetChfCents: 500 };
  const session = { access_token: 'synthetic-token', user: { id: account } } as Session;
  jest.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null });
  const query = (data: unknown) => Object.assign(Promise.resolve({ data, status: 200, error: null }), { setHeader: jest.fn().mockReturnThis(), abortSignal: jest.fn().mockReturnThis(), retry: jest.fn().mockReturnThis() }) as unknown as ReturnType<typeof supabase.rpc>;
  jest.mocked(supabase.rpc).mockReturnValueOnce(query({ version: 1, policy }))
    .mockReturnValueOnce(query({ version: 1, accountId: account, policyId: 'p', exists: false, revision: 0 }))
    .mockReturnValueOnce(query({ version: 1, accountId: account, policyId: 'p', text: true, audio: false, revision: 1, grantedAt: '2026-10-23T08:00:00Z' }));
  jest.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  const runtime = createAppIntelligenceRuntime({ ownerId: account, dogId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, () => account);
  expect(runtime.session.snapshot().policy).toBeNull();
  runtime.configurePolicy(await loadAppIntelligencePolicy(account, () => account, new AbortController().signal));
  expect(await runtime.consent.loadRevision()).toBe(true); expect(await runtime.consent.grant(true, false)).toBe(true);
  expect(runtime.session.snapshot().consent).toEqual({ text: true, audio: false }); expect(supabase.rpc).toHaveBeenCalledTimes(3);
  expect(supabase.rpc).toHaveBeenLastCalledWith('intelligence_consent_grant_v1', expect.objectContaining({ p_policy_id: 'p', p_expected_revision: 0 }), { get: false });
  runtime.configurePolicy(null); expect(runtime.session.snapshot().consent).toBeNull(); expect(await runtime.consent.loadRevision()).toBe(false); expect(supabase.rpc).toHaveBeenCalledTimes(3); runtime.dispose();
});

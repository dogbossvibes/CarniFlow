// This exact file is also executed against the immutable 256 source copy.
// Positive assertions are unchanged: historical defects must turn RED -> GREEN.
// Native capture is unavailable in this SDK/RPC regression fixture; its app
// integration is exercised separately by appRuntimeDeployment and capture tests.
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import Route from '../../../app/intelligence';
import { supabase } from '@/lib/supabase';
import { IntelligenceConversation } from '../IntelligenceConversation';
import { IntelligenceSession } from '../session';
import { IntelligenceConsentController } from '../consentController';
import { createConsentOutbox } from '../consentOutbox';
import { createConsentRpcGateway } from '../consentRpcGateway';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { conversationCopy as copy } from '../copy';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const dog = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const policy = { id: 'p', enabled: true, providerLabel: 'Test provider', disclosure: 'D', retentionSummary: 'R', monthlyBudgetChfCents: 500 };
let mockRaw: string | null = null; let mockNoDogs = false; let mockUnknown = false;
const mockRequests: string[] = [];
async function mockFetch(url: RequestInfo | URL, init?: RequestInit) {
  const rpc = String(url).split('/').pop()!.split('?')[0]; mockRequests.push(rpc);
  let body: unknown;
  if (rpc === 'intelligence_policy_v1') body = { version: 1, policy };
  else if (rpc === 'intelligence_consent_revision_v1') body = { version: 1, accountId: owner, policyId: 'p', exists: false, revision: 0 };
  else if (rpc === 'intelligence_consent_grant_v1') {
    if (mockUnknown) throw new TypeError('synthetic unknown outcome');
    body = { version: 1, accountId: owner, policyId: 'p', text: true, audio: false, revision: 1, grantedAt: '2026-10-23T09:00:00Z' };
  } else if (rpc === 'intelligence_consent_revoke_v1') {
    body = { version: 1, accountId: owner, policyId: JSON.parse(String(init?.body)).p_policy_id, revoked: true, revision: 2, revokedAt: '2026-10-23T09:00:00Z' };
  } else throw new Error('Unexpected fixture RPC');
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
jest.mock('@/lib/supabase', () => {
  const { createClient } = jest.requireActual('@supabase/supabase-js');
  return { supabase: createClient('https://anyvo-fixture.invalid', 'synthetic-public', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (url: RequestInfo | URL, init?: RequestInit) => mockFetch(url, init) } }) };
});
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(async () => mockRaw), setItem: jest.fn(async (_key: string, value: string) => { mockRaw = value; }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } }, loading: false }) }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => ({ dogs: mockNoDogs ? [] : [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Malu' }], loading: false, error: null, refresh: jest.fn() }) }));
jest.mock('../releaseGate', () => ({ conversationReleaseReady: () => true }));
jest.mock('../expoPcmCapture', () => ({
  createExpoPcmCapture: () => ({ available: () => false, permitted: async () => false,
    recover: async () => true, prepare: async () => { throw new Error('No native audio in RPC fixture'); } }),
  intelligenceAudioIdle: () => true,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ canGoBack: () => true, back: jest.fn(), replace: jest.fn() }), useFocusEffect: (fn: () => unknown) => { jest.requireActual('react').useEffect(fn, [fn]); } }));
let renderer: ReactTestRenderer;
const button = (label: string) => renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = async (label: string) => { await act(async () => button(label).props.onPress()); };
beforeEach(() => {
  mockRaw = null; mockNoDogs = false; mockUnknown = false; mockRequests.length = 0;
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
  jest.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: { access_token: 'synthetic-token', user: { id: owner } } as Session }, error: null });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); jest.restoreAllMocks(); });
it('P2-1 actual app route uses late policy for the revision SDK request', async () => {
  await act(async () => { renderer = TestRenderer.create(<Route />); }); await press('Malu'); await press(copy.readRevision);
  expect(mockRequests.filter(r => r === 'intelligence_consent_revision_v1')).toHaveLength(1);
});
it('P2-2 unknown grant keeps a working explicit revoke in the controlled UI', async () => {
  const session = new IntelligenceSession({ respond: async () => null }, () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'); session.selectScope({ ownerId: owner, dogId: dog }); session.configure(policy);
  const consent = new IntelligenceConsentController(session, createConsentOutbox(AsyncStorage), createConsentRpcGateway(supabase, () => owner), () => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await act(async () => { renderer = TestRenderer.create(<IntelligenceConversation session={session} consent={consent} speech={null} identity={{ accountId: owner, dogId: dog, dogName: 'Malu' }} onBack={() => {}} />); });
  await press(copy.readRevision); await act(async () => renderer.root.findAll(n => n.props.accessibilityLabel === copy.textConsent && typeof n.props.onValueChange === 'function')[0].props.onValueChange(true));
  mockUnknown = true; await press(copy.agree); expect(consent.canRetryGrant()).toBe(true); expect(session.snapshot().consent).toBeNull();
  expect(button(copy.revoke)).toBeDefined(); await press(copy.revoke); expect(mockRequests.filter(r => r === 'intelligence_consent_revoke_v1')).toHaveLength(1);
});
it('P2-3 account privacy can transmit a durable revoke without any dog', async () => {
  mockNoDogs = true; mockRaw = JSON.stringify([{ accountId: owner, policyId: 'old-policy' }]);
  await act(async () => { renderer = TestRenderer.create(<Route />); });
  expect(button('Datenschutz & Widerrufe')).toBeDefined(); await press('Datenschutz & Widerrufe'); await press('Ausstehende Widerrufe übertragen');
  expect(mockRaw).toBe('[]'); expect(mockRequests).toEqual(['intelligence_consent_revoke_v1']);
});

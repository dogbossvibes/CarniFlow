import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import Route from '../../../app/intelligence';
import { IntelligenceEntry } from '../IntelligenceEntry';
import { assistantCopy } from '../assistantCopy';
import { conversationReleaseReady, INTELLIGENCE_RELEASE } from '../releaseGate';
import { createAppIntelligenceRuntime, loadAppIntelligencePolicy, createAppAccountConsentPrivacy } from '../appRuntime';
import { createIntelligenceRouteRuntime, type IntelligenceRouteRuntime } from '../routeRuntime';
import { routeCopy as copy } from '../routeCopy';
import { conversationCopy as conversation } from '../copy';
import { createAccountConsentPrivacy } from '../accountPrivacyRuntime';
import type { ConsentIntent } from '../consent';
import type { ConversationRequest } from '../contract';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const dog = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otherDog = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
let mockSession: { session: { user: { id: string } } | null; loading: boolean };
let mockDogs: { dogs: { id: string; owner_id: string; name: string }[]; loading: boolean; error: string | null; refresh: jest.Mock };
const mockPush = jest.fn(); const mockBack = jest.fn(); const mockReplace = jest.fn(); let mockCanBack = true;
let mockFocus: (() => void | (() => void)) | undefined; let mockBlur: (() => void) | undefined;
const mockUseDogs = jest.fn(() => mockDogs);
jest.mock('@/hooks/useSession', () => ({ useSession: () => mockSession }));
jest.mock('@/hooks/useDogs', () => ({ useDogs: () => mockUseDogs() }));
jest.mock('../appRuntime', () => ({ createAppIntelligenceRuntime: jest.fn(), loadAppIntelligencePolicy: jest.fn(), createAppAccountConsentPrivacy: jest.fn() }));
jest.mock('../releaseGate', () => {
  const actual = jest.requireActual('../releaseGate'); return { ...actual, conversationReleaseReady: jest.fn(actual.conversationReleaseReady) };
});
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace, canGoBack: () => mockCanBack }),
  useFocusEffect: (fn: () => void | (() => void)) => {
    mockFocus = fn;
    jest.requireActual('react').useEffect(() => { const cleanup = fn(); mockBlur = cleanup || undefined; return cleanup; }, [fn]);
  },
}));
let mockRespond: jest.Mock<Promise<unknown>, [ConversationRequest, AbortSignal]>;
let mockPort: { available: jest.Mock; permitted: jest.Mock<Promise<boolean>, []>; start: jest.Mock; stop: jest.Mock; abort: jest.Mock };
let renderer: ReactTestRenderer; let runtimes: IntelligenceRouteRuntime[]; let appListeners: Set<(s: AppStateStatus) => void>;
const factory = jest.mocked(createAppIntelligenceRuntime);
const gate = jest.mocked(conversationReleaseReady);
const policyReader = jest.mocked(loadAppIntelligencePolicy);
const privacyFactory = jest.mocked(createAppAccountConsentPrivacy);
let mockPrivacyRaw: string | null;
const mockPrivacyRevoke = jest.fn(async (record: { accountId: string; policyId: string }) => ({ version: 1, ...record, revoked: true, revision: 1, revokedAt: '2026-10-23T09:00:00Z' }));
const text = () => renderer.root.findAll(() => true).flatMap(n => Array.isArray(n.props.children) ? n.props.children : [n.props.children]).filter(v => typeof v === 'string').join(' ');
const button = (label: string) => renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const input = () => renderer.root.findAll(n => n.props.accessibilityLabel === conversation.input && typeof n.props.onChangeText === 'function')[0];
const press = async (label: string) => { await act(async () => button(label).props.onPress()); };
const mount = async () => { await act(async () => { renderer = TestRenderer.create(<Route />); }); };
const update = async () => { await act(async () => renderer.update(<Route />)); };
const grant = async (audio = false) => {
  await press(conversation.readRevision);
  await act(async () => renderer.root.findAll(n => n.props.accessibilityLabel === conversation.textConsent && typeof n.props.onValueChange === 'function')[0].props.onValueChange(true));
  if (audio) await act(async () => renderer.root.findAll(n => n.props.accessibilityLabel === conversation.audioConsent && typeof n.props.onValueChange === 'function')[0].props.onValueChange(true));
  await press(conversation.agree);
};
beforeEach(() => {
  jest.clearAllMocks(); runtimes = []; appListeners = new Set(); mockCanBack = true; mockFocus = undefined; mockBlur = undefined;
  mockSession = { session: { user: { id: owner } }, loading: false };
  mockDogs = { dogs: [{ id: dog, owner_id: owner, name: 'Malu' }, { id: otherDog, owner_id: other, name: 'Foreign dog' }], loading: false, error: null, refresh: jest.fn() };
  gate.mockImplementation(jest.requireActual('../releaseGate').conversationReleaseReady);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => { appListeners.add(cb); return { remove: () => { appListeners.delete(cb); } }; });
  mockRespond = jest.fn<Promise<unknown>, [ConversationRequest, AbortSignal]>(async req => ({ version: 1, requestId: req.requestId, dogId: req.dogId, policyId: req.policyId, text: 'Answer for Malu', sources: [] }));
  mockPort = { available: jest.fn(() => true), permitted: jest.fn(async () => true), start: jest.fn(), stop: jest.fn(), abort: jest.fn() };
  policyReader.mockResolvedValue({ id: 'p1', enabled: true, providerLabel: 'Test provider', disclosure: 'Test disclosure', retentionSummary: 'Test retention', monthlyBudgetChfCents: 500 });
  mockPrivacyRaw = null;
  privacyFactory.mockImplementation((account, currentAccount) => createAccountConsentPrivacy(account, currentAccount, {
    getItem: async () => mockPrivacyRaw, setItem: async (_key, value) => { mockPrivacyRaw = value; },
  }, { readRevision: async () => null, grant: async () => null, revoke: mockPrivacyRevoke }));
  factory.mockImplementation((scope, currentAccount) => {
    let seq = 0;
    const r = createIntelligenceRouteRuntime(scope, {
      storage: { getItem: async () => null, setItem: async () => {} }, currentAccount,
      policy: { id: 'p1', enabled: true, providerLabel: 'Test provider', disclosure: 'Test disclosure', retentionSummary: 'Test retention', monthlyBudgetChfCents: 500 },
      uuid: () => `eeeeeeee-eeee-4eee-8eee-${(++seq).toString().padStart(12, '0')}`,
      gateway: { respond: mockRespond },
      speech: { port: mockPort, audioIdle: () => true },
      consentGateway: {
        readRevision: async ctx => ({ version: 1, ...ctx, exists: false, revision: 0 }),
        grant: async (i: ConsentIntent) => ({ version: 1, accountId: i.accountId, policyId: i.policyId, text: i.text, audio: i.audio, revision: i.expectedRevision + 1, grantedAt: '2026-10-23T08:00:00Z' }),
        revoke: async () => null,
      },
    }); runtimes.push(r); return r;
  });
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); runtimes.forEach(r => r.dispose()); jest.restoreAllMocks(); });

it('mounts the discovered app route safely locked without dog queries, runtime, composer or permissions', async () => {
  await mount(); expect(text()).toContain(copy.locked); expect(button(conversation.speak)).toBeUndefined();
  expect(button(conversation.agree)).toBeUndefined(); expect(input()).toBeUndefined(); expect(mockUseDogs).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
});
it('requires all three independent source gates and defaults to false', () => {
  const actual = jest.requireActual('../releaseGate'); expect(actual.conversationReleaseReady()).toBe(false); expect(Object.isFrozen(INTELLIGENCE_RELEASE)).toBe(true);
  for (const key of Object.keys(INTELLIGENCE_RELEASE)) expect(actual.conversationReleaseReady({ serverDeployed: true, independentReviewApproved: true, globalBudgetVerified: true, [key]: false })).toBe(false);
  expect(actual.conversationReleaseReady({ serverDeployed: true, independentReviewApproved: true, globalBudgetVerified: true })).toBe(true);
});
it('does not query dogs during session loading and provides sign-in for a deep link without account', async () => {
  mockSession.loading = true; await mount(); expect(text()).toContain(copy.loading);
  mockSession = { session: null, loading: false }; await update(); expect(text()).toContain(copy.login); await press(copy.signIn);
  expect(mockReplace).toHaveBeenCalledWith('/(auth)/login'); expect(mockUseDogs).not.toHaveBeenCalled();
});
it('returns safely from a cold-start link without an existing back stack', async () => {
  mockCanBack = false; await mount(); await press(copy.back); expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home'); expect(mockBack).not.toHaveBeenCalled();
});
it('supplies an optional navigation entry without activating or constructing the runtime', async () => {
  await act(async () => { renderer = TestRenderer.create(<IntelligenceEntry />); }); await press(copy.title);
  expect(mockPush).toHaveBeenCalledWith('/intelligence'); expect(factory).not.toHaveBeenCalled();
});
it('selects only an owned dog before mounting the controlled conversation', async () => {
  gate.mockReturnValue(true); await mount(); expect(button('Foreign dog')).toBeUndefined(); expect(factory).not.toHaveBeenCalled();
  await press('Malu'); expect(factory).toHaveBeenCalledTimes(1); expect(factory.mock.calls[0][0]).toEqual({ ownerId: owner, dogId: dog });
  expect(text()).toContain(conversation.privacy); expect(input()).toBeUndefined();
});
it('keeps one authenticated runtime, policy read and in-flight answer across both host layouts', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant();
  let finish!: (value: unknown) => void;
  mockRespond.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => input().props.onChangeText('Frage im Begleiter')); await press(conversation.send);
  const [request, signal] = mockRespond.mock.calls[0];
  await press(assistantCopy.expand); await press(assistantCopy.collapse); await press(assistantCopy.expand);
  expect(factory).toHaveBeenCalledTimes(1); expect(policyReader).toHaveBeenCalledTimes(1);
  expect(mockRespond).toHaveBeenCalledTimes(1); expect(signal.aborted).toBe(false);
  await act(async () => finish({ version: 1, requestId: request.requestId, dogId: request.dogId, policyId: request.policyId, text: 'Im selben Gespräch', sources: [] }));
  expect(text()).toContain('Im selben Gespräch'); expect(runtimes[0].session.snapshot().messages).toHaveLength(2);
});
it('fails closed on offline dog loading with explicit refresh and no runtime', async () => {
  gate.mockReturnValue(true); mockDogs.error = 'offline'; await mount(); expect(text()).toContain(copy.dogsFailed); await press(copy.retry);
  expect(mockDogs.refresh).toHaveBeenCalledTimes(1); expect(factory).not.toHaveBeenCalled();
});
it('hides old account messages synchronously and disposes its runtime on logout', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant();
  await act(async () => input().props.onChangeText('A private question')); await press(conversation.send); expect(text()).toContain('Answer for Malu');
  mockSession = { session: null, loading: false }; await update(); expect(text()).not.toContain('Answer for Malu'); expect(text()).not.toContain('A private question');
  expect(runtimes[0].session.snapshot().scope).toBeNull(); expect(input()).toBeUndefined();
});
it('does not relabel old messages with a new account or use foreign dogs during account switch', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(); await act(async () => input().props.onChangeText('Old private text'));
  mockSession = { session: { user: { id: other } }, loading: false }; await update();
  expect(text()).not.toContain('Old private text'); expect(button('Malu')).toBeUndefined(); expect(runtimes[0].session.snapshot().scope).toBeNull();
});
it('clears consent and draft on route blur and never automatically sends or restores consent on refocus', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(); await act(async () => input().props.onChangeText('Unsaved draft'));
  await act(async () => mockBlur?.()); expect(input()).toBeUndefined(); expect(runtimes[0].session.snapshot()).toMatchObject({ input: '', consent: null });
  await act(async () => { mockFocus?.(); }); expect(input()).toBeUndefined(); expect(text()).toContain(conversation.privacy);
});
it('stops on background and resumes without automatic consent restoration', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant();
  await act(async () => { [...appListeners].forEach(cb => cb('background')); });
  expect(runtimes[0].session.snapshot().consent).toBeNull(); expect(input()).toBeUndefined();
  await act(async () => { [...appListeners].forEach(cb => cb('active')); }); expect(input()).toBeUndefined();
});
it('unmounts and disposes the old dog session before returning to the dog picker', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(); await press(assistantCopy.close);
  expect(runtimes[0].session.snapshot().scope).toBeNull(); expect(text()).toContain(copy.chooseDog); expect(factory).toHaveBeenCalledTimes(1);
});
it('withdraws the entire runtime when a release gate closes', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(); gate.mockReturnValue(false); await update();
  expect(text()).toContain(copy.locked); expect(input()).toBeUndefined(); expect(runtimes[0].session.snapshot().scope).toBeNull();
});
it('removes route AppState subscriptions on exit', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); expect(appListeners.size).toBeGreaterThan(0);
  await act(async () => renderer.unmount()); expect(appListeners.size).toBe(0);
});

it('cancels a pending microphone permission on route blur without recording on refocus', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(true);
  let answer!: (v: boolean) => void; mockPort.permitted.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  await press(conversation.speak); expect(mockPort.permitted).toHaveBeenCalledTimes(1);
  await act(async () => mockBlur?.()); await act(async () => answer(true));
  expect(mockPort.start).not.toHaveBeenCalled(); await act(async () => { mockFocus?.(); });
  expect(button(conversation.speak)).toBeUndefined(); expect(mockPort.permitted).toHaveBeenCalledTimes(1);
});
it('shows permission denial and keeps text entry available without requesting again', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(true); mockPort.permitted.mockResolvedValueOnce(false);
  await press(conversation.speak); expect(text()).toContain(conversation.speechDenied); expect(input()).toBeDefined();
  expect(mockPort.start).not.toHaveBeenCalled(); expect(mockPort.permitted).toHaveBeenCalledTimes(1);
});
it('retains a failed offline question and performs no automatic resend', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(); mockRespond.mockRejectedValueOnce(new Error('offline'));
  await act(async () => input().props.onChangeText('Keep my question')); await press(conversation.send);
  expect(input().props.value).toBe('Keep my question'); expect(text()).toContain(conversation.errors.NETWORK); expect(mockRespond).toHaveBeenCalledTimes(1);
});
it('aborts a pending answer on leaving and never shows its late reply in another dog session', async () => {
  gate.mockReturnValue(true); await mount(); await press('Malu'); await grant(); let finish!: (v: unknown) => void;
  mockRespond.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => input().props.onChangeText('Question')); await press(conversation.send);
  const [req, signal] = mockRespond.mock.calls[0]; await press(assistantCopy.close); expect(signal.aborted).toBe(true);
  await act(async () => finish({ version: 1, requestId: req.requestId, policyId: req.policyId, dogId: req.dogId, text: 'Stale answer', sources: [] }));
  await press('Malu'); expect(text()).not.toContain('Stale answer'); expect(input()).toBeUndefined(); expect(mockRespond).toHaveBeenCalledTimes(1);
});

it('does not mount consent controls when the real policy adapter returns disabled or fails', async () => {
  gate.mockReturnValue(true); policyReader.mockResolvedValueOnce(null); await mount(); await press('Malu');
  expect(text()).toContain(copy.unavailable); expect(button(conversation.agree)).toBeUndefined();
  policyReader.mockRejectedValueOnce(new Error('offline')); await press(copy.retry); expect(text()).toContain(copy.unavailable);
  expect(mockRespond).not.toHaveBeenCalled(); expect(mockPort.permitted).not.toHaveBeenCalled();
});
it('aborts pending policy lookup on exit and ignores its late enabled result', async () => {
  gate.mockReturnValue(true); let finish!: (v: Awaited<ReturnType<typeof loadAppIntelligencePolicy>>) => void;
  policyReader.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(); await press('Malu'); expect(text()).toContain(copy.loading);
  const signal = policyReader.mock.calls[0][2]; await press(copy.back); expect(signal.aborted).toBe(true);
  await act(async () => finish({ id: 'late', enabled: true, providerLabel: 'P', disclosure: 'D', retentionSummary: 'R', monthlyBudgetChfCents: 500 }));
  expect(runtimes[0].session.snapshot().policy).toBeNull(); expect(button(conversation.agree)).toBeUndefined();
});

it('offers an explicit privacy-only pending revoke check when the server policy is disabled', async () => {
  gate.mockReturnValue(true); policyReader.mockResolvedValueOnce(null); await mount(); await press('Malu');
  expect(text()).toContain(copy.unavailable); expect(button(conversation.send)).toBeUndefined(); await press(copy.privacy); await press(copy.retryRevocations);
  expect(text()).toContain(copy.privacyConfirmed); expect(mockRespond).not.toHaveBeenCalled(); expect(mockPort.permitted).not.toHaveBeenCalled();
});

it.each(['no dogs', 'dog read error', 'dog read loading', 'chat gate closed'])('can flush a saved revoke with %s and without selecting any dog', async situation => {
  gate.mockReturnValue(situation !== 'chat gate closed');
  if (situation === 'no dogs') mockDogs.dogs = [];
  if (situation === 'dog read error') mockDogs.error = 'offline';
  if (situation === 'dog read loading') mockDogs.loading = true;
  mockPrivacyRaw = JSON.stringify([{ accountId: owner, policyId: 'old-policy' }]);
  await mount(); await press(copy.privacy); expect(text()).toContain(copy.privacyDetail); expect(mockPrivacyRevoke).not.toHaveBeenCalled();
  await press(copy.retryRevocations); expect(mockPrivacyRevoke).toHaveBeenCalledWith({ accountId: owner, policyId: 'old-policy' }, expect.anything());
  expect(mockPrivacyRaw).toBe('[]'); expect(text()).toContain(copy.privacyConfirmed); expect(factory).not.toHaveBeenCalled(); expect(policyReader).not.toHaveBeenCalled();
  expect(mockPort.permitted).not.toHaveBeenCalled(); expect(mockRespond).not.toHaveBeenCalled();
});

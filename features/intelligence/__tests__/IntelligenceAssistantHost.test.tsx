import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Modal, StyleSheet, type AppStateStatus } from 'react-native';
import { IntelligenceAssistantHost } from '../IntelligenceAssistantHost';
import { IntelligenceConversation } from '../IntelligenceConversation';
import { createIntelligenceRouteRuntime, type IntelligenceRouteRuntime } from '../routeRuntime';
import { assistantCopy as hostCopy } from '../assistantCopy';
import { conversationCopy as copy } from '../copy';
import type { ConsentIntent } from '../consent';
import type { ConversationRequest } from '../contract';
import type { SpeechCapturePort } from '../speechCapture';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dog = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const identity = { accountId: owner, dogId: dog, dogName: 'Milo' };
const policy = { id: 'cf-policy', enabled: true, providerLabel: 'Fixture Free provider', disclosure: 'Fixture disclosure', retentionSummary: 'Fixture retention', monthlyBudgetChfCents: 500 };
let renderer: ReactTestRenderer | null;
let listeners: Set<(state: AppStateStatus) => void>;
let runtimes: IntelligenceRouteRuntime[];
const setup = (pcm = false) => {
  let seq = 0;
  const gateway = { respond: jest.fn(async (req: ConversationRequest, _signal: AbortSignal): Promise<unknown> => ({ version: 1, requestId: req.requestId, dogId: req.dogId, policyId: req.policyId, text: 'Eine Antwort für deinen Alltag.', sources: [] })) };
  const consentGateway = {
    readRevision: jest.fn(async (context: { accountId: string; policyId: string }) => ({ version: 1, ...context, exists: false, revision: 0 })),
    grant: jest.fn(async (i: ConsentIntent) => ({ version: 1, accountId: i.accountId, policyId: i.policyId, text: i.text, audio: i.audio, revision: i.expectedRevision + 1, grantedAt: '2026-10-24T09:00:00Z' })),
    revoke: jest.fn(async (context: { accountId: string; policyId: string }) => ({ version: 1, ...context, revoked: true, revision: 2, revokedAt: '2026-10-24T09:01:00Z' })),
  };
  const port = { available: jest.fn(() => true), permitted: jest.fn(async () => true),
    start: jest.fn<void, [Parameters<SpeechCapturePort['start']>[0]]>(), stop: jest.fn(), abort: jest.fn() };
  const take = { start: jest.fn(), bytes: jest.fn(async () => new Uint8Array([1])), close: jest.fn(async () => false) };
  const pcmPort = { available: () => true, permitted: jest.fn(async () => true), recover: jest.fn(async () => true), prepare: jest.fn(async () => take) };
  const transcription = { transcribe: jest.fn(async () => ({ error: 'UNAVAILABLE' as const })) };
  const runtime = createIntelligenceRouteRuntime({ ownerId: owner, dogId: dog }, {
    policy, currentAccount: () => owner, storage: { getItem: async () => null, setItem: async () => {} },
    uuid: () => `cccccccc-cccc-4ccc-8ccc-${(++seq).toString().padStart(12, '0')}`,
    gateway, consentGateway,
    ...(pcm ? { serverSpeech: { port: pcmPort, gateway: transcription, audioIdle: () => true } } : { speech: { port, audioIdle: () => true } }),
  });
  runtimes.push(runtime);
  return { runtime, gateway, consentGateway, port, pcmPort, take, transcription, onClose: jest.fn() };
};
type Setup = ReturnType<typeof setup>;
const button = (label: string) => renderer!.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const input = (label = copy.input) => renderer!.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onChangeText === 'function')[0];
const visible = () => renderer!.root.findAll(() => true).flatMap(n => Array.isArray(n.props.children) ? n.props.children : [n.props.children]).filter(v => typeof v === 'string').join(' ');
const press = async (label: string) => { await act(async () => button(label).props.onPress()); };
const mount = async (s: Setup) => { await act(async () => { renderer = TestRenderer.create(<IntelligenceAssistantHost runtime={s.runtime} identity={identity} onClose={s.onClose} />); }); };
const grant = async (s: Setup, audio = false) => { await act(async () => { await s.runtime.consent.loadRevision(); await s.runtime.consent.grant(true, audio); }); };
beforeEach(() => {
  renderer = null; runtimes = []; listeners = new Set();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listeners.add(callback); return { remove: () => { listeners.delete(callback); } }; });
});
afterEach(() => { if (renderer) act(() => renderer!.unmount()); runtimes.forEach(r => r.dispose()); jest.restoreAllMocks(); });

it('opens compact without loading consent, permissions or a model; disclosure remains visible', async () => {
  const s = setup(); await mount(s);
  expect(visible()).toContain(hostCopy.companion); expect(visible()).toContain(policy.disclosure);
  expect(button(hostCopy.expand)).toBeDefined(); expect(input()).toBeUndefined();
  expect(s.gateway.respond).not.toHaveBeenCalled(); expect(s.consentGateway.readRevision).not.toHaveBeenCalled();
  expect(s.consentGateway.grant).not.toHaveBeenCalled(); expect(s.port.permitted).not.toHaveBeenCalled();
  await press(hostCopy.expand); await press(hostCopy.collapse);
  expect(s.consentGateway.readRevision).not.toHaveBeenCalled(); expect(s.gateway.respond).not.toHaveBeenCalled();
});

it('preserves the mounted conversation, history, draft and consent across repeated layout changes', async () => {
  const s = setup(); await mount(s); await grant(s);
  await act(async () => input().props.onChangeText('Frage zum Alltag')); await press(copy.send);
  await act(async () => input().props.onChangeText('Noch eine ungesendete Frage'));
  const conversation = renderer!.root.findByType(IntelligenceConversation);
  const subscribe = jest.spyOn(s.runtime.session, 'subscribe'); const clear = jest.spyOn(s.runtime.session, 'clear');
  const snapshot = s.runtime.session.snapshot();
  for (let n = 0; n < 4; n++) { await press(hostCopy.expand); await press(hostCopy.collapse); }
  expect(renderer!.root.findByType(IntelligenceConversation)).toBe(conversation);
  expect(s.runtime.session.snapshot()).toEqual(snapshot); expect(input().props.value).toBe('Noch eine ungesendete Frage');
  expect(visible()).toContain('Eine Antwort für deinen Alltag.'); expect(s.gateway.respond).toHaveBeenCalledTimes(1);
  expect(s.consentGateway.grant).toHaveBeenCalledTimes(1); expect(subscribe).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
});
it('preserves a single pending consent acknowledgement and its unchecked audio choice while resizing', async () => {
  const s = setup(); let finish!: (value: Awaited<ReturnType<typeof s.consentGateway.grant>>) => void;
  s.consentGateway.grant.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(s); await act(async () => { await s.runtime.consent.loadRevision(); });
  const choice = renderer!.root.findAll(n => n.props.accessibilityLabel === copy.textConsent && typeof n.props.onValueChange === 'function')[0];
  await act(async () => choice.props.onValueChange(true)); await press(copy.agree);
  const intent = s.consentGateway.grant.mock.calls[0][0]; await press(hostCopy.expand); await press(hostCopy.collapse);
  expect(s.consentGateway.grant).toHaveBeenCalledTimes(1); expect(s.port.permitted).not.toHaveBeenCalled(); expect(input()).toBeUndefined();
  await act(async () => finish({ version: 1, accountId: owner, policyId: policy.id, text: true, audio: false, revision: intent.expectedRevision + 1, grantedAt: '2026-10-24T09:00:00Z' }));
  expect(input()).toBeDefined(); expect(s.runtime.session.snapshot().consent).toEqual({ text: true, audio: false });
});

it('keeps one in-flight request and its result while resizing, without abort or duplicate dispatch', async () => {
  const s = setup(); let finish!: (value: unknown) => void;
  s.gateway.respond.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(s); await grant(s); await act(async () => input().props.onChangeText('Eine offene Frage')); await press(copy.send);
  const [request, signal] = s.gateway.respond.mock.calls[0];
  await press(hostCopy.expand); await press(hostCopy.collapse); await press(hostCopy.expand);
  expect(signal.aborted).toBe(false); expect(s.gateway.respond).toHaveBeenCalledTimes(1);
  await act(async () => finish({ version: 1, requestId: request.requestId, dogId: request.dogId, policyId: request.policyId, text: 'Genau eine Antwort', sources: [] }));
  expect(s.runtime.session.snapshot().messages).toHaveLength(2); expect(visible()).toContain('Genau eine Antwort');
});

it('retains the locally corrected transcript across layouts and adopts it without sending', async () => {
  const s = setup(); await mount(s); await grant(s, true); await press(copy.speak);
  await act(async () => s.port.start.mock.calls[0][0].result('Ursprünglich erkannt'));
  await act(async () => input(copy.review).props.onChangeText('Von mir korrigiert'));
  await press(hostCopy.expand); await press(hostCopy.collapse);
  expect(input(copy.review).props.value).toBe('Von mir korrigiert'); expect(s.port.start).toHaveBeenCalledTimes(1);
  expect(s.gateway.respond).not.toHaveBeenCalled(); await press(copy.useTranscript);
  expect(input().props.value).toBe('Von mir korrigiert'); expect(s.gateway.respond).not.toHaveBeenCalled();
  await press(copy.send); expect(s.gateway.respond).toHaveBeenCalledTimes(1);
});

it('guards a same-event stale resize/close handler during pending microphone permission', async () => {
  const s = setup(); let answer!: (value: boolean) => void;
  s.port.permitted.mockImplementationOnce(() => new Promise(resolve => { answer = resolve; }));
  await mount(s); await grant(s, true); await act(async () => input().props.onChangeText('Vorhandener Entwurf'));
  const resize = button(hostCopy.expand).props.onPress; const close = button(hostCopy.close).props.onPress;
  await act(async () => { void s.runtime.speech!.start(); resize(); close(); });
  expect(button(hostCopy.collapse)).toBeUndefined(); expect(s.onClose).toHaveBeenCalledTimes(1);
  expect(button(hostCopy.discard)).toBeUndefined(); await act(async () => answer(true));
  expect(s.port.start).not.toHaveBeenCalled(); expect(s.runtime.session.snapshot().consent).toBeNull();
});

it('disables resizing during recording and closes immediately through the single abort path', async () => {
  const s = setup(); await mount(s); await grant(s, true); await press(copy.speak);
  expect(button(hostCopy.expand).props.disabled).toBe(true); const event = s.port.start.mock.calls[0][0];
  await press(hostCopy.close); await press(hostCopy.close);
  expect(s.onClose).toHaveBeenCalledTimes(1); expect(s.port.abort).toHaveBeenCalledTimes(1);
  await act(async () => event.result('Späte fremde Aufnahme'));
  expect(s.runtime.session.snapshot()).toMatchObject({ consent: null, input: '', transcript: '', messages: [] });
  expect(s.gateway.respond).not.toHaveBeenCalled();
});

it('keeps failed audio cleanup and retry accessible after revocation in the shared surface', async () => {
  const s = setup(true); await mount(s); await grant(s, true); await press(copy.speak); await press(copy.revoke);
  expect(s.runtime.speech!.getStatus()).toBe('cleanupPending'); expect(button(hostCopy.expand).props.disabled).toBe(true);
  expect(button(copy.retryAudioCleanup)).toBeDefined(); expect(visible()).toContain(copy.cleanupPending);
  s.take.close.mockResolvedValue(true); await press(copy.retryAudioCleanup);
  expect(s.runtime.speech!.getStatus()).toBe('idle'); expect(button(hostCopy.expand).props.disabled).toBe(false);
  expect(s.runtime.session.snapshot().consent).toBeNull(); expect(s.transcription.transcribe).not.toHaveBeenCalled();
});

it('confirms discarding an idle draft, preserves it when cancelled and isolates the dialog for accessibility', async () => {
  const s = setup(); await mount(s); await grant(s); await act(async () => input().props.onChangeText('Behalten'));
  await press(hostCopy.close); expect(button(hostCopy.discard)).toBeDefined(); expect(s.onClose).not.toHaveBeenCalled();
  expect(renderer!.root.findAll(n => n.props.importantForAccessibility === 'no-hide-descendants').length).toBeGreaterThan(0);
  await press(hostCopy.keep); expect(input().props.value).toBe('Behalten');
  await press(hostCopy.close); await press(hostCopy.discard);
  expect(s.onClose).toHaveBeenCalledTimes(1); expect(s.runtime.session.snapshot()).toMatchObject({ input: '', messages: [], consent: null });
});

it('handles Android modal back through the same draft confirmation and aborts a pending answer on true close', async () => {
  const s = setup(); await mount(s); await grant(s); await act(async () => input().props.onChangeText('Entwurf'));
  await act(async () => renderer!.root.findByType(Modal).props.onRequestClose());
  expect(button(hostCopy.keep)).toBeDefined(); await press(hostCopy.keep);
  s.gateway.respond.mockImplementationOnce(() => new Promise(() => {})); await press(copy.send);
  const signal = s.gateway.respond.mock.calls[0][1]; await act(async () => renderer!.root.findByType(Modal).props.onRequestClose());
  expect(signal.aborted).toBe(true); expect(s.onClose).toHaveBeenCalledTimes(1);
});

it('preserves route-level clearing on background, dismisses confirmation and never restarts on resume', async () => {
  const s = setup(); await mount(s); await grant(s); await act(async () => input().props.onChangeText('Privater Entwurf')); await press(hostCopy.close);
  await act(async () => { [...listeners].forEach(listener => listener('background')); });
  expect(s.runtime.session.snapshot()).toMatchObject({ input: '', messages: [], transcript: '', consent: null });
  expect(button(hostCopy.keep)).toBeUndefined(); expect(input()).toBeUndefined();
  await act(async () => { [...listeners].forEach(listener => listener('active')); });
  expect(input()).toBeUndefined(); expect(s.consentGateway.grant).toHaveBeenCalledTimes(1);
  expect(s.gateway.respond).not.toHaveBeenCalled(); expect(s.port.permitted).not.toHaveBeenCalled();
});

it.each(['DAILY_LIMIT_REACHED', 'BUDGET_EXHAUSTED', 'UNAVAILABLE'] as const)('retains %s and its draft across layouts without retry or paid fallback', async error => {
  const s = setup(); s.gateway.respond.mockResolvedValueOnce({ version: 1, error: { code: error } });
  await mount(s); await grant(s); await act(async () => input().props.onChangeText('Erhalten')); await press(copy.send);
  await press(hostCopy.expand); await press(hostCopy.collapse);
  expect(input().props.value).toBe('Erhalten'); expect(visible()).toContain(copy.errors[error]); expect(s.gateway.respond).toHaveBeenCalledTimes(1);
});

it('hides mismatched identity data, clears stale scope and ignores its pending reply', async () => {
  const s = setup(); let finish!: (value: unknown) => void;
  s.gateway.respond.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(s); await grant(s); await act(async () => input().props.onChangeText('Privat')); await press(copy.send);
  const req = s.gateway.respond.mock.calls[0][0];
  await act(async () => renderer!.update(<IntelligenceAssistantHost runtime={s.runtime} identity={{ ...identity, accountId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }} onClose={s.onClose} />));
  await act(async () => finish({ version: 1, requestId: req.requestId, dogId: req.dogId, policyId: req.policyId, text: 'Veraltete Antwort', sources: [] }));
  expect(visible()).not.toContain('Privat'); expect(visible()).not.toContain('Veraltete Antwort'); expect(input()).toBeUndefined();
});

it('unmount aborts pending work and removes the host and conversation subscriptions', async () => {
  const s = setup(); await mount(s); await grant(s); s.gateway.respond.mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => input().props.onChangeText('Offen')); await press(copy.send); const signal = s.gateway.respond.mock.calls[0][1];
  expect(listeners.size).toBe(2); await act(async () => { renderer!.unmount(); renderer = null; });
  expect(signal.aborted).toBe(true); expect(listeners.size).toBe(0); expect(s.runtime.session.snapshot().consent).toBeNull();
});

it('changes only the bounded surface dimensions while keeping both layouts scrollable and a static orb', async () => {
  const s = setup(); await mount(s);
  const surface = () => renderer!.root.findAll(n => n.props.testID === 'intelligence-assistant-surface')[0];
  expect(StyleSheet.flatten(surface().props.style).height).toMatch(/%$/);
  await press(hostCopy.expand); expect(StyleSheet.flatten(surface().props.style).flex).toBe(1);
  expect(renderer!.root.findByType(IntelligenceConversation).props.embedded).toBe(true);
  expect(button(hostCopy.close).props.disabled).not.toBe(true);
});

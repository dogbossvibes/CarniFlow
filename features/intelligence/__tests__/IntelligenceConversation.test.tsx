import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { IntelligenceConversation } from '../IntelligenceConversation';
import { IntelligenceSession } from '../session';
import { IntelligenceConsentController, type PendingRevocation } from '../consentController';
import { IntelligenceSpeechCapture, type SpeechCapturePort } from '../speechCapture';
import { conversationCopy as copy } from '../copy';
import type { ConsentIntent } from '../consent';
import type { ConversationRequest } from '../contract';

const identity = { accountId: 'owner', dogId: 'dog', dogName: 'Malu' };
const policy = { id: 'policy', enabled: true, providerLabel: 'Named provider', disclosure: 'Explicit data disclosure', retentionSummary: 'Actual retention agreement', monthlyBudgetChfCents: 500 };
const ack = (i: ConsentIntent) => ({ version: 1, accountId: i.accountId, policyId: i.policyId, text: i.text, audio: i.audio, revision: i.expectedRevision + 1, grantedAt: '2026-10-23T06:00:00Z' });
const setup = (enabled = true) => {
  const gateway = { respond: jest.fn(async (r: ConversationRequest): Promise<unknown> => ({ version: 1, requestId: r.requestId, dogId: r.dogId, policyId: r.policyId, text: 'Eine passende Antwort', sources: [] })) };
  const session = new IntelligenceSession(gateway, () => 'request');
  session.selectScope({ ownerId: 'owner', dogId: 'dog' }); session.configure(enabled ? policy : null);
  let records: PendingRevocation[] = [];
  const outbox = { read: async () => records.map(r => ({ ...r })), write: async (r: PendingRevocation[]) => { records = r.map(v => ({ ...v })); } };
  let actions = 0;
  const consentGateway = { readRevision: jest.fn(async (r: PendingRevocation): Promise<unknown> => ({ version: 1, ...r, exists: false, revision: 0 })),
    grant: jest.fn(async (r: ConsentIntent): Promise<unknown> => ack(r)),
    revoke: jest.fn(async (r: PendingRevocation): Promise<unknown> => ({ version: 1, ...r, revoked: true, revision: 2, revokedAt: '2026-10-23T06:00:00Z' })) };
  const consent = new IntelligenceConsentController(session, outbox, consentGateway, () => `aaaaaaaa-aaaa-4aaa-8aaa-${(++actions).toString(16).padStart(12, '0')}`);
  const port = { available: jest.fn(() => true), permitted: jest.fn(async () => true),
    start: jest.fn<void, [Parameters<SpeechCapturePort['start']>[0]]>(), stop: jest.fn(), abort: jest.fn() };
  const speech = new IntelligenceSpeechCapture(session, port, () => true, () => true);
  const back = jest.fn();
  return { session, consent, speech, gateway, consentGateway, port, back };
};
type Setup = ReturnType<typeof setup>;
let renderer: ReactTestRenderer;
let appState: ((state: AppStateStatus) => void) | undefined;
const button = (label: string) => renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const hasButton = (label: string) => !!button(label);
const visible = () => renderer.root.findAll(() => true).flatMap(n => Array.isArray(n.props.children) ? n.props.children : [n.props.children]).filter(v => typeof v === 'string').join(' ');
const choice = (label: string) => renderer.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onValueChange === 'function')[0];
const mount = async (s: Setup, speech = true) => { await act(async () => { renderer = TestRenderer.create(<IntelligenceConversation session={s.session} consent={s.consent} speech={speech ? s.speech : null} identity={identity} onBack={s.back} />); }); };
const grant = async (audio = false) => {
  if (hasButton(copy.readRevision)) await act(async () => button(copy.readRevision).props.onPress());
  await act(async () => choice(copy.textConsent).props.onValueChange(true));
  if (audio) await act(async () => choice(copy.audioConsent).props.onValueChange(true));
  await act(async () => button(copy.agree).props.onPress());
};
const input = () => renderer.root.findAll(n => n.props.accessibilityLabel === copy.input && typeof n.props.onChangeText === 'function')[0];
beforeEach(() => { jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => { appState = listener; return { remove: jest.fn() }; }); });
afterEach(() => { if (renderer) act(() => renderer.unmount()); jest.restoreAllMocks(); appState = undefined; });

it('shows no consent or microphone action when policy is unavailable', async () => {
  const s = setup(false); await mount(s);
  expect(visible()).toContain(copy.unavailable); expect(hasButton(copy.agree)).toBe(false);
  expect(s.port.permitted).not.toHaveBeenCalled(); expect(s.gateway.respond).not.toHaveBeenCalled();
});
it('discloses provider, transfer and retention before unchecked, separate consent', async () => {
  const s = setup(); await mount(s); const view = visible();
  expect(view).toContain(policy.providerLabel); expect(view).toContain(policy.disclosure); expect(view).toContain(policy.retentionSummary);
  const choices = [choice(copy.textConsent), choice(copy.audioConsent)]; expect(choices[0].props.value).toBe(false); expect(choices[1].props.value).toBe(false);
  expect(choices[1].props.disabled).toBe(true); expect(button(copy.agree).props.disabled).toBe(true);
  expect(s.consentGateway.grant).not.toHaveBeenCalled();
});
it('does not expose the composer before matching server consent acknowledgement', async () => {
  const s = setup(); let resolve!: (v: unknown) => void;
  s.consentGateway.grant.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await mount(s); await grant(true); expect(hasButton(copy.send)).toBe(false);
  expect(visible()).toContain(copy.saving); expect(s.port.start).not.toHaveBeenCalled();
  const intent = s.consentGateway.grant.mock.calls[0][0];
  await act(async () => resolve(ack(intent)));
  expect(hasButton(copy.send)).toBe(true); expect(hasButton(copy.speak)).toBe(true);
});
it('keeps conversation locked on mismatched server ACK', async () => {
  const s = setup(); s.consentGateway.grant.mockResolvedValueOnce({ version: 1, accountId: 'other' });
  await mount(s); await grant(); expect(hasButton(copy.send)).toBe(false); expect(visible()).toContain(copy.consentFailed);
});
it('sends only on explicit action and renders a validated reply', async () => {
  const s = setup(); await mount(s); await grant(); expect(hasButton(copy.speak)).toBe(false);
  await act(async () => input().props.onChangeText('Frage zum Alltag')); expect(s.gateway.respond).not.toHaveBeenCalled();
  await act(async () => button(copy.send).props.onPress());
  expect(s.gateway.respond).toHaveBeenCalledTimes(1); expect(visible()).toContain('Eine passende Antwort'); expect(input().props.value).toBe('');
});
it('shows a budget stop without automatic retry and retains the question', async () => {
  const s = setup(); s.gateway.respond.mockResolvedValueOnce({ version: 1, error: { code: 'BUDGET_EXHAUSTED' } });
  await mount(s); await grant(); await act(async () => input().props.onChangeText('Meine Frage'));
  await act(async () => button(copy.send).props.onPress());
  expect(visible()).toContain(copy.errors.BUDGET_EXHAUSTED); expect(input().props.value).toBe('Meine Frage'); expect(s.gateway.respond).toHaveBeenCalledTimes(1);
});
it('reviews, edits and explicitly adopts a transcript before separate send', async () => {
  const s = setup(); await mount(s); await grant(true); await act(async () => button(copy.speak).props.onPress());
  expect(s.port.start).toHaveBeenCalledTimes(1);
  await act(async () => s.port.start.mock.calls[0][0].result('Erkannter Text'));
  const review = renderer.root.findAll(n => n.props.accessibilityLabel === copy.review && typeof n.props.onChangeText === 'function')[0];
  expect(review.props.value).toBe('Erkannter Text'); expect(hasButton(copy.send)).toBe(false); expect(s.gateway.respond).not.toHaveBeenCalled();
  await act(async () => review.props.onChangeText('Korrigierter Text'));
  await act(async () => button(copy.useTranscript).props.onPress());
  expect(input().props.value).toBe('Korrigierter Text'); expect(s.gateway.respond).not.toHaveBeenCalled();
  await act(async () => button(copy.send).props.onPress()); expect(s.gateway.respond.mock.calls[0][0].messages[0].text).toBe('Korrigierter Text');
});
it('requires shortening long transcripts before adoption', async () => {
  const s = setup(); await mount(s); await grant(true); await act(async () => button(copy.speak).props.onPress());
  await act(async () => s.port.start.mock.calls[0][0].result('a'.repeat(2100)));
  expect(button(copy.useTranscript).props.disabled).toBe(true); expect(visible()).toContain(copy.length);
});
it('discards a transcript and never sends it', async () => {
  const s = setup(); await mount(s); await grant(true); await act(async () => button(copy.speak).props.onPress());
  await act(async () => s.port.start.mock.calls[0][0].result('Privater Text'));
  await act(async () => button(copy.discard).props.onPress());
  expect(input().props.value).toBe(''); expect(visible()).not.toContain('Privater Text'); expect(s.gateway.respond).not.toHaveBeenCalled();
});
it('cancels capture on background without restarting on resume', async () => {
  const s = setup(); await mount(s); await grant(true); await act(async () => button(copy.speak).props.onPress());
  await act(async () => appState?.('background')); expect(s.port.abort).toHaveBeenCalledTimes(1);
  await act(async () => appState?.('active')); expect(s.port.start).toHaveBeenCalledTimes(1); expect(s.gateway.respond).not.toHaveBeenCalled();
});
it('immediately hides messages for a changed dog identity even before scope updates', async () => {
  const s = setup(); await mount(s); await grant(); await act(async () => input().props.onChangeText('Private Frage'));
  await act(async () => button(copy.send).props.onPress()); expect(visible()).toContain('Eine passende Antwort');
  await act(async () => renderer.update(<IntelligenceConversation session={s.session} consent={s.consent} speech={s.speech} identity={{ ...identity, dogId: 'other', dogName: 'Other' }} onBack={s.back} />));
  expect(visible()).not.toContain('Private Frage'); expect(visible()).not.toContain('Eine passende Antwort'); expect(hasButton(copy.send)).toBe(false);
});
it('keeps local recording stopped and shows pending revocation offline', async () => {
  const s = setup(); s.consentGateway.revoke.mockRejectedValueOnce(new Error('offline')); await mount(s); await grant(true);
  await act(async () => button(copy.speak).props.onPress()); await act(async () => button(copy.revoke).props.onPress());
  expect(s.port.abort).toHaveBeenCalledTimes(1); expect(hasButton(copy.send)).toBe(false); expect(visible()).toContain(copy.pending);
  expect(button(copy.agree).props.disabled).toBe(true);
  await act(async () => button(copy.retry).props.onPress()); expect(visible()).toContain(copy.revoked);
});
it('keeps typing available when native speech is absent', async () => {
  const s = setup(); await mount(s, false); await grant(true);
  expect(hasButton(copy.send)).toBe(true); expect(hasButton(copy.speak)).toBe(false); expect(visible()).toContain(copy.speechUnavailable);
});
it('leaving stops capture, removes ephemeral text and ignores late recognition', async () => {
  const s = setup(); await mount(s); await grant(true); await act(async () => button(copy.speak).props.onPress());
  const events = s.port.start.mock.calls[0][0]; await act(async () => button(copy.back).props.onPress());
  expect(s.back).toHaveBeenCalledTimes(1); expect(s.port.abort).toHaveBeenCalledTimes(1);
  await act(async () => events.result('late')); expect(s.session.snapshot().transcript).toBe(''); expect(s.gateway.respond).not.toHaveBeenCalled();
});

it('returns to actionable consent after background invalidates a pending ACK', async () => {
  const s = setup(); let resolve!: (v: unknown) => void;
  s.consentGateway.grant.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await mount(s); await grant(); await act(async () => appState?.('background'));
  const intent = s.consentGateway.grant.mock.calls[0][0];
  await act(async () => resolve(ack(intent)));
  expect(hasButton(copy.send)).toBe(false); expect(button(copy.agree).props.disabled).toBe(true);
  await act(async () => button(copy.readRevision).props.onPress());
  await act(async () => button(copy.agree).props.onPress()); expect(hasButton(copy.send)).toBe(true);
});
it('shows denied microphone permission while preserving text entry', async () => {
  const s = setup(); s.port.permitted.mockResolvedValueOnce(false); await mount(s); await grant(true);
  await act(async () => button(copy.speak).props.onPress());
  expect(visible()).toContain(copy.speechDenied); expect(input().props.editable).toBe(true); expect(s.port.start).not.toHaveBeenCalled();
});
it('offers cancellation of an unanswered request and keeps the typed question', async () => {
  const s = setup(); s.gateway.respond.mockImplementationOnce(() => new Promise(() => {}));
  await mount(s); await grant(); await act(async () => input().props.onChangeText('Meine offene Frage'));
  await act(async () => button(copy.send).props.onPress()); expect(visible()).toContain(copy.sending);
  expect(button(copy.send).props.disabled).toBe(true);
  await act(async () => button(copy.cancel).props.onPress());
  expect(input().props.value).toBe('Meine offene Frage'); expect(s.session.snapshot().phase).toBe('idle'); expect(s.gateway.respond).toHaveBeenCalledTimes(1);
});
it('rejects an account switch during consent confirmation at screen level', async () => {
  const s = setup(); let resolve!: (v: unknown) => void;
  s.consentGateway.grant.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await mount(s); await grant(true); const intent = s.consentGateway.grant.mock.calls[0][0];
  await act(async () => s.session.selectScope({ ownerId: 'other', dogId: 'other' }));
  await act(async () => resolve(ack(intent)));
  expect(hasButton(copy.send)).toBe(false); expect(visible()).toContain(copy.unavailable); expect(s.port.start).not.toHaveBeenCalled();
});
it('requires a separate confirmed revision read before the explicit agreement action', async () => {
  const s = setup(); await mount(s);
  await act(async () => choice(copy.textConsent).props.onValueChange(true));
  expect(button(copy.agree).props.disabled).toBe(true); expect(s.consentGateway.readRevision).not.toHaveBeenCalled();
  await act(async () => button(copy.readRevision).props.onPress());
  expect(s.consentGateway.grant).not.toHaveBeenCalled(); expect(button(copy.agree).props.disabled).toBe(false);
  await act(async () => button(copy.agree).props.onPress());
  expect(s.consentGateway.grant.mock.calls[0][0]).toMatchObject({ expectedRevision: 0, actionId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' });
});
it('offers only an explicit stable retry after an unknown grant outcome', async () => {
  const s = setup(); s.consentGateway.grant.mockRejectedValueOnce(new Error('unknown')); await mount(s); await grant(true);
  expect(hasButton(copy.send)).toBe(false); expect(hasButton(copy.retryConsent)).toBe(true); expect(s.consentGateway.grant).toHaveBeenCalledTimes(1);
  expect(s.consentGateway.readRevision).toHaveBeenCalledTimes(1);
  const original = s.consentGateway.grant.mock.calls[0][0]; await act(async () => button(copy.retryConsent).props.onPress());
  expect(s.consentGateway.grant.mock.calls[1][0]).toBe(original); expect(s.consentGateway.readRevision).toHaveBeenCalledTimes(1); expect(hasButton(copy.send)).toBe(true);
});
it('a regrant after confirmed revoke requires a new press and a new action UUID', async () => {
  const s = setup(); await mount(s); await grant(true); const original = s.consentGateway.grant.mock.calls[0][0];
  await act(async () => button(copy.revoke).props.onPress());
  expect(s.consentGateway.grant).toHaveBeenCalledTimes(1); expect(hasButton(copy.send)).toBe(false);
  await act(async () => button(copy.agree).props.onPress());
  const next = s.consentGateway.grant.mock.calls[1][0]; expect(next.expectedRevision).toBe(2); expect(next.actionId).not.toBe(original.actionId); expect(hasButton(copy.send)).toBe(true);
});
it('does not treat a failed server revision read as initial revision0', async () => {
  const s = setup(); s.consentGateway.readRevision.mockRejectedValueOnce(new Error('unavailable')); await mount(s);
  await act(async () => choice(copy.textConsent).props.onValueChange(true)); await act(async () => button(copy.readRevision).props.onPress());
  expect(button(copy.agree).props.disabled).toBe(true); expect(s.consentGateway.grant).not.toHaveBeenCalled(); expect(hasButton(copy.send)).toBe(false);
});

it('keeps explicit revoke available after an unknown grant outcome without another consent action', async () => {
  const s = setup(); s.consentGateway.grant.mockRejectedValueOnce(new Error('unknown outcome')); await mount(s); await grant();
  expect(s.consent.getStatus()).toBe('failed'); expect(s.consent.canRetryGrant()).toBe(true); expect(s.session.snapshot().consent).toBeNull();
  expect(hasButton(copy.revoke)).toBe(true); await act(async () => button(copy.revoke).props.onPress());
  expect(s.consentGateway.revoke).toHaveBeenCalledWith({ accountId: 'owner', policyId: 'policy' }, expect.anything());
  expect(s.consentGateway.grant).toHaveBeenCalledTimes(1); expect(s.consent.canRetryGrant()).toBe(false); expect(s.session.snapshot().consent).toBeNull();
});
it('offers revoke in a fresh policy context without restoring or granting local consent', async () => {
  const s = setup(); await mount(s); expect(s.session.snapshot().consent).toBeNull(); expect(hasButton(copy.revoke)).toBe(true);
  await act(async () => button(copy.revoke).props.onPress()); expect(s.consentGateway.grant).not.toHaveBeenCalled();
  expect(s.consentGateway.revoke).toHaveBeenCalledTimes(1); expect(s.session.snapshot().consent).toBeNull(); expect(hasButton(copy.send)).toBe(false);
});
it('retains a pending revoke after an unknown grant followed by an offline withdrawal', async () => {
  const s = setup(); s.consentGateway.grant.mockRejectedValueOnce(new Error('unknown outcome')); s.consentGateway.revoke.mockRejectedValueOnce(new Error('offline'));
  await mount(s); await grant(); await act(async () => button(copy.revoke).props.onPress());
  expect(s.consent.getStatus()).toBe('revocationPending'); expect(visible()).toContain(copy.pending); expect(hasButton(copy.retry)).toBe(true); expect(hasButton(copy.send)).toBe(false);
  await act(async () => button(copy.retry).props.onPress()); expect(s.consentGateway.revoke).toHaveBeenCalledTimes(2); expect(s.consentGateway.grant).toHaveBeenCalledTimes(1);
});

it('shows the shared daily quota distinctly from monthly cost and keeps the draft without retry', async () => {
  const s = setup(); s.gateway.respond.mockResolvedValueOnce({ version: 1, error: { code: 'DAILY_LIMIT_REACHED' } });
  await mount(s); await grant(); await act(async () => input().props.onChangeText('Meine Tagesfrage'));
  await act(async () => button(copy.send).props.onPress());
  expect(visible()).toContain(copy.errors.DAILY_LIMIT_REACHED);
  expect(visible()).not.toContain(copy.errors.BUDGET_EXHAUSTED);
  expect(input().props.value).toBe('Meine Tagesfrage'); expect(s.gateway.respond).toHaveBeenCalledTimes(1);
});

import { IntelligenceSession } from '../session';
import { INTELLIGENCE_LIMITS, validPolicy, type ConversationRequest, type IntelligencePolicy } from '../contract';
const scope = { ownerId: 'owner', dogId: 'dog' };
const policy: IntelligencePolicy = { id: 'policy-v1', enabled: true, providerLabel: 'Configured provider',
  disclosure: 'Only explicitly submitted text', retentionSummary: 'Shown retention agreement', monthlyBudgetChfCents: 500 };
const reply = (r: ConversationRequest, text = 'Hallo') => ({ version: 1, requestId: r.requestId, dogId: r.dogId, policyId: r.policyId, text, sources: [] });
const gateway = { respond: jest.fn() };
const consent = (session: IntelligenceSession, text: boolean, audio: boolean) => {
  const intent = session.beginConsent(text, audio, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0)!;
  return session.confirmConsent(intent, { version: 1, accountId: intent.accountId, policyId: intent.policyId, text: intent.text, audio: intent.audio, revision: 1, grantedAt: '2026-10-23T06:00:00Z' });
};
let id = 0;
const create = () => { const session = new IntelligenceSession(gateway, () => `request-${++id}`, 100); session.selectScope(scope); session.configure(policy); return session; };
beforeEach(() => { id = 0; gateway.respond.mockReset().mockImplementation(async r => reply(r)); });
afterEach(() => { jest.useRealTimers(); });
it('never calls the gateway without enabled policy, owner/dog scope and explicit consent', async () => {
  const session = new IntelligenceSession(gateway, () => 'request'); session.editInput('Hallo');
  expect(await session.send()).toBe(false); session.selectScope(scope); session.configure(policy); session.editInput('Hallo');
  expect(await session.send()).toBe(false); expect(session.snapshot().error).toBe('CONSENT_REQUIRED');
  expect(gateway.respond).not.toHaveBeenCalled();
});
it.each([null, {}, { ...policy, monthlyBudgetChfCents: 501 }, { ...policy, enabled: false }, { ...policy, providerLabel: null }])('fails closed for missing/invalid policy %j', value => {
  expect(validPolicy(value)).toBe(false);
});
it('does not auto-send transcribed text and only prepares the explicitly reviewed current note', async () => {
  const session = create(); consent(session, true, true);
  const ticket = session.beginSpeechReview()!;
  expect(session.receiveTranscript(ticket, 'Heutiges Training')).toBe(true);
  expect(session.trainingNoteDraft()).toBeNull(); expect(await session.send()).toBe(false);
  expect(gateway.respond).not.toHaveBeenCalled();
  expect(session.confirmTranscript('Korrigierter heutiger Eintrag')).toBe(true);
  expect(session.trainingNoteDraft()).toEqual({ dogId: 'dog', note: 'Korrigierter heutiger Eintrag' });
  expect(gateway.respond).not.toHaveBeenCalled();
});
it('requires separate audio consent and ignores old transcript events after interruption', () => {
  const session = create(); consent(session, true, false); expect(session.beginSpeechReview()).toBeNull();
  consent(session, true, true); const ticket = session.beginSpeechReview()!;
  session.interrupt(); expect(session.receiveTranscript(ticket, 'late')).toBe(false);
});
it('sends bounded user/assistant messages without owner claims, tools, keys or automatic save fields', async () => {
  const session = create(); consent(session, true, false); session.editInput('Hallo');
  expect(await session.send()).toBe(true);
  expect(gateway.respond.mock.calls[0][0]).toEqual({ version: 1, requestId: 'request-1', dogId: 'dog', policyId: policy.id,
    messages: [{ role: 'user', text: 'Hallo' }], sources: [] });
  expect(session.snapshot().messages).toEqual([{ role: 'user', text: 'Hallo' }, { role: 'assistant', text: 'Hallo' }]);
});
it.each([{ dogId: 'other' }, { policyId: 'old' }, { requestId: 'old' }, { save: true }, { text: '' },
  { sources: [{ kind: 'unit', originalId: 'unselected' }] }])('rejects mismatched/unsolicited server fields %j', patch => {
  gateway.respond.mockImplementation(async r => ({ ...reply(r), ...patch }));
  const session = create(); consent(session, true, false); session.editInput('Hallo');
  return session.send().then(ok => { expect(ok).toBe(false); expect(session.snapshot().messages).toEqual([]); expect(session.snapshot().error).toBe('INVALID_RESPONSE'); });
});
it('accepts references only from explicitly selected sources and clears derived conversation on deselection', async () => {
  gateway.respond.mockImplementation(async r => ({ ...reply(r), sources: r.sources }));
  const session = create(); consent(session, true, false); session.selectSources([{ kind: 'unit', originalId: 'allowed' }]); session.editInput('Bitte ansehen');
  expect(await session.send()).toBe(true); session.selectSources([]); expect(session.snapshot().messages).toEqual([]);
});
it('discards in-flight replies and clears conversation on dog/account changes', async () => {
  let complete!: (v: unknown) => void;
  gateway.respond.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const session = create(); consent(session, true, false); session.editInput('Hallo'); const pending = session.send();
  const request = gateway.respond.mock.calls[0][0]; session.selectScope({ ownerId: 'other', dogId: 'other' });
  complete(reply(request)); expect(await pending).toBe(false);
  expect(session.snapshot()).toMatchObject({ messages: [], input: '', phase: 'idle' });
});
it('immediately cancels even a transport that ignores AbortSignal, without automatic retry', async () => {
  gateway.respond.mockImplementation(() => new Promise(() => {}));
  const session = create(); consent(session, true, false); session.editInput('Hallo'); const pending = session.send();
  session.revokeConsent(); expect(await pending).toBe(false);
  expect(session.snapshot()).toMatchObject({ phase: 'idle', messages: [], input: '' }); expect(gateway.respond).toHaveBeenCalledTimes(1);
});
it('times out without hanging or repeating a possibly charged request', async () => {
  jest.useFakeTimers(); gateway.respond.mockImplementation(() => new Promise(() => {}));
  const session = create(); consent(session, true, false); session.editInput('Hallo'); const pending = session.send();
  jest.advanceTimersByTime(101); expect(await pending).toBe(false); expect(session.snapshot().error).toBe('TIMEOUT');
  expect(gateway.respond).toHaveBeenCalledTimes(1);
});
it('shows budget exhaustion without billing logic, retry or provider error leakage in the client', async () => {
  gateway.respond.mockResolvedValue({ version: 1, error: { code: 'BUDGET_EXHAUSTED', internal: 'sensitive' } });
  const session = create(); consent(session, true, false); session.editInput('Hallo');
  expect(await session.send()).toBe(false); expect(session.snapshot().error).toBe('BUDGET_EXHAUSTED');
  expect(JSON.stringify(session.snapshot())).not.toContain('sensitive'); expect(gateway.respond).toHaveBeenCalledTimes(1);
});
it('requires fresh consent when data policy changes', () => {
  const session = create(); consent(session, true, true); session.editInput('Hallo'); session.configure({ ...policy, id: 'new' });
  expect(session.beginSpeechReview()).toBeNull(); expect(session.snapshot().error).toBe('CONSENT_REQUIRED');
});
it('bounds history and rejects oversized input rather than silently sending a shortened request', async () => {
  const session = create(); consent(session, true, false);
  for (let i = 0; i < 10; i++) { session.editInput('Hallo'); expect(await session.send()).toBe(true); }
  for (const [r] of gateway.respond.mock.calls) { expect(r.messages.length).toBeLessThanOrEqual(INTELLIGENCE_LIMITS.historyMessages); expect(r.messages[0].role).toBe('user'); }
  const calls = gateway.respond.mock.calls.length; session.editInput('a'.repeat(2001)); expect(await session.send()).toBe(false);
  expect(gateway.respond).toHaveBeenCalledTimes(calls);
});

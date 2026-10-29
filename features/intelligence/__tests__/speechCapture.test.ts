import { IntelligenceSpeechCapture, type SpeechCapturePort } from '../speechCapture';
import { IntelligenceSession } from '../session';
const setup = () => {
  const gateway = { respond: jest.fn() };
  const session = new IntelligenceSession(gateway, () => 'request');
  session.selectScope({ ownerId: 'owner', dogId: 'dog' });
  session.configure({ id: 'policy', enabled: true, providerLabel: 'Provider', disclosure: 'Text/audio', retentionSummary: 'Shown', monthlyBudgetChfCents: 500 });
  const intent = session.beginConsent(true, true, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0)!;
  session.confirmConsent(intent, { version: 1, accountId: intent.accountId, policyId: intent.policyId, text: intent.text, audio: intent.audio, revision: 1, grantedAt: '2026-10-23T06:00:00Z' });
  const port = { available: jest.fn(() => true), permitted: jest.fn(async () => true), start: jest.fn<void, [Parameters<SpeechCapturePort['start']>[0]]>(), stop: jest.fn(), abort: jest.fn() };
  const current = jest.fn(() => true); const idle = jest.fn(() => true);
  const capture = new IntelligenceSpeechCapture(session, port, current, idle);
  return { session, gateway, port, capture, current, idle };
};
afterEach(() => { jest.useRealTimers(); });
it('requires an explicit start, then reviews final text without sending it', async () => {
  const s = setup(); expect(s.port.start).not.toHaveBeenCalled();
  expect(await s.capture.start()).toBe(true);
  const events = s.port.start.mock.calls[0][0] as Parameters<SpeechCapturePort['start']>[0];
  events.result('Heutige Beobachtung');
  expect(s.session.snapshot()).toMatchObject({ phase: 'reviewing', transcript: 'Heutige Beobachtung' });
  expect(s.gateway.respond).not.toHaveBeenCalled(); expect(s.port.stop).toHaveBeenCalledTimes(1);
  s.capture.dispose();
});
it('does not request permission or start if the module is absent or other audio owns capture', async () => {
  const s = setup(); s.port.available.mockReturnValue(false); expect(await s.capture.start()).toBe(false);
  s.port.available.mockReturnValue(true); s.idle.mockReturnValue(false); expect(await s.capture.start()).toBe(false);
  expect(s.port.permitted).not.toHaveBeenCalled(); s.capture.dispose();
});
it('does not request microphone permission before audio/data consent', async () => {
  const s = setup(); s.session.revokeConsent(); expect(await s.capture.start()).toBe(false);
  expect(s.port.permitted).not.toHaveBeenCalled(); s.capture.dispose();
});
it('does not start if permissions resolve after cancellation', async () => {
  const s = setup(); let done!: (v: boolean) => void;
  s.port.permitted.mockImplementation(() => new Promise(resolve => { done = resolve; }));
  const pending = s.capture.start(); s.capture.cancel(); done(true);
  expect(await pending).toBe(false); expect(s.port.start).not.toHaveBeenCalled(); s.capture.dispose();
});
it('a superseded permission reply cannot cancel a newer recording', async () => {
  const s = setup(); let done!: (v: boolean) => void;
  s.port.permitted.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
  const old = s.capture.start(); s.capture.cancel();
  expect(await s.capture.start()).toBe(true); done(true); expect(await old).toBe(false);
  expect(s.capture.getStatus()).toBe('listening'); expect(s.port.abort).not.toHaveBeenCalled(); s.capture.dispose();
});
it('rejects permission denial and rechecks audio priority after the permission dialog', async () => {
  const s = setup(); s.port.permitted.mockResolvedValue(false); expect(await s.capture.start()).toBe(false);
  expect(s.capture.getStatus()).toBe('denied'); s.port.permitted.mockResolvedValue(true);
  s.idle.mockReturnValueOnce(true).mockReturnValueOnce(false); expect(await s.capture.start()).toBe(false);
  expect(s.port.start).not.toHaveBeenCalled(); s.capture.dispose();
});
it('aborts its own capture on a dog switch and ignores a late transcript', async () => {
  const s = setup(); await s.capture.start(); const events = s.port.start.mock.calls[0][0] as Parameters<SpeechCapturePort['start']>[0];
  s.session.selectScope({ ownerId: 'owner', dogId: 'other' }); events.result('Wrong dog');
  expect(s.port.abort).toHaveBeenCalledTimes(1); expect(s.session.snapshot().transcript).toBe(''); s.capture.dispose();
});
it('ends after 60 seconds without restarting or sending', async () => {
  jest.useFakeTimers(); const s = setup(); await s.capture.start(); jest.advanceTimersByTime(60001);
  expect(s.capture.getStatus()).toBe('idle'); expect(s.port.abort).toHaveBeenCalledTimes(1);
  expect(s.port.start).toHaveBeenCalledTimes(1); expect(s.gateway.respond).not.toHaveBeenCalled(); s.capture.dispose();
});
it('deduplicates starts and safely stops on disposal', async () => {
  const s = setup(); await s.capture.start(); expect(await s.capture.start()).toBe(false); s.capture.dispose();
  expect(s.port.start).toHaveBeenCalledTimes(1); expect(s.port.abort).toHaveBeenCalledTimes(1);
  expect(await s.capture.start()).toBe(false);
});

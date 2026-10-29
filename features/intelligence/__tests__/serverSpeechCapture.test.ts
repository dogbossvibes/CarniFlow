import { IntelligenceSession } from '../session';
import type { TranscriptionGateway } from '../transcriptionHttp';
import { ServerSpeechCapture } from '../serverSpeechCapture';
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };
function setup() {
  const respond = jest.fn(); const session = new IntelligenceSession({ respond }, () => 'request');
  session.selectScope({ ownerId: 'owner', dogId: 'dog' });
  session.configure({ id: 'p', enabled: true, providerLabel: 'P', disclosure: 'D', retentionSummary: 'R', monthlyBudgetChfCents: 500 });
  const retry = session.beginConsent(true, true, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0)!;
  session.confirmConsent(retry, { version: 1, accountId: 'owner', policyId: 'p', text: true, audio: true, revision: 1, grantedAt: '2026-10-23T06:00:00Z' });
  const bytes = new Uint8Array(46).fill(7);
  const take = { start: jest.fn(), bytes: jest.fn(async () => bytes), close: jest.fn(async () => true) };
  const port = { available: () => true, permitted: jest.fn(async () => true), recover: jest.fn(async () => true), prepare: jest.fn(async (_signal: AbortSignal) => take) };
  const gateway = { transcribe: jest.fn<ReturnType<TranscriptionGateway['transcribe']>, Parameters<TranscriptionGateway['transcribe']>>(async () => ({ text: 'Ein Spaziergang' })) };
  const idle = jest.fn(() => true);
  const capture = new ServerSpeechCapture(session, port, gateway, () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', () => true, idle);
  return { session, respond, bytes, take, port, gateway, capture, idle };
}
afterEach(() => jest.useRealTimers());
it('requires consent before permission, records only after explicit start and never sends chat automatically', async () => {
  const s = setup(); expect(s.port.permitted).not.toHaveBeenCalled();
  expect(await s.capture.start()).toBe(true); expect(s.take.start).toHaveBeenCalledTimes(1);
  expect(s.gateway.transcribe).not.toHaveBeenCalled(); expect(await s.capture.finish()).toBe(true);
  expect(s.session.snapshot()).toMatchObject({ phase: 'reviewing', transcript: 'Ein Spaziergang', input: '' });
  expect(s.respond).not.toHaveBeenCalled(); expect([...s.bytes]).toEqual(Array(46).fill(0));
  s.capture.dispose();
});
it('denies microphone use without separate audio consent', async () => {
  const s = setup(); s.session.revokeConsent(); expect(await s.capture.start()).toBe(false);
  expect(s.port.permitted).not.toHaveBeenCalled(); s.capture.dispose();
});
it('cancellation during permission never prepares or starts a recorder', async () => {
  const s = setup(); const wait = deferred<boolean>(); s.port.permitted.mockReturnValue(wait.promise);
  const running = s.capture.start(); await Promise.resolve(); await Promise.resolve(); s.capture.cancel(); wait.resolve(true);
  expect(await running).toBe(false); expect(s.port.prepare).not.toHaveBeenCalled(); s.capture.dispose();
});
it('late prepare after cancellation is cleaned without starting or uploading', async () => {
  const s = setup(); const wait = deferred<typeof s.take>(); s.port.prepare.mockReturnValue(wait.promise);
  const running = s.capture.start(); for (let i = 0; i < 5; i++) await Promise.resolve();
  s.capture.cancel(); expect(await s.capture.start()).toBe(false); wait.resolve(s.take);
  expect(await running).toBe(false); expect(s.take.start).not.toHaveBeenCalled(); expect(s.take.close).toHaveBeenCalledTimes(1);
  expect(s.gateway.transcribe).not.toHaveBeenCalled(); s.capture.dispose();
});
it('losing audio priority while permissions resolve never starts capture', async () => {
  const s = setup(); s.port.permitted.mockImplementation(async () => { s.idle.mockReturnValue(false); return true; });
  expect(await s.capture.start()).toBe(false); expect(s.take.start).not.toHaveBeenCalled(); s.capture.dispose();
});
it('60 second watchdog discards rather than uploading', async () => {
  jest.useFakeTimers(); const s = setup(); await s.capture.start(); jest.advanceTimersByTime(60000);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  expect(s.take.close).toHaveBeenCalled(); expect(s.gateway.transcribe).not.toHaveBeenCalled(); expect(s.session.snapshot().phase).toBe('idle'); s.capture.dispose();
});
it('failed deletion blocks transcript and future recordings until explicit cleanup retry', async () => {
  const s = setup(); await s.capture.start(); s.take.close.mockResolvedValue(false);
  expect(await s.capture.finish()).toBe(false); expect(s.capture.getStatus()).toBe('cleanupPending');
  expect(s.session.snapshot().transcript).toBe(''); expect(await s.capture.start()).toBe(false);
  s.take.close.mockResolvedValue(true); expect(await s.capture.retryCleanup()).toBe(true); expect(await s.capture.start()).toBe(true); s.capture.dispose();
});
it('dog switch aborts in-flight transcription and discards a late result', async () => {
  const s = setup(); const wait = deferred<{ text: string }>(); s.gateway.transcribe.mockReturnValue(wait.promise);
  await s.capture.start(); const finishing = s.capture.finish(); for (let i = 0; i < 4; i++) await Promise.resolve();
  s.session.selectScope({ ownerId: 'owner', dogId: 'other' }); expect(await finishing).toBe(false);
  wait.resolve({ text: 'Old dog' }); await Promise.resolve(); expect(s.session.snapshot().transcript).toBe(''); expect(s.take.close).toHaveBeenCalled(); s.capture.dispose();
});
it('an uncooperative transport times out, cleans locally and is never retried', async () => {
  jest.useFakeTimers(); const s = setup(); s.gateway.transcribe.mockReturnValue(new Promise(() => {}));
  await s.capture.start(); const finishing = s.capture.finish(); for (let i = 0; i < 4; i++) await Promise.resolve();
  jest.advanceTimersByTime(15001); expect(await finishing).toBe(false); expect(s.take.close).toHaveBeenCalled();
  expect(s.gateway.transcribe).toHaveBeenCalledTimes(1); expect(s.session.snapshot().transcript).toBe(''); s.capture.dispose();
});

it('a daily speech quota stops after verified cleanup without transcript, chat send or retry', async () => {
  const s = setup(); s.gateway.transcribe.mockResolvedValue({ error: 'DAILY_LIMIT_REACHED' });
  await s.capture.start(); expect(await s.capture.finish()).toBe(false);
  expect(s.take.close).toHaveBeenCalled(); expect(s.session.snapshot()).toMatchObject({ phase: 'idle', error: 'DAILY_LIMIT_REACHED', transcript: '' });
  expect(s.gateway.transcribe).toHaveBeenCalledTimes(1); expect(s.respond).not.toHaveBeenCalled(); s.capture.dispose();
});

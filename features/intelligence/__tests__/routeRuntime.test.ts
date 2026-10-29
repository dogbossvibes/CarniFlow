import { createIntelligenceRouteRuntime, type RouteRuntimeDependencies } from '../routeRuntime';
import { CONSENT_OUTBOX_KEY } from '../consentOutbox';
import type { ConsentIntent } from '../consent';
import type { ConversationRequest } from '../contract';

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const dog = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const policy = { id: 'p1', enabled: true, providerLabel: 'Test provider', disclosure: 'Test disclosure', retentionSummary: 'Test retention', monthlyBudgetChfCents: 500 };
const ack = (i: ConsentIntent) => ({ version: 1, accountId: i.accountId, policyId: i.policyId, text: i.text, audio: i.audio, revision: i.expectedRevision + 1, grantedAt: '2026-10-23T07:00:00Z' });
const setup = () => {
  let account: string | null = owner; let raw: string | null = null; let seq = 0;
  const storage = { getItem: jest.fn(async (_key: string): Promise<string | null> => raw), setItem: jest.fn(async (_key: string, value: string) => { raw = value; }) };
  const gateway = { respond: jest.fn(async (r: ConversationRequest): Promise<unknown> => ({ version: 1, requestId: r.requestId, policyId: r.policyId, dogId: r.dogId, text: 'Reply', sources: [] })) };
  const consentGateway = {
    readRevision: jest.fn(async (r: { accountId: string; policyId: string }, _s: AbortSignal): Promise<unknown> => ({ version: 1, ...r, exists: false, revision: 0 })),
    grant: jest.fn(async (i: ConsentIntent, _s: AbortSignal): Promise<unknown> => ack(i)),
    revoke: jest.fn(async (r: { accountId: string; policyId: string }, _s: AbortSignal): Promise<unknown> => ({ version: 1, ...r, revoked: true, revision: 2, revokedAt: '2026-10-23T07:01:00Z' })),
  };
  const port = { available: jest.fn(() => true), permitted: jest.fn(async () => true), start: jest.fn(), stop: jest.fn(), abort: jest.fn() };
  const deps: RouteRuntimeDependencies = { storage, gateway, consentGateway, policy, uuid: () => `dddddddd-dddd-4ddd-8ddd-${(++seq).toString().padStart(12, '0')}`, currentAccount: () => account, speech: { port, audioIdle: () => true } };
  const runtime = createIntelligenceRouteRuntime({ ownerId: owner, dogId: dog }, deps);
  return { runtime, deps, storage, gateway, consentGateway, port, setAccount: (v: string | null) => { account = v; }, stored: () => raw };
};
const ready = async (s: ReturnType<typeof setup>) => { expect(await s.runtime.consent.loadRevision()).toBe(true); expect(await s.runtime.consent.grant(true, true)).toBe(true); };

afterEach(() => jest.useRealTimers());
it('constructs an isolated runtime without storage, network or permission side effects', () => {
  const s = setup(); expect(s.storage.getItem).not.toHaveBeenCalled(); expect(s.consentGateway.readRevision).not.toHaveBeenCalled();
  expect(s.port.permitted).not.toHaveBeenCalled(); expect(s.gateway.respond).not.toHaveBeenCalled(); s.runtime.dispose();
});
it('mounts durable storage in its own namespace without persisting messages or audio', async () => {
  const s = setup(); await ready(s); s.runtime.session.editInput('Private draft');
  s.consentGateway.revoke.mockRejectedValueOnce(new Error('offline'));
  expect(await s.runtime.consent.revoke()).toBe(false);
  expect(s.stored()).toBe(JSON.stringify([{ accountId: owner, policyId: 'p1' }]));
  expect(s.storage.setItem.mock.calls.every(([key]) => key === CONSENT_OUTBOX_KEY)).toBe(true);
  expect(s.runtime.session.snapshot().messages).toEqual([]); s.runtime.dispose();
});
it('retains an offline revoke across runtime disposal/remount and requires explicit retry', async () => {
  const s = setup(); await ready(s); s.consentGateway.revoke.mockRejectedValueOnce(new Error('offline'));
  await s.runtime.consent.revoke(); s.runtime.dispose();
  const next = createIntelligenceRouteRuntime({ ownerId: owner, dogId: dog }, s.deps);
  expect(s.consentGateway.revoke).toHaveBeenCalledTimes(1);
  expect(await next.consent.loadRevision()).toBe(false); expect(next.consent.getStatus()).toBe('revocationPending');
  expect(await next.consent.retryRevocations(owner)).toBe(true); expect(s.stored()).toBe('[]');
  expect(next.session.snapshot().consent).toBeNull(); next.dispose();
});
it('cannot call permission, chat or revision while policy is missing or exceeds five CHF', async () => {
  const s = setup(); s.runtime.dispose();
  for (const candidate of [null, { ...policy, monthlyBudgetChfCents: 501 }]) {
    const next = createIntelligenceRouteRuntime({ ownerId: owner, dogId: dog }, { ...s.deps, policy: candidate });
    expect(await next.consent.loadRevision()).toBe(false); expect(await next.speech!.start()).toBe(false);
    expect(await next.session.send()).toBe(false); next.dispose();
  }
  expect(s.consentGateway.readRevision).not.toHaveBeenCalled(); expect(s.port.permitted).not.toHaveBeenCalled(); expect(s.gateway.respond).not.toHaveBeenCalled();
});
it('aborts pending read on disposal, rejects late no-row response and cleans timers', async () => {
  jest.useFakeTimers(); const s = setup(); let finish!: (v: unknown) => void;
  let reached!: () => void; const started = new Promise<void>(resolve => { reached = resolve; });
  s.consentGateway.readRevision.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; reached(); }));
  const pending = s.runtime.consent.loadRevision(); await started;
  expect(s.consentGateway.readRevision).toHaveBeenCalledTimes(1);
  const signal = s.consentGateway.readRevision.mock.calls[0][1]; s.runtime.dispose(); expect(signal.aborted).toBe(true);
  finish({ version: 1, accountId: owner, policyId: 'p1', exists: false, revision: 0 });
  expect(await pending).toBe(false); expect(s.runtime.consent.getRevision()).toBeNull(); expect(jest.getTimerCount()).toBe(0);
});
it('never grants on a late ACK after interruption and requires a new deliberate consent action', async () => {
  const s = setup(); await s.runtime.consent.loadRevision(); let finish!: (v: unknown) => void;
  s.consentGateway.grant.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = s.runtime.consent.grant(true, true);
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const intent = s.consentGateway.grant.mock.calls[0][0]; s.runtime.interrupt(); finish(ack(intent));
  expect(await pending).toBe(false); expect(s.runtime.session.snapshot().consent).toBeNull(); expect(s.runtime.consent.canRetryGrant()).toBe(false); s.runtime.dispose();
});
it('pins original account before and after transport even if route effects have not run', async () => {
  const s = setup(); await ready(s); let finish!: (v: unknown) => void;
  s.gateway.respond.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  s.runtime.session.editInput('Question'); const pending = s.runtime.session.send(); const request = s.gateway.respond.mock.calls[0][0];
  s.setAccount(other); finish({ version: 1, requestId: request.requestId, policyId: 'p1', dogId: dog, text: 'Old reply', sources: [] });
  expect(await pending).toBe(false); expect(s.runtime.session.snapshot().messages).toEqual([]);
  expect(await s.runtime.speech!.start()).toBe(false); expect(s.port.permitted).not.toHaveBeenCalled(); s.runtime.dispose();
});
it('does not start capture if permission resolves after leaving or a synchronous account change', async () => {
  const s = setup(); await ready(s); let permission!: (v: boolean) => void;
  s.port.permitted.mockImplementationOnce(() => new Promise(resolve => { permission = resolve; }));
  const pending = s.runtime.speech!.start(); s.setAccount(other); s.runtime.dispose(); permission(true);
  expect(await pending).toBe(false); expect(s.port.start).not.toHaveBeenCalled(); expect(s.runtime.session.snapshot().scope).toBeNull();
});
it('stops only its own recording and ignores a late result after interruption', async () => {
  const s = setup(); await ready(s); await s.runtime.speech!.start(); const events = s.port.start.mock.calls[0][0];
  s.runtime.interrupt(); events.result('Late words'); expect(s.port.abort).toHaveBeenCalledTimes(1);
  expect(s.runtime.session.snapshot()).toMatchObject({ phase: 'idle', transcript: '', consent: null });
  expect(s.gateway.respond).not.toHaveBeenCalled(); s.runtime.dispose(); s.runtime.dispose(); expect(s.port.abort).toHaveBeenCalledTimes(1);
});
it('never replays another account pending revoke and preserves the original record', async () => {
  const s = setup(); await ready(s); s.consentGateway.revoke.mockRejectedValueOnce(new Error('offline')); await s.runtime.consent.revoke(); s.runtime.dispose(); s.setAccount(other);
  const next = createIntelligenceRouteRuntime({ ownerId: other, dogId: dog }, s.deps);
  expect(await next.consent.retryRevocations(other)).toBe(true); expect(s.consentGateway.revoke).toHaveBeenCalledTimes(1);
  expect(s.stored()).toContain(owner); next.dispose();
});
it('shares a storage transaction lock across overlapping old/new route instances', async () => {
  const s = setup(); await ready(s); let unblock!: () => void; const original = s.storage.setItem.getMockImplementation()!;
  s.storage.setItem.mockImplementationOnce(async (key, value) => { await new Promise<void>(resolve => { unblock = resolve; }); await original(key, value); });
  s.consentGateway.revoke.mockRejectedValue(new Error('offline'));
  const first = s.runtime.consent.revoke();
  for (let i = 0; i < 15; i++) await Promise.resolve();
  expect(unblock).toBeDefined(); s.runtime.dispose(); s.setAccount(other);
  const next = createIntelligenceRouteRuntime({ ownerId: other, dogId: dog }, s.deps);
  const second = next.consent.revoke(); unblock(); await first; await second;
  expect(JSON.parse(s.stored()!)).toEqual(expect.arrayContaining([{ accountId: owner, policyId: 'p1' }, { accountId: other, policyId: 'p1' }])); next.dispose();
});
it('rejects invalid route identities before creating ports', () => {
  const s = setup(); expect(() => createIntelligenceRouteRuntime({ ownerId: 'invalid', dogId: dog }, s.deps)).toThrow(); s.runtime.dispose();
});

it('replays a pending revoke for the same account even when policy is unavailable, without enabling chat', async () => {
  const s = setup(); await ready(s); s.consentGateway.revoke.mockRejectedValueOnce(new Error('offline')); await s.runtime.consent.revoke(); s.runtime.dispose();
  const next = createIntelligenceRouteRuntime({ ownerId: owner, dogId: dog }, { ...s.deps, policy: null });
  expect(await next.consent.loadRevision()).toBe(false); expect(await next.consent.retryRevocations(owner)).toBe(true);
  expect(s.stored()).toBe('[]'); expect(s.consentGateway.revoke).toHaveBeenCalledTimes(2); expect(next.session.snapshot().policy).toBeNull(); expect(next.session.snapshot().consent).toBeNull(); expect(s.gateway.respond).not.toHaveBeenCalled(); next.dispose();
});

it('rebinds late server policy safely and rejects an excessive or post-disposal configuration', async () => {
  const s = setup(); s.runtime.configurePolicy(null); expect(await s.runtime.consent.loadRevision()).toBe(false);
  s.runtime.configurePolicy(policy); await ready(s); s.runtime.configurePolicy({ ...policy, monthlyBudgetChfCents: 501 });
  expect(s.runtime.session.snapshot().policy).toBeNull(); expect(s.runtime.session.snapshot().consent).toBeNull();
  s.runtime.dispose(); s.runtime.configurePolicy(policy); expect(s.runtime.session.snapshot().policy).toBeNull();
});

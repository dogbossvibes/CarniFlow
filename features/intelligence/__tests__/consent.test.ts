import { IntelligenceSession } from '../session';
import { IntelligenceConsentController, type PendingRevocation } from '../consentController';
import { parseConsentReceipt, parseConsentRevision, parseRevocationReceipt, type ConsentIntent } from '../consent';
const policy = { id: 'policy', enabled: true, providerLabel: 'Provider', disclosure: 'Data transfer', retentionSummary: 'Retention', monthlyBudgetChfCents: 500 };
const action = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const receipt = (i: ConsentIntent) => ({ version: 1, accountId: i.accountId, policyId: i.policyId, text: i.text, audio: i.audio, revision: i.expectedRevision + 1, grantedAt: '2026-10-23T06:00:00Z' });
const revoked = (r: PendingRevocation, revision = 2) => ({ version: 1, ...r, revoked: true, revision, revokedAt: '2026-10-23T06:00:01Z' });
const setup = (initial: PendingRevocation[] = []) => {
  const session = new IntelligenceSession({ respond: jest.fn() }, () => 'request');
  session.selectScope({ ownerId: 'owner', dogId: 'dog' }); session.configure(policy);
  let stored = initial.map(r => ({ ...r })); let revision = 0; let actions = 0;
  const outbox = { read: jest.fn(async () => stored.map(r => ({ ...r }))), write: jest.fn(async (r: PendingRevocation[]) => { stored = r.map(v => ({ ...v })); }) };
  const uuid = jest.fn(() => `aaaaaaaa-aaaa-4aaa-8aaa-${(++actions).toString(16).padStart(12, '0')}`);
  const gateway = {
    readRevision: jest.fn(async (r: PendingRevocation, _signal: AbortSignal): Promise<unknown> => ({ version: 1, ...r, exists: revision > 0, revision })),
    grant: jest.fn(async (r: ConsentIntent, _signal: AbortSignal): Promise<unknown> => { revision = r.expectedRevision + 1; return receipt(r); }),
    revoke: jest.fn(async (r: PendingRevocation, _signal: AbortSignal): Promise<unknown> => { revision = Math.max(1, revision + 1); return revoked(r, revision); }),
  };
  const controller = new IntelligenceConsentController(session, outbox, gateway, uuid, 10);
  return { session, outbox, gateway, controller, uuid, stored: () => stored };
};
const ready = async () => { const s = setup(); expect(await s.controller.loadRevision()).toBe(true); return s; };
const deferred = () => { let resolve!: (value: unknown) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
afterEach(() => jest.useRealTimers());

it.each([{ accountId: 'other' }, { policyId: 'old' }, { text: false }, { audio: false }, { revision: 0 }, { revision: 2 },
  { revision: 1.5 }, { grantedAt: 'invalid' }, { version: 2 }, { actionId: action }])('rejects mismatched/malformed/extra ACK fields (%#)', patch => {
  const intent: ConsentIntent = { accountId: 'owner', policyId: 'policy', text: true, audio: true, expectedRevision: 0, actionId: action };
  expect(parseConsentReceipt({ ...receipt(intent), ...patch }, intent)).toBeNull();
});
it.each([
  { exists: false, revision: 1 }, { exists: true, revision: 0 }, { revision: -1 }, { revision: 1.5 },
  { revision: Number.MAX_SAFE_INTEGER }, { revision: '0' }, { accountId: 'other' }, { policyId: 'other' }, { exists: null }, { extra: true },
])('rejects invalid normalized revision state (%#)', patch => {
  expect(parseConsentRevision({ version: 1, accountId: 'owner', policyId: 'policy', exists: false, revision: 0, ...patch }, { accountId: 'owner', policyId: 'policy' })).toBeNull();
});
it('does not infer revision0 at startup or restore consent from a read', async () => {
  const s = setup(); expect(s.controller.getRevision()).toBeNull(); expect(await s.controller.grant(true, true)).toBe(false);
  expect(s.gateway.grant).not.toHaveBeenCalled(); expect(s.uuid).not.toHaveBeenCalled();
  expect(await s.controller.loadRevision()).toBe(true); expect(s.controller.getRevision()).toBe(0);
  expect(s.session.beginSpeechReview()).toBeNull(); expect(s.gateway.grant).not.toHaveBeenCalled();
});
it('requires the exact one-shot ticket for an ACK with expectedRevision+1', () => {
  const s = setup(); const i = s.session.beginConsent(true, true, action, 0)!;
  expect(s.session.confirmConsent({ ...i }, receipt(i))).toBe(false);
  expect(s.session.confirmConsent(i, receipt(i))).toBe(true);
  expect(s.session.confirmConsent(i, receipt(i))).toBe(false);
});
it('pins UUID and confirmed revision synchronously to an explicit grant', async () => {
  const s = await ready(); const grant = s.controller.grant(true, true);
  expect(s.uuid).toHaveBeenCalledTimes(1); expect(await grant).toBe(true);
  expect(s.gateway.grant.mock.calls[0][0]).toMatchObject({ expectedRevision: 0, actionId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001' });
  expect(s.controller.getRevision()).toBe(1); expect(s.gateway.readRevision).toHaveBeenCalledTimes(1);
});
it('deduplicates a second tap while a grant is pending', async () => {
  const s = await ready(); const first = s.controller.grant(true, false); const duplicate = s.controller.grant(true, true);
  expect(await duplicate).toBe(false); expect(await first).toBe(true); expect(s.gateway.grant).toHaveBeenCalledTimes(1); expect(s.uuid).toHaveBeenCalledTimes(1);
});
it.each(['bad', 'aaaaaaaa-aaaa-0aaa-8aaa-aaaaaaaaaaaa', ''])('does not send an invalid action UUID (%#)', async id => {
  const s = await ready(); s.uuid.mockReturnValueOnce(id); expect(await s.controller.grant(true, true)).toBe(false); expect(s.gateway.grant).not.toHaveBeenCalled();
});
it('does not reuse an action UUID for a new explicit action', async () => {
  const s = await ready(); s.uuid.mockReturnValue(action); expect(await s.controller.grant(true, true)).toBe(true);
  expect(await s.controller.revoke()).toBe(true); expect(await s.controller.grant(true, true)).toBe(false); expect(s.gateway.grant).toHaveBeenCalledTimes(1);
});
it('retries only the same unresolved action after an explicit retry', async () => {
  const s = await ready(); s.gateway.grant.mockRejectedValueOnce(new Error('unknown network outcome'));
  expect(await s.controller.grant(true, true)).toBe(false); expect(s.controller.getRevision()).toBeNull(); expect(s.controller.canRetryGrant()).toBe(true);
  expect(s.gateway.grant).toHaveBeenCalledTimes(1); expect(s.gateway.readRevision).toHaveBeenCalledTimes(1);
  const original = s.gateway.grant.mock.calls[0][0]; expect(await s.controller.retryGrant()).toBe(true);
  expect(s.gateway.grant.mock.calls[1][0]).toBe(original); expect(s.uuid).toHaveBeenCalledTimes(1); expect(s.gateway.readRevision).toHaveBeenCalledTimes(1);
});
it.each(['dog', 'account', 'policy', 'localRevoke'])('ignores a late grant after %s invalidation', async change => {
  const s = await ready(); const pending = deferred(); s.gateway.grant.mockReturnValueOnce(pending.promise);
  const task = s.controller.grant(true, true); await tick(); const original = s.gateway.grant.mock.calls[0][0];
  if (change === 'dog') s.session.selectScope({ ownerId: 'owner', dogId: 'other' });
  if (change === 'account') s.session.selectScope({ ownerId: 'other', dogId: 'other' });
  if (change === 'policy') s.session.configure({ ...policy, id: 'new' });
  if (change === 'localRevoke') s.session.revokeConsent();
  pending.resolve(receipt(original)); expect(await task).toBe(false); expect(s.controller.getRevision()).toBeNull();
  expect(s.controller.canRetryGrant()).toBe(false); expect(await s.controller.retryGrant()).toBe(false);
  expect(s.gateway.grant).toHaveBeenCalledTimes(1); expect(s.gateway.readRevision).toHaveBeenCalledTimes(1); expect(s.uuid).toHaveBeenCalledTimes(1);
});
it('a grant reply after explicit revoke cannot seed a revision or new action', async () => {
  const s = await ready(); const pending = deferred(); s.gateway.grant.mockReturnValueOnce(pending.promise);
  const first = s.controller.grant(true, true); await tick(); const old = s.gateway.grant.mock.calls[0][0];
  const revoke = s.controller.revoke(); expect(s.session.snapshot().consent).toBeNull(); expect(s.controller.getRevision()).toBeNull();
  pending.resolve(receipt(old)); expect(await first).toBe(false); expect(await revoke).toBe(true);
  const rev = s.controller.getRevision(); expect(rev).toBeGreaterThan(0); expect(s.gateway.grant).toHaveBeenCalledTimes(1); expect(s.uuid).toHaveBeenCalledTimes(1);
  expect(await s.controller.retryGrant()).toBe(false);
  expect(await s.controller.grant(true, true)).toBe(true);
  const next = s.gateway.grant.mock.calls[1][0]; expect(next.expectedRevision).toBe(rev); expect(next.actionId).not.toBe(old.actionId);
});
it('keeps offline revocation durable and blocks regrant/revision refresh', async () => {
  const s = await ready(); await s.controller.grant(true, true); s.gateway.revoke.mockRejectedValueOnce(new Error('offline'));
  const revoke = s.controller.revoke(); expect(s.session.snapshot().consent).toBeNull(); expect(await revoke).toBe(false);
  expect(s.stored()).toEqual([{ accountId: 'owner', policyId: 'policy' }]);
  expect(await s.controller.grant(true, true)).toBe(false); expect(await s.controller.loadRevision()).toBe(false);
  expect(s.gateway.readRevision).toHaveBeenCalledTimes(1); expect(await s.controller.retryGrant()).toBe(false);
  const restarted = new IntelligenceConsentController(s.session, s.outbox, s.gateway, s.uuid);
  expect(await restarted.loadRevision()).toBe(false); expect(restarted.getRevision()).toBeNull();
  expect(await restarted.retryRevocations('owner')).toBe(true); expect(restarted.getRevision()).toBeGreaterThan(0);
});
it('accepts a positive revision1 tombstone ACK without prior grant', async () => {
  const s = setup(); expect(await s.controller.revoke()).toBe(true); expect(s.controller.getRevision()).toBe(1);
  expect(await s.controller.grant(true, true)).toBe(true); expect(s.gateway.grant.mock.calls[0][0].expectedRevision).toBe(1);
});
it('does not forget a failed local write or send DELETE before persistence', async () => {
  const s = await ready(); s.outbox.write.mockRejectedValueOnce(new Error('disk')); expect(await s.controller.revoke()).toBe(false);
  expect(s.gateway.revoke).not.toHaveBeenCalled(); expect(await s.controller.loadRevision()).toBe(false);
  expect(await s.controller.retryRevocations('owner')).toBe(true);
});
it('does not treat storage or revision-read errors as an absent row', async () => {
  const s = setup(); s.outbox.read.mockRejectedValueOnce(new Error('disk')); expect(await s.controller.loadRevision()).toBe(false);
  s.gateway.readRevision.mockRejectedValueOnce(new Error('network')); expect(await s.controller.loadRevision()).toBe(false);
  expect(s.controller.getRevision()).toBeNull(); expect(await s.controller.grant(true, true)).toBe(false); expect(s.gateway.grant).not.toHaveBeenCalled();
});
it('never removes a pending revoke on a mismatched or zero ACK', async () => {
  const s = setup(); s.gateway.revoke.mockResolvedValueOnce(revoked({ accountId: 'other', policyId: 'policy' }));
  expect(await s.controller.revoke()).toBe(false); expect(s.stored()).toHaveLength(1);
  s.gateway.revoke.mockResolvedValueOnce(revoked({ accountId: 'owner', policyId: 'policy' }, 0));
  expect(await s.controller.retryRevocations('owner')).toBe(false); expect(s.stored()).toHaveLength(1);
});
it('does not dispatch another account’s queued revoke', async () => {
  const s = setup([{ accountId: 'other', policyId: 'policy' }]); expect(await s.controller.retryRevocations('other')).toBe(false);
  expect(s.gateway.revoke).not.toHaveBeenCalled(); expect(s.stored()).toHaveLength(1);
});
it('ignores a delayed revision read after switching away and back', async () => {
  const s = setup(); const pending = deferred(); s.gateway.readRevision.mockReturnValueOnce(pending.promise);
  const load = s.controller.loadRevision(); await tick(); s.session.selectScope({ ownerId: 'other', dogId: 'other' }); s.session.selectScope({ ownerId: 'owner', dogId: 'dog' });
  pending.resolve({ version: 1, accountId: 'owner', policyId: 'policy', exists: false, revision: 0 });
  expect(await load).toBe(false); expect(s.controller.getRevision()).toBeNull(); expect(s.uuid).not.toHaveBeenCalled();
});
it('binds before asynchronous storage access and rejects a later scope change', async () => {
  const s = await ready(); let finish!: (r: PendingRevocation[]) => void;
  s.outbox.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const task = s.controller.grant(true, true); await tick(); s.session.selectScope({ ownerId: 'other', dogId: 'other' }); finish([]);
  expect(await task).toBe(false); expect(s.gateway.grant).not.toHaveBeenCalled(); expect(s.uuid).toHaveBeenCalledTimes(1);
});
it('a timeout preserves only the same retry action; late completion never unlocks', async () => {
  jest.useFakeTimers(); const s = await ready(); const pending = deferred(); s.gateway.grant.mockReturnValueOnce(pending.promise);
  const grant = s.controller.grant(true, true); await tick(); jest.advanceTimersByTime(11); expect(await grant).toBe(false);
  const original = s.gateway.grant.mock.calls[0][0]; pending.resolve(receipt(original)); await tick();
  expect(s.session.snapshot().consent).toBeNull(); expect(s.controller.getRevision()).toBeNull(); expect(s.controller.canRetryGrant()).toBe(true);
  expect(s.gateway.grant).toHaveBeenCalledTimes(1); expect(s.gateway.readRevision).toHaveBeenCalledTimes(1);
});
it('never claims a cloud revoke from malformed acknowledgement', () => {
  expect(parseRevocationReceipt({ ...revoked({ accountId: 'owner', policyId: 'policy' }), revoked: false }, 'owner', 'policy')).toBeNull();
});
it('persists an explicit revoke while an older grant response is still pending', async () => {
  const s = await ready(); const pending = deferred(); s.gateway.grant.mockReturnValueOnce(pending.promise);
  const grant = s.controller.grant(true, true); await tick(); const old = s.gateway.grant.mock.calls[0][0];
  const revoke = s.controller.revoke(); await tick();
  expect(s.stored()).toEqual([{ accountId: 'owner', policyId: 'policy' }]); expect(s.session.snapshot().consent).toBeNull();
  pending.resolve(receipt(old)); expect(await grant).toBe(false); expect(await revoke).toBe(true);
});
it('a newer explicit revision read cancels an unresolved retry without resending it', async () => {
  const s = await ready(); s.gateway.grant.mockRejectedValueOnce(new Error('unknown'));
  expect(await s.controller.grant(true, true)).toBe(false); expect(s.controller.canRetryGrant()).toBe(true);
  s.gateway.readRevision.mockResolvedValueOnce({ version: 1, accountId: 'owner', policyId: 'policy', exists: true, revision: 1 });
  expect(await s.controller.loadRevision()).toBe(true); expect(s.controller.canRetryGrant()).toBe(false);
  expect(s.gateway.grant).toHaveBeenCalledTimes(1); expect(await s.controller.grant(true, true)).toBe(true);
  const [old, next] = s.gateway.grant.mock.calls.map(call => call[0]); expect(next.actionId).not.toBe(old.actionId); expect(next.expectedRevision).toBe(1);
});
it('keeps an unresponsive DELETE durable after timeout and allows no new grant', async () => {
  jest.useFakeTimers(); const s = await ready(); s.gateway.revoke.mockImplementationOnce(() => new Promise(() => {}));
  const revoke = s.controller.revoke(); await tick(); jest.advanceTimersByTime(11); expect(await revoke).toBe(false);
  expect(s.stored()).toHaveLength(1); expect(await s.controller.grant(true, true)).toBe(false); expect(s.gateway.grant).not.toHaveBeenCalled();
});
it('does not lose a second policy revoke while the first storage write is delayed', async () => {
  const s = setup(); const write = s.outbox.write.getMockImplementation()!; let finish!: () => void;
  s.outbox.write.mockImplementationOnce(async records => { await new Promise<void>(resolve => { finish = resolve; }); await write(records); });
  s.gateway.revoke.mockRejectedValue(new Error('offline'));
  const first = s.controller.revoke(); await tick();
  s.session.configure({ ...policy, id: 'policy-next' }); const second = s.controller.revoke(); finish();
  expect(await first).toBe(false); expect(await second).toBe(false);
  expect(s.stored()).toEqual(expect.arrayContaining([{ accountId: 'owner', policyId: 'policy' }, { accountId: 'owner', policyId: 'policy-next' }]));
});
it('never transfers a confirmed old-account revoke revision to the new account', async () => {
  const s = setup(); const pending = deferred(); s.gateway.revoke.mockReturnValueOnce(pending.promise);
  const revoke = s.controller.revoke(); await tick();
  s.session.selectScope({ ownerId: 'other', dogId: 'other' }); pending.resolve(revoked({ accountId: 'owner', policyId: 'policy' }, 1));
  expect(await revoke).toBe(true); expect(s.controller.getRevision()).toBeNull();
  expect(s.gateway.revoke.mock.calls[0][0].accountId).toBe('owner'); expect(await s.controller.grant(true, true)).toBe(false); expect(s.gateway.grant).not.toHaveBeenCalled();
});

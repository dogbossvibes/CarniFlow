import { createAccountConsentPrivacy } from '../accountPrivacyRuntime';
import { CONSENT_OUTBOX_KEY } from '../consentOutbox';
import type { ConsentGateway, PendingRevocation } from '../consentController';
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function setup(records: PendingRevocation[] = [{ accountId: owner, policyId: 'old-policy' }, { accountId: other, policyId: 'another-policy' }]) {
  let current: string | null = owner; let raw = JSON.stringify(records);
  const storage = { getItem: jest.fn(async () => raw), setItem: jest.fn(async (_key: string, value: string) => { raw = value; }) };
  const gateway = { readRevision: jest.fn(), grant: jest.fn(), revoke: jest.fn<Promise<unknown>, [PendingRevocation, AbortSignal]>(async record => ({ version: 1, ...record, revoked: true, revision: 1, revokedAt: '2026-10-23T09:00:00Z' })) };
  const runtime = createAccountConsentPrivacy(owner, () => current, storage, gateway as ConsentGateway);
  return { runtime, storage, gateway, stored: () => JSON.parse(raw) as PendingRevocation[], select: (id: string | null) => { current = id; }, corrupt: () => { raw = 'corrupt'; } };
}
afterEach(() => jest.useRealTimers());
it('requires no dog or active policy and sends only stored original-account records on explicit action', async () => {
  const s = setup(); expect(s.storage.getItem).not.toHaveBeenCalled(); expect(s.gateway.revoke).not.toHaveBeenCalled();
  expect(await s.runtime.retry()).toBe(true); expect(s.gateway.revoke).toHaveBeenCalledWith({ accountId: owner, policyId: 'old-policy' }, expect.anything());
  expect(s.stored()).toEqual([{ accountId: other, policyId: 'another-policy' }]); expect(s.storage.setItem.mock.calls[0][0]).toBe(CONSENT_OUTBOX_KEY);
  expect(s.gateway.grant).not.toHaveBeenCalled(); expect(s.gateway.readRevision).not.toHaveBeenCalled(); s.runtime.dispose();
});
it('keeps an offline record until a matching authenticated ACK and explicit retry', async () => {
  const s = setup(); s.gateway.revoke.mockRejectedValueOnce(new Error('offline')); expect(await s.runtime.retry()).toBe(false);
  expect(s.stored()).toHaveLength(2); expect(s.gateway.revoke).toHaveBeenCalledTimes(1); expect(await s.runtime.retry()).toBe(true); expect(s.stored()).toHaveLength(1); s.runtime.dispose();
});
it('never clears a foreign or malformed ACK and never interprets it as completed privacy work', async () => {
  const s = setup(); s.gateway.revoke.mockResolvedValueOnce({ version: 1, accountId: other, policyId: 'old-policy', revoked: true, revision: 1, revokedAt: '2026-10-23T09:00:00Z' });
  expect(await s.runtime.retry()).toBe(false); expect(s.stored()).toHaveLength(2); expect(s.storage.setItem.mock.calls.every(([, value]) => JSON.parse(value).length === 2)).toBe(true); s.runtime.dispose();
});
it('aborts on account switch/disposal and ignores a late server success without removing the record', async () => {
  const s = setup(); let finish!: (v: unknown) => void; let started!: () => void; const reached = new Promise<void>(resolve => { started = resolve; });
  s.gateway.revoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; started(); }));
  const pending = s.runtime.retry(); await reached; const [record, signal] = s.gateway.revoke.mock.calls[0]; s.select(other); s.runtime.dispose(); expect(signal.aborted).toBe(true);
  finish({ version: 1, ...record, revoked: true, revision: 1, revokedAt: '2026-10-23T09:00:00Z' }); expect(await pending).toBe(false); expect(s.stored()).toHaveLength(2);
  expect(await s.runtime.retry()).toBe(false); expect(s.gateway.revoke).toHaveBeenCalledTimes(1);
});
it('interrupts background requests and leaves the record available for a conscious retry', async () => {
  const s = setup(); let started!: () => void; const reached = new Promise<void>(resolve => { started = resolve; });
  s.gateway.revoke.mockImplementationOnce(() => { started(); return new Promise(() => {}); });
  const pending = s.runtime.retry(); await reached; s.runtime.interrupt(); expect(await pending).toBe(false); expect(s.stored()).toHaveLength(2);
  expect(await s.runtime.retry()).toBe(true); s.runtime.dispose();
});
it('does not read or replay when the original account is no longer authenticated', async () => {
  const s = setup(); s.select(other); expect(await s.runtime.retry()).toBe(false); expect(s.storage.getItem).not.toHaveBeenCalled(); expect(s.gateway.revoke).not.toHaveBeenCalled(); s.runtime.dispose();
});
it('fails closed on corrupted storage and keeps data after a cleanup write failure', async () => {
  const s = setup(); const original = s.storage.setItem.getMockImplementation()!; s.storage.setItem.mockImplementationOnce(original).mockRejectedValueOnce(new Error('storage full')); expect(await s.runtime.retry()).toBe(false); expect(s.stored()).toHaveLength(2);
  s.corrupt(); expect(await s.runtime.retry()).toBe(false); expect(s.gateway.revoke).toHaveBeenCalledTimes(1); s.runtime.dispose();
});
it('reports an empty outbox without fabricating a policy or sending a server request', async () => {
  const s = setup([]); expect(await s.runtime.retry()).toBe(true); expect(s.gateway.revoke).not.toHaveBeenCalled(); expect(s.gateway.grant).not.toHaveBeenCalled(); s.runtime.dispose();
});

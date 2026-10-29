import { CONSENT_OUTBOX_KEY, createConsentOutbox } from '../consentOutbox';
it('retains only account/policy identifiers across adapter recreation', async () => {
  let raw: string | null = null;
  const storage = { getItem: jest.fn(async () => raw), setItem: jest.fn(async (_key: string, value: string) => { raw = value; }) };
  const first = createConsentOutbox(storage); expect(await first.read()).toEqual([]);
  await first.write([{ accountId: 'owner', policyId: 'policy' }]);
  expect(storage.setItem).toHaveBeenCalledWith(CONSENT_OUTBOX_KEY, '[{"accountId":"owner","policyId":"policy"}]');
  const restarted = createConsentOutbox(storage); expect(await restarted.read()).toEqual([{ accountId: 'owner', policyId: 'policy' }]);
});
it.each(['', '{', 'null', '{}', '[{"accountId":"owner","policyId":"policy","text":"private"}]',
  '[{"accountId":"","policyId":"policy"}]', 'x'.repeat(100001)])('fails closed on corrupt storage without overwriting it (%#)', async raw => {
  const storage = { getItem: jest.fn(async () => raw), setItem: jest.fn() };
  await expect(createConsentOutbox(storage).read()).rejects.toThrow(); expect(storage.setItem).not.toHaveBeenCalled();
});
it('propagates storage read and write failures instead of dropping pending revocations', async () => {
  const storage = { getItem: jest.fn(async () => { throw new Error('unavailable'); }), setItem: jest.fn(async () => { throw new Error('full'); }) };
  const outbox = createConsentOutbox(storage);
  await expect(outbox.read()).rejects.toThrow(); await expect(outbox.write([{ accountId: 'owner', policyId: 'policy' }])).rejects.toThrow();
});
it('rejects excess or malformed writes before touching storage', async () => {
  const storage = { getItem: jest.fn(async () => null), setItem: jest.fn() };
  await expect(createConsentOutbox(storage).write(Array.from({ length: 257 }, () => ({ accountId: 'owner', policyId: 'policy' })))).rejects.toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
});

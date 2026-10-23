import { createLiveShareTransport } from '../liveShareTransport';
const input = { userId: 'owner', sessionId: 'session', dogId: 'dog', shareId: 'share',
  recipientIds: ['recipient'], durationMs: 60_000 };
const ack = { version: 1, serverNowMs: 1_000_000, expiresAtMs: 1_060_000, userId: 'owner',
  sessionId: 'session', dogId: 'dog', shareId: 'share', recipientUserIds: ['recipient'] };
it('projects only whitelisted RPC fields and derives observation time from server plus monotonic time', async () => {
  let time = 100;
  const rpc = jest.fn().mockResolvedValueOnce(ack).mockResolvedValueOnce({ version: 1, serverNowMs: 1_005_000,
    shareId: 'share', sequence: 1, accepted: true });
  const t = createLiveShareTransport(rpc, () => time), signal = new AbortController().signal;
  await t.start(input, signal);
  time += 5_000;
  await t.publish('owner', { shareId: 'share', sessionId: 'session', sequence: 1, latitude: 47,
    longitude: 8, accuracyM: 4, observedAtMonotonicMs: time }, signal);
  expect(rpc.mock.calls[0][3]).toEqual({ shareId: 'share', sessionId: 'session', dogId: 'dog',
    recipientUserIds: ['recipient'], ttlSeconds: 60 });
  expect(rpc.mock.calls[1][3]).toEqual({ shareId: 'share', sessionId: 'session', sequence: 1,
    latitude: 47, longitude: 8, accuracyM: 4, observedAtServerMs: 1_005_000 });
});
it('rejects broadened server recipients and missing/mismatched acknowledgement fields', async () => {
  for (const patch of [{ recipientUserIds: ['recipient', 'stranger'] }, { recipientUserIds: ['stranger'] },
    { version: 2 }, { dogId: 'other' }, { expiresAtMs: NaN }]) {
    const rpc = jest.fn().mockResolvedValue({ ...ack, ...patch });
    await expect(createLiveShareTransport(rpc, () => 1).start(input, new AbortController().signal)).rejects.toThrow();
  }
});
it('a revocation in flight blocks a late start acknowledgement and subsequent publishes', async () => {
  let resolve!: (data: Record<string, unknown>) => void;
  const pending = new Promise<Record<string, unknown>>(r => { resolve = r; });
  const rpc = jest.fn().mockReturnValueOnce(pending).mockResolvedValueOnce({ version: 1,
    serverNowMs: 1_000_000, shareId: 'share', revoked: true });
  const t = createLiveShareTransport(rpc, () => 100), signal = new AbortController().signal;
  const starting = t.start(input, signal);
  await t.revoke('owner', { shareId: 'share', sessionId: 'session' });
  resolve(ack);
  await expect(starting).rejects.toThrow('REVOKED');
  await expect(t.publish('owner', { shareId: 'share', sessionId: 'session', sequence: 1,
    latitude: 47, longitude: 8, accuracyM: 4, observedAtMonotonicMs: 100 }, signal)).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(2);
});
it('does not acknowledge revocation on an unrelated success response', async () => {
  const t = createLiveShareTransport(jest.fn().mockResolvedValue({ version: 1,
    serverNowMs: 1_000_000, shareId: 'another', revoked: true }), () => 100);
  await expect(t.revoke('owner', { shareId: 'share', sessionId: 'session' })).rejects.toThrow('INVALID_RESPONSE');
});
it('sends integer observation milliseconds for real fractional monotonic clocks', async () => {
 let time = 100.125;
 const rpc = jest.fn(async (_owner, _endpoint, action, payload) => {
  if (action === 'start') return ack;
  if (!Number.isSafeInteger(payload.observedAtServerMs)) throw new Error('GROUP_INVALID_REQUEST');
  return { version: 1, serverNowMs: 1_005_000, shareId: 'share', sequence: 1, accepted: true };
 });
 const transport = createLiveShareTransport(rpc, () => time), signal = new AbortController().signal;
 await transport.start(input, signal); time = 5100.875;
 await expect(transport.publish('owner', { shareId: 'share', sessionId: 'session', sequence: 1,
  latitude: 47, longitude: 8, accuracyM: 4, observedAtMonotonicMs: time - 1 }, signal)).resolves.toBeUndefined();
 expect(rpc.mock.calls[1][3].observedAtServerMs).toBe(1_004_999);
});

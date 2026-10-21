import { LiveShareController, type LiveShareTransport, type StartShare, type ShareState } from '../liveShareController';
import { RevocationJournal } from '../revocationJournal';
import type { ShareGrant } from '../liveShareLease';

const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const input: StartShare = { userId: user, sessionId: '20000000-0000-4000-8000-000000000001',
  shareId: '30000000-0000-4000-8000-000000000001', dogId: '40000000-0000-4000-8000-000000000001',
  recipientIds: [other], durationMs: 60_000 };
const grant: ShareGrant = { ...input, serverNowMs: 1_000_000, expiresAtMs: 1_060_000 };
const point = { latitude: 47, longitude: 8, accuracyM: 4 };
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function setup() {
  let now = 100, uid: string | null = user;
  const data = new Map<string, string>(), states: ShareState[] = [];
  const storage = { getItem: jest.fn(async (k: string) => data.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => { data.set(k, v); }) };
  const journal = new RevocationJournal(storage);
  const transport = { start: jest.fn(async () => grant), publish: jest.fn(async () => undefined),
    revoke: jest.fn(async () => undefined) };
  const controller = new LiveShareController(transport as LiveShareTransport, journal, () => uid,
    () => now, s => states.push(s));
  return { controller, journal, transport, storage, states, setUser: (u: string | null) => { uid = u; },
    setTime: (n: number) => { now = n; } };
}
it('records the revocation before creating a share and erases it only after server ACK', async () => {
  const s = setup();
  s.transport.start.mockImplementation(async () => {
    expect(await s.journal.list(user)).toEqual([{ shareId: input.shareId, sessionId: input.sessionId }]);
    return grant;
  });
  expect(await s.controller.start(input)).toBe(true);
  await s.controller.position(point, 100);
  expect(s.transport.publish).toHaveBeenCalledTimes(1);
  await s.controller.stop();
  expect(s.transport.revoke).toHaveBeenCalledWith(user, { shareId: input.shareId, sessionId: input.sessionId });
  expect(await s.journal.list(user)).toEqual([]);
  expect(s.controller.snapshot.phase).toBe('stopped');
});
it('never creates a server grant if durable storage fails', async () => {
  const s = setup(); s.storage.setItem.mockRejectedValueOnce(new Error('full'));
  expect(await s.controller.start(input)).toBe(false);
  expect(s.transport.start).not.toHaveBeenCalled();
  expect(s.controller.snapshot).toEqual({ phase: 'error', issue: 'storage' });
});
it('stop during a delayed start cannot reactivate sharing, even when abort is ignored', async () => {
  const s = setup(), d = deferred<ShareGrant>();
  const entered = deferred<void>();
  s.transport.start.mockImplementation(() => { entered.resolve(); return d.promise; });
  const starting = s.controller.start(input);
  await entered.promise;
  await s.controller.stop();
  d.resolve(grant);
  expect(await starting).toBe(false);
  await s.controller.position(point, 100);
  expect(s.transport.publish).not.toHaveBeenCalled();
  expect(s.transport.revoke).toHaveBeenCalled();
  expect(s.controller.snapshot.phase).not.toBe('sharing');
});
it('sends no backlog after failure; persistent revoke retries never resume sharing', async () => {
  const s = setup(); await s.controller.start(input);
  s.transport.publish.mockRejectedValueOnce(new Error('offline'));
  s.transport.revoke.mockRejectedValueOnce(new Error('offline'));
  await s.controller.position(point, 100);
  expect(s.controller.snapshot.phase).toBe('revoke_pending');
  expect((await s.journal.list(user)).length).toBe(1);
  s.setTime(10_100); await s.controller.position(point, 10_100);
  expect(s.transport.publish).toHaveBeenCalledTimes(1);
  expect(await s.controller.start(input)).toBe(false);
  expect(await s.controller.retryPending()).toBe(true);
  expect(await s.journal.list(user)).toEqual([]);
  expect(s.transport.start).toHaveBeenCalledTimes(1);
});
it('keeps owner revocations after logout and never dispatches them under another account', async () => {
  const s = setup(); await s.controller.start(input);
  s.setUser(other); s.controller.tick();
  expect(s.transport.revoke).not.toHaveBeenCalled();
  expect(await s.controller.retryPending()).toBe(true); // other account has no journal.
  expect((await s.journal.list(user)).length).toBe(1);
  s.setUser(user); await s.controller.retryPending();
  expect(s.transport.revoke).toHaveBeenCalledWith(user, expect.anything());
  expect(await s.journal.list(user)).toEqual([]);
});
it('limits publish concurrency and aborts the outstanding request immediately on stop', async () => {
  const s = setup(), d = deferred<undefined>();
  s.transport.publish.mockReturnValue(d.promise);
  await s.controller.start(input);
  const sending = s.controller.position(point, 100);
  s.setTime(10_100); await s.controller.position(point, 10_100);
  expect(s.transport.publish).toHaveBeenCalledTimes(1);
  const signal = (s.transport.publish.mock.calls as unknown as [string, unknown, AbortSignal][])[0][2];
  const stopping = s.controller.stop();
  expect(signal.aborted).toBe(true);
  d.resolve(undefined); await sending; await stopping;
});
it('tick stops expired sharing before the next position and revokes server access', async () => {
  const s = setup(); await s.controller.start(input);
  s.setTime(60_100); await s.controller.position(point, 60_100);
  expect(s.transport.publish).not.toHaveBeenCalled();
  expect(s.transport.revoke).toHaveBeenCalledTimes(1);
});
it('rejects a server grant with a different share ID or a longer duration', async () => {
  for (const patch of [{ shareId: 'unexpected' }, { expiresAtMs: grant.expiresAtMs + 1 }]) {
    const s = setup(); s.transport.start.mockResolvedValue({ ...grant, ...patch });
    expect(await s.controller.start(input)).toBe(false);
    expect(s.transport.revoke).toHaveBeenCalledWith(user, { shareId: input.shareId, sessionId: input.sessionId });
  }
});
it('dispose aborts late publication and suppresses UI callbacks', async () => {
  const s = setup(); await s.controller.start(input);
  const count = s.states.length;
  s.controller.dispose();
  await Promise.resolve();
  expect(s.states).toHaveLength(count);
  expect(await s.controller.start(input)).toBe(false);
});
it('shows a pending revocation restored after restart even when the first retry is offline', async () => {
  const s = setup(); await s.journal.put(user, { shareId: input.shareId, sessionId: input.sessionId });
  s.transport.revoke.mockRejectedValueOnce(new Error('offline'));
  expect(await s.controller.retryPending()).toBe(false);
  expect(s.controller.snapshot).toEqual({ phase: 'revoke_pending', issue: 'connection' });
  expect(await s.controller.start(input)).toBe(false);
  expect(await s.controller.retryPending()).toBe(true);
  expect(s.controller.snapshot.phase).toBe('stopped');
  expect(s.transport.start).not.toHaveBeenCalled();
});
it('keeps a failed revocation-journal read visible and blocks new grants', async () => {
  const s = setup(); s.storage.getItem.mockRejectedValueOnce(new Error('storage'));
  expect(await s.controller.retryPending()).toBe(false);
  expect(s.controller.snapshot).toEqual({ phase: 'revoke_pending', issue: 'storage' });
  expect(await s.controller.start(input)).toBe(false);
});
it('coalesces Stop and manual retry so an older failure cannot overwrite a newer ACK', async () => {
  const s = setup(); await s.controller.start(input);
  const revoke = deferred<undefined>(); s.transport.revoke.mockReturnValueOnce(revoke.promise);
  const stopping = s.controller.stop(), retrying = s.controller.retryPending();
  await Promise.resolve(); await Promise.resolve();
  expect(s.transport.revoke).toHaveBeenCalledTimes(1);
  revoke.resolve(undefined); await stopping; await retrying;
  expect(s.controller.snapshot.phase).toBe('stopped');
  expect(await s.journal.list(user)).toHaveLength(0);
});
it('a second Stop while revocation is pending cannot orphan the successful first ACK', async () => {
  const s = setup(); await s.controller.start(input);
  const revoke = deferred<undefined>(); s.transport.revoke.mockReturnValueOnce(revoke.promise);
  const first = s.controller.stop(); await s.controller.stop();
  revoke.resolve(undefined); await first;
  expect(s.controller.snapshot.phase).toBe('stopped');
  expect(await s.journal.list(user)).toHaveLength(0);
  expect(s.transport.revoke).toHaveBeenCalledTimes(1);
});
it('acknowledges cancellation after a delayed durable write without starting a remote grant', async () => {
  const s = setup(), written = deferred<undefined>(), entered = deferred<undefined>();
  const original = s.storage.setItem.getMockImplementation()!;
  s.storage.setItem.mockImplementationOnce(async (key, value) => { entered.resolve(undefined); await written.promise; await original(key, value); });
  const starting = s.controller.start(input); await entered.promise;
  await s.controller.stop(); expect(s.controller.snapshot.phase).toBe('revoke_pending');
  written.resolve(undefined); expect(await starting).toBe(false);
  expect(s.transport.start).not.toHaveBeenCalled();
  expect(await s.journal.list(user)).toHaveLength(0);
  expect(s.controller.snapshot.phase).toBe('stopped');
});
it('keeps ACTIVE denial visible while retaining the existing safe revocation flow', async () => {
  const s = setup(); s.transport.start.mockRejectedValue(new Error('TRACKING_ACTIVE_REQUIRED'));
  expect(await s.controller.start(input)).toBe(false);
  expect(s.controller.snapshot).toEqual({ phase: 'error', issue: 'active_required' });
  expect(s.transport.publish).not.toHaveBeenCalled();
  expect(s.transport.revoke).toHaveBeenCalledWith(user, { shareId: input.shareId, sessionId: input.sessionId });
  expect(await s.journal.list(user)).toEqual([]);
});
it('stops publishing and revokes when server initiator rights expire during sharing', async () => {
  const s = setup(); await s.controller.start(input);
  s.transport.publish.mockRejectedValueOnce(new Error('TRACKING_ACTIVE_REQUIRED'));
  await s.controller.position(point, 100);
  expect(s.controller.snapshot).toEqual({ phase: 'stopped', issue: 'active_required' });
  expect(s.transport.revoke).toHaveBeenCalledWith(user, { shareId: input.shareId, sessionId: input.sessionId });
  s.setTime(10_100); await s.controller.position(point, 10_100);
  expect(s.transport.publish).toHaveBeenCalledTimes(1);
});
it('retains revocation after initiator denial even if the network cannot acknowledge it', async () => {
  const s = setup(); await s.controller.start(input);
  s.transport.publish.mockRejectedValueOnce(new Error('TRACKING_ACTIVE_REQUIRED'));
  s.transport.revoke.mockRejectedValueOnce(new Error('offline'));
  await s.controller.position(point, 100);
  expect(s.controller.snapshot).toEqual({ phase: 'revoke_pending', issue: 'active_required' });
  expect(await s.journal.list(user)).toEqual([{ shareId: input.shareId, sessionId: input.sessionId }]);
});

import { createTransferRpcClient } from '../rpc';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
function setup() {
  let authChange!: () => void;
  const currentUser = jest.fn(async () => 'owner' as string | null);
  const request = jest.fn(async () => ({ data: { version: 1, serverNowMs: 1000 }, error: null as { message?: string; code?: string } | null }));
  const client = createTransferRpcClient({ currentUser, request, onAuthChange: fn => { authChange = fn; return jest.fn(); } }, 1000);
  return { client, currentUser, request, authChange: () => authChange() };
}
it('authenticates before querying and never sends an owner ID in the RPC request', async () => {
  const s = setup();
  await s.client.call('owner', 'list', {});
  expect(s.request).toHaveBeenCalledWith('list', {}, expect.anything());
  expect(s.currentUser).toHaveBeenCalledTimes(2);
  s.currentUser.mockResolvedValue(null);
  await expect(s.client.call('owner', 'list', {})).rejects.toThrow('ACCOUNT_CHANGED');
  expect(s.request).toHaveBeenCalledTimes(1); s.client.dispose();
});
it('rejects a delayed response crossing A→B→A, even when the final account matches again', async () => {
  const s = setup(), d = deferred<Awaited<ReturnType<typeof s.request>>>();
  s.request.mockReturnValue(d.promise);
  const result = s.client.call('owner', 'list', {});
  await Promise.resolve(); s.authChange(); s.authChange();
  d.resolve({ data: { version: 1, serverNowMs: 1000 }, error: null });
  await expect(result).rejects.toThrow('ACCOUNT_CHANGED'); s.client.dispose();
});
it('times out a stalled auth lookup and never dispatches its later server mutation', async () => {
  jest.useFakeTimers();
  const s = setup(), d = deferred<string | null>(); s.currentUser.mockReturnValue(d.promise);
  const result = s.client.call('owner', 'start', {});
  const rejected = expect(result).rejects.toThrow('CONNECTION');
  jest.advanceTimersByTime(1000); await rejected;
  d.resolve('owner'); await Promise.resolve(); await Promise.resolve();
  expect(s.request).not.toHaveBeenCalled(); s.client.dispose(); jest.useRealTimers();
});
it('sanitizes arbitrary server errors rather than disclosing payloads', async () => {
  const s = setup(); s.request.mockResolvedValue({ data: { version: 1, serverNowMs: 1000 }, error: { message: 'SECRET GPS payload' } });
  await expect(s.client.call('owner', 'snapshot', {})).rejects.toThrow('CONNECTION');
  s.client.dispose();
});
it('missing deployed RPC is unavailable, never an empty successful group list', async () => {
  const s = setup(); s.request.mockResolvedValue({ data: { version: 1, serverNowMs: 1000 }, error: { code: 'PGRST202' } });
  await expect(s.client.call('owner', 'list', {})).rejects.toThrow('TRANSFER_UNAVAILABLE');
  s.client.dispose();
});
it('preserves maintenance unavailability as a distinct safe product error', async () => {
  const s = setup(); s.request.mockResolvedValue({ data: { version: 1, serverNowMs: 1000 }, error: { message: 'TRANSFER_MAINTENANCE_UNAVAILABLE' } });
  await expect(s.client.call('owner', 'start', {})).rejects.toThrow('TRANSFER_MAINTENANCE_UNAVAILABLE');
  s.client.dispose();
});

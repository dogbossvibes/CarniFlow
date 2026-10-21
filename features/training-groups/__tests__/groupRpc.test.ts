import { TrackSharingAccessError } from '@/services/trackSharingAccess';
import { createGroupRpcClient } from '../groupRpc';
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
function setup() {
  let authChange!: () => void;
  const currentUser = jest.fn(async () => 'owner' as string | null);
  const request = jest.fn(async () => ({ data: { version: 1, serverNowMs: 1000 }, error: null as { message?: string; code?: string } | null }));
  const authorizeInitiation = jest.fn(async () => {});
  const client = createGroupRpcClient({ currentUser, request, authorizeInitiation, onAuthChange: fn => { authChange = fn; return jest.fn(); } }, 1000);
  return { client, currentUser, request, authorizeInitiation, authChange: () => authChange() };
}
it('authenticates before querying and never sends an owner ID in the RPC request', async () => {
  const s = setup();
  await s.client.call('owner', 'training_group_v1', 'list', {});
  expect(s.request).toHaveBeenCalledWith('training_group_v1', 'list', {}, expect.anything());
  expect(s.currentUser).toHaveBeenCalledTimes(2);
  s.currentUser.mockResolvedValue(null);
  await expect(s.client.call('owner', 'training_group_v1', 'list', {})).rejects.toThrow('ACCOUNT_CHANGED');
  expect(s.request).toHaveBeenCalledTimes(1); s.client.dispose();
});
it('rejects a delayed response crossing A→B→A, even when the final account matches again', async () => {
  const s = setup(), d = deferred<Awaited<ReturnType<typeof s.request>>>();
  s.request.mockReturnValue(d.promise);
  const result = s.client.call('owner', 'training_group_v1', 'list', {});
  await Promise.resolve(); s.authChange(); s.authChange();
  d.resolve({ data: { version: 1, serverNowMs: 1000 }, error: null });
  await expect(result).rejects.toThrow('ACCOUNT_CHANGED'); s.client.dispose();
});
it('times out a stalled auth lookup and never dispatches its later server mutation', async () => {
  jest.useFakeTimers();
  const s = setup(), d = deferred<string | null>(); s.currentUser.mockReturnValue(d.promise);
  const result = s.client.call('owner', 'training_group_live_v1', 'start', {});
  const rejected = expect(result).rejects.toThrow('CONNECTION');
  jest.advanceTimersByTime(1000); await rejected;
  d.resolve('owner'); await Promise.resolve(); await Promise.resolve();
  expect(s.request).not.toHaveBeenCalled(); s.client.dispose(); jest.useRealTimers();
});
it('sanitizes arbitrary server errors rather than disclosing payloads', async () => {
  const s = setup(); s.request.mockResolvedValue({ data: { version: 1, serverNowMs: 1000 }, error: { message: 'SECRET GPS payload' } });
  await expect(s.client.call('owner', 'training_group_live_v1', 'snapshot', {})).rejects.toThrow('GROUP_CONNECTION');
  s.client.dispose();
});
it('missing deployed RPC is unavailable, never an empty successful group list', async () => {
  const s = setup(); s.request.mockResolvedValue({ data: { version: 1, serverNowMs: 1000 }, error: { code: 'PGRST202' } });
  await expect(s.client.call('owner', 'training_group_v1', 'list', {})).rejects.toThrow('GROUP_UNAVAILABLE');
  s.client.dispose();
});
it('preserves maintenance unavailability as a distinct safe product error', async () => {
  const s = setup(); s.request.mockResolvedValue({ data: { version: 1, serverNowMs: 1000 }, error: { message: 'GROUP_MAINTENANCE_UNAVAILABLE' } });
  await expect(s.client.call('owner', 'training_group_live_v1', 'start', {})).rejects.toThrow('GROUP_MAINTENANCE_UNAVAILABLE');
  s.client.dispose();
});

it('requires ACTIVE for live start before any live mutation', async () => {
  const s = setup(); s.authorizeInitiation.mockRejectedValue(new TrackSharingAccessError('TRACKING_ACTIVE_REQUIRED'));
  await expect(s.client.call('owner', 'training_group_live_v1', 'start', {})).rejects.toThrow('TRACKING_ACTIVE_REQUIRED');
  expect(s.request).not.toHaveBeenCalled(); s.client.dispose();
});
it.each(['publish', 'snapshot', 'revoke'])('keeps existing live %s available without a new ACTIVE gate', async action => {
  const s = setup(); s.authorizeInitiation.mockRejectedValue(new TrackSharingAccessError('TRACKING_ACTIVE_REQUIRED'));
  await s.client.call('owner', 'training_group_live_v1', action, {});
  expect(s.authorizeInitiation).not.toHaveBeenCalled(); expect(s.request).toHaveBeenCalledTimes(1); s.client.dispose();
});
it('does not expand the gate to creating groups or accepting invitations', async () => {
  const s = setup(); s.authorizeInitiation.mockRejectedValue(new TrackSharingAccessError('TRACKING_ACTIVE_REQUIRED'));
  await s.client.call('owner', 'training_group_v1', 'create', {});
  await s.client.call('owner', 'training_group_v1', 'accept', {});
  expect(s.authorizeInitiation).not.toHaveBeenCalled(); s.client.dispose();
});

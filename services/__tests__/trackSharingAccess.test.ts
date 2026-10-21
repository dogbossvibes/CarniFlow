import { createTrackSharingAccessCheck, requireTrackSharingAccess } from '../trackSharingAccess';
const mockRpc = jest.fn(), mockGetSession = jest.fn(), mockAbortSignal = jest.fn();
const mockUnsubscribe = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: {
  rpc: (...args: unknown[]) => mockRpc(...args),
  auth: { getSession: () => mockGetSession(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: mockUnsubscribe } } }) },
} }));
function deferred<T>() { let resolve!: (x: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
function setup() {
  let changed!: () => void;
  const unsubscribe = jest.fn();
  const currentUser = jest.fn(async () => 'owner' as string | null);
  const request = jest.fn(async () => ({ data: { version: 1, canInitiate: true } as unknown, error: null as unknown }));
  const check = createTrackSharingAccessCheck({ currentUser, request, onAuthChange: fn => { changed = fn; return unsubscribe; } }, 50);
  return { check, request, currentUser, unsubscribe, changed: () => changed() };
}
afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); });
it('production request uses current auth and sends no caller-selected user ID', async () => {
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null });
  mockAbortSignal.mockResolvedValue({ data: { version: 1, canInitiate: true }, error: null });
  mockRpc.mockReturnValue({ abortSignal: mockAbortSignal });
  await requireTrackSharingAccess('owner');
  expect(mockRpc).toHaveBeenCalledWith('track_sharing_access_v1');
  expect(mockGetSession).toHaveBeenCalledTimes(2); expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
});
it('accepts only explicit current server permission and checks again on the next initiation', async () => {
  const s = setup(); await s.check('owner');
  s.request.mockResolvedValue({ data: { version: 1, canInitiate: false }, error: null });
  await expect(s.check('owner')).rejects.toMatchObject({ code: 'TRACKING_ACTIVE_REQUIRED' });
  expect(s.request).toHaveBeenCalledTimes(2); expect(s.unsubscribe).toHaveBeenCalledTimes(2);
});
it.each([null, [], true, { version: 2, canInitiate: true }, { version: 1 }, { version: 1, canInitiate: 'true' }])('fails closed on malformed authority %j', async data => {
  const s = setup(); s.request.mockResolvedValue({ data, error: null });
  await expect(s.check('owner')).rejects.toMatchObject({ code: 'TRACKING_ACCESS_UNAVAILABLE' });
});
it.each([{ code: 'PGRST202' }, { message: 'private payload' }])('does not fall back to old cached rights after RPC failure', async error => {
  const s = setup(); await s.check('owner'); s.request.mockResolvedValue({ data: {version:1,canInitiate:true}, error });
  await expect(s.check('owner')).rejects.toThrow('TRACKING_ACCESS_UNAVAILABLE');
});
it('rejects anonymous and foreign identity without querying permissions', async () => {
  const s = setup(); s.currentUser.mockResolvedValue(null);
  await expect(s.check('owner')).rejects.toThrow('ACCOUNT_CHANGED');
  s.currentUser.mockResolvedValue('other'); await expect(s.check('owner')).rejects.toThrow('ACCOUNT_CHANGED');
  expect(s.request).not.toHaveBeenCalled();
});
it('rejects A→B→A during lookup even when final session matches', async () => {
  const s = setup(), d = deferred<Awaited<ReturnType<typeof s.request>>>(); s.request.mockReturnValue(d.promise);
  const result = s.check('owner'); await Promise.resolve(); s.changed(); s.changed();
  d.resolve({ data: { version: 1, canInitiate: true }, error: null });
  await expect(result).rejects.toThrow('ACCOUNT_CHANGED'); expect(s.unsubscribe).toHaveBeenCalledTimes(1);
});
it('rejects a differing session after a successful authority result', async () => {
  const s = setup(); s.currentUser.mockResolvedValueOnce('owner').mockResolvedValueOnce('other');
  await expect(s.check('owner')).rejects.toThrow('ACCOUNT_CHANGED');
});
it('does not query after cancellation before entry', async () => {
  const s = setup(), controller = new AbortController(); controller.abort();
  await expect(s.check('owner', controller.signal)).rejects.toThrow('TRACKING_ACCESS_UNAVAILABLE');
  expect(s.request).not.toHaveBeenCalled();
});
it('times out a hanging lookup and ignores late permission', async () => {
  jest.useFakeTimers(); const s = setup(), d = deferred<string | null>(); s.currentUser.mockReturnValue(d.promise);
  const result = expect(s.check('owner')).rejects.toThrow('TRACKING_ACCESS_UNAVAILABLE');
  jest.advanceTimersByTime(50); await result; d.resolve('owner'); await Promise.resolve(); await Promise.resolve();
  expect(s.request).not.toHaveBeenCalled(); expect(s.unsubscribe).toHaveBeenCalledTimes(1);
});

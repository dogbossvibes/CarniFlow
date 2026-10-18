import { listConnections, listConnectionsStrict } from '@/services/connectionService';
import { listConnectedInviteTargets } from '@/features/training-groups/connectedInviteTargets';
const mockQuery = jest.fn(), mockNames = jest.fn(), mockAbort = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ or: () => ({ eq: () => ({ order: () => ({ then: (resolve: (value: unknown) => unknown) => Promise.resolve(mockQuery()).then(resolve), abortSignal: (signal: AbortSignal) => { mockAbort(signal); return Promise.resolve(mockQuery()); } }) }) }) }) }), rpc: () => ({ then: (resolve: (value: unknown) => unknown) => Promise.resolve(mockNames()).then(resolve), abortSignal: (signal: AbortSignal) => { mockAbort(signal); return Promise.resolve(mockNames()); } }) } }));
beforeEach(() => { jest.clearAllMocks(); mockQuery.mockReturnValue({ data: [], error: null }); mockNames.mockReturnValue({ data: [], error: null }); });
it('strict lookup propagates resolved Supabase failures instead of reporting an empty contact list', async () => {
  mockQuery.mockReturnValue({ data: null, error: { message: 'offline' } });
  await expect(listConnectionsStrict('owner', 'trainer_client')).rejects.toThrow('CONNECTION_LOOKUP_FAILED');
  await expect(listConnections('owner')).resolves.toEqual([]);
});
it('strict name lookup propagates failure and forwards cancellation to both existing reads', async () => {
  const signal = new AbortController().signal;
  mockQuery.mockReturnValue({ data: [{ owner_user_id: 'owner', connected_user_id: 'contact', status: 'accepted' }], error: null });
  mockNames.mockReturnValue({ data: null, error: { message: 'offline' } });
  await expect(listConnectionsStrict('owner', 'trainer_client', signal)).rejects.toThrow('CONNECTION_LOOKUP_FAILED');
  expect(mockAbort.mock.calls).toEqual([[signal], [signal]]);
});
it('accepts only confirmed connections involving this account and deduplicates across connection types', async () => {
  mockQuery.mockReturnValue({ data: [
    { owner_user_id: 'owner', connected_user_id: 'contact', status: 'accepted' },
    { owner_user_id: 'owner', connected_user_id: 'pending', status: 'pending' },
    { owner_user_id: 'stranger', connected_user_id: 'foreign', status: 'accepted' },
  ], error: null });
  mockNames.mockReturnValue({ data: [{ id: 'contact', full_name: 'Actual contact', username: null }], error: null });
  expect(await listConnectedInviteTargets('owner', true)).toEqual([{ userId: 'contact', displayName: 'Actual contact' }]);
});

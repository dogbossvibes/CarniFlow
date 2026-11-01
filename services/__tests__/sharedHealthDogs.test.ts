import { loadReceivedHealthDogs } from '../sharedHealthDogs';
const mockRpc = jest.fn();
jest.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
beforeEach(() => { mockRpc.mockReset(); });
it('uses the scoped minimal metadata RPC, no whole-dog table read', async () => {
  mockRpc.mockResolvedValue({ data: [], error: null });
  await expect(loadReceivedHealthDogs('dog')).resolves.toEqual([]);
  expect(mockRpc).toHaveBeenCalledWith('list_received_health_dogs', { p_dog_id: 'dog' });
});
it('distinguishes a missing backend or network error from an empty inbox', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
  await expect(loadReceivedHealthDogs()).rejects.toThrow('shared_health_unavailable');
});
it.each([null, {}, [null], [{ grant_id: 'g', permissions: 'can_view_weight' }]])('fails closed for malformed response %p', async data => {
  mockRpc.mockResolvedValue({ data, error: null });
  await expect(loadReceivedHealthDogs()).rejects.toThrow('shared_health_invalid_response');
});

const valid = { grant_id: 'g', dog_id: 'd', dog_name: 'Yam', owner_display_name: null, starts_at: '2026-01-01T00:00:00Z', expires_at: null, permissions: ['can_view_weight'] };
it('rejects foreign dog rows for a scoped RPC response', async () => {
  mockRpc.mockResolvedValue({ data: [valid], error: null });
  await expect(loadReceivedHealthDogs('other-dog')).rejects.toThrow('shared_health_invalid_response');
});
it('projects only reviewed metadata and known read flags', async () => {
  mockRpc.mockResolvedValue({ data: [{ ...valid, private_note: 'never', permissions: ['can_view_weight', 'can_edit_health', 'future_flag'] }], error: null });
  expect(await loadReceivedHealthDogs()).toEqual([valid]);
});
it('rejects conflicting duplicate grant identity', async () => {
  mockRpc.mockResolvedValue({ data: [valid, { ...valid, dog_id: 'other' }], error: null });
  await expect(loadReceivedHealthDogs()).rejects.toThrow('shared_health_invalid_response');
});
